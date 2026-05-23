// One-time helper: opens a real browser, lets you sign in with your
// Clerk dev user, then saves the session cookies + localStorage to
// .auth/state.json. The capture script reuses that state so it doesn't
// have to walk through the Clerk login form on every run.
//
// Usage:
//   node scripts/screenshots/auth.mjs
//
// Then sign in normally. When you see your /welcome or / page, hit
// ENTER in this terminal to save and quit.

import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import readline from "node:readline";

const BASE_URL = process.env.SCREENSHOT_BASE_URL || "http://localhost:3000";
const STATE_PATH = ".auth/state.json";

const browser = await chromium.launch({ headless: false });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
});
const page = await context.newPage();

console.log(`[auth] navigating to ${BASE_URL}/sign-in`);
console.log(`[auth] sign in with your Clerk user, wait until you land on the home/welcome page, then come back here and hit ENTER.`);

await page.goto(`${BASE_URL}/sign-in`);

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
await new Promise((resolve) => rl.question("> press ENTER once signed in: ", resolve));
rl.close();

await mkdir(dirname(STATE_PATH), { recursive: true });
await context.storageState({ path: STATE_PATH });
console.log(`[auth] saved session state to ${STATE_PATH}`);

await browser.close();
