import type { Command } from "commander";
import * as fs from "node:fs";
import * as path from "node:path";
import chalk from "chalk";
import { apiClient } from "../lib/api.js";
import { error } from "../lib/ui.js";

interface ProjectConfig {
  projectId: string;
  projectSlug: string;
}

interface HistoryEntry {
  version: number;
  message?: string;
  createdAt: string;
  author?: { email?: string; id?: string };
  authorId?: string;
}

interface HistoryResponse {
  snapshots: HistoryEntry[];
  total: number;
  page: number;
  limit: number;
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

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    if (diffHours === 0) {
      const diffMins = Math.floor(diffMs / (1000 * 60));
      return diffMins <= 1 ? "just now" : `${diffMins} minutes ago`;
    }
    return `${diffHours} hour${diffHours !== 1 ? "s" : ""} ago`;
  }
  if (diffDays === 1) return "yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;

  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function registerLogCommand(program: Command): void {
  program
    .command("log")
    .description("Show push history for the project")
    .option("-a, --all", "Show full history")
    .action(async (options: { all?: boolean }) => {
      try {
        const config = loadProjectConfig();
        if (!config) {
          error(
            "No .gitignored.json found. Run `gitignored new` to create a project.",
          );
          process.exitCode = 1;
          return;
        }

        const limit = options.all ? 100 : 20;
        let page = 1;
        const allSnapshots: HistoryEntry[] = [];

        // Fetch pages
        while (true) {
          const result = await apiClient<HistoryResponse>(
            `/api/projects/${config.projectId}/env/history?page=${page}&limit=${limit}`,
          );

          allSnapshots.push(...result.snapshots);

          if (!options.all || allSnapshots.length >= result.total) break;
          page++;
        }

        if (allSnapshots.length === 0) {
          console.log(chalk.dim("  No history found. Run `gitignored push` to create the first snapshot."));
          return;
        }

        console.log();
        console.log(chalk.bold(`  History for ${config.projectSlug}`));
        console.log();

        // Header
        console.log(
          "  " +
          chalk.dim(
            "VERSION".padEnd(10) +
            "AUTHOR".padEnd(28) +
            "MESSAGE".padEnd(32) +
            "DATE"
          )
        );
        console.log("  " + chalk.dim("-".repeat(85)));

        for (const entry of allSnapshots) {
          const version = chalk.cyan(`v${entry.version}`.padEnd(10));
          const author = (entry.author?.email || entry.authorId || "unknown").padEnd(28);
          const message = (entry.message || chalk.dim("no message")).toString().padEnd(32);
          const date = chalk.dim(formatDate(entry.createdAt));

          console.log(`  ${version}${author}${message}${date}`);
        }

        console.log();
      } catch (err) {
        error(
          `Log failed: ${err instanceof Error ? err.message : String(err)}`,
        );
        process.exitCode = 1;
      }
    });
}
