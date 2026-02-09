import { describe, it, expect } from "vitest";
import {
  generateKeypair,
  generateProjectKey,
  encryptEnv,
  decryptEnv,
  encryptProjectKey,
  decryptProjectKey,
} from "../crypto.js";

describe("generateKeypair", () => {
  it("returns a keypair with publicKey and secretKey", () => {
    const keypair = generateKeypair();
    expect(keypair).toHaveProperty("publicKey");
    expect(keypair).toHaveProperty("secretKey");
  });

  it("publicKey is 32 bytes (NaCl box public key length)", () => {
    const keypair = generateKeypair();
    expect(keypair.publicKey).toBeInstanceOf(Uint8Array);
    expect(keypair.publicKey.length).toBe(32);
  });

  it("secretKey is 32 bytes (NaCl box secret key length)", () => {
    const keypair = generateKeypair();
    expect(keypair.secretKey).toBeInstanceOf(Uint8Array);
    expect(keypair.secretKey.length).toBe(32);
  });

  it("generates different keypairs on each call", () => {
    const kp1 = generateKeypair();
    const kp2 = generateKeypair();
    expect(kp1.publicKey).not.toEqual(kp2.publicKey);
    expect(kp1.secretKey).not.toEqual(kp2.secretKey);
  });
});

describe("generateProjectKey", () => {
  it("returns a Uint8Array of 32 bytes", () => {
    const key = generateProjectKey();
    expect(key).toBeInstanceOf(Uint8Array);
    expect(key.length).toBe(32);
  });

  it("generates different keys on each call", () => {
    const k1 = generateProjectKey();
    const k2 = generateProjectKey();
    expect(k1).not.toEqual(k2);
  });
});

describe("encryptEnv / decryptEnv", () => {
  it("roundtrip: encrypt then decrypt returns original plaintext", () => {
    const projectKey = generateProjectKey();
    const plaintext = "SECRET_KEY=abc123\nDB_URL=postgres://localhost/mydb";
    const encrypted = encryptEnv(plaintext, projectKey);
    const decrypted = decryptEnv(encrypted, projectKey);
    expect(decrypted).toBe(plaintext);
  });

  it("handles empty string", () => {
    const projectKey = generateProjectKey();
    const plaintext = "";
    const encrypted = encryptEnv(plaintext, projectKey);
    const decrypted = decryptEnv(encrypted, projectKey);
    expect(decrypted).toBe(plaintext);
  });

  it("handles multiline .env content", () => {
    const projectKey = generateProjectKey();
    const plaintext = [
      "# Database",
      "DATABASE_URL=postgres://user:pass@host:5432/db",
      "DATABASE_POOL_SIZE=10",
      "",
      "# API Keys",
      "STRIPE_SECRET_KEY=sk_test_abc123",
      "RESEND_API_KEY=re_xyz789",
      "",
      "# Feature flags",
      "ENABLE_BETA=true",
    ].join("\n");

    const encrypted = encryptEnv(plaintext, projectKey);
    const decrypted = decryptEnv(encrypted, projectKey);
    expect(decrypted).toBe(plaintext);
  });

  it("encrypted output is a base64 string", () => {
    const projectKey = generateProjectKey();
    const encrypted = encryptEnv("hello", projectKey);
    expect(typeof encrypted).toBe("string");
    // Base64 regex: only base64 chars, possibly with padding
    expect(encrypted).toMatch(/^[A-Za-z0-9+/]+=*$/);
  });

  it("decryption with wrong key throws", () => {
    const key1 = generateProjectKey();
    const key2 = generateProjectKey();
    const encrypted = encryptEnv("secret data", key1);
    expect(() => decryptEnv(encrypted, key2)).toThrow();
  });

  it("different plaintexts produce different ciphertexts", () => {
    const projectKey = generateProjectKey();
    const enc1 = encryptEnv("plaintext-a", projectKey);
    const enc2 = encryptEnv("plaintext-b", projectKey);
    expect(enc1).not.toBe(enc2);
  });

  it("same plaintext produces different ciphertexts (nonce randomness)", () => {
    const projectKey = generateProjectKey();
    const plaintext = "same-content";
    const enc1 = encryptEnv(plaintext, projectKey);
    const enc2 = encryptEnv(plaintext, projectKey);
    expect(enc1).not.toBe(enc2);

    // Both should still decrypt to the same thing
    expect(decryptEnv(enc1, projectKey)).toBe(plaintext);
    expect(decryptEnv(enc2, projectKey)).toBe(plaintext);
  });

  it("handles large payloads", () => {
    const projectKey = generateProjectKey();
    // Generate a large payload (~100KB)
    const lines: string[] = [];
    for (let i = 0; i < 2000; i++) {
      lines.push(`VAR_${i}=value_${"x".repeat(50)}`);
    }
    const plaintext = lines.join("\n");
    const encrypted = encryptEnv(plaintext, projectKey);
    const decrypted = decryptEnv(encrypted, projectKey);
    expect(decrypted).toBe(plaintext);
  });

  it("handles unicode content", () => {
    const projectKey = generateProjectKey();
    const plaintext = "APP_NAME=Mon Application\nGREETING=Hello World";
    const encrypted = encryptEnv(plaintext, projectKey);
    const decrypted = decryptEnv(encrypted, projectKey);
    expect(decrypted).toBe(plaintext);
  });
});

describe("encryptProjectKey / decryptProjectKey", () => {
  it("roundtrip: encrypt with recipient's public key, decrypt with recipient's secret key", () => {
    const sender = generateKeypair();
    const recipient = generateKeypair();
    const projectKey = generateProjectKey();

    const encrypted = encryptProjectKey(
      projectKey,
      recipient.publicKey,
      sender.secretKey
    );
    const decrypted = decryptProjectKey(
      encrypted,
      sender.publicKey,
      recipient.secretKey
    );

    expect(decrypted).toEqual(projectKey);
  });

  it("encrypted project key is a base64 string", () => {
    const sender = generateKeypair();
    const recipient = generateKeypair();
    const projectKey = generateProjectKey();

    const encrypted = encryptProjectKey(
      projectKey,
      recipient.publicKey,
      sender.secretKey
    );
    expect(typeof encrypted).toBe("string");
    expect(encrypted).toMatch(/^[A-Za-z0-9+/]+=*$/);
  });

  it("decryption with wrong recipient secret key throws", () => {
    const sender = generateKeypair();
    const recipient = generateKeypair();
    const wrongRecipient = generateKeypair();
    const projectKey = generateProjectKey();

    const encrypted = encryptProjectKey(
      projectKey,
      recipient.publicKey,
      sender.secretKey
    );

    expect(() =>
      decryptProjectKey(encrypted, sender.publicKey, wrongRecipient.secretKey)
    ).toThrow();
  });

  it("decryption with wrong sender public key throws", () => {
    const sender = generateKeypair();
    const wrongSender = generateKeypair();
    const recipient = generateKeypair();
    const projectKey = generateProjectKey();

    const encrypted = encryptProjectKey(
      projectKey,
      recipient.publicKey,
      sender.secretKey
    );

    expect(() =>
      decryptProjectKey(encrypted, wrongSender.publicKey, recipient.secretKey)
    ).toThrow();
  });

  it("same project key encrypted twice produces different ciphertexts (nonce randomness)", () => {
    const sender = generateKeypair();
    const recipient = generateKeypair();
    const projectKey = generateProjectKey();

    const enc1 = encryptProjectKey(
      projectKey,
      recipient.publicKey,
      sender.secretKey
    );
    const enc2 = encryptProjectKey(
      projectKey,
      recipient.publicKey,
      sender.secretKey
    );

    expect(enc1).not.toBe(enc2);

    // Both should still decrypt to the same key
    const dec1 = decryptProjectKey(enc1, sender.publicKey, recipient.secretKey);
    const dec2 = decryptProjectKey(enc2, sender.publicKey, recipient.secretKey);
    expect(dec1).toEqual(projectKey);
    expect(dec2).toEqual(projectKey);
  });

  it("decrypted project key has correct length (32 bytes)", () => {
    const sender = generateKeypair();
    const recipient = generateKeypair();
    const projectKey = generateProjectKey();

    const encrypted = encryptProjectKey(
      projectKey,
      recipient.publicKey,
      sender.secretKey
    );
    const decrypted = decryptProjectKey(
      encrypted,
      sender.publicKey,
      recipient.secretKey
    );

    expect(decrypted.length).toBe(32);
  });
});
