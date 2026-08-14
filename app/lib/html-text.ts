const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
};

export function stripHtml(html: string): string {
  const source = String(html);
  let text = "";
  let cursor = 0;

  while (cursor < source.length) {
    if (source[cursor] !== "<" || !isTagStart(source[cursor + 1])) {
      text += source[cursor];
      cursor += 1;
      continue;
    }

    const tagStart = cursor;
    cursor += 1;
    let quote = "";
    let closed = false;
    while (cursor < source.length) {
      const character = source[cursor];
      if (quote) {
        if (character === quote) quote = "";
      } else if (character === '"' || character === "'") {
        quote = character;
      } else if (character === ">") {
        closed = true;
        cursor += 1;
        break;
      }
      cursor += 1;
    }

    if (!closed) {
      text += source.slice(tagStart);
      break;
    }
    text += " ";
  }

  return text
    .replace(/&(amp|lt|gt|quot|#39);/g, (entity) => ENTITIES[entity] ?? entity)
    .replace(/\s+/g, " ")
    .trim();
}

function isTagStart(value: string | undefined): boolean {
  return Boolean(value && /[A-Za-z/!?]/.test(value));
}
