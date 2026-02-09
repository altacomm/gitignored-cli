import type { Command } from "commander";
import * as fs from "node:fs";
import * as path from "node:path";
import * as readline from "node:readline";
import { apiClient } from "../lib/api.js";
import { encryptEnv, encryptProjectKey } from "../lib/crypto.js";
import { loadProjectKey, loadIdentityKeypair } from "../lib/keystore.js";
import { success, error, warn, info } from "../lib/ui.js";
import { decodeBase64 } from "tweetnacl-util";

interface ProjectConfig {
  projectId: string;
  projectSlug: string;
  lastPushedVersion?: number;
}

interface PushResponse {
  version: number;
}

interface VersionResponse {
  version: number;
}

interface PendingMember {
  userId: string;
  publicKey: string;
}

function countVars(content: string): number {
  return content
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      return trimmed.length > 0 && !trimmed.startsWith("#");
    }).length;
}

function loadProjectConfig(): ProjectConfig | null {
  try {
    const raw = fs.readFileSync(
      path.join(process.cwd(), ".gitignored.json"),
      "utf-8",
    );
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function saveProjectConfig(config: ProjectConfig): void {
  fs.writeFileSync(
    path.join(process.cwd(), ".gitignored.json"),
    JSON.stringify(config, null, 2) + "\n",
  );
}

function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase());
    });
  });
}

async function syncPendingKeys(projectId: string): Promise<void> {
  try {
    const pending = await apiClient<PendingMember[]>(
      `/api/projects/${projectId}/members/pending-keys`,
    );

    if (pending.length === 0) return;

    const keypair = loadIdentityKeypair();
    const projectKey = loadProjectKey(projectId);
    if (!keypair || !projectKey) return;

    let shared = 0;
    for (const member of pending) {
      try {
        const recipientPublicKey = decodeBase64(member.publicKey);
        const encrypted = encryptProjectKey(
          projectKey,
          recipientPublicKey,
          keypair.secretKey,
        );

        await apiClient(
          `/api/projects/${projectId}/members/${member.userId}/key`,
          {
            method: "POST",
            body: JSON.stringify({ encryptedProjectKey: encrypted }),
          },
        );
        shared++;
      } catch {
        // Skip individual failures
      }
    }

    if (shared > 0) {
      info(`Shared project key with ${shared} new member${shared !== 1 ? "s" : ""}`);
    }
  } catch {
    // Key sync is best-effort
  }
}

export function registerPushCommand(program: Command): void {
  program
    .command("push")
    .description("Encrypt and push .env to the server")
    .option("-m, --message <message>", "Commit message")
    .option("-f, --force", "Skip conflict warning")
    .action(async (options: { message?: string; force?: boolean }) => {
      try {
        const config = loadProjectConfig();
        if (!config) {
          error(
            "No .gitignored.json found. Run `gitignored new` to create a project.",
          );
          process.exitCode = 1;
          return;
        }

        const envPath = path.join(process.cwd(), ".env.shared");
        let envContent: string;
        try {
          envContent = fs.readFileSync(envPath, "utf-8");
        } catch {
          error("No .env.shared file found.");
          process.exitCode = 1;
          return;
        }

        const projectKey = loadProjectKey(config.projectId);
        if (!projectKey) {
          error(
            "No project key found. You may need to be invited to this project.",
          );
          process.exitCode = 1;
          return;
        }

        // Conflict detection: check if server is ahead
        if (!options.force) {
          try {
            const versionResult = await apiClient<VersionResponse>(
              `/api/projects/${config.projectId}/env/version`,
            );

            const localVersion = config.lastPushedVersion ?? 0;
            if (versionResult.version > localVersion && localVersion > 0) {
              warn(
                `Server has v${versionResult.version}, you last pushed v${localVersion}. You may be overwriting changes.`,
              );
              const answer = await prompt("Continue? [y/N] ");
              if (answer !== "y" && answer !== "yes") {
                console.log("  Push cancelled.");
                return;
              }
            }
          } catch {
            // If version check fails, proceed anyway
          }
        }

        const encryptedPayload = encryptEnv(envContent, projectKey);

        const result = await apiClient<PushResponse>(
          `/api/projects/${config.projectId}/env`,
          {
            method: "POST",
            body: JSON.stringify({
              encryptedPayload,
              message: options.message,
            }),
          },
        );

        // Track the pushed version
        config.lastPushedVersion = result.version;
        saveProjectConfig(config);

        const vars = countVars(envContent);
        success(`Pushed v${result.version} (${vars} var${vars !== 1 ? "s" : ""})`);

        await syncPendingKeys(config.projectId);
      } catch (err) {
        error(
          `Push failed: ${err instanceof Error ? err.message : String(err)}`,
        );
        process.exitCode = 1;
      }
    });
}
