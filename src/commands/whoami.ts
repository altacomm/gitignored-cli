import type { Command } from "commander";
import { apiClient, ApiError } from "../lib/api.js";
import { success, error } from "../lib/ui.js";

interface MeResponse {
  email: string;
  userId: string;
}

export function registerWhoamiCommand(program: Command): void {
  program
    .command("whoami")
    .description("Show current authenticated user")
    .action(async () => {
      try {
        const me = await apiClient<MeResponse>("/api/cli/me");
        success(`Logged in as ${me.email} (${me.userId})`);
      } catch (err) {
        if (err instanceof ApiError && err.statusCode === 401) {
          error("Not logged in. Run `gitignored login` to authenticate.");
        } else {
          error(
            `Failed to fetch user: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
        process.exitCode = 1;
      }
    });
}
