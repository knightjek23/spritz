// Capture screenshots against PRODUCTION instead of a local dev server.
//
// Why this exists: capture.mjs defaults to http://localhost:3000, which means
// booting the dev server first. For case-study and portfolio shots you want
// the real deployed site anyway, so this just presets the base URL and hands
// off to the same capture script. Nothing else differs.
//
// Run (Node 20+ reads .env.local natively, no dotenv needed):
//
//   node --env-file=.env.local scripts/screenshots/prod.mjs
//
// Needs NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from .env.local,
// because routes.mjs resolves the dynamic [id]/[slug] routes against the real
// catalog rather than hard-coding sample records.
//
// NOTE on auth: .auth/state.json was saved against localhost, so its cookies
// are scoped to that origin and will NOT authenticate on the production
// domain. Signed-in routes will quietly capture as signed-out. To fix, re-run
// auth against prod first:
//
//   node --env-file=.env.local scripts/screenshots/prod-auth.mjs

process.env.SCREENSHOT_BASE_URL =
  process.env.SCREENSHOT_BASE_URL || "https://spritzofficial.app";

console.log(`[prod] capturing against ${process.env.SCREENSHOT_BASE_URL}`);
await import("./capture.mjs");
