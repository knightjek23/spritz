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
    // Shown when the live site cannot be loaded (no network, DNS failure).
    // Relative to webDir, so public/offline.html, bundled into the app at
    // `cap sync`. Without it WKWebView paints its own error text on white.
    errorPath: "offline.html",
    // Keep Clerk's hosted auth pages inside the webview instead of kicking
    // them out to Safari. Without this, email sign-in dead-ends in the shell.
    allowNavigation: ["spritzofficial.app", "*.spritzofficial.app"],
  },
  // Painted behind the webview before the first page renders, and behind
  // any over-scroll. Cream, matching app/globals.css --bg-base and the
  // launch screen, so launch -> splash -> first page is one continuous
  // color. Without it the default is white, which is the "white flash on
  // launch" slice 8 lists.
  backgroundColor: "#F4EFE6",
  ios: {
    // "never": the page handles the status bar itself (viewportFit cover
    // plus the --safe-* tokens, D13). "automatic" made WKWebView add the
    // status-bar height as a scrollable inset on top of that, so the nav
    // sat too low, the page had two resting positions, and pulling down
    // scrolled into a blank cream band above the nav.
    contentInset: "never",
    // No long-press link preview (the title + domain bubble, then Open
    // Link / Copy Link / Share) on cards. Cards are app rows, not web
    // links. components/native-touch-links.tsx covers builds 1-3 from
    // the web side; this is the native switch from build 4 on.
    allowsLinkPreview: false,
  },
  plugins: {
    // Keeps the launch storyboard (cream + "spritz" wordmark) on screen
    // while the webview fetches the live site, instead of iOS swapping it
    // for an empty cream webview the moment the app process is up. That
    // swap was the blank beat on cold launch. The web launch layer paints
    // the identical frame and then calls SplashScreen.hide() with no fade
    // (LAUNCH_SCREEN_BOOT in components/launch-screen.tsx), so the native
    // wordmark is replaced by the web wordmark in the same pixels.
    // launchAutoHide stays on with a long duration purely as a failsafe:
    // if the page never loads, the splash still clears after 8s.
    // public/offline.html hides it too.
    SplashScreen: {
      launchAutoHide: true,
      launchShowDuration: 8000,
      launchFadeOutDuration: 0,
      backgroundColor: "#F4EFE6",
      showSpinner: false,
    },
    PushNotifications: {
      // Show the banner even when the app is in the foreground. Without
      // this iOS delivers the notification silently to Notification Center
      // while the app is on screen, which during testing looks exactly like
      // "nothing arrived".
      presentationOptions: ["badge", "sound", "alert"],
    },
  },
};

export default config;
