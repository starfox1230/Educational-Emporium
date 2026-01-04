import OpenAI from "openai";

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

  return Buffer.from(await resp.arrayBuffer());
}
