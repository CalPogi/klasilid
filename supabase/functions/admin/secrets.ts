// Codes and keys the admin function makes, in exactly the formats of scripts/school-code.mjs and
// scripts/new-reader.mjs (a test keeps them equal). Web Crypto only, so this runs in Deno and in Node tests.
import { sha256Hex } from '../tap/handler.ts';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O, 1/I

/** A uniform random integer in [0, max), by rejection sampling (no modulo bias). */
function randomInt(max: number): number {
  const limit = Math.floor(0x1_0000_0000 / max) * max;
  const buf = new Uint32Array(1);
  for (;;) {
    crypto.getRandomValues(buf);
    if (buf[0] < limit) return buf[0] % max;
  }
}

function base64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** A school's sign-up code `XXXX-XXXX`; stored as sha256 of its 8 characters. */
export async function makeSchoolCode(): Promise<{ code: string; hash: string }> {
  const raw = Array.from({ length: 8 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');
  return { code: `${raw.slice(0, 4)}-${raw.slice(4)}`, hash: await sha256Hex(raw) };
}

/** A reader key (32 random bytes, base64url) and pairing code (8 digits), with their sha256 hashes. */
export async function makeReaderSecrets(): Promise<{ key: string; pairingCode: string; keyHash: string; tokenHash: string }> {
  const key = base64url(crypto.getRandomValues(new Uint8Array(32)));
  const pairingCode = String(randomInt(100_000_000)).padStart(8, '0');
  return { key, pairingCode, keyHash: await sha256Hex(key), tokenHash: await sha256Hex(pairingCode) };
}

export function randomReaderId(): string {
  return `KD-${String(randomInt(10_000)).padStart(4, '0')}`;
}
