import type { Command } from "commander";
import * as fs from "node:fs";
import * as path from "node:path";
import { apiClient } from "../lib/api.js";
import { success, error } from "../lib/ui.js";

interface ProjectConfig {
  projectId: string;
  projectSlug: string;
}

interface InvitationResponse {
  id: string;
  email: string;
  role: string;
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

export function registerInviteCommand(program: Command): void {
  program
    .command("invite <email>")
    .description("Invite a team member to a project")
    .option("--role <role>", "Role to assign (member, readonly)", "member")
    .action(async (email: string, options: { role: string }) => {
      try {
        const config = loadProjectConfig();
        if (!config) {
          error(
            "No .gitignored.json found. Run `gitignored new` to create a project.",
          );
          process.exitCode = 1;
          return;
        }

        const invitation = await apiClient<InvitationResponse>(
          `/api/projects/${config.projectId}/invitations`,
          {
            method: "POST",
            body: JSON.stringify({ email, role: options.role }),
          },
        );

        success(`Invitation sent to ${invitation.email} (${invitation.role})`);
      } catch (err) {
        error(
          `Invite failed: ${err instanceof Error ? err.message : String(err)}`,
        );
        process.exitCode = 1;
      }
    });
}
