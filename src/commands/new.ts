import type { Command } from "commander";
import * as fs from "node:fs";
import * as path from "node:path";
import * as readline from "node:readline";
import { apiClient } from "../lib/api.js";
import { generateProjectKey, encryptProjectKey } from "../lib/crypto.js";
import { loadIdentityKeypair, saveProjectKey } from "../lib/keystore.js";
import { success, error } from "../lib/ui.js";

interface CreateProjectResponse {
  id: string;
  slug: string;
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function promptForName(): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    rl.question("Project name: ", (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

function ensureGitignoreEntries(dir: string, entries: string[]): void {
  const gitignorePath = path.join(dir, ".gitignore");
  let content = "";
  try {
    content = fs.readFileSync(gitignorePath, "utf-8");
  } catch {
    // File doesn't exist yet
  }

  const lines = content.split("\n");
  const toAdd = entries.filter((entry) => !lines.includes(entry));

  if (toAdd.length > 0) {
    const suffix = content.length > 0 && !content.endsWith("\n") ? "\n" : "";
    fs.writeFileSync(
      gitignorePath,
      content + suffix + toAdd.join("\n") + "\n",
    );
  }
}

export function registerNewCommand(program: Command): void {
  program
    .command("new")
    .description("Create a new project")
    .option("--name <name>", "Project name")
    .action(async (options: { name?: string }) => {
      try {
        let name = options.name;
        if (!name) {
          name = await promptForName();
        }

        if (!name) {
          error("Project name is required.");
          process.exitCode = 1;
          return;
        }

        const slug = slugify(name);

        const keypair = loadIdentityKeypair();
        if (!keypair) {
          error(
            "No identity keypair found. Run `gitignored login` first.",
          );
          process.exitCode = 1;
          return;
        }

        const projectKey = generateProjectKey();
        const encryptedProjectKey = encryptProjectKey(
          projectKey,
          keypair.publicKey,
          keypair.secretKey,
        );

        const project = await apiClient<CreateProjectResponse>(
          "/api/projects",
          {
            method: "POST",
            body: JSON.stringify({
              name,
              slug,
              encryptedProjectKey,
            }),
          },
        );

        saveProjectKey(project.id, projectKey);

        const cwd = process.cwd();

        fs.writeFileSync(
          path.join(cwd, ".gitignored.json"),
          JSON.stringify(
            { projectId: project.id, projectSlug: project.slug },
            null,
            2,
          ) + "\n",
        );

        const envSharedPath = path.join(cwd, ".env.shared");
        if (!fs.existsSync(envSharedPath)) {
          fs.writeFileSync(envSharedPath, "");
        }

        const envLocalPath = path.join(cwd, ".env.local");
        if (!fs.existsSync(envLocalPath)) {
          fs.writeFileSync(envLocalPath, "");
        }

        ensureGitignoreEntries(cwd, [".env.local", ".gitignored.json"]);

        success(
          `Created project "${name}" (${project.slug})`,
        );
      } catch (err) {
        error(
          `Failed to create project: ${err instanceof Error ? err.message : String(err)}`,
        );
        process.exitCode = 1;
      }
    });
}
