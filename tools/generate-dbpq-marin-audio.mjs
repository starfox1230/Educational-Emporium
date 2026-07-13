import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = path.join(root, "apps", "dbpq-letter-quest", "audio", "marin");
const manifestPath = path.join(outputDir, "manifest.js");
const apiKey = process.env.OPENAI_API_KEY;

if (!apiKey) {
  throw new Error("OPENAI_API_KEY is required to generate the Marin audio library.");
}

const letters = [..."abcdefghijklmnopqrstuvwxyz"];
const worlds = [
  "Deep Ocean", "Outer Space", "Dinosaur Jungle", "Magical Forest", "Robot Workshop",
  "Pirate Island", "Cloud Kingdom", "Glowing Cave", "Arctic Expedition",
];
const phonics = {
  b: "the letter that says buh",
  d: "the letter that says duh",
  p: "the letter that says puh",
  q: "the letter q, usually followed by u",
};
const structuralClues = {
  b: "the letter with a tall line first and a belly on the right",
  d: "the letter with a round part first and a tall line on the right",
  p: "the letter that goes below the line and has its bowl on the right",
  q: "the letter that goes below the line with its tail on the right",
};
const prompts = new Map();
const add = (key, input = key) => prompts.set(key, input);

function spokenLetterPrompt(letter, verb, mode) {
  const writing = verb.toLowerCase() === "write";
  if (mode === "phonics" && phonics[letter]) {
    return writing
      ? `${verb} lowercase ${letter}, ${phonics[letter]}.`
      : `${verb} ${phonics[letter]}.`;
  }
  if (mode === "both" && phonics[letter]) {
    return `${verb}${writing ? " lowercase" : ""} ${letter}, ${phonics[letter]}.`;
  }
  return `${verb}${writing ? " lowercase" : ""} ${letter}.`;
}

[
  "Welcome to Letter Quest!",
  "Sound is ready for Letter Quest.",
  "Sound is ready.",
  "Tap these letters in order.",
  "Find the one letter that is different.",
  "Trace the letter you heard.",
  "Good practice. Trace the whole path once more.",
  "Let's listen one more time.",
  "Let's look at it together.",
  "Try making the main line and round part clearly.",
  "This one needs to go below the line.",
  "This one needs a tall line above the round part.",
  "Try making the line and round part connect clearly.",
  "You found it!", "Excellent listening!", "Nice work!", "You spotted it!",
  "You found them all!", "Perfect order!", "Sorted perfectly!", "Sharp eyes!",
  "Rocket launch!", "Bubbles rescued!", "Treasure found!", "Wonderful tracing!",
  "You remembered it!", "Built correctly!",
].forEach(text => add(text));
add("answer-prefix", "The answer is:");

worlds.forEach(world => add(`Welcome to ${world}.`));

letters.forEach(letter => {
  add(`letter:${letter}`, letter.toUpperCase());
  add(`That one is ${letter}.`);
  add(`That is ${letter}.`);
  add(`The answer is ${letter}.`);
  for (const verb of ["Find", "Find every", "Move the object to", "Pop every", "Dig for", "Trace", "Write", "Build"]) {
    for (const mode of ["name", "phonics", "both"]) {
      add(spokenLetterPrompt(letter, verb, mode));
    }
  }
});

["left", "right"].forEach(side => add(`That one is ${side}.`));
Object.values(structuralClues).forEach(clue => add(`Find ${clue}.`));

[
  "b has a tall line first and a belly on the right.",
  "d has the round part first and the tall line on the right.",
  "p goes below the line and has its belly on the right.",
  "q goes below the line with its tail on the right.",
].forEach(text => add(text));

for (const letter of ["b", "d", "p", "q"]) {
  for (const side of ["left", "right"]) {
    add(`For ${letter}, the main line belongs on the ${side}.`);
    add(`For ${letter}, the round part belongs on the ${side}.`);
  }
}

await mkdir(outputDir, { recursive: true });

let previousManifest = {};
try {
  const previous = await readFile(manifestPath, "utf8");
  const match = previous.match(/Object\.freeze\((\{[\s\S]*\})\);?\s*$/);
  if (match) previousManifest = JSON.parse(match[1]);
} catch {}

const entries = [...prompts.entries()].sort(([a], [b]) => a.localeCompare(b));
const manifest = {};
let cursor = 0;
let generated = 0;

function filenameFor(key) {
  const slug = key
    .replace(/^letter:/, "letter-")
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 56)
    .toLowerCase() || "clip";
  const hash = createHash("sha256").update(key).digest("hex").slice(0, 10);
  return `${slug}-${hash}.mp3`;
}

async function generate(key, input) {
  const filename = filenameFor(key);
  const filePath = path.join(outputDir, filename);
  manifest[key] = `audio/marin/${filename}`;

  if (previousManifest[key] === manifest[key]) {
    try {
      const existing = await readFile(filePath);
      if (existing.length > 1000) return;
    } catch {}
  }

  const response = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini-tts",
      voice: "marin",
      input,
      response_format: "mp3",
      instructions: "Speak in a warm, natural, encouraging voice for a young child learning lowercase letters. Pronounce isolated letters by their standard English letter names. Pronounce phonics cues exactly as written. Keep the delivery concise, clear, and consistent. Do not add or omit words.",
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI TTS failed for ${JSON.stringify(key)}: ${response.status} ${await response.text()}`);
  }
  const audio = Buffer.from(await response.arrayBuffer());
  if (audio.length < 1000) throw new Error(`OpenAI TTS returned an invalid audio file for ${JSON.stringify(key)}.`);
  await writeFile(filePath, audio);
  generated++;
  process.stdout.write(`Generated ${generated}: ${key}\n`);
}

const concurrency = 8;
await Promise.all(Array.from({ length: concurrency }, async () => {
  while (cursor < entries.length) {
    const [key, input] = entries[cursor++];
    await generate(key, input);
  }
}));

const manifestSource = `// Generated by tools/generate-dbpq-marin-audio.mjs.\nwindow.DBPQ_MARIN_AUDIO = Object.freeze(${JSON.stringify(manifest, null, 2)});\n`;
await writeFile(manifestPath, manifestSource, "utf8");
process.stdout.write(`Marin library ready: ${entries.length} clips (${generated} generated).\n`);
