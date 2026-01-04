import React, { useEffect, useRef, useState } from "react";
import WaveSurfer from "wavesurfer.js";
import RegionsPlugin from "wavesurfer.js/dist/plugins/regions.esm.js";
import lamejs from "lamejs";

export default function AudioTrimmer({ word, url, onClose, onSave }) {
  const containerRef = useRef(null);
  const surferRef = useRef(null);
  const regionsRef = useRef(null);
  const [status, setStatus] = useState("Loading waveform…");
  const [isReady, setIsReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    if (!containerRef.current) return undefined;

    const ws = WaveSurfer.create({
      container: containerRef.current,
      waveColor: "#4a74a5",
      progressColor: "#66a6ff",
      cursorColor: "#e7eefc",
      barWidth: 2,
      height: 128,
      normalize: true,
      url,
    });

    const wsRegions = ws.registerPlugin(RegionsPlugin.create());

    ws.on("ready", () => {
      setIsReady(true);
      setStatus("Ready. Drag or resize the region to trim.");

      const duration = ws.getDuration();
      wsRegions.addRegion({
        start: duration * 0.1,
        end: duration * 0.9,
        color: "rgba(102, 166, 255, 0.3)",
        drag: true,
        resize: true,
        loop: true,
      });
    });

    ws.on("error", e => setStatus(`Error: ${e?.message || e}`));

    ws.on("play", () => {
      setIsPlaying(true);
    });
    ws.on("pause", () => {
      setIsPlaying(false);
    });

    surferRef.current = ws;
    regionsRef.current = wsRegions;

    return () => {
      ws.destroy();
    };
  }, [url]);

  const togglePlay = () => {
    if (!surferRef.current) return;
    if (isPlaying) {
      surferRef.current.pause();
      return;
    }
    const regions = regionsRef.current?.getRegions() || [];
    if (regions.length > 0) {
      regions[0].playLoop();
    } else {
      surferRef.current?.playPause();
    }
  };

  const handleSave = async () => {
    setStatus("Processing trim…");
    const regions = regionsRef.current?.getRegions() || [];
    if (!regions.length) {
      setStatus("Add a selection before saving.");
      return;
    }

    const start = regions[0].start;
    const end = regions[0].end;

    const buffer = surferRef.current?.getDecodedData();
    if (!buffer) {
      setStatus("Error: Audio not loaded");
      return;
    }

    try {
      const blob = encodeTrimToMp3(buffer, start, end);
      const base64 = await blobToBase64(blob);
      await onSave(base64);
    } catch (e) {
      setStatus(`Error encoding: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  return (
    <div className="modalBackdrop">
      <div className="modal">
        <div className="modalHeader">
          <div className="subtitle">Trim “{word}”</div>
          <button className="btn" onClick={onClose} aria-label="Close trim dialog">
            ✕
          </button>
        </div>

        <div className="muted" style={{ marginBottom: 10 }}>
          Drag the blue box to select the word. Use Play Selection to loop the region before saving.
        </div>

        <div
          ref={containerRef}
          style={{
            marginBottom: 16,
            background: "rgba(0,0,0,0.2)",
            borderRadius: 8,
            border: "1px solid rgba(255,255,255,0.1)",
            minHeight: 140,
          }}
        />

        <div className="status" style={{ marginBottom: 10 }}>
          {status}
        </div>

        <div className="wordActions" style={{ justifyContent: "flex-end" }}>
          <button className="btn" onClick={togglePlay} disabled={!isReady}>
            {isPlaying ? "Pause" : "Play Selection"}
          </button>
          <button className="btnPrimary" onClick={handleSave} disabled={!isReady}>
            Save Trim
          </button>
        </div>
      </div>
    </div>
  );
}

function floatTo16BitPCM(input) {
  const output = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]));
    output[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return output;
}

function encodeTrimToMp3(buffer, start, end) {
  const sampleRate = buffer.sampleRate;
  const startSample = Math.floor(start * sampleRate);
  const endSample = Math.floor(end * sampleRate);

  if (startSample >= endSample) throw new Error("Invalid selection");

  const left = buffer.getChannelData(0).slice(startSample, endSample);
  const right = buffer.numberOfChannels > 1 ? buffer.getChannelData(1).slice(startSample, endSample) : left;

  const encoder = new lamejs.Mp3Encoder(2, sampleRate, 128);
  const mp3Data = [];
  const maxSamples = 1152;

  for (let i = 0; i < left.length; i += maxSamples) {
    const leftChunk = floatTo16BitPCM(left.subarray(i, i + maxSamples));
    const rightChunk = floatTo16BitPCM(right.subarray(i, i + maxSamples));
    const buf = encoder.encodeBuffer(leftChunk, rightChunk);
    if (buf.length > 0) mp3Data.push(buf);
  }

  const endBuf = encoder.flush();
  if (endBuf.length > 0) mp3Data.push(endBuf);
  return new Blob(mp3Data, { type: "audio/mpeg" });
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
