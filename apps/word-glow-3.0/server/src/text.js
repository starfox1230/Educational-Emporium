export function splitIntoSentences(text) {
  const cleaned = (text || "").replace(/\s+/g, " ").trim();
  if (!cleaned) return [];
  const withMarkers = cleaned
    // Mark boundaries where punctuation is followed by optional closing quotes/parens and whitespace
    .replace(/([.!?]["'”’\)\]]*)\s+/g, "$1|")
    // Also handle text that ends without trailing whitespace
    .replace(/([.!?]["'”’\)\]]*)$/g, "$1|");

  return withMarkers
    .split("|")
    .map(s => s.trim())
    .filter(Boolean);
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
