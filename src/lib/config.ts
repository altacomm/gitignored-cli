import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

export const CONFIG_DIR = path.join(os.homedir(), ".gitignored");
export const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");
export const KEYS_DIR = path.join(CONFIG_DIR, "keys");

export interface Config {
  apiBaseUrl: string;
  authToken?: string;
  userId?: string;
  email?: string;
}

const DEFAULT_CONFIG: Config = {
  apiBaseUrl: "http://localhost:3000",
};

export function ensureConfigDir(): void {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.mkdirSync(KEYS_DIR, { recursive: true });
}

export function getConfig(): Config {
  try {
    const raw = fs.readFileSync(CONFIG_FILE, "utf-8");
    const config = { ...DEFAULT_CONFIG, ...JSON.parse(raw) };

    // Allow GITIGNORED_TOKEN env var to override authToken (CI/CD support)
    const envToken = process.env.GITIGNORED_TOKEN;
    if (envToken) {
      config.authToken = envToken;
    }

    return config;
  } catch {
    const config = { ...DEFAULT_CONFIG };

    // Allow GITIGNORED_TOKEN env var as fallback (CI/CD support)
    const envToken = process.env.GITIGNORED_TOKEN;
    if (envToken) {
      config.authToken = envToken;
    }

    return config;
  }
}

export function saveConfig(partial: Partial<Config>): void {
  ensureConfigDir();
  const existing = getConfig();
  const merged = { ...existing, ...partial };
  // Don't persist the env var token
  if (process.env.GITIGNORED_TOKEN && merged.authToken === process.env.GITIGNORED_TOKEN) {
    delete merged.authToken;
  }
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(merged, null, 2) + "\n");
}

export function clearConfig(): void {
  const config = getConfig();
  delete config.authToken;
  delete config.userId;
  delete config.email;
  ensureConfigDir();
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2) + "\n");
}
