import type { CapacitorConfig } from "@capacitor/cli";

// Capacitor config for the Spritz native shells (iOS first, Android later).
//
// Strategy: this is NOT a static export of the app. Spritz is a server-
// rendered Next.js app on Vercel, so the native shell loads the live site
// (server.url) and layers native capabilities on top — RevenueCat in-app
// purchases, push notifications, and the native camera — via Capacitor
// plugins. That native layer is exactly what carries the App Store 4.2
// "this is a real app, not a repackaged website" argument.
//
// Setup lives in APP_STORE_LAUNCH.md. This file is read only by the
// Capacitor CLI (`npx cap ...`) and Xcode — it is never imported by the
// web build, so it can't affect the Vercel deploy.
const config: CapacitorConfig = {
  appId: "app.spritzofficial",
  appName: "Spritz",
  // Placeholder web assets dir. With server.url set, the shell loads the
  // remote site; webDir just needs to exist for the CLI. `public` already does.
  webDir: "public",
  server: {
    url: "https://spritzofficial.app",
    // Never allow plaintext http in production shells.
    cleartext: false,
  },
  ios: {
    contentInset: "automatic",
  },
};

export default config;
