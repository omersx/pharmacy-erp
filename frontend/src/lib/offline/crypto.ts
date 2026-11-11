/**
 * Web Crypto & PIN Security
 *
 * Implements PBKDF2-HMAC-SHA256 key derivation with 600,000 iterations (OWASP guidance)
 * for offline terminal PIN verification and fast user unlock.
 * Conforms to PWA implementation guide §8.3 & §8.4.
 */

import { db } from "./db";

const PBKDF2_ITERATIONS = 600_000;

function bufferToHex(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, "0");
  }
  return hex;
}

function hexToBuffer(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

/**
 * Derives a secure hash from a PIN and salt using PBKDF2
 */
export async function derivePinHash(pin: string, salt: Uint8Array): Promise<string> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(pin),
    { name: "PBKDF2" },
    false,
    ["deriveBits"]
  );

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: salt as BufferSource,
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    keyMaterial,
    256
  );

  return bufferToHex(derivedBits);
}

/**
 * Saves a 6-digit PIN for a user in the local database
 */
export async function setUserPin(userId: string, pin: string): Promise<void> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hashHex = await derivePinHash(pin, salt);

  await db.meta.put({
    key: `pin_auth_${userId}`,
    value: {
      saltHex: bufferToHex(salt),
      hashHex,
      updatedAt: new Date().toISOString(),
    },
  });
}

/**
 * Checks whether a user has set a terminal PIN
 */
export async function hasUserPin(userId: string): Promise<boolean> {
  const record = await db.meta.get(`pin_auth_${userId}`);
  return Boolean(record && record.value);
}

/**
 * Verifies a PIN against the stored hash
 */
export async function verifyUserPin(userId: string, pin: string): Promise<boolean> {
  const record = await db.meta.get(`pin_auth_${userId}`);
  if (!record || !record.value) return false;

  const { saltHex, hashHex } = record.value as { saltHex: string; hashHex: string };
  const salt = hexToBuffer(saltHex);
  const candidateHashHex = await derivePinHash(pin, salt);

  return candidateHashHex === hashHex;
}
