export function splitIntoSentences(text) {
  const cleaned = (text || "").replace(/\s+/g, " ").trim();
  if (!cleaned) return [];

  // Use the built-in browser API for locale-aware sentence segmentation.
  // This handles quotes, abbreviations (Mr., Dr.), and punctuation correctly.
  const segmenter = new Intl.Segmenter("en", { granularity: "sentence" });
  const segments = segmenter.segment(cleaned);

  return Array.from(segments)
    .map(s => s.segment.trim())
    .filter(s => s.length > 0);
}

export function extractWords(text) {
  // words with apostrophes
  const matches = (text || "").match(/[A-Za-z'’]+/g);
  return matches ? matches : [];
}

export function normalizeWord(w) {
  // lowercase, strip leading/trailing apostrophes
  return (w || "")
    .toLowerCase()
    .replace(/^[\'’]+|[\'’]+$/g, "")
    .trim();
}
