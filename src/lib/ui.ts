import chalk from "chalk";
import ora, { type Ora } from "ora";

export function success(msg: string): void {
  console.log(chalk.green("\u2714") + " " + msg);
}

export function error(msg: string): void {
  console.error(chalk.red("\u2718") + " " + msg);
}

export function warn(msg: string): void {
  console.warn(chalk.yellow("\u26A0") + " " + msg);
}

export function info(msg: string): void {
  console.log(chalk.blue("\u2139") + " " + msg);
}

export function createSpinner(text: string): Ora {
  return ora({ text });
}
