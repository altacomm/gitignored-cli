import type { Command } from "commander";
import * as fs from "node:fs";
import * as path from "node:path";
import chalk from "chalk";
import { apiClient } from "../lib/api.js";
import { success, error, info } from "../lib/ui.js";

interface ProjectConfig {
  projectId: string;
  projectSlug: string;
}

interface Member {
  id: string;
  userId: string;
  role: string;
  joinedAt: string;
}

interface Invitation {
  id: string;
  email: string;
  role: string;
  accepted: boolean;
  expiresAt: string;
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
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function registerMembersCommand(program: Command): void {
  program
    .command("members")
    .description("List project members")
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

        const members = await apiClient<Member[]>(
          `/api/projects/${config.projectId}/members`,
        );

        if (members.length === 0) {
          info("No members found.");
        } else {
          console.log(chalk.bold("\nMembers:"));
          for (const m of members) {
            const role = chalk.dim(`(${m.role})`);
            const joined = chalk.dim(`joined ${formatDate(m.joinedAt)}`);
            console.log(`  ${m.userId}  ${role}  ${joined}`);
          }
        }

        const invitations = await apiClient<Invitation[]>(
          `/api/projects/${config.projectId}/invitations`,
        );

        const pending = invitations.filter(
          (inv) => !inv.accepted && new Date(inv.expiresAt) > new Date(),
        );

        if (pending.length > 0) {
          console.log(chalk.bold("\nPending Invitations:"));
          for (const inv of pending) {
            const role = chalk.dim(`(${inv.role})`);
            const expires = chalk.dim(`expires ${formatDate(inv.expiresAt)}`);
            console.log(`  ${inv.email}  ${role}  ${expires}`);
          }
        }

        console.log("");
      } catch (err) {
        error(
          `Failed to list members: ${err instanceof Error ? err.message : String(err)}`,
        );
        process.exitCode = 1;
      }
    });
}
