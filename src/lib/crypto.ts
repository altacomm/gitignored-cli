import nacl from "tweetnacl";
import { decodeBase64, encodeBase64, decodeUTF8, encodeUTF8 } from "tweetnacl-util";

export function generateKeypair(): {
  publicKey: Uint8Array;
  secretKey: Uint8Array;
} {
  return nacl.box.keyPair();
}

export function generateProjectKey(): Uint8Array {
  return nacl.randomBytes(32);
}

export function encryptEnv(
  plaintext: string,
  projectKey: Uint8Array,
): string {
  const nonce = nacl.randomBytes(24);
  const messageBytes = decodeUTF8(plaintext);
  const ciphertext = nacl.secretbox(messageBytes, nonce, projectKey);

  const combined = new Uint8Array(nonce.length + ciphertext.length);
  combined.set(nonce, 0);
  combined.set(ciphertext, nonce.length);

  return encodeBase64(combined);
}

export function decryptEnv(
  encrypted: string,
  projectKey: Uint8Array,
): string {
  const combined = decodeBase64(encrypted);
  const nonce = combined.slice(0, 24);
  const ciphertext = combined.slice(24);

  const plaintext = nacl.secretbox.open(ciphertext, nonce, projectKey);
  if (!plaintext) {
    throw new Error("Decryption failed. Invalid key or corrupted data.");
  }

  return encodeUTF8(plaintext);
}

export function encryptProjectKey(
  projectKey: Uint8Array,
  recipientPublicKey: Uint8Array,
  senderSecretKey: Uint8Array,
): string {
  const nonce = nacl.randomBytes(24);
  const ciphertext = nacl.box(
    projectKey,
    nonce,
    recipientPublicKey,
    senderSecretKey,
  );

  const combined = new Uint8Array(nonce.length + ciphertext.length);
  combined.set(nonce, 0);
  combined.set(ciphertext, nonce.length);

  return encodeBase64(combined);
}

export function decryptProjectKey(
  encrypted: string,
  senderPublicKey: Uint8Array,
  recipientSecretKey: Uint8Array,
): Uint8Array {
  const combined = decodeBase64(encrypted);
  const nonce = combined.slice(0, 24);
  const ciphertext = combined.slice(24);

  const plaintext = nacl.box.open(
    ciphertext,
    nonce,
    senderPublicKey,
    recipientSecretKey,
  );
  if (!plaintext) {
    throw new Error("Failed to decrypt project key.");
  }

  return plaintext;
}
