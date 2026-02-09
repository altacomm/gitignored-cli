import type { Command } from "commander";
import chalk from "chalk";
import { apiClient } from "../lib/api.js";
import { error } from "../lib/ui.js";

interface Project {
  id: string;
  name: string;
  slug: string;
  role?: string;
  memberCount?: number;
  updatedAt?: string;
  createdAt?: string;
}

interface ListResponse {
  projects: Project[];
}

function formatDate(dateStr?: string): string {
  if (!dateStr) return chalk.dim("—");
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function registerListCommand(program: Command): void {
  program
    .command("list")
    .description("List all projects")
    .action(async () => {
      try {
        const result = await apiClient<ListResponse | Project[]>(
          "/api/projects",
        );

        const projects = Array.isArray(result) ? result : result.projects;

        if (!projects || projects.length === 0) {
          console.log(chalk.dim("  No projects found. Run `gitignored new` to create one."));
          return;
        }

        console.log();
        console.log(chalk.bold("  Your projects"));
        console.log();

        // Header
        console.log(
          "  " +
          chalk.dim(
            "NAME".padEnd(24) +
            "SLUG".padEnd(20) +
            "ROLE".padEnd(12) +
            "MEMBERS".padEnd(10) +
            "UPDATED"
          )
        );
        console.log("  " + chalk.dim("-".repeat(78)));

        for (const project of projects) {
          const name = project.name.padEnd(24);
          const slug = chalk.cyan(project.slug.padEnd(20));
          const role = (project.role || "owner").padEnd(12);
          const members = String(project.memberCount ?? "—").padEnd(10);
          const updated = chalk.dim(formatDate(project.updatedAt || project.createdAt));

          console.log(`  ${name}${slug}${role}${members}${updated}`);
        }

        console.log();
      } catch (err) {
        error(
          `List failed: ${err instanceof Error ? err.message : String(err)}`,
        );
        process.exitCode = 1;
      }
    });
}
