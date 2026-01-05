export function splitIntoSentences(text) {
  const cleaned = (text || "").replace(/\s+/g, " ").trim();
  if (!cleaned) return [];

  // Match runs that end in sentence punctuation, optionally followed by
  // closing quotes/brackets. This keeps quoted sentences intact and ensures
  // punctuation like .” or ?' still signal the sentence boundary.
  const matches = cleaned.match(/[^.!?]+[.!?]["'”’\)\]]*(?=\s+|$)/g);

  return matches ? matches.map(s => s.trim()) : [cleaned];
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
