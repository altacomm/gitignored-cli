import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import nacl from "tweetnacl";

let tmpDir: string;
let keystoreModule: typeof import("../keystore.js");

beforeEach(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "gitignored-keystore-test-"));

  vi.resetModules();

  vi.doMock("node:os", async () => {
    const actual = await vi.importActual<typeof import("node:os")>("node:os");
    return {
      ...actual,
      default: { ...actual, homedir: () => tmpDir },
      homedir: () => tmpDir,
    };
  });

  keystoreModule = await import("../keystore.js");
});

afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("saveIdentityKeypair / loadIdentityKeypair", () => {
  it("roundtrip: save and load returns the same keypair", () => {
    const keypair = nacl.box.keyPair();
    keystoreModule.saveIdentityKeypair(keypair);
    const loaded = keystoreModule.loadIdentityKeypair();

    expect(loaded).not.toBeNull();
    expect(loaded!.publicKey).toEqual(keypair.publicKey);
    expect(loaded!.secretKey).toEqual(keypair.secretKey);
  });

  it("saved keypair file has restricted permissions (mode 0o600)", () => {
    const keypair = nacl.box.keyPair();
    keystoreModule.saveIdentityKeypair(keypair);

    const keysDir = path.join(tmpDir, ".gitignored", "keys");
    const filePath = path.join(keysDir, "identity.key");
    const stat = fs.statSync(filePath);
    // Check that group and other bits have no access (mode & 0o077 === 0)
    const mode = stat.mode & 0o777;
    expect(mode & 0o077).toBe(0);
  });

  it("loaded keypair keys are Uint8Array instances", () => {
    const keypair = nacl.box.keyPair();
    keystoreModule.saveIdentityKeypair(keypair);
    const loaded = keystoreModule.loadIdentityKeypair();

    expect(loaded!.publicKey).toBeInstanceOf(Uint8Array);
    expect(loaded!.secretKey).toBeInstanceOf(Uint8Array);
  });
});

describe("loadIdentityKeypair when no file exists", () => {
  it("returns null", () => {
    const loaded = keystoreModule.loadIdentityKeypair();
    expect(loaded).toBeNull();
  });
});

describe("hasIdentityKeypair", () => {
  it("returns false when no keypair saved", () => {
    expect(keystoreModule.hasIdentityKeypair()).toBe(false);
  });

  it("returns true after saving a keypair", () => {
    const keypair = nacl.box.keyPair();
    keystoreModule.saveIdentityKeypair(keypair);
    expect(keystoreModule.hasIdentityKeypair()).toBe(true);
  });
});

describe("saveProjectKey / loadProjectKey", () => {
  it("roundtrip: save and load returns the same key", () => {
    const projectId = "proj-abc-123";
    const key = nacl.randomBytes(32);

    keystoreModule.saveProjectKey(projectId, key);
    const loaded = keystoreModule.loadProjectKey(projectId);

    expect(loaded).not.toBeNull();
    expect(loaded).toEqual(key);
  });

  it("returns null for nonexistent project", () => {
    const loaded = keystoreModule.loadProjectKey("nonexistent-project");
    expect(loaded).toBeNull();
  });

  it("can store keys for multiple projects independently", () => {
    const key1 = nacl.randomBytes(32);
    const key2 = nacl.randomBytes(32);

    keystoreModule.saveProjectKey("project-1", key1);
    keystoreModule.saveProjectKey("project-2", key2);

    const loaded1 = keystoreModule.loadProjectKey("project-1");
    const loaded2 = keystoreModule.loadProjectKey("project-2");

    expect(loaded1).toEqual(key1);
    expect(loaded2).toEqual(key2);
    expect(loaded1).not.toEqual(loaded2);
  });

  it("overwriting a project key replaces the old one", () => {
    const projectId = "proj-overwrite";
    const oldKey = nacl.randomBytes(32);
    const newKey = nacl.randomBytes(32);

    keystoreModule.saveProjectKey(projectId, oldKey);
    keystoreModule.saveProjectKey(projectId, newKey);

    const loaded = keystoreModule.loadProjectKey(projectId);
    expect(loaded).toEqual(newKey);
  });

  it("loaded project key is a Uint8Array", () => {
    const projectId = "proj-type-check";
    const key = nacl.randomBytes(32);

    keystoreModule.saveProjectKey(projectId, key);
    const loaded = keystoreModule.loadProjectKey(projectId);

    expect(loaded).toBeInstanceOf(Uint8Array);
  });
});
