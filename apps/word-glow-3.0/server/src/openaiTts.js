import { spawn } from "child_process";
import ffmpegPath from "ffmpeg-static";
import OpenAI from "openai";

const SILENCE_TRIM_CONFIG = {
  startSilenceSeconds: 0.35,
  stopSilenceSeconds: 0.35,
  thresholdDb: -35
};

function buildSilenceFilter({ startSilenceSeconds, stopSilenceSeconds, thresholdDb }) {
  const threshold = `${thresholdDb}dB`;
  return [
    "silenceremove",
    "start_periods=1",
    `start_duration=${startSilenceSeconds}`,
    `start_threshold=${threshold}`,
    "stop_periods=1",
    `stop_duration=${stopSilenceSeconds}`,
    `stop_threshold=${threshold}`
  ].join(":");
}

export async function trimSilenceMp3(buffer, config = {}) {
  if (!ffmpegPath || !Buffer.isBuffer(buffer) || buffer.length === 0) return buffer;

  const { startSilenceSeconds, stopSilenceSeconds, thresholdDb } = {
    ...SILENCE_TRIM_CONFIG,
    ...config
  };

  const args = [
    "-hide_banner",
    "-loglevel",
    "error",
    "-i",
    "pipe:0",
    "-af",
    buildSilenceFilter({ startSilenceSeconds, stopSilenceSeconds, thresholdDb }),
    "-f",
    "mp3",
    "pipe:1"
  ];

  return await new Promise(resolve => {
    const child = spawn(ffmpegPath, args);
    const out = [];
    let stderr = "";

    const fallback = () => resolve(buffer);

    child.stdout.on("data", chunk => out.push(chunk));
    child.stderr.on("data", chunk => { stderr += chunk.toString(); });
    child.on("error", fallback);
    child.on("close", code => {
      if (code === 0 && out.length > 0) {
        resolve(Buffer.concat(out));
      } else {
        if (stderr) console.warn("[trimSilenceMp3] ffmpeg stderr:", stderr.trim());
        fallback();
      }
    });

    child.stdin.on("error", fallback);
    child.stdin.write(buffer);
    child.stdin.end();
  });
}

export function getOpenAIClient() {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("Missing OPENAI_API_KEY.");
  return new OpenAI({ apiKey: key });
}

export async function ttsMp3({ text, voice, model, instructions }) {
  const openai = getOpenAIClient();

  // OpenAI TTS guide: Audio speech endpoint with model + voice + input. :contentReference[oaicite:0]{index=0}
  const resp = await openai.audio.speech.create({
    model,
    voice,
    input: text,
    instructions: instructions || undefined
  });

  const raw = Buffer.from(await resp.arrayBuffer());

  try {
    return await trimSilenceMp3(raw);
  } catch (err) {
    console.warn("[ttsMp3] Failed to trim silence:", err);
    return raw;
  }
}
