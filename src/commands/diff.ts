import type { Command } from "commander";
import * as fs from "node:fs";
import * as path from "node:path";
import chalk from "chalk";
import { apiClient } from "../lib/api.js";
import { decryptEnv } from "../lib/crypto.js";
import { loadProjectKey } from "../lib/keystore.js";
import { error, info } from "../lib/ui.js";

interface ProjectConfig {
  projectId: string;
  projectSlug: string;
}

interface PullResponse {
  encryptedPayload: string;
  version: number;
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

function parseEnvContent(content: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim();
    map.set(key, value);
  }
  return map;
}

export function registerDiffCommand(program: Command): void {
  program
    .command("diff")
    .description("Compare local .env with remote version")
    .action(async () => {
      try {
        const config = loadProjectConfig();
        if (!config) {
          error(
            "No .gitignored.json found. Run `gitignored new` to create a project.",
          );
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

        // Read local .env.shared
        const envPath = path.join(process.cwd(), ".env.shared");
        let localContent: string;
        try {
          localContent = fs.readFileSync(envPath, "utf-8");
        } catch {
          error("No .env.shared file found locally.");
          process.exitCode = 1;
          return;
        }

        // Fetch remote
        const result = await apiClient<PullResponse>(
          `/api/projects/${config.projectId}/env`,
        );

        if (!result.encryptedPayload) {
          error("No environment snapshot found on server.");
          process.exitCode = 1;
          return;
        }

        const remoteContent = decryptEnv(result.encryptedPayload, projectKey);

        const localVars = parseEnvContent(localContent);
        const remoteVars = parseEnvContent(remoteContent);

        const added: string[] = [];
        const removed: string[] = [];
        const changed: { key: string; local: string; remote: string }[] = [];

        // Vars in remote but not local (added on server)
        for (const [key, value] of remoteVars) {
          if (!localVars.has(key)) {
            added.push(`${key}=${value}`);
          } else if (localVars.get(key) !== value) {
            changed.push({ key, local: localVars.get(key)!, remote: value });
          }
        }

        // Vars in local but not remote (removed on server / added locally)
        for (const key of localVars.keys()) {
          if (!remoteVars.has(key)) {
            removed.push(`${key}=${localVars.get(key)!}`);
          }
        }

        if (added.length === 0 && removed.length === 0 && changed.length === 0) {
          info("Local and remote are in sync.");
          return;
        }

        console.log();
        console.log(chalk.bold(`  Diff: local vs server (v${result.version})`));
        console.log();

        if (added.length > 0) {
          console.log(chalk.green.bold("  Added on server:"));
          for (const line of added) {
            console.log(chalk.green(`    + ${line}`));
          }
          console.log();
        }

        if (removed.length > 0) {
          console.log(chalk.red.bold("  Only in local:"));
          for (const line of removed) {
            console.log(chalk.red(`    - ${line}`));
          }
          console.log();
        }

        if (changed.length > 0) {
          console.log(chalk.yellow.bold("  Changed:"));
          for (const { key, local, remote } of changed) {
            console.log(chalk.yellow(`    ~ ${key}`));
            console.log(chalk.red(`      local:  ${local}`));
            console.log(chalk.green(`      remote: ${remote}`));
          }
          console.log();
        }
      } catch (err) {
        error(
          `Diff failed: ${err instanceof Error ? err.message : String(err)}`,
        );
        process.exitCode = 1;
      }
    });
}
