const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

/**
 * One left-to-right pass. Replacements are not scanned again, so `&amp;amp;`
 * stays `&amp;` and `&amp;lt;` stays `&lt;`.
 */
function decodeEntitiesOnce(text: string): string {
  return text.replace(
    /&(#x[0-9a-fA-F]+|#[0-9]+|[a-zA-Z][a-zA-Z0-9]+);/g,
    (match, body: string) => {
      const named = NAMED_ENTITIES[body.toLowerCase()];
      if (named) return named;
      if (body[0] !== '#') return match;
      const hex = body[1] === 'x' || body[1] === 'X';
      const codePoint = Number.parseInt(body.slice(hex ? 2 : 1), hex ? 16 : 10);
      if (
        !Number.isInteger(codePoint) ||
        codePoint < 0 ||
        codePoint > 0x10ffff ||
        (codePoint >= 0xd800 && codePoint <= 0xdfff)
      ) {
        return match;
      }
      return String.fromCodePoint(codePoint);
    },
  );
}

/** Plain reading text from stored note HTML. The original HTML is exported separately. */
export function noteHtmlToText(html: string | null | undefined): string {
  if (!html) return '';
  const withoutBlocks = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '');
  const withBreaks = withoutBlocks
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|blockquote)>/gi, '\n');
  const stripped = withBreaks.replace(/<[^>]+>/g, '');
  return decodeEntitiesOnce(stripped)
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
