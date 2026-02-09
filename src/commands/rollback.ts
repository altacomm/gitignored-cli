import type { Command } from "commander";
import * as fs from "node:fs";
import * as path from "node:path";
import * as readline from "node:readline";
import chalk from "chalk";
import { apiClient } from "../lib/api.js";
import { encryptEnv, decryptEnv } from "../lib/crypto.js";
import { loadProjectKey } from "../lib/keystore.js";
import { success, error, warn } from "../lib/ui.js";

interface ProjectConfig {
  projectId: string;
  projectSlug: string;
}

interface SnapshotResponse {
  encryptedPayload: string;
  version: number;
}

interface PushResponse {
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

function showDiff(currentContent: string, oldContent: string): void {
  const currentLines = currentContent.split("\n").filter((l) => l.trim() && !l.trim().startsWith("#"));
  const oldLines = oldContent.split("\n").filter((l) => l.trim() && !l.trim().startsWith("#"));

  const currentSet = new Set(currentLines);
  const oldSet = new Set(oldLines);

  const removed = currentLines.filter((l) => !oldSet.has(l));
  const added = oldLines.filter((l) => !currentSet.has(l));

  if (removed.length === 0 && added.length === 0) {
    console.log(chalk.dim("  No differences detected."));
    return;
  }

  console.log();
  for (const line of removed) {
    console.log(chalk.red(`  - ${line}`));
  }
  for (const line of added) {
    console.log(chalk.green(`  + ${line}`));
  }
  console.log();
}

export function registerRollbackCommand(program: Command): void {
  program
    .command("rollback <version>")
    .description("Rollback to a previous version")
    .action(async (versionStr: string) => {
      try {
        const version = parseInt(versionStr, 10);
        if (isNaN(version) || version < 1) {
          error("Version must be a positive integer.");
          process.exitCode = 1;
          return;
        }

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

        // Fetch the old version
        const oldSnapshot = await apiClient<SnapshotResponse>(
          `/api/projects/${config.projectId}/env/${version}`,
        );

        if (!oldSnapshot.encryptedPayload) {
          error(`Version ${version} not found.`);
          process.exitCode = 1;
          return;
        }

        const oldContent = decryptEnv(oldSnapshot.encryptedPayload, projectKey);

        // Read current .env.shared if it exists
        const envPath = path.join(process.cwd(), ".env.shared");
        let currentContent = "";
        try {
          currentContent = fs.readFileSync(envPath, "utf-8");
        } catch {
          // No local file, that's fine
        }

        // Show diff
        if (currentContent) {
          console.log(chalk.bold(`\n  Changes from current to v${version}:`));
          showDiff(currentContent, oldContent);
        } else {
          warn("No local .env.shared found. Will create one from the rollback.");
        }

        // Prompt for confirmation
        const answer = await prompt(`Rollback to v${version}? [y/N] `);
        if (answer !== "y" && answer !== "yes") {
          console.log(chalk.dim("  Rollback cancelled."));
          return;
        }

        // Encrypt and push as new version
        const encryptedPayload = encryptEnv(oldContent, projectKey);
        const result = await apiClient<PushResponse>(
          `/api/projects/${config.projectId}/env`,
          {
            method: "POST",
            body: JSON.stringify({
              encryptedPayload,
              message: `Rollback to v${version}`,
            }),
          },
        );

        // Write the old content locally
        fs.writeFileSync(envPath, oldContent);

        success(`Rolled back to v${version} (pushed as v${result.version})`);
      } catch (err) {
        error(
          `Rollback failed: ${err instanceof Error ? err.message : String(err)}`,
        );
        process.exitCode = 1;
      }
    });
}
