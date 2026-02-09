import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

let tmpDir: string;
let CONFIG_DIR: string;
let CONFIG_FILE: string;
let KEYS_DIR: string;

// We need to re-import the module after mocking, so we use dynamic imports
let configModule: typeof import("../config.js");

beforeEach(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "gitignored-config-test-"));
  CONFIG_DIR = path.join(tmpDir, ".gitignored");
  CONFIG_FILE = path.join(CONFIG_DIR, "config.json");
  KEYS_DIR = path.join(CONFIG_DIR, "keys");

  // Clear any cached module
  vi.resetModules();

  // Clear any env var that might interfere
  delete process.env.GITIGNORED_TOKEN;

  // Mock the os module to return our temp dir as homedir
  vi.doMock("node:os", async () => {
    const actual = await vi.importActual<typeof import("node:os")>("node:os");
    return {
      ...actual,
      default: { ...actual, homedir: () => tmpDir },
      homedir: () => tmpDir,
    };
  });

  configModule = await import("../config.js");
});

afterEach(() => {
  vi.restoreAllMocks();
  // Clean up temp dir
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("ensureConfigDir", () => {
  it("creates the config and keys directories", () => {
    configModule.ensureConfigDir();
    expect(fs.existsSync(configModule.CONFIG_DIR)).toBe(true);
    expect(fs.existsSync(configModule.KEYS_DIR)).toBe(true);
  });

  it("does not throw if directories already exist", () => {
    configModule.ensureConfigDir();
    expect(() => configModule.ensureConfigDir()).not.toThrow();
  });
});

describe("getConfig", () => {
  it("returns defaults when no config file exists", () => {
    const config = configModule.getConfig();
    expect(config.apiBaseUrl).toBe("http://localhost:3000");
    expect(config.authToken).toBeUndefined();
    expect(config.userId).toBeUndefined();
    expect(config.email).toBeUndefined();
  });

  it("reads from config file when it exists", () => {
    configModule.ensureConfigDir();
    const data = {
      apiBaseUrl: "https://api.gitignored.io",
      authToken: "test-token",
      userId: "user-123",
      email: "test@example.com",
    };
    fs.writeFileSync(configModule.CONFIG_FILE, JSON.stringify(data));

    const config = configModule.getConfig();
    expect(config.apiBaseUrl).toBe("https://api.gitignored.io");
    expect(config.authToken).toBe("test-token");
    expect(config.userId).toBe("user-123");
    expect(config.email).toBe("test@example.com");
  });

  it("merges with defaults (missing fields get defaults)", () => {
    configModule.ensureConfigDir();
    fs.writeFileSync(
      configModule.CONFIG_FILE,
      JSON.stringify({ userId: "user-456" })
    );

    const config = configModule.getConfig();
    expect(config.apiBaseUrl).toBe("http://localhost:3000");
    expect(config.userId).toBe("user-456");
  });

  it("GITIGNORED_TOKEN env var overrides authToken in config file", () => {
    configModule.ensureConfigDir();
    fs.writeFileSync(
      configModule.CONFIG_FILE,
      JSON.stringify({ authToken: "file-token" })
    );

    process.env.GITIGNORED_TOKEN = "env-token";
    const config = configModule.getConfig();
    expect(config.authToken).toBe("env-token");
    delete process.env.GITIGNORED_TOKEN;
  });

  it("GITIGNORED_TOKEN env var works even without config file", () => {
    process.env.GITIGNORED_TOKEN = "env-only-token";
    const config = configModule.getConfig();
    expect(config.authToken).toBe("env-only-token");
    delete process.env.GITIGNORED_TOKEN;
  });
});

describe("saveConfig", () => {
  it("writes config and getConfig reads it back", () => {
    configModule.saveConfig({
      apiBaseUrl: "https://api.example.com",
      userId: "user-789",
    });

    const config = configModule.getConfig();
    expect(config.apiBaseUrl).toBe("https://api.example.com");
    expect(config.userId).toBe("user-789");
  });

  it("merges with existing config", () => {
    configModule.saveConfig({ userId: "user-111" });
    configModule.saveConfig({ email: "new@example.com" });

    const config = configModule.getConfig();
    expect(config.userId).toBe("user-111");
    expect(config.email).toBe("new@example.com");
  });

  it("creates directories if they do not exist", () => {
    expect(fs.existsSync(configModule.CONFIG_DIR)).toBe(false);
    configModule.saveConfig({ userId: "user-222" });
    expect(fs.existsSync(configModule.CONFIG_DIR)).toBe(true);
  });

  it("does not persist GITIGNORED_TOKEN env var as authToken", () => {
    process.env.GITIGNORED_TOKEN = "env-secret";
    configModule.saveConfig({ userId: "user-333" });
    delete process.env.GITIGNORED_TOKEN;

    const raw = JSON.parse(
      fs.readFileSync(configModule.CONFIG_FILE, "utf-8")
    );
    expect(raw.authToken).toBeUndefined();
  });
});

describe("clearConfig", () => {
  it("removes authToken, userId, and email", () => {
    configModule.saveConfig({
      authToken: "secret",
      userId: "user-444",
      email: "user@example.com",
    });

    configModule.clearConfig();

    const config = configModule.getConfig();
    expect(config.authToken).toBeUndefined();
    expect(config.userId).toBeUndefined();
    expect(config.email).toBeUndefined();
  });

  it("preserves apiBaseUrl after clearing", () => {
    configModule.saveConfig({
      apiBaseUrl: "https://api.custom.com",
      authToken: "secret",
      userId: "user-555",
    });

    configModule.clearConfig();

    const config = configModule.getConfig();
    expect(config.apiBaseUrl).toBe("https://api.custom.com");
  });
});
