import type { Command } from "commander";
import * as fs from "node:fs";
import * as path from "node:path";
import { apiClient } from "../lib/api.js";
import { decryptEnv, encryptProjectKey } from "../lib/crypto.js";
import { loadProjectKey, loadIdentityKeypair } from "../lib/keystore.js";
import { success, error, info } from "../lib/ui.js";
import { decodeBase64 } from "tweetnacl-util";

interface ProjectConfig {
  projectId: string;
  projectSlug: string;
}

interface PullResponse {
  encryptedPayload: string;
  version: number;
}

interface PendingMember {
  userId: string;
  publicKey: string;
}

interface Project {
  id: string;
  name: string;
  slug: string;
}

interface ListResponse {
  projects: Project[];
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

export function registerPullCommand(program: Command): void {
  program
    .command("pull")
    .description("Pull and decrypt .env from the server")
    .option("--token <token>", "Auth token (for CI/CD)")
    .option("--project <slug>", "Project slug (for CI/CD)")
    .action(async (options: { token?: string; project?: string }) => {
      try {
        // CI/CD: if --token is provided, set it as env var for apiClient
        if (options.token) {
          process.env.GITIGNORED_TOKEN = options.token;
        }

        let projectId: string;

        if (options.project) {
          // CI/CD mode: resolve slug to projectId
          const result = await apiClient<ListResponse | Project[]>(
            "/api/projects",
          );
          const projects = Array.isArray(result) ? result : result.projects;
          const project = projects?.find((p) => p.slug === options.project);

          if (!project) {
            error(`Project "${options.project}" not found.`);
            process.exitCode = 1;
            return;
          }
          projectId = project.id;
        } else {
          const config = loadProjectConfig();
          if (!config) {
            error(
              "No .gitignored.json found. Run `gitignored new` to create a project, or use --project <slug>.",
            );
            process.exitCode = 1;
            return;
          }
          projectId = config.projectId;
        }

        const projectKey = loadProjectKey(projectId);
        if (!projectKey) {
          error(
            "No project key found. You may need to be invited to this project.",
          );
          process.exitCode = 1;
          return;
        }

        const result = await apiClient<PullResponse>(
          `/api/projects/${projectId}/env`,
        );

        if (!result.encryptedPayload) {
          error("No environment snapshot found. Run `gitignored push` first.");
          process.exitCode = 1;
          return;
        }

        const decrypted = decryptEnv(result.encryptedPayload, projectKey);

        fs.writeFileSync(
          path.join(process.cwd(), ".env.shared"),
          decrypted,
        );

        const vars = countVars(decrypted);
        success(`Pulled v${result.version} (${vars} var${vars !== 1 ? "s" : ""})`);

        await syncPendingKeys(projectId);
      } catch (err) {
        error(
          `Pull failed: ${err instanceof Error ? err.message : String(err)}`,
        );
        process.exitCode = 1;
      }
    });
}
