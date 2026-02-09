import type { Command } from "commander";
import { clearConfig } from "../lib/config.js";
import { success } from "../lib/ui.js";

export function registerLogoutCommand(program: Command): void {
  program
    .command("logout")
    .description("Sign out and clear credentials")
    .action(async () => {
      clearConfig();
      success("Logged out successfully.");
    });
}
