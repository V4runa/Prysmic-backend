// Guardrails for note attachments. The client compresses images before upload,
// so these are the server-side safety net (a client could be bypassed) and the
// bound that keeps the Postgres-backed store from quietly bloating.

/** Hard per-file ceiling accepted by the API (post client-side compression). */
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024; // 10 MB

/** Cap on how many attachments a single note may hold. */
export const MAX_ATTACHMENTS_PER_NOTE = 20;

/** Accepted MIME types: images + a few common document formats. */
export const ALLOWED_MIME_TYPES = new Set<string>([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'application/pdf',
  'text/plain',
  'text/markdown',
]);

// Some browsers/OSes send text/markdown or plain .md files as octet-stream or
// with an empty type; allow those through by extension so notes-adjacent docs
// aren't rejected on a technicality.
const EXTENSION_FALLBACK: Record<string, string> = {
  '.md': 'text/markdown',
  '.markdown': 'text/markdown',
  '.txt': 'text/plain',
};

/**
 * Decide whether a file is acceptable, resolving the MIME type we should store.
 * Returns the canonical mime type when allowed, or null when it should be
 * rejected.
 */
export function resolveAllowedMime(
  mimeType: string | undefined,
  filename: string,
): string | null {
  const mt = (mimeType ?? '').toLowerCase();
  if (ALLOWED_MIME_TYPES.has(mt)) return mt;

  const dot = filename.lastIndexOf('.');
  if (dot !== -1) {
    const ext = filename.slice(dot).toLowerCase();
    if (EXTENSION_FALLBACK[ext]) return EXTENSION_FALLBACK[ext];
  }
  return null;
}
