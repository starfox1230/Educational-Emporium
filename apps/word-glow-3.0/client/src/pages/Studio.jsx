import React, { useEffect, useRef, useState } from "react";
import lamejs from "lamejs";
import { apiDelete, apiGetWithKey, apiPostJson } from "../api.js";

export default function Studio() {
  const [parentKey, setParentKey] = useState("");
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [status, setStatus] = useState("");
  const [err, setErr] = useState("");
  const [wordStatus, setWordStatus] = useState("");
  const [wordErr, setWordErr] = useState("");
  const [words, setWords] = useState([]);
  const [loadingWords, setLoadingWords] = useState(false);
  const [wordPreviews, setWordPreviews] = useState({});
  const [wordBusy, setWordBusy] = useState("");
  const [purgeConfirm, setPurgeConfirm] = useState("");
  const [editDialog, setEditDialog] = useState(null);
  const [trimStatus, setTrimStatus] = useState("");
  const [trimPreview, setTrimPreview] = useState(null);
  const [trimErr, setTrimErr] = useState("");

  const audioRef = useRef(null);
  const previewUrls = useRef(new Set());
  const editBufferRef = useRef(null);

  useEffect(() => {
    if (!parentKey) {
      setWords([]);
      setWordPreviews({});
      setWordStatus("");
      setWordErr("");
      setPurgeConfirm("");
      closeEditDialog();
    }
  }, [parentKey]);

  useEffect(() => {
    return () => {
      previewUrls.current.forEach(url => URL.revokeObjectURL(url));
      previewUrls.current.clear();
    };
  }, []);

  useEffect(() => {
    return () => {
      if (trimPreview?.url) URL.revokeObjectURL(trimPreview.url);
    };
  }, [trimPreview]);

  async function onProcess() {
    setErr("");
    setStatus("Processing… (sentence audio + cached word audio)");
    try {
      const r = await apiPostJson("/api/process-story", { title, text }, parentKey);
      setStatus(`Done. Created story ${r.storyId} (${r.sentenceCount} pages).`);
      window.location.hash = `#/read/${r.storyId}`;
    } catch (e) {
      setStatus("");
      setErr(String(e));
    }
  }

  async function loadWordLibrary() {
    if (!parentKey) return;
    setWordErr("");
    setWordStatus("Loading word library…");
    setLoadingWords(true);
    try {
      const r = await apiGetWithKey("/api/word-library", parentKey);
      setWords(r.words || []);
      setWordStatus(`Loaded ${r.words?.length || 0} words.`);
    } catch (e) {
      setWordStatus("");
      setWordErr(String(e));
    } finally {
      setLoadingWords(false);
    }
  }

  function base64ToObjectUrl(b64) {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const blob = new Blob([bytes], { type: "audio/mpeg" });
    return URL.createObjectURL(blob);
  }

  function setPreviewForWord(word, base64) {
    setWordPreviews(prev => {
      const next = { ...prev };
      if (next[word]?.objectUrl) {
        URL.revokeObjectURL(next[word].objectUrl);
        previewUrls.current.delete(next[word].objectUrl);
      }
      const url = base64ToObjectUrl(base64);
      previewUrls.current.add(url);
      next[word] = { base64, objectUrl: url };
      return next;
    });
  }

  function clearPreview(word) {
    setWordPreviews(prev => {
      const next = { ...prev };
      if (next[word]?.objectUrl) {
        URL.revokeObjectURL(next[word].objectUrl);
        previewUrls.current.delete(next[word].objectUrl);
      }
      delete next[word];
      return next;
    });
  }

  function clearTrimPreview() {
    setTrimPreview(prev => {
      if (prev?.url) URL.revokeObjectURL(prev.url);
      return null;
    });
  }

  function closeEditDialog() {
    clearTrimPreview();
    editBufferRef.current = null;
    setEditDialog(null);
    setTrimStatus("");
    setTrimErr("");
  }

  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const res = reader.result;
        if (typeof res === "string") {
          const [, b64] = res.split(",");
          resolve(b64 || "");
        } else {
          resolve("");
        }
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  function floatTo16BitPCM(input) {
    const output = new Int16Array(input.length);
    for (let i = 0; i < input.length; i++) {
      const s = Math.max(-1, Math.min(1, input[i]));
      output[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return output;
  }

  function encodeTrimToMp3({ buffer, start, end }) {
    if (!buffer) throw new Error("Audio not loaded.");
    const duration = buffer.duration || 0;
    const safeStart = Math.max(0, Math.min(start, duration));
    const safeEnd = Math.max(safeStart + 0.05, Math.min(end, duration));
    const sampleRate = buffer.sampleRate;
    const startSample = Math.floor(safeStart * sampleRate);
    const endSample = Math.floor(safeEnd * sampleRate);
    const left = buffer.getChannelData(0).slice(startSample, endSample);
    const right = buffer.numberOfChannels > 1 ? buffer.getChannelData(1).slice(startSample, endSample) : left;

    const encoder = new lamejs.Mp3Encoder(2, sampleRate, 128);
    const maxSamples = 1152;
    const mp3Data = [];

    for (let i = 0; i < left.length; i += maxSamples) {
      const leftChunk = floatTo16BitPCM(left.subarray(i, i + maxSamples));
      const rightChunk = floatTo16BitPCM(right.subarray(i, i + maxSamples));
      const buf = encoder.encodeBuffer(leftChunk, rightChunk);
      if (buf.length) mp3Data.push(buf);
    }

    const endBuf = encoder.flush();
    if (endBuf.length) mp3Data.push(endBuf);
    return new Blob(mp3Data, { type: "audio/mpeg" });
  }

  function updateTrimStart(val) {
    if (!editDialog) return;
    const duration = editDialog.duration;
    const parsed = Number(val);
    const start = Math.max(0, Math.min(Number.isFinite(parsed) ? parsed : 0, duration));
    const safeStart = Math.min(start, editDialog.end - 0.05);
    setEditDialog({ ...editDialog, start: Math.max(0, safeStart) });
    setTrimStatus("");
  }

  function updateTrimEnd(val) {
    if (!editDialog) return;
    const duration = editDialog.duration;
    const parsed = Number(val);
    const end = Math.max(0, Math.min(Number.isFinite(parsed) ? parsed : duration, duration));
    const safeEnd = Math.max(end, editDialog.start + 0.05);
    setEditDialog({ ...editDialog, end: Math.min(duration, safeEnd) });
    setTrimStatus("");
  }

  async function createTrimPreview() {
    if (!editDialog || !editBufferRef.current) throw new Error("No audio loaded.");
    const blob = encodeTrimToMp3({ buffer: editBufferRef.current, start: editDialog.start, end: editDialog.end });
    const base64 = await blobToBase64(blob);
    const url = URL.createObjectURL(blob);
    setTrimPreview(prev => {
      if (prev?.url) URL.revokeObjectURL(prev.url);
      return { url, base64 };
    });
    return { url, base64 };
  }

  async function onPreviewTrim() {
    if (!editDialog) return;
    setTrimErr("");
    setTrimStatus("Rendering trim preview…");
    setWordBusy(editDialog.word);
    try {
      const preview = await createTrimPreview();
      setTrimStatus("Trim preview ready.");
      await playAudio(preview.url);
    } catch (e) {
      setTrimStatus("");
      setTrimErr(String(e));
    } finally {
      setWordBusy("");
    }
  }

  async function onSaveTrimmed() {
    if (!editDialog) return;
    setTrimErr("");
    setTrimStatus("Saving trimmed audio…");
    try {
      const preview = trimPreview || (await createTrimPreview());
      await onReplace(editDialog.word, preview.base64);
      closeEditDialog();
    } catch (e) {
      setTrimStatus("");
      setTrimErr(String(e));
    }
  }

  async function onEditWord(word) {
    setTrimErr("");
    setTrimStatus("");
    clearTrimPreview();
    setWordBusy(word);
    try {
      const entry = words.find(w => w.normalizedWord === word);
      const url = entry?.audioUrl;
      if (!url) throw new Error("Audio missing for this word.");

      const res = await fetch(url);
      if (!res.ok) throw new Error("Unable to download audio file.");
      const arr = await res.arrayBuffer();

      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) throw new Error("This browser cannot edit audio.");
      const ctx = new Ctx();
      const buffer = await ctx.decodeAudioData(arr.slice(0));
      editBufferRef.current = buffer;

      const dur = Math.max(buffer.duration || 0, 0.2);
      setEditDialog({ word, duration: dur, start: 0, end: dur });
    } catch (e) {
      setTrimErr(String(e));
      editBufferRef.current = null;
      setEditDialog(null);
    } finally {
      setTrimStatus("");
      setWordBusy("");
    }
  }

  async function onPreview(word) {
    if (!parentKey) return;
    setWordErr("");
    setWordStatus(`Generating preview for "${word}"…`);
    setWordBusy(word);
    try {
      const r = await apiPostJson(`/api/word-library/${encodeURIComponent(word)}/preview`, {}, parentKey);
      setPreviewForWord(word, r.audioBase64);
      setWordStatus(`Preview ready for "${word}". Listen and replace if you like it.`);
    } catch (e) {
      setWordStatus("");
      setWordErr(String(e));
    } finally {
      setWordBusy("");
    }
  }

  async function onDeleteWord(word) {
    if (!parentKey) return;
    setWordErr("");
    setWordStatus(`Deleting "${word}"…`);
    setWordBusy(word);
    try {
      await apiDelete(`/api/word-library/${encodeURIComponent(word)}`, null, parentKey);
      setWords(prev => prev.filter(w => w.normalizedWord !== word));
      clearPreview(word);
      setWordStatus(`Deleted "${word}" from library.`);
    } catch (e) {
      setWordStatus("");
      setWordErr(String(e));
    } finally {
      setWordBusy("");
    }
  }

  async function onPurgeAll() {
    if (!parentKey || purgeConfirm !== parentKey) return;
    setWordErr("");
    setWordStatus("Deleting all word audio…");
    setWordBusy("__purge__");
    try {
      await apiPostJson("/api/word-library/purge", { confirmKey: purgeConfirm }, parentKey);
      setWords([]);
      setWordPreviews({});
      setPurgeConfirm("");
      setWordStatus("All word entries removed.");
    } catch (e) {
      setWordStatus("");
      setWordErr(String(e));
    } finally {
      setWordBusy("");
    }
  }

  async function onReplace(word, overrideBase64) {
    const preview = wordPreviews[word];
    const audioBase64 = overrideBase64 || preview?.base64;
    if (!audioBase64 || !parentKey) return;
    setWordErr("");
    setWordStatus(`Saving new audio for "${word}"…`);
    setWordBusy(word);
    try {
      const r = await apiPostJson(
        `/api/word-library/${encodeURIComponent(word)}/replace`,
        { audioBase64 },
        parentKey
      );

      setWords(prev => {
        const exists = prev.some(w => w.normalizedWord === word);
        if (!exists) return [...prev, r];
        return prev.map(w => (w.normalizedWord === word ? { ...w, ...r } : w));
      });
      if (overrideBase64) {
        clearTrimPreview();
      } else {
        clearPreview(word);
      }
      setWordStatus(`Updated audio for "${word}".`);
      return r;
    } catch (e) {
      setWordStatus("");
      setWordErr(String(e));
      throw e;
    } finally {
      setWordBusy("");
    }
  }

  async function playAudio(url) {
    if (!url) return;
    try {
      if (!audioRef.current) audioRef.current = new Audio();
      audioRef.current.src = url;
      await audioRef.current.play();
    } catch (e) {
      setWordErr(String(e));
    }
  }

  const editingWord = editDialog ? words.find(w => w.normalizedWord === editDialog.word) : null;

  return (
    <>
      <div className="wrap">
      <div className="topbar">
        <a className="btn" href="#/">‹ Back</a>
        <div className="title">WordGlow Studio</div>
      </div>

      <div className="card">
        <div className="subtitle">Studio Key</div>
        <input
          className="input"
          placeholder="Shared key (x-parent-key)"
          value={parentKey}
          onChange={e => setParentKey(e.target.value)}
        />
        <div className="muted">This controls story processing and image uploads.</div>
      </div>

      <div className="card">
        <div className="subtitle">Story Title</div>
        <input
          className="input"
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="e.g., Matilda and the Glow Word"
        />
      </div>

      <div className="card">
        <div className="subtitle">Story Text</div>
        <textarea
          className="textarea"
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="Paste the full story here…"
        />
        <button className="btnPrimary" onClick={onProcess} disabled={!title || !text || !parentKey}>
          Create Story
        </button>
        {status ? <div className="status">{status}</div> : null}
        {err ? <div className="error">{err}</div> : null}
      </div>

      <div className="card">
        <div className="subtitle">Word Library</div>
        <div className="muted" style={{ marginBottom: 8 }}>
          Load all generated word clips, regenerate previews, and replace the saved audio for any entry.
          Studio key is required for these actions.
        </div>
        <div className="wordActions">
          <button className="btn" onClick={loadWordLibrary} disabled={!parentKey || loadingWords}>
            {loadingWords ? "Loading…" : "Load Word Library"}
          </button>
          <div className="muted">{words.length ? `${words.length} words loaded.` : ""}</div>
        </div>
        {wordStatus ? <div className="status">{wordStatus}</div> : null}
        {wordErr ? <div className="error">{wordErr}</div> : null}

        <div className="wordList">
          {words.length === 0 ? <div className="muted">No words loaded yet.</div> : null}
          {words.map(w => {
            const preview = wordPreviews[w.normalizedWord];
            return (
              <div key={w.normalizedWord} className="wordRow">
                <div className="wordHeader">
                  <div className="rowTitle">{w.normalizedWord}</div>
                  <div className="rowMeta">{w.ttsVoice || "voice"} · {w.ttsModel || "model"}</div>
                </div>
                <div className="wordActions">
                  <button className="btn" onClick={() => playAudio(w.audioUrl)}>Play Current</button>
                  <button
                    className="btn"
                    onClick={() => onPreview(w.normalizedWord)}
                    disabled={!parentKey || wordBusy === w.normalizedWord}
                  >
                    {wordBusy === w.normalizedWord ? "Working…" : "Regenerate Preview"}
                  </button>
                  <button
                    className="btn"
                    onClick={() => onEditWord(w.normalizedWord)}
                    disabled={!parentKey || wordBusy === w.normalizedWord}
                  >
                    {wordBusy === w.normalizedWord ? "Working…" : "Edit"}
                  </button>
                  <button
                    className="btn trashBtn"
                    onClick={() => onDeleteWord(w.normalizedWord)}
                    disabled={!parentKey || wordBusy === w.normalizedWord}
                    aria-label={`Delete ${w.normalizedWord}`}
                  >
                    🗑
                  </button>
                  {w.updatedAt ? <span className="pill">Updated {new Date(w.updatedAt).toLocaleDateString()}</span> : null}
                </div>

                {preview ? (
                  <div className="previewBox">
                    <div className="rowMeta">Preview ready — listen and replace if it sounds better.</div>
                    <div className="wordActions">
                      <button className="btn" onClick={() => playAudio(preview.objectUrl)}>Play Preview</button>
                      <button
                        className="btnPrimary"
                        onClick={() => onReplace(w.normalizedWord)}
                        disabled={!parentKey || wordBusy === w.normalizedWord}
                      >
                        {wordBusy === w.normalizedWord ? "Saving…" : "Replace Current"}
                      </button>
                      <button className="btn" onClick={() => clearPreview(w.normalizedWord)}>Discard Preview</button>
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>

        <div className="dangerZone">
          <div className="subtitle">Delete All Word Audio</div>
          <div className="muted" style={{ marginBottom: 8 }}>
            To confirm, re-type the studio key and click delete. This removes every generated word clip.
          </div>
          <input
            className="input"
            placeholder="Re-type studio key to confirm"
            value={purgeConfirm}
            onChange={e => setPurgeConfirm(e.target.value)}
          />
          <div className="wordActions" style={{ marginTop: 10 }}>
            <button
              className="btn danger"
              onClick={onPurgeAll}
              disabled={!parentKey || purgeConfirm !== parentKey || wordBusy === "__purge__"}
            >
              {wordBusy === "__purge__" ? "Deleting…" : "Delete All Words"}
            </button>
            {purgeConfirm && purgeConfirm !== parentKey ? <div className="pill">Key mismatch</div> : null}
          </div>
        </div>
      </div>
      </div>

      {editDialog ? (
        <div className="modalBackdrop">
          <div className="modal">
            <div className="modalHeader">
              <div className="subtitle">Trim “{editDialog.word}”</div>
              <button className="btn" onClick={closeEditDialog}>✕</button>
            </div>

            <div className="muted" style={{ marginBottom: 10 }}>
              Drag the sliders to keep just the part you want, preview it, then save to replace the stored audio.
            </div>

            <div className="sliderRow">
              <label className="sliderLabel">
                Start: {editDialog.start.toFixed(2)}s
                <input
                  type="range"
                  min={0}
                  max={editDialog.duration}
                  step={0.05}
                  value={editDialog.start}
                  onChange={e => updateTrimStart(e.target.value)}
                />
              </label>
              <label className="sliderLabel">
                End: {editDialog.end.toFixed(2)}s
                <input
                  type="range"
                  min={0}
                  max={editDialog.duration}
                  step={0.05}
                  value={editDialog.end}
                  onChange={e => updateTrimEnd(e.target.value)}
                />
              </label>
              <div className="muted">Clip length: {(editDialog.end - editDialog.start).toFixed(2)}s of {editDialog.duration.toFixed(2)}s</div>
            </div>

            <div className="wordActions" style={{ justifyContent: "space-between" }}>
              <button className="btn" onClick={() => playAudio(editingWord?.audioUrl)}>Play Current</button>
              <div className="wordActions">
                <button className="btn" onClick={onPreviewTrim} disabled={wordBusy === editDialog.word}>
                  {wordBusy === editDialog.word ? "Working…" : "Preview Trim"}
                </button>
                <button className="btnPrimary" onClick={onSaveTrimmed} disabled={wordBusy === editDialog.word || !parentKey}>
                  {wordBusy === editDialog.word ? "Saving…" : "Save Trimmed Audio"}
                </button>
              </div>
            </div>

            {trimPreview ? (
              <div className="previewBox" style={{ marginTop: 10 }}>
                <div className="rowMeta">Trim preview ready. Listen before saving.</div>
                <div className="wordActions">
                  <button className="btn" onClick={() => playAudio(trimPreview.url)}>Play Trimmed</button>
                  <button className="btn" onClick={clearTrimPreview}>Discard Trim Preview</button>
                </div>
              </div>
            ) : null}

            {trimStatus ? <div className="status">{trimStatus}</div> : null}
            {trimErr ? <div className="error">{trimErr}</div> : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
