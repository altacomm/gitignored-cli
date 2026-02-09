import * as fs from "node:fs";
import * as path from "node:path";
import { encodeBase64, decodeBase64 } from "tweetnacl-util";
import { KEYS_DIR, ensureConfigDir } from "./config.js";

interface StoredKeypair {
  publicKey: string;
  secretKey: string;
}

export function saveIdentityKeypair(keypair: {
  publicKey: Uint8Array;
  secretKey: Uint8Array;
}): void {
  ensureConfigDir();
  const stored: StoredKeypair = {
    publicKey: encodeBase64(keypair.publicKey),
    secretKey: encodeBase64(keypair.secretKey),
  };
  const filePath = path.join(KEYS_DIR, "identity.key");
  fs.writeFileSync(filePath, JSON.stringify(stored, null, 2) + "\n", {
    mode: 0o600,
  });
}

export function loadIdentityKeypair(): {
  publicKey: Uint8Array;
  secretKey: Uint8Array;
} | null {
  const filePath = path.join(KEYS_DIR, "identity.key");
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const stored: StoredKeypair = JSON.parse(raw);
    return {
      publicKey: decodeBase64(stored.publicKey),
      secretKey: decodeBase64(stored.secretKey),
    };
  } catch {
    return null;
  }
}

export function hasIdentityKeypair(): boolean {
  const filePath = path.join(KEYS_DIR, "identity.key");
  return fs.existsSync(filePath);
}

export function saveProjectKey(
  projectId: string,
  key: Uint8Array,
): void {
  ensureConfigDir();
  const filePath = path.join(KEYS_DIR, `${projectId}.key`);
  fs.writeFileSync(filePath, encodeBase64(key) + "\n", { mode: 0o600 });
}

export function loadProjectKey(projectId: string): Uint8Array | null {
  const filePath = path.join(KEYS_DIR, `${projectId}.key`);
  try {
    const raw = fs.readFileSync(filePath, "utf-8").trim();
    return decodeBase64(raw);
  } catch {
    return null;
  }
}
