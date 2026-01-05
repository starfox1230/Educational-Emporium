import React, { useEffect, useMemo, useRef, useState } from "react";
import { apiDelete, apiGet, apiPostJson, apiUploadImage } from "../api.js";

function extractDisplayWords(sentence) {
  const parts = sentence.split(/(\s+)/);
  return parts.map(p => {
    if (/^\s+$/.test(p)) return { kind: "space", text: p };
    const m = p.match(/[A-Za-z'’]+/);
    if (!m) return { kind: "punct", text: p };
    return { kind: "word", text: p, wordOnly: m[0] };
  });
}

function ScratchImageReveal({ src, locked = false, onImageLoad }) {
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const lastCanvasSize = useRef({ width: 0, height: 0 });
  const [isDrawing, setIsDrawing] = useState(false);
  const [unlockPulse, setUnlockPulse] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    lastCanvasSize.current = { width: 0, height: 0 };

    function paintOverlay({ keepExisting = false, force = false } = {}) {
      const rect = container.getBoundingClientRect();
      const ratio = window.devicePixelRatio || 1;
      const targetWidth = rect.width * ratio;
      const targetHeight = rect.height * ratio;
      const { width: prevW, height: prevH } = lastCanvasSize.current;
      const sizeChanged =
        Math.abs(targetWidth - prevW) > 1 || Math.abs(targetHeight - prevH) > 1;

      if (!force && !sizeChanged) return;

      let existingLayer = null;
      if (keepExisting && canvas.width && canvas.height) {
        existingLayer = document.createElement("canvas");
        existingLayer.width = canvas.width;
        existingLayer.height = canvas.height;
        existingLayer.getContext("2d")?.drawImage(canvas, 0, 0);
      }

      canvas.width = targetWidth;
      canvas.height = targetHeight;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      lastCanvasSize.current = { width: targetWidth, height: targetHeight };

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(ratio, ratio);
      ctx.globalCompositeOperation = "source-over";

      if (existingLayer) {
        ctx.drawImage(existingLayer, 0, 0, rect.width, rect.height);
        return;
      }

      const gradient = ctx.createLinearGradient(0, 0, rect.width, rect.height);
      gradient.addColorStop(0, "rgba(126,240,195,0.9)");
      gradient.addColorStop(1, "rgba(102,166,255,0.95)");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, rect.width, rect.height);

      for (let i = 0; i < 46; i += 1) {
        const radius = 10 + Math.random() * 34;
        const x = Math.random() * rect.width;
        const y = Math.random() * rect.height;
        const hue = 130 + Math.random() * 120;
        ctx.beginPath();
        ctx.fillStyle = `hsla(${hue}, 80%, 70%, 0.5)`;
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.lineWidth = 14;
      ctx.strokeStyle = "rgba(255,255,255,0.5)";
      for (let i = 0; i < 4; i += 1) {
        ctx.beginPath();
        ctx.moveTo(Math.random() * rect.width, Math.random() * rect.height);
        ctx.bezierCurveTo(
          Math.random() * rect.width,
          Math.random() * rect.height,
          Math.random() * rect.width,
          Math.random() * rect.height,
          Math.random() * rect.width,
          Math.random() * rect.height,
        );
        ctx.stroke();
      }
    }

    paintOverlay({ force: true });
    const onResize = () => paintOverlay({ keepExisting: true });
    window.addEventListener("resize", onResize);

    const resizeObserver = new ResizeObserver(() => paintOverlay({ keepExisting: true }));
    resizeObserver.observe(container);

    return () => {
      window.removeEventListener("resize", onResize);
      resizeObserver.disconnect();
    };
  }, [src]);

  useEffect(() => {
    if (locked) return;
    setUnlockPulse(true);
    const t = setTimeout(() => setUnlockPulse(false), 1100);
    return () => clearTimeout(t);
  }, [locked]);

  function scratch(e) {
    if (locked) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    ctx.save();
    ctx.globalCompositeOperation = "destination-out";
    ctx.beginPath();
    ctx.arc(x, y, 26, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  return (
    <div className={`revealShell ${locked ? "locked" : ""} ${unlockPulse ? "unlockPulse" : ""}`} ref={containerRef}>
      <img className="img" src={src} alt="" draggable={false} onLoad={onImageLoad} />
      <canvas
        className={`revealCanvas ${locked ? "isLocked" : ""}`}
        ref={canvasRef}
        onPointerDown={e => {
          if (locked) return;
          canvasRef.current?.setPointerCapture(e.pointerId);
          setIsDrawing(true);
          scratch(e);
        }}
        onPointerMove={e => {
          if (!isDrawing) return;
          scratch(e);
        }}
        onPointerUp={e => {
          setIsDrawing(false);
          canvasRef.current?.releasePointerCapture(e.pointerId);
        }}
        onPointerLeave={() => setIsDrawing(false)}
      />
    </div>
  );
}

export default function Reader({ storyId }) {
  const [data, setData] = useState(null);
  const [idx, setIdx] = useState(0);
  const [err, setErr] = useState("");
  const [parentKey, setParentKey] = useState(""); // paste key to enable uploads
  const [mode, setMode] = useState("view");
  const [actionStatus, setActionStatus] = useState("");
  const [deleteStatus, setDeleteStatus] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [tappedWordIndexes, setTappedWordIndexes] = useState(new Set());
  const [lastTappedWord, setLastTappedWord] = useState(null);
  const [imageSize, setImageSize] = useState({ width: 16, height: 9 });

  const sentenceAudioRef = useRef(null);
  const htmlAudioFallbackRef = useRef(null);
  const wordCache = useRef(new Map());
  const audioContextRef = useRef(null);

  function getAudioContext() {
    if (!audioContextRef.current) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      audioContextRef.current = new Ctx();
    }
    return audioContextRef.current;
  }

  function normalizeWord(raw) {
    return (raw || "").toLowerCase().replace(/^[\'’]+|[\'’]+$/g, "");
  }

  useEffect(() => {
    apiGet(`/api/stories/${storyId}`)
      .then(d => { setData(d); setIdx(0); })
      .catch(e => setErr(String(e)));
  }, [storyId]);

  const sentence = data?.sentences?.[idx];
  const tokens = useMemo(() => extractDisplayWords(sentence?.text || ""), [sentence?.text]);
  const wordCount = useMemo(() => tokens.filter(t => t.kind === "word").length, [tokens]);
  const allWordsTapped = wordCount > 0 && tappedWordIndexes.size >= wordCount;
  const storyProgressPct = useMemo(() => {
    if (!data?.sentences?.length) return 0;
    return Math.round(((idx + 1) / data.sentences.length) * 100);
  }, [data?.sentences?.length, idx]);
  const sentenceProgressPct = useMemo(() => {
    if (!wordCount) return 0;
    return Math.min(100, Math.round((tappedWordIndexes.size / wordCount) * 100));
  }, [tappedWordIndexes.size, wordCount]);

  useEffect(() => {
    setActionStatus("");
  }, [idx]);

  useEffect(() => {
    if (mode !== "edit") setDeleteStatus("");
  }, [mode]);

  useEffect(() => {
    setTappedWordIndexes(new Set());
    setLastTappedWord(null);
  }, [sentence?.text]);

  useEffect(() => {
    setImageSize({ width: 16, height: 9 });
  }, [sentence?.imageUrl]);

  async function playSentence() {
    if (!sentence?.sentenceAudioUrl) return;
    if (!sentenceAudioRef.current) {
      sentenceAudioRef.current = new Audio();
      sentenceAudioRef.current.preload = "auto";
    }
    if (sentenceAudioRef.current.src !== sentence.sentenceAudioUrl) {
      sentenceAudioRef.current.src = sentence.sentenceAudioUrl;
      sentenceAudioRef.current.load();
    }
    sentenceAudioRef.current
      .play()
      .catch(() => {});
  }

  async function playWord(raw) {
    const w = normalizeWord(raw);
    if (!w) return;

    const url = await ensureWordUrl(w);
    if (!url) return;

    try {
      const buffer = await ensureWordBuffer(w, url);
      const ctx = getAudioContext();
      await ctx.resume();
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.connect(ctx.destination);
      src.start();
      return;
    } catch {
      // Fall back to HTMLAudio playback if decoding fails or is blocked.
    }

    if (!htmlAudioFallbackRef.current) htmlAudioFallbackRef.current = new Audio();
    htmlAudioFallbackRef.current.src = url;
    htmlAudioFallbackRef.current.play().catch(() => {});
  }

  function onWordTap(wordIdx, raw) {
    setLastTappedWord(wordIdx);
    setTappedWordIndexes(prev => {
      const next = new Set(prev);
      next.add(wordIdx);
      return next;
    });
    playWord(raw);
  }

  async function ensureWordUrl(w) {
    const existing = wordCache.current.get(w);
    if (existing?.url) return existing.url;

    const pendingUrl = existing?.fetchPromise;
    if (pendingUrl) return pendingUrl;

    const fetchPromise = apiGet(`/api/word-audio?word=${encodeURIComponent(w)}`)
      .then(r => r.audioUrl)
      .catch(() => null);

    wordCache.current.set(w, { ...(existing || {}), fetchPromise });
    const url = await fetchPromise;
    wordCache.current.set(w, { ...(existing || {}), url });
    return url;
  }

  async function ensureWordBuffer(w, urlFromCaller) {
    const cached = wordCache.current.get(w);
    if (cached?.buffer) return cached.buffer;

    const url = urlFromCaller || cached?.url || (await ensureWordUrl(w));
    if (!url) throw new Error("No URL");

    const ctx = getAudioContext();
    const arrayBuf = await fetch(url).then(r => r.arrayBuffer());
    const buffer = await ctx.decodeAudioData(arrayBuf.slice(0));
    wordCache.current.set(w, { ...(cached || {}), url, buffer });
    return buffer;
  }

  useEffect(() => {
    const words = tokens
      .filter(t => t.kind === "word")
      .map(t => normalizeWord(t.wordOnly))
      .filter(Boolean);

    const unique = Array.from(new Set(words));
    unique.forEach(w => {
      ensureWordUrl(w).catch(() => {
        // Ignore preload failures; playback will fall back to HTMLAudio.
      });
    });
  }, [tokens]);

  function onImageLoad(e) {
    const { naturalWidth, naturalHeight } = e.target || {};
    if (naturalWidth && naturalHeight) {
      setImageSize({ width: naturalWidth, height: naturalHeight });
    }
  }

  const imageAspectStyle = useMemo(
    () => ({ "--img-aspect-ratio": `${imageSize.width} / ${imageSize.height}` }),
    [imageSize.height, imageSize.width]
  );

  useEffect(() => {
    if (!sentence?.sentenceAudioUrl) return;
    if (!sentenceAudioRef.current) {
      sentenceAudioRef.current = new Audio();
      sentenceAudioRef.current.preload = "auto";
    }
    if (sentenceAudioRef.current.src !== sentence.sentenceAudioUrl) {
      sentenceAudioRef.current.src = sentence.sentenceAudioUrl;
      sentenceAudioRef.current.load();
    }
  }, [sentence?.sentenceAudioUrl]);

  async function onUploadImage(file) {
    if (!parentKey || mode !== "edit") return;
    try {
      setActionStatus("Uploading image…");
      await apiUploadImage(`/api/stories/${storyId}/sentences/${idx}/image`, file, parentKey);
      const fresh = await apiGet(`/api/stories/${storyId}`);
      setData(fresh);
      setActionStatus("Image updated.");
    } catch (e) {
      setErr(String(e));
      setActionStatus("");
    }
  }

  async function onRegenerateAudio() {
    if (!parentKey || mode !== "edit") return;
    setErr("");
    setActionStatus("Regenerating audio…");
    try {
      await apiPostJson(`/api/stories/${storyId}/sentences/${idx}/regenerate-audio`, {}, parentKey);
      const fresh = await apiGet(`/api/stories/${storyId}`);
      setData(fresh);
      setActionStatus("Sentence audio refreshed.");
    } catch (e) {
      setErr(String(e));
      setActionStatus("");
    }
  }

  async function onDeleteStory() {
    if (!parentKey || mode !== "edit") return;
    if (!window.confirm("Delete this story? This cannot be undone.")) return;

    setErr("");
    setDeleteStatus("Deleting story…");
    setDeleting(true);
    try {
      await apiDelete(`/api/stories/${storyId}`, null, parentKey);
      setDeleteStatus("Story deleted.");
      window.location.hash = "#/";
    } catch (e) {
      setDeleteStatus("");
      setErr(String(e));
    } finally {
      setDeleting(false);
    }
  }

  function isEditEnabled() {
    return mode === "edit" && !!parentKey;
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

      <div className="page">
        <div className="progressPanel" aria-label="Progress indicators">
          <div className="progressTrack" aria-label="Story progress">
            <div className="progressFill story" style={{ width: `${storyProgressPct}%` }} />
          </div>
          <div className="progressTrack" aria-label="Sentence taps">
            <div className="progressFill sentence" style={{ width: `${sentenceProgressPct}%` }} />
          </div>
        </div>

        <div className="imageBox" style={imageAspectStyle}>
          {sentence.imageUrl ? (
            mode === "view" ? (
              <ScratchImageReveal
                key={`${idx}-${sentence.imageUrl}`}
                src={sentence.imageUrl}
                locked={!allWordsTapped}
                onImageLoad={onImageLoad}
              />
            ) : (
              <img className="img" src={sentence.imageUrl} alt="" draggable={false} onLoad={onImageLoad} />
            )
          ) : (
            <div className="imgPlaceholder">No image</div>
          )}

          {mode === "edit" ? (
            <label className={`imgBtn ${isEditEnabled() ? "" : "disabled"}`}>
              + Add Image
              <input
                type="file"
                accept="image/*"
                style={{ display: "none" }}
                disabled={!isEditEnabled()}
                onChange={e => {
                  const f = e.target.files?.[0];
                  if (f) onUploadImage(f);
                }}
              />
            </label>
          ) : null}
        </div>

        <div className="sentence">
          {tokens.map((t, i) => {
            if (t.kind === "space") return <span key={i}>{t.text}</span>;
            if (t.kind === "punct") return <span key={i}>{t.text}</span>;
            return (
              <button
                key={i}
                className={`wordBtn ${lastTappedWord === i ? "wordActive" : ""}`}
                onClick={() => onWordTap(i, t.wordOnly)}
              >
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

        {mode === "edit" ? (
          <div className="editActions">
            <div className="muted">Editing tools</div>
            <div className="wordActions">
              <button className="btn" onClick={onRegenerateAudio} disabled={!isEditEnabled()}>
                Regenerate Sentence Audio
              </button>
              {!parentKey ? <div className="pill">Enter studio key to edit</div> : null}
            </div>
            {actionStatus ? <div className="status">{actionStatus}</div> : null}
          </div>
        ) : null}

        <div className="muted center">Page {idx + 1} / {data.sentences.length}</div>
      </div>

      <div className="card storyMeta">
        <div className="subtitle">Studio Key (optional)</div>
        <input
          className="input"
          placeholder="Paste key to enable editing and uploads"
          value={parentKey}
          onChange={e => setParentKey(e.target.value)}
        />
        <div className="modeToggle">
          <button
            className={`modeBtn ${mode === "view" ? "active" : ""}`}
            onClick={() => setMode("view")}
          >
            View Mode
          </button>
          <button
            className={`modeBtn ${mode === "edit" ? "active" : ""}`}
            onClick={() => setMode("edit")}
          >
            Edit Mode
          </button>
        </div>
        <div className="muted">
          View mode is read-only. Switch to edit to upload photos or regenerate sentence audio (key required).
        </div>

        {mode === "edit" ? (
          <div className="storyDangerRow">
            <div className="muted">Delete this story</div>
            <button
              className="btn trashBtn large"
              onClick={onDeleteStory}
              disabled={!parentKey || deleting}
            >
              {deleting ? "Deleting…" : "🗑 Delete Story"}
            </button>
          </div>
        ) : null}

        {deleteStatus ? <div className="status">{deleteStatus}</div> : null}
      </div>
    </div>
  );
}
