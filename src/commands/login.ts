import type { Command } from "commander";
import * as crypto from "node:crypto";
import open from "open";
import { ensureConfigDir, getConfig, saveConfig } from "../lib/config.js";
import { apiClient, ApiError } from "../lib/api.js";
import { generateKeypair } from "../lib/crypto.js";
import {
  hasIdentityKeypair,
  saveIdentityKeypair,
} from "../lib/keystore.js";
import { success, error, info, createSpinner } from "../lib/ui.js";
import { encodeBase64 } from "tweetnacl-util";

interface DeviceStatusResponse {
  status: "pending" | "approved";
  token?: string;
  userId?: string;
  email?: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function registerLoginCommand(program: Command): void {
  program
    .command("login")
    .description("Authenticate with gitignored")
    .action(async () => {
      try {
        ensureConfigDir();

        const code = crypto.randomBytes(16).toString("hex");
        const config = getConfig();

        await apiClient("/api/cli/device", {
          method: "POST",
          body: JSON.stringify({ code }),
        });

        const authUrl = `${config.apiBaseUrl}/auth/device?code=${code}`;
        info(`Opening browser to authorize...`);
        await open(authUrl);

        const spinner = createSpinner("Waiting for authorization...").start();

        while (true) {
          await sleep(2000);

          try {
            const status = await apiClient<DeviceStatusResponse>(
              `/api/cli/device/${code}/status`,
            );

            if (status.status === "approved" && status.token) {
              spinner.stop();

              saveConfig({
                authToken: status.token,
                userId: status.userId,
                email: status.email,
              });

              if (!hasIdentityKeypair()) {
                const keypair = generateKeypair();
                saveIdentityKeypair(keypair);

                await apiClient("/api/cli/keys", {
                  method: "POST",
                  body: JSON.stringify({
                    publicKey: encodeBase64(keypair.publicKey),
                  }),
                });
              }

              success(`Logged in as ${status.email}`);
              return;
            }
          } catch (err) {
            if (err instanceof ApiError && err.statusCode === 404) {
              spinner.stop();
              error("Device code expired. Please try again.");
              return;
            }
            // Other errors: keep polling
          }
        }
      } catch (err) {
        error(
          `Login failed: ${err instanceof Error ? err.message : String(err)}`,
        );
        process.exitCode = 1;
      }
    });
}
