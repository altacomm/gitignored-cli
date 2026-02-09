import type { Command } from "commander";
import * as fs from "node:fs";
import * as path from "node:path";
import * as readline from "node:readline";
import chalk from "chalk";
import { apiClient } from "../lib/api.js";
import { encryptEnv, decryptEnv } from "../lib/crypto.js";
import { loadProjectKey } from "../lib/keystore.js";
import { success, error, info, warn } from "../lib/ui.js";

interface ProjectConfig {
  projectId: string;
  projectSlug: string;
}

interface PullResponse {
  encryptedPayload: string;
  version: number;
}

interface VersionResponse {
  version: number;
}

interface PushResponse {
  version: number;
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

export function registerStartCommand(program: Command): void {
  program
    .command("start")
    .description("Watch mode: sync .env changes in real-time")
    .action(async () => {
      const configResult = loadProjectConfig();
      if (!configResult) {
        error(
          "No .gitignored.json found. Run `gitignored new` to create a project.",
        );
        process.exitCode = 1;
        return;
      }

      const keyResult = loadProjectKey(configResult.projectId);
      if (!keyResult) {
        error(
          "No project key found. You may need to be invited to this project.",
        );
        process.exitCode = 1;
        return;
      }

      // Store as non-nullable for use in closures
      const config = configResult;
      const projectKey = keyResult;
      const envPath = path.join(process.cwd(), ".env.shared");
      let localVersion = 0;
      let isPushing = false;
      let isPrompting = false;

      // Initial pull
      try {
        const result = await apiClient<PullResponse>(
          `/api/projects/${config.projectId}/env`,
        );

        if (result.encryptedPayload) {
          const decrypted = decryptEnv(result.encryptedPayload, projectKey);
          fs.writeFileSync(envPath, decrypted);
          localVersion = result.version;
          const vars = countVars(decrypted);
          success(`Pulled v${result.version} (${vars} var${vars !== 1 ? "s" : ""})`);
        } else {
          info("No remote snapshot found. Watching for local changes.");
        }
      } catch (err) {
        warn(
          `Could not pull latest: ${err instanceof Error ? err.message : String(err)}`,
        );
      }

      console.log();
      console.log(chalk.cyan("  Watching for changes... (Ctrl+C to stop)"));
      console.log();

      // Poll for remote changes
      const pollInterval = setInterval(async () => {
        if (isPushing || isPrompting) return;

        try {
          const versionResult = await apiClient<VersionResponse>(
            `/api/projects/${config.projectId}/env/version`,
          );

          if (versionResult.version > localVersion) {
            info(`New version detected: v${versionResult.version}`);

            const pullResult = await apiClient<PullResponse>(
              `/api/projects/${config.projectId}/env`,
            );

            if (pullResult.encryptedPayload) {
              const decrypted = decryptEnv(pullResult.encryptedPayload, projectKey);
              // Temporarily stop watching to avoid triggering local change
              if (watcher) {
                watcher.close();
              }
              fs.writeFileSync(envPath, decrypted);
              localVersion = pullResult.version;
              const vars = countVars(decrypted);
              success(`Auto-pulled v${pullResult.version} (${vars} var${vars !== 1 ? "s" : ""})`);

              // Restart watcher
              watcher = startWatcher();
            }
          }
        } catch {
          // Silently ignore poll errors
        }
      }, 10_000);

      // Watch for local file changes
      function startWatcher(): fs.FSWatcher | null {
        try {
          return fs.watch(envPath, { persistent: true }, async (_eventType) => {
            if (isPushing || isPrompting) return;

            // Debounce — small delay for editors that write multiple times
            await new Promise((r) => setTimeout(r, 200));

            isPrompting = true;
            try {
              const answer = await prompt("  Local changes detected. Push? [y/N] ");
              if (answer === "y" || answer === "yes") {
                isPushing = true;
                try {
                  const content = fs.readFileSync(envPath, "utf-8");
                  const encryptedPayload = encryptEnv(content, projectKey);
                  const result = await apiClient<PushResponse>(
                    `/api/projects/${config.projectId}/env`,
                    {
                      method: "POST",
                      body: JSON.stringify({ encryptedPayload }),
                    },
                  );
                  localVersion = result.version;
                  const vars = countVars(content);
                  success(`Pushed v${result.version} (${vars} var${vars !== 1 ? "s" : ""})`);
                } catch (pushErr) {
                  error(
                    `Push failed: ${pushErr instanceof Error ? pushErr.message : String(pushErr)}`,
                  );
                } finally {
                  isPushing = false;
                }
              }
            } finally {
              isPrompting = false;
            }
          });
        } catch {
          return null;
        }
      }

      let watcher = startWatcher();

      // Graceful shutdown
      const cleanup = () => {
        console.log();
        info("Stopping watch mode. Goodbye!");
        clearInterval(pollInterval);
        if (watcher) {
          watcher.close();
        }
        process.exit(0);
      };

      process.on("SIGINT", cleanup);
      process.on("SIGTERM", cleanup);
    });
}
