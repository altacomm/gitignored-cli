import { Command } from "commander";
import { registerLoginCommand } from "./commands/login.js";
import { registerLogoutCommand } from "./commands/logout.js";
import { registerWhoamiCommand } from "./commands/whoami.js";
import { registerNewCommand } from "./commands/new.js";
import { registerPushCommand } from "./commands/push.js";
import { registerPullCommand } from "./commands/pull.js";
import { registerInviteCommand } from "./commands/invite.js";
import { registerMembersCommand } from "./commands/members.js";
import { registerListCommand } from "./commands/list.js";
import { registerSwitchCommand } from "./commands/switch.js";
import { registerLogCommand } from "./commands/log.js";
import { registerRollbackCommand } from "./commands/rollback.js";
import { registerDiffCommand } from "./commands/diff.js";
import { registerStartCommand } from "./commands/start.js";
import { registerKeysCommand } from "./commands/keys.js";

const program = new Command();

program
  .name("gitignored")
  .description("Zero-knowledge .env sharing for developer teams")
  .version("0.1.0");

// Auth commands
registerLoginCommand(program);
registerLogoutCommand(program);
registerWhoamiCommand(program);

// Project commands
registerNewCommand(program);
registerPushCommand(program);
registerPullCommand(program);
registerInviteCommand(program);
registerMembersCommand(program);
registerListCommand(program);
registerSwitchCommand(program);

// History commands
registerLogCommand(program);
registerRollbackCommand(program);
registerDiffCommand(program);

// Runner
registerStartCommand(program);

// Key management
registerKeysCommand(program);

program.parse(process.argv);
