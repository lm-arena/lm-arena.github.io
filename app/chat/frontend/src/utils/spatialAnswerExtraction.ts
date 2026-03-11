/**
 * Extract predicted answers from model responses to spatial reasoning tasks
 */

export function extractSpatialAnswer(
  response: string,
  taskFormat: 'free_text' | 'direction' | 'entity' | 'description'
): string {
  const cleaned = response.trim();

  if (taskFormat === 'direction') {
    // Extract cardinal directions and relative directions
    const directions = ['north', 'south', 'east', 'west', 'left', 'right', 'up', 'down', 'forward', 'backward', 'turn'];
    const found = directions.filter(d => cleaned.toLowerCase().includes(d));
    if (found.length > 0) {
      return found.join(', ').toLowerCase();
    }
  }

  if (taskFormat === 'entity') {
    // For entity answers, extract noun phrases or color names
    const colors = ['red', 'blue', 'green', 'yellow', 'white', 'black', 'pink', 'orange', 'purple'];
    const colorMatch = colors.find(c => cleaned.toLowerCase().includes(c));
    if (colorMatch) return colorMatch;

    // Extract capitalized words (likely proper nouns)
    const nounMatch = cleaned.match(/\b[A-Z][a-z]+\b/g);
    if (nounMatch && nounMatch.length > 0) return nounMatch[0].toLowerCase();
  }

  if (taskFormat === 'description') {
    // For descriptions, return last complete sentence
    const sentences = cleaned.split(/[.!?]+/).filter(s => s.trim().length > 0);
    if (sentences.length > 0) {
      return sentences[sentences.length - 1].trim().toLowerCase();
    }
  }

  // Default: return last 20 words
  const words = cleaned.split(/\s+/);
  return words.slice(Math.max(0, words.length - 20)).join(' ').toLowerCase();
}

export function extractCardinals(text: string): string[] {
  const cardinals = ['north', 'south', 'east', 'west', 'n', 's', 'e', 'w'];
  const found = new Set<string>();

  for (const cardinal of cardinals) {
    if (new RegExp(`\\b${cardinal}\\b`, 'i').test(text)) {
      found.add(cardinal.toLowerCase());
    }
  }

  return Array.from(found);
}

export function extractKeywords(text: string): string[] {
  // Extract multi-word phrases and longer words
  const words = text.toLowerCase().split(/\s+/).filter(w => w.length > 3);
  const phrases = text.match(/\b[a-z]+\s+[a-z]+\b/gi) || [];
  return [...new Set([...words, ...(phrases.map(p => p.toLowerCase()) || [])])];
}
