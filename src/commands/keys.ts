import type { Command } from "commander";
import { info } from "../lib/ui.js";

export function registerKeysCommand(program: Command): void {
  const keys = program
    .command("keys")
    .description("Manage encryption keys");

  keys
    .command("sync")
    .description("Sync encryption keys with the server")
    .action(async () => {
      info("Not implemented yet");
    });
}
