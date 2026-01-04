import React, { useState } from "react";
import { apiPostJson } from "../api.js";

export default function Studio() {
  const [parentKey, setParentKey] = useState("");
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [status, setStatus] = useState("");
  const [err, setErr] = useState("");

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

  return (
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
    </div>
  );
}
