import React, { useEffect, useState } from "react";
import { apiGet } from "../api.js";

export default function Stories() {
  const [stories, setStories] = useState([]);
  const [err, setErr] = useState("");

  useEffect(() => {
    apiGet("/api/stories").then(d => setStories(d.stories)).catch(e => setErr(String(e)));
  }, []);

  return (
    <div className="wrap">
      <div className="topbar">
        <div className="title">WordGlow 3.0</div>
        <a className="btn" href="#/studio">WordGlow Studio</a>
      </div>

      {err ? <div className="error">{err}</div> : null}

      <div className="card">
        <div className="subtitle">Stories</div>
        {stories.length === 0 ? <div className="muted">No stories yet.</div> : null}
        <div className="list">
          {stories.map(s => (
            <a key={s.id} className="row" href={`#/read/${s.id}`}>
              <div className="rowMain">
                <div className="rowTitle">{s.title}</div>
                <div className="rowMeta">{s.sentenceCount} pages</div>
              </div>
              <div className="rowArrow">›</div>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
