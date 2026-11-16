import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'crypto';

const IV_LENGTH = 12;
const TAG_LENGTH = 16;

/** 32-byte key. The refresh token stays unreadable from the database alone. */
function sealKey(secret: string): Buffer {
  return createHash('sha256')
    .update('prysmic-refresh-seal')
    .update(secret, 'utf8')
    .digest();
}

/** Encrypts the successor so a concurrent refresh can be handed the same cookie. */
export function sealRefreshToken(raw: string, secret: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv('aes-256-gcm', sealKey(secret), iv);
  const ciphertext = Buffer.concat([
    cipher.update(raw, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]).toString('base64url');
}

/** Null when the seal is damaged or was made with a different secret. */
export function openRefreshSeal(sealed: string, secret: string): string | null {
  try {
    const packed = Buffer.from(sealed, 'base64url');
    if (packed.length <= IV_LENGTH + TAG_LENGTH) return null;
    const iv = packed.subarray(0, IV_LENGTH);
    const tag = packed.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
    const ciphertext = packed.subarray(IV_LENGTH + TAG_LENGTH);
    const decipher = createDecipheriv('aes-256-gcm', sealKey(secret), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    return null;
  }
}
