import React, { useEffect, useRef, useState } from "react";
import AudioTrimmer from "./AudioTrimmer.jsx";
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

  const audioRef = useRef(null);
  const previewUrls = useRef(new Set());

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

  function closeEditDialog() {
    setEditDialog(null);
  }

  async function onEditWord(word) {
    setWordErr("");
    try {
      const entry = words.find(w => w.normalizedWord === word);
      const url = entry?.audioUrl;
      if (!url) throw new Error("Audio missing for this word.");
      setEditDialog({ word, url });
    } catch (e) {
      setWordErr(String(e));
      setEditDialog(null);
    }
  }

  async function onDownload(word) {
    if (!parentKey) return;
    setWordErr("");
    setWordStatus(`Downloading audio for "${word}"…`);
    setWordBusy(word);
    try {
      const entry = words.find(w => w.normalizedWord === word);
      if (!entry?.audioUrl) throw new Error("Audio missing for this word.");

      const response = await fetch(entry.audioUrl);
      if (!response.ok) throw new Error(`Download failed (${response.status}).`);

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${word}.mp3`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);

      setWordStatus(`Downloaded audio for "${word}".`);
    } catch (e) {
      setWordStatus("");
      setWordErr(String(e));
    } finally {
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
      clearPreview(word);
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
                    {wordBusy === w.normalizedWord ? "Working…" : "Regenerate"}
                  </button>
                  <button
                    className="btn"
                    onClick={() => onDownload(w.normalizedWord)}
                    disabled={!parentKey || wordBusy === w.normalizedWord}
                    aria-label={`Download ${w.normalizedWord}`}
                  >
                    ⬇️
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
        <AudioTrimmer
          word={editDialog.word}
          url={editDialog.url}
          onClose={closeEditDialog}
          onSave={async base64 => {
            await onReplace(editDialog.word, base64);
            closeEditDialog();
          }}
        />
      ) : null}
    </>
  );
}
