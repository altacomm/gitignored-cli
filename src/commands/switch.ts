import type { Command } from "commander";
import * as fs from "node:fs";
import * as path from "node:path";
import { apiClient } from "../lib/api.js";
import { decryptEnv } from "../lib/crypto.js";
import { loadProjectKey } from "../lib/keystore.js";
import { success, error, warn, info } from "../lib/ui.js";

interface Project {
  id: string;
  name: string;
  slug: string;
}

interface ListResponse {
  projects: Project[];
}

interface PullResponse {
  encryptedPayload: string;
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

export function registerSwitchCommand(program: Command): void {
  program
    .command("switch <slug>")
    .description("Switch active project")
    .action(async (slug: string) => {
      try {
        // Find project by slug
        const result = await apiClient<ListResponse | Project[]>(
          "/api/projects",
        );

        const projects = Array.isArray(result) ? result : result.projects;
        const project = projects?.find((p) => p.slug === slug);

        if (!project) {
          error(`Project "${slug}" not found.`);
          process.exitCode = 1;
          return;
        }

        // Update .gitignored.json
        const configPath = path.join(process.cwd(), ".gitignored.json");
        const configData = {
          projectId: project.id,
          projectSlug: project.slug,
        };
        fs.writeFileSync(configPath, JSON.stringify(configData, null, 2) + "\n");

        // Check for project key
        const projectKey = loadProjectKey(project.id);
        if (!projectKey) {
          warn(
            "No project key found locally. You may need to be invited to this project.",
          );
          success(`Switched to ${project.name} (${project.slug})`);
          return;
        }

        // Auto-pull latest .env.shared
        try {
          const pullResult = await apiClient<PullResponse>(
            `/api/projects/${project.id}/env`,
          );

          if (pullResult.encryptedPayload) {
            const decrypted = decryptEnv(pullResult.encryptedPayload, projectKey);
            fs.writeFileSync(
              path.join(process.cwd(), ".env.shared"),
              decrypted,
            );
            const vars = countVars(decrypted);
            info(`Pulled v${pullResult.version} (${vars} var${vars !== 1 ? "s" : ""})`);
          }
        } catch {
          warn("Could not pull latest .env.shared. Run `gitignored pull` manually.");
        }

        success(`Switched to ${project.name} (${project.slug})`);
      } catch (err) {
        error(
          `Switch failed: ${err instanceof Error ? err.message : String(err)}`,
        );
        process.exitCode = 1;
      }
    });
}
