import React, { useEffect, useMemo, useRef, useState } from "react";
import { apiGet, apiUploadImage } from "../api.js";

function extractDisplayWords(sentence) {
  const parts = sentence.split(/(\s+)/);
  return parts.map(p => {
    if (/^\s+$/.test(p)) return { kind: "space", text: p };
    const m = p.match(/[A-Za-z']+/);
    if (!m) return { kind: "punct", text: p };
    return { kind: "word", text: p, wordOnly: m[0] };
  });
}

export default function Reader({ storyId }) {
  const [data, setData] = useState(null);
  const [idx, setIdx] = useState(0);
  const [err, setErr] = useState("");
  const [parentKey, setParentKey] = useState(""); // paste key to enable uploads

  const audioRef = useRef(null);
  const wordCache = useRef(new Map());

  useEffect(() => {
    apiGet(`/api/stories/${storyId}`)
      .then(d => { setData(d); setIdx(0); })
      .catch(e => setErr(String(e)));
  }, [storyId]);

  const sentence = data?.sentences?.[idx];
  const tokens = useMemo(() => extractDisplayWords(sentence?.text || ""), [sentence?.text]);

  async function playSentence() {
    if (!sentence?.sentenceAudioUrl) return;
    if (!audioRef.current) audioRef.current = new Audio();
    audioRef.current.src = sentence.sentenceAudioUrl;
    await audioRef.current.play();
  }

  async function playWord(raw) {
    const w = (raw || "").toLowerCase().replace(/^'+|'+$/g, "");
    if (!w) return;

    let url = wordCache.current.get(w);
    if (!url) {
      try {
        const r = await apiGet(`/api/word-audio?word=${encodeURIComponent(w)}`);
        url = r.audioUrl;
        wordCache.current.set(w, url);
      } catch {
        return;
      }
    }

    if (!audioRef.current) audioRef.current = new Audio();
    audioRef.current.src = url;
    await audioRef.current.play();
  }

  async function onUploadImage(file) {
    if (!parentKey) return;
    try {
      await apiUploadImage(`/api/stories/${storyId}/sentences/${idx}/image`, file, parentKey);
      const fresh = await apiGet(`/api/stories/${storyId}`);
      setData(fresh);
    } catch (e) {
      setErr(String(e));
    }
  }

  if (err) return <div className="wrap"><div className="error">{err}</div></div>;
  if (!data) return <div className="wrap"><div className="muted">Loading…</div></div>;
  if (!sentence) return <div className="wrap"><div className="muted">No sentences.</div></div>;

  return (
    <div className="wrap reader">
      <div className="topbar">
        <a className="btn" href="#/">‹ Stories</a>
        <div className="title">{data.title}</div>
      </div>

      <div className="card">
        <div className="subtitle">Studio Key (optional)</div>
        <input
          className="input"
          placeholder="Paste key to enable image uploads"
          value={parentKey}
          onChange={e => setParentKey(e.target.value)}
        />
      </div>

      <div className="page">
        <div className="imageBox">
          {sentence.imageUrl ? (
            <img className="img" src={sentence.imageUrl} alt="" />
          ) : (
            <div className="imgPlaceholder">No image</div>
          )}

          <label className={`imgBtn ${parentKey ? "" : "disabled"}`}>
            + Add Image
            <input
              type="file"
              accept="image/*"
              style={{ display: "none" }}
              disabled={!parentKey}
              onChange={e => {
                const f = e.target.files?.[0];
                if (f) onUploadImage(f);
              }}
            />
          </label>
        </div>

        <div className="sentence">
          {tokens.map((t, i) => {
            if (t.kind === "space") return <span key={i}>{t.text}</span>;
            if (t.kind === "punct") return <span key={i}>{t.text}</span>;
            return (
              <button key={i} className="wordBtn" onClick={() => playWord(t.wordOnly)}>
                {t.text}
              </button>
            );
          })}
        </div>

        <div className="controls">
          <button className="btn" onClick={() => setIdx(Math.max(0, idx - 1))} disabled={idx === 0}>‹ Prev</button>
          <button className="btnPrimary" onClick={playSentence}>Play Sentence</button>
          <button className="btn" onClick={() => setIdx(Math.min(data.sentences.length - 1, idx + 1))} disabled={idx === data.sentences.length - 1}>Next ›</button>
        </div>

        <div className="muted center">Page {idx + 1} / {data.sentences.length}</div>
      </div>
    </div>
  );
}
