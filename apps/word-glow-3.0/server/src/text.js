export function splitIntoSentences(text) {
  const cleaned = (text || "").replace(/\s+/g, " ").trim();
  if (!cleaned) return [];
  return cleaned.split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(Boolean);
}

export function extractWords(text) {
  // words with apostrophes
  const matches = (text || "").match(/[A-Za-z']+/g);
  return matches ? matches : [];
}

export function normalizeWord(w) {
  // lowercase, strip leading/trailing apostrophes
  return (w || "")
    .toLowerCase()
    .replace(/^'+|'+$/g, "")
    .trim();
}
