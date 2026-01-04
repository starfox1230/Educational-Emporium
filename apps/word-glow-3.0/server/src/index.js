import "dotenv/config";
import express from "express";
import cors from "cors";
import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";
import pLimit from "p-limit";

import { getFirestore } from "./firebaseAdmin.js";
import { splitIntoSentences, extractWords, normalizeWord } from "./text.js";
import { ttsMp3 } from "./openaiTts.js";
import { deleteFileIfExists, getObjectPathFromDownloadUrl, uploadBufferAndGetDownloadUrl } from "./storage.js";

const app = express();
app.use(express.json({ limit: "2mb" }));
app.use(cors());

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 } // 8 MB
});

const PARENT_KEY = process.env.SHARED_PARENT_KEY || "";
const BUCKET = process.env.FIREBASE_STORAGE_BUCKET || "";

const TTS_MODEL = process.env.TTS_MODEL || "gpt-4o-mini-tts";
const TTS_VOICE = process.env.TTS_VOICE || "coral";
const TTS_INSTRUCTIONS =
  process.env.TTS_INSTRUCTIONS || "Speak clearly and warmly for a young child.";

function base64ToBuffer(str) {
  try {
    return Buffer.from(str || "", "base64");
  } catch {
    return null;
  }
}

function requireParentKey(req, res, next) {
  if (!PARENT_KEY) return res.status(500).json({ error: "Server missing SHARED_PARENT_KEY." });
  const key = req.header("x-parent-key");
  if (key !== PARENT_KEY) return res.status(401).json({ error: "Unauthorized." });
  next();
}

app.get("/api/health", (req, res) => res.json({ ok: true, app: "WordGlow 3.0" }));

// Public: list stories
app.get("/api/stories", async (req, res) => {
  const db = getFirestore();
  const snap = await db.collection("stories").orderBy("createdAt", "desc").limit(50).get();
  const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  res.json({ stories: items });
});

// Public: get story + sentences
app.get("/api/stories/:storyId", async (req, res) => {
  const { storyId } = req.params;
  const db = getFirestore();

  const storyDoc = await db.collection("stories").doc(storyId).get();
  if (!storyDoc.exists) return res.status(404).json({ error: "Story not found." });

  const sentSnap = await db.collection("stories").doc(storyId)
    .collection("sentences").orderBy("index").get();

  const sentences = sentSnap.docs.map(d => d.data());
  res.json({ id: storyDoc.id, ...storyDoc.data(), sentences });
});

// Public: fetch word audio by word
app.get("/api/word-audio", async (req, res) => {
  const raw = (req.query.word || "").toString();
  const w = normalizeWord(raw);
  if (!w) return res.status(400).json({ error: "Missing word." });

  const db = getFirestore();
  const doc = await db.collection("wordLibrary").doc(w).get();
  if (!doc.exists) return res.status(404).json({ error: "Word not found." });

  res.json({ word: w, ...doc.data() });
});

// Parent-only: list all word audio entries
app.get("/api/word-library", requireParentKey, async (req, res) => {
  const db = getFirestore();
  const snap = await db.collection("wordLibrary").orderBy("normalizedWord").get();
  const words = snap.docs.map(d => ({
    normalizedWord: d.id,
    ...d.data()
  }));
  res.json({ words });
});

// Parent-only: generate a preview audio clip for a word
app.post("/api/word-library/:word/preview", requireParentKey, async (req, res) => {
  const raw = req.params.word || "";
  const w = normalizeWord(raw);
  if (!w) return res.status(400).json({ error: "Missing word." });

  const buf = await ttsMp3({
    text: w,
    voice: TTS_VOICE,
    model: TTS_MODEL,
    instructions: TTS_INSTRUCTIONS
  });

  res.json({ audioBase64: buf.toString("base64"), ttsModel: TTS_MODEL, ttsVoice: TTS_VOICE });
});

// Parent-only: replace a word's stored audio with a provided preview
app.post("/api/word-library/:word/replace", requireParentKey, async (req, res) => {
  const raw = req.params.word || "";
  const w = normalizeWord(raw);
  if (!w) return res.status(400).json({ error: "Missing word." });
  if (!BUCKET) return res.status(500).json({ error: "Missing FIREBASE_STORAGE_BUCKET." });

  const buf = base64ToBuffer(req.body?.audioBase64);
  if (!buf?.length) return res.status(400).json({ error: "Invalid or missing audioBase64." });

  const db = getFirestore();
  const ref = db.collection("wordLibrary").doc(w);
  const existing = await ref.get();
  const prevUrl = existing.exists ? existing.data().audioUrl : null;

  const objectPath = `wordAudio/${TTS_MODEL}_${TTS_VOICE}/${w}.mp3`;
  const url = await uploadBufferAndGetDownloadUrl({
    bucketName: BUCKET,
    objectPath,
    buffer: buf,
    contentType: "audio/mpeg"
  });

  const now = new Date().toISOString();
  await ref.set({
    normalizedWord: w,
    audioUrl: url,
    ttsModel: TTS_MODEL,
    ttsVoice: TTS_VOICE,
    updatedAt: now,
    ...(existing.exists ? {} : { createdAt: now })
  }, { merge: true });

  if (prevUrl && prevUrl !== url) {
    const prevPath = getObjectPathFromDownloadUrl({ url: prevUrl, bucketName: BUCKET });
    if (prevPath && prevPath !== objectPath) {
      await deleteFileIfExists({ bucketName: BUCKET, objectPath: prevPath });
    }
  }

  res.json({
    normalizedWord: w,
    audioUrl: url,
    ttsModel: TTS_MODEL,
    ttsVoice: TTS_VOICE,
    updatedAt: now
  });
});

// Parent-only: create story (split + sentence audio + word-audio cache)
app.post("/api/process-story", requireParentKey, async (req, res) => {
  const { title, text } = req.body || {};
  if (!title || !text) return res.status(400).json({ error: "Missing title or text." });
  if (!BUCKET) return res.status(500).json({ error: "Missing FIREBASE_STORAGE_BUCKET." });

  const db = getFirestore();
  const sentences = splitIntoSentences(text);

  if (sentences.length === 0) return res.status(400).json({ error: "No sentences found." });
  if (sentences.length > 60) return res.status(400).json({ error: "Too many sentences (max 60 for v1)." });

  const storyRef = db.collection("stories").doc();
  const now = new Date().toISOString();

  await storyRef.set({
    title,
    createdAt: now,
    updatedAt: now,
    sentenceCount: sentences.length,
    ttsModel: TTS_MODEL,
    ttsVoice: TTS_VOICE,
    appName: "WordGlow 3.0"
  });

  // Build unique word set across the story
  const allWords = new Set();
  for (const s of sentences) {
    for (const rawWord of extractWords(s)) {
      const n = normalizeWord(rawWord);
      if (n) allWords.add(n);
    }
  }

  // Find missing words in wordLibrary
  const wordList = Array.from(allWords);
  const missing = [];
  const chunks = [];
  for (let i = 0; i < wordList.length; i += 200) chunks.push(wordList.slice(i, i + 200));

  for (const chunk of chunks) {
    const refs = chunk.map(w => db.collection("wordLibrary").doc(w));
    const snaps = await db.getAll(...refs);
    snaps.forEach((docSnap, idx) => {
      if (!docSnap.exists) missing.push(chunk[idx]);
    });
  }

  const limit = pLimit(3);

  // Generate missing word audio (deduped)
  await Promise.all(
    missing.map(w => limit(async () => {
      const buf = await ttsMp3({
        text: w,
        voice: TTS_VOICE,
        model: TTS_MODEL,
        instructions: TTS_INSTRUCTIONS
      });

      const url = await uploadBufferAndGetDownloadUrl({
        bucketName: BUCKET,
        objectPath: `wordAudio/${TTS_MODEL}_${TTS_VOICE}/${w}.mp3`,
        buffer: buf,
        contentType: "audio/mpeg"
      });

      await db.collection("wordLibrary").doc(w).set({
        normalizedWord: w,
        audioUrl: url,
        createdAt: new Date().toISOString(),
        ttsModel: TTS_MODEL,
        ttsVoice: TTS_VOICE
      });
    }))
  );

  // Generate sentence audio + sentence docs
  await Promise.all(
    sentences.map((s, idx) => limit(async () => {
      const buf = await ttsMp3({
        text: s,
        voice: TTS_VOICE,
        model: TTS_MODEL,
        instructions: TTS_INSTRUCTIONS
      });

      const url = await uploadBufferAndGetDownloadUrl({
        bucketName: BUCKET,
        objectPath: `stories/${storyRef.id}/sentences/${idx}.mp3`,
        buffer: buf,
        contentType: "audio/mpeg"
      });

      await storyRef.collection("sentences").doc(String(idx)).set({
        index: idx,
        text: s,
        sentenceAudioUrl: url,
        imageUrl: null
      });
    }))
  );

  res.json({
    storyId: storyRef.id,
    sentenceCount: sentences.length,
    missingWordsGenerated: missing.length
  });
});

// Parent-only: upload image for a sentence index
app.post("/api/stories/:storyId/sentences/:index/image",
  requireParentKey,
  upload.single("image"),
  async (req, res) => {
    const { storyId, index } = req.params;
    if (!req.file) return res.status(400).json({ error: "Missing image file." });
    if (!BUCKET) return res.status(500).json({ error: "Missing FIREBASE_STORAGE_BUCKET." });

    const db = getFirestore();
    const storyRef = db.collection("stories").doc(storyId);

    const storyDoc = await storyRef.get();
    if (!storyDoc.exists) return res.status(404).json({ error: "Story not found." });

    const idx = Number(index);
    if (!Number.isFinite(idx) || idx < 0) return res.status(400).json({ error: "Bad index." });

    const contentType = req.file.mimetype || "image/jpeg";
    const ext = contentType.includes("png") ? "png" : contentType.includes("webp") ? "webp" : "jpg";

    const url = await uploadBufferAndGetDownloadUrl({
      bucketName: BUCKET,
      objectPath: `stories/${storyId}/images/${idx}.${ext}`,
      buffer: req.file.buffer,
      contentType
    });

    await storyRef.collection("sentences").doc(String(idx)).set({ imageUrl: url }, { merge: true });
    res.json({ ok: true, imageUrl: url });
  }
);

// Serve built client in production
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const clientDist = path.resolve(__dirname, "../../client/dist");

app.use(express.static(clientDist));
app.get("*", (req, res) => res.sendFile(path.join(clientDist, "index.html")));

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`WordGlow 3.0 listening on ${port}`));
