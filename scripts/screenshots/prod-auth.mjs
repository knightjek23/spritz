// Save a PRODUCTION Clerk session to .auth/state.json.
//
// Same as auth.mjs, but pointed at the live site. Only needed if you want
// the signed-in screens (For You home, /collection, /account, signed-in
// /scan). The public encyclopedia screens do not need this.
//
// Run: node --env-file=.env.local scripts/screenshots/prod-auth.mjs
//
// A real browser window opens. Sign in, wait until you land on the home or
// welcome page, then return to the terminal and press ENTER.

process.env.SCREENSHOT_BASE_URL =
  process.env.SCREENSHOT_BASE_URL || "https://spritzofficial.app";

console.log(`[prod-auth] signing in against ${process.env.SCREENSHOT_BASE_URL}`);
await import("./auth.mjs");
