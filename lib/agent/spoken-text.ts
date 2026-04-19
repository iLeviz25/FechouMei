const spokenFillerPatterns = [
  /\b(?:tipo assim|tipo|entao assim|então assim|assim|entao|então|olha so|olha só|olha|bom|bem|ne|né|ta|tá|ok|okay|sabe|entendeu)\b/gi,
  /\b(?:me ajuda(?:\s+a[ií])?(?:\s+a)?|ajuda(?:\s+a[ií])?(?:\s+a)?)\b/gi,
  /\b(?:pra mim|para mim|por favor|porfavor)\b/gi,
  /(^|\s)(?:o|ó|oh)[,\s]+/gi,
  /\b(?:ai|aí|dai|daí)\b/gi,
];

export function normalizeSpokenAgentMessage(message: string) {
  let normalized = message
    .replace(/[“”]/g, "\"")
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, " ")
    .trim();

  for (const pattern of spokenFillerPatterns) {
    normalized = normalized.replace(pattern, " ");
  }

  return normalized
    .replace(/\b(?:tambem|também)\b/gi, " e ")
    .replace(/\b(?:alem disso|além disso|depois|junto com isso)\b/gi, " e ")
    .replace(/^[,\s]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
