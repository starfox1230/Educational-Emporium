import "dotenv/config";
import express from "express";
import cors from "cors";
import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";
import pLimit from "p-limit";
import imageSize from "image-size";

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

// TTS settings for sentences vs. individual words. Keep together for easy edits.
const TTS_CONFIG = {
  sentence: {
    model: "gpt-4o-mini-tts",
    voice: "sage",
    instructions: "Voice Affect: Warm, gentle, and inviting; sounds like a caring grown-up reading at bedtime.\\n\\nTone: Kind, playful, and reassuring; encourages curiosity and makes the listener feel safe.\\n\\nPacing: Unhurried and rhythmic; slightly slower than normal speech to support comprehension and keep a cozy flow.\\n\\nEmotion: Expressive but not over-the-top; soft wonder for discoveries, light excitement for fun moments, and tender empathy for worries.\\n\\nSpeech Mannerisms: Uses subtle “smiles in the voice,” friendly emphasis, and occasional conspiratorial softness for secrets (“and guess what…”). Keeps it simple and direct.\\n\\nPronunciation: Very clear and rounded; crisp consonants, warm vowels. Gently emphasizes character names, key action words, and repeated phrases.\\n\\nPauses: Short pauses before important moments and after punchlines; slightly longer pauses at scene changes and after a meaningful line to let it land.\\n\\nCharacter Voices: Light differentiation only—small shifts in pitch, speed, and energy."
  },
  word: {
    model: "gpt-4o-mini-tts",
    voice: "shimmer",
    instructions: "Voice Affect: Calm, composed, and reassuring; project quiet authority and confidence.\\n\\nTone: Sincere, empathetic, and gently authoritative—express genuine apology while conveying competence.\\n\\nPacing: Steady and moderate; unhurried enough to communicate care, yet efficient enough to demonstrate professionalism.\\n\\nEmotion: Genuine empathy and understanding; speak with warmth, especially during apologies (\"I'm very sorry for any disruption...\").\\n\\nPronunciation: Clear and precise, emphasizing key reassurances (\"smoothly,\" \"quickly,\" \"promptly\") to reinforce confidence.\\n\\nPauses: Brief pauses after offering assistance or requesting details, highlighting willingness to listen and support."
  }
};

const SENTENCE_TTS = TTS_CONFIG.sentence;
const WORD_TTS = TTS_CONFIG.word;

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

// Parent-only: delete a single word entry and its audio
app.delete("/api/word-library/:word", requireParentKey, async (req, res) => {
  const raw = req.params.word || "";
  const w = normalizeWord(raw);
  if (!w) return res.status(400).json({ error: "Missing word." });
  if (!BUCKET) return res.status(500).json({ error: "Missing FIREBASE_STORAGE_BUCKET." });

  const db = getFirestore();
  const ref = db.collection("wordLibrary").doc(w);
  const doc = await ref.get();
  if (!doc.exists) return res.status(404).json({ error: "Word not found." });

  const data = doc.data();
  const objectPath = getObjectPathFromDownloadUrl({ url: data?.audioUrl, bucketName: BUCKET });
  if (objectPath) await deleteFileIfExists({ bucketName: BUCKET, objectPath });
  await ref.delete();

  res.json({ ok: true, deleted: w });
});

// Parent-only: purge the entire word library (requires confirm key)
app.post("/api/word-library/purge", requireParentKey, async (req, res) => {
  if (!BUCKET) return res.status(500).json({ error: "Missing FIREBASE_STORAGE_BUCKET." });
  if ((req.body?.confirmKey || "") !== PARENT_KEY) {
    return res.status(400).json({ error: "Confirmation key mismatch." });
  }

  const db = getFirestore();
  const snap = await db.collection("wordLibrary").get();
  const limit = pLimit(5);

  await Promise.all(snap.docs.map(doc => limit(async () => {
    const data = doc.data();
    const objectPath = getObjectPathFromDownloadUrl({ url: data?.audioUrl, bucketName: BUCKET });
    if (objectPath) await deleteFileIfExists({ bucketName: BUCKET, objectPath });
    await doc.ref.delete();
  })));

  res.json({ ok: true, deletedCount: snap.size });
});

// Parent-only: generate a preview audio clip for a word
app.post("/api/word-library/:word/preview", requireParentKey, async (req, res) => {
  const raw = req.params.word || "";
  const w = normalizeWord(raw);
  if (!w) return res.status(400).json({ error: "Missing word." });

  const buf = await ttsMp3({
    text: w,
    voice: WORD_TTS.voice,
    model: WORD_TTS.model,
    instructions: WORD_TTS.instructions
  });

  res.json({ audioBase64: buf.toString("base64"), ttsModel: WORD_TTS.model, ttsVoice: WORD_TTS.voice });
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

  const objectPath = `wordAudio/${WORD_TTS.model}_${WORD_TTS.voice}/${w}.mp3`;
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
    ttsModel: WORD_TTS.model,
    ttsVoice: WORD_TTS.voice,
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
    ttsModel: WORD_TTS.model,
    ttsVoice: WORD_TTS.voice,
    updatedAt: now
  });
});

// Parent-only: delete an entire story and its assets
app.delete("/api/stories/:storyId", requireParentKey, async (req, res) => {
  const { storyId } = req.params;
  if (!BUCKET) return res.status(500).json({ error: "Missing FIREBASE_STORAGE_BUCKET." });

  const db = getFirestore();
  const storyRef = db.collection("stories").doc(storyId);
  const storyDoc = await storyRef.get();
  if (!storyDoc.exists) return res.status(404).json({ error: "Story not found." });

  const sentSnap = await storyRef.collection("sentences").get();
  const limit = pLimit(5);

  await Promise.all(sentSnap.docs.map(doc => limit(async () => {
    const data = doc.data();
    const audioPath = getObjectPathFromDownloadUrl({ url: data?.sentenceAudioUrl, bucketName: BUCKET });
    const imagePath = getObjectPathFromDownloadUrl({ url: data?.imageUrl, bucketName: BUCKET });
    if (audioPath) await deleteFileIfExists({ bucketName: BUCKET, objectPath: audioPath });
    if (imagePath) await deleteFileIfExists({ bucketName: BUCKET, objectPath: imagePath });
    await doc.ref.delete();
  })));

  await storyRef.delete();
  res.json({ ok: true, deletedSentences: sentSnap.size });
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
    ttsModel: SENTENCE_TTS.model,
    ttsVoice: SENTENCE_TTS.voice,
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
        voice: WORD_TTS.voice,
        model: WORD_TTS.model,
        instructions: WORD_TTS.instructions
      });

      const url = await uploadBufferAndGetDownloadUrl({
        bucketName: BUCKET,
        objectPath: `wordAudio/${WORD_TTS.model}_${WORD_TTS.voice}/${w}.mp3`,
        buffer: buf,
        contentType: "audio/mpeg"
      });

      await db.collection("wordLibrary").doc(w).set({
        normalizedWord: w,
        audioUrl: url,
        createdAt: new Date().toISOString(),
        ttsModel: WORD_TTS.model,
        ttsVoice: WORD_TTS.voice
      });
    }))
  );

  // Generate sentence audio + sentence docs
  await Promise.all(
    sentences.map((s, idx) => limit(async () => {
      const buf = await ttsMp3({
        text: s,
        voice: SENTENCE_TTS.voice,
        model: SENTENCE_TTS.model,
        instructions: SENTENCE_TTS.instructions
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
        imageUrl: null,
        imageWidth: null,
        imageHeight: null
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

    let dimensions = {};
    try {
      const { width, height } = imageSize(req.file.buffer) || {};
      if (width && height) dimensions = { imageWidth: width, imageHeight: height };
    } catch (e) {
      console.warn("Could not read image dimensions", e);
    }

    const url = await uploadBufferAndGetDownloadUrl({
      bucketName: BUCKET,
      objectPath: `stories/${storyId}/images/${idx}.${ext}`,
      buffer: req.file.buffer,
      contentType
    });

    const update = { imageUrl: url, ...dimensions };
    await storyRef.collection("sentences").doc(String(idx)).set(update, { merge: true });
    res.json({ ok: true, ...update });
  }
);

// Parent-only: update sentence text (optional audio regen + missing word audio)
app.post("/api/stories/:storyId/sentences/:index/update-text",
  requireParentKey,
  async (req, res) => {
    const { storyId, index } = req.params;
    const { text, regenerateAudio } = req.body || {};

    const trimmed = (text || "").toString().trim();
    if (!trimmed) return res.status(400).json({ error: "Missing sentence text." });

    const idx = Number(index);
    if (!Number.isFinite(idx) || idx < 0) return res.status(400).json({ error: "Bad index." });

    if (regenerateAudio && !BUCKET) return res.status(500).json({ error: "Missing FIREBASE_STORAGE_BUCKET." });

    const db = getFirestore();
    const storyRef = db.collection("stories").doc(storyId);
    const storyDoc = await storyRef.get();
    if (!storyDoc.exists) return res.status(404).json({ error: "Story not found." });

    const sentenceRef = storyRef.collection("sentences").doc(String(idx));
    const sentenceDoc = await sentenceRef.get();
    if (!sentenceDoc.exists) return res.status(404).json({ error: "Sentence not found." });

    let sentenceAudioUrl = sentenceDoc.data().sentenceAudioUrl || null;
    let missingWordsGenerated = 0;

    const normalizedWords = Array.from(new Set(
      extractWords(trimmed).map(normalizeWord).filter(Boolean)
    ));

    if (regenerateAudio && normalizedWords.length) {
      const missing = [];
      const chunks = [];
      for (let i = 0; i < normalizedWords.length; i += 200) chunks.push(normalizedWords.slice(i, i + 200));

      for (const chunk of chunks) {
        const refs = chunk.map(w => db.collection("wordLibrary").doc(w));
        const snaps = await db.getAll(...refs);
        snaps.forEach((docSnap, i) => {
          if (!docSnap.exists) missing.push(chunk[i]);
        });
      }

      const limit = pLimit(3);

      await Promise.all(missing.map(w => limit(async () => {
        const buf = await ttsMp3({
          text: w,
          voice: WORD_TTS.voice,
          model: WORD_TTS.model,
          instructions: WORD_TTS.instructions
        });

        const url = await uploadBufferAndGetDownloadUrl({
          bucketName: BUCKET,
          objectPath: `wordAudio/${WORD_TTS.model}_${WORD_TTS.voice}/${w}.mp3`,
          buffer: buf,
          contentType: "audio/mpeg"
        });

        await db.collection("wordLibrary").doc(w).set({
          normalizedWord: w,
          audioUrl: url,
          createdAt: new Date().toISOString(),
          ttsModel: WORD_TTS.model,
          ttsVoice: WORD_TTS.voice
        });
      })));

      missingWordsGenerated = missing.length;
    }

    if (regenerateAudio) {
      const buf = await ttsMp3({
        text: trimmed,
        voice: SENTENCE_TTS.voice,
        model: SENTENCE_TTS.model,
        instructions: SENTENCE_TTS.instructions
      });

      const objectPath = `stories/${storyId}/sentences/${idx}.mp3`;
      sentenceAudioUrl = await uploadBufferAndGetDownloadUrl({
        bucketName: BUCKET,
        objectPath,
        buffer: buf,
        contentType: "audio/mpeg"
      });
    }

    const now = new Date().toISOString();
    const update = {
      text: trimmed,
      updatedAt: now,
      ...(regenerateAudio && sentenceAudioUrl ? { sentenceAudioUrl } : {})
    };

    await sentenceRef.set(update, { merge: true });
    await storyRef.set({ updatedAt: now }, { merge: true });

    res.json({
      ok: true,
      text: trimmed,
      regenerated: !!regenerateAudio,
      sentenceAudioUrl,
      missingWordsGenerated
    });
  }
);

// Parent-only: insert a blank sentence before or after the given index
app.post("/api/stories/:storyId/sentences/:index/insert",
  requireParentKey,
  async (req, res) => {
    const { storyId, index } = req.params;
    const position = (req.body?.position || "").toString();

    if (!BUCKET) return res.status(500).json({ error: "Missing FIREBASE_STORAGE_BUCKET." });
    if (!["before", "after"].includes(position)) return res.status(400).json({ error: "Missing or invalid position." });

    const idx = Number(index);
    if (!Number.isFinite(idx) || idx < 0) return res.status(400).json({ error: "Bad index." });

    const insertIndex = position === "before" ? idx : idx + 1;

    const db = getFirestore();
    const storyRef = db.collection("stories").doc(storyId);
    const storyDoc = await storyRef.get();
    if (!storyDoc.exists) return res.status(404).json({ error: "Story not found." });

    const storyData = storyDoc.data() || {};
    const sentenceCount = Number(storyData.sentenceCount) || 0;
    // Allow inserting at the very end
    if (insertIndex > sentenceCount) return res.status(400).json({ error: "Insert position out of range." });

    const sentenceCollection = storyRef.collection("sentences");
    const toShift = await sentenceCollection
      .where("index", ">=", insertIndex)
      .orderBy("index", "desc") // Work backwards to avoid overwriting data we haven't moved yet
      .get();

    // Shift them sequentially (No Deletes, just Overwrites)
    const docs = toShift.docs;
    for (const doc of docs) {
      const data = doc.data();
      const newIndex = (data.index ?? Number(doc.id)) + 1;
      await sentenceCollection.doc(String(newIndex)).set({ ...data, index: newIndex });
    }

    const now = new Date().toISOString();

    await sentenceCollection.doc(String(insertIndex)).set({
      index: insertIndex,
      text: "",
      sentenceAudioUrl: null,
      imageUrl: null,
      imageWidth: null,
      imageHeight: null,
      createdAt: now,
      updatedAt: now
    });

    await storyRef.set({ sentenceCount: sentenceCount + 1, updatedAt: now }, { merge: true });

    res.json({ ok: true, insertIndex });
  }
);

// Parent-only: regenerate audio for a specific sentence
app.post("/api/stories/:storyId/sentences/:index/regenerate-audio",
  requireParentKey,
  async (req, res) => {
    const { storyId, index } = req.params;
    if (!BUCKET) return res.status(500).json({ error: "Missing FIREBASE_STORAGE_BUCKET." });

    const idx = Number(index);
    if (!Number.isFinite(idx) || idx < 0) return res.status(400).json({ error: "Bad index." });

    const db = getFirestore();
    const storyRef = db.collection("stories").doc(storyId);
    const storyDoc = await storyRef.get();
    if (!storyDoc.exists) return res.status(404).json({ error: "Story not found." });

    const sentenceRef = storyRef.collection("sentences").doc(String(idx));
    const sentenceDoc = await sentenceRef.get();
    if (!sentenceDoc.exists) return res.status(404).json({ error: "Sentence not found." });

    const text = sentenceDoc.data().text;
    if (!text) return res.status(400).json({ error: "Sentence is missing text." });

    const buf = await ttsMp3({
      text,
      voice: SENTENCE_TTS.voice,
      model: SENTENCE_TTS.model,
      instructions: SENTENCE_TTS.instructions
    });

    const objectPath = `stories/${storyId}/sentences/${idx}.mp3`;
    const url = await uploadBufferAndGetDownloadUrl({
      bucketName: BUCKET,
      objectPath,
      buffer: buf,
      contentType: "audio/mpeg"
    });

    const now = new Date().toISOString();
    await sentenceRef.set({ sentenceAudioUrl: url, updatedAt: now }, { merge: true });
    await storyRef.set({ updatedAt: now }, { merge: true });

    res.json({ ok: true, sentenceAudioUrl: url });
  }
);

// Parent-only: delete a sentence and shift following indexes
app.delete("/api/stories/:storyId/sentences/:index",
  requireParentKey,
  async (req, res) => {
    const { storyId, index } = req.params;
    const idx = Number(index);

    if (!BUCKET) return res.status(500).json({ error: "Missing FIREBASE_STORAGE_BUCKET." });
    if (!Number.isFinite(idx) || idx < 0) return res.status(400).json({ error: "Bad index." });

    const db = getFirestore();
    const storyRef = db.collection("stories").doc(storyId);
    const storyDoc = await storyRef.get();
    if (!storyDoc.exists) return res.status(404).json({ error: "Story not found." });

    const sentenceRef = storyRef.collection("sentences").doc(String(idx));
    const sentenceDoc = await sentenceRef.get();
    if (!sentenceDoc.exists) return res.status(404).json({ error: "Sentence not found." });

    const sentenceData = sentenceDoc.data() || {};
    const audioPath = getObjectPathFromDownloadUrl({ url: sentenceData.sentenceAudioUrl, bucketName: BUCKET });
    const imagePath = getObjectPathFromDownloadUrl({ url: sentenceData.imageUrl, bucketName: BUCKET });
    if (audioPath) await deleteFileIfExists({ bucketName: BUCKET, objectPath: audioPath });
    if (imagePath) await deleteFileIfExists({ bucketName: BUCKET, objectPath: imagePath });

    const sentenceCollection = storyRef.collection("sentences");
    const toShift = await sentenceCollection
      .where("index", ">", idx)
      .orderBy("index", "asc")
      .get();

    const docs = toShift.docs;
    let lastIndex = idx;

    for (const doc of docs) {
      const data = doc.data();
      const currentIndex = data.index ?? Number(doc.id);
      const newIndex = currentIndex - 1;

      await sentenceCollection.doc(String(newIndex)).set({ ...data, index: newIndex });
      lastIndex = currentIndex;
    }

    if (docs.length > 0) {
      await sentenceCollection.doc(String(lastIndex)).delete();
    } else {
      await sentenceRef.delete();
    }

    const storyData = storyDoc.data() || {};
    const now = new Date().toISOString();
    const newCount = Math.max(0, (Number(storyData.sentenceCount) || 0) - 1);
    await storyRef.set({ sentenceCount: newCount, updatedAt: now }, { merge: true });

    res.json({ ok: true, deletedIndex: idx, sentenceCount: newCount });
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
