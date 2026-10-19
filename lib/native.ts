// Native-shell detection.
//
// The iOS and Android apps are Capacitor shells that load the live site
// (see capacitor.config.ts). Capacitor injects `window.Capacitor` into its
// webview before any page script runs, so the web app can tell at runtime
// whether it is inside the shell without a build-time flag. This is the
// single place that check lives; slice 7 branches on it to hide Stripe,
// which Guideline 3.1.1 makes an automatic rejection if missed.
//
// Server components and SSR see `false`. Anything that must differ on
// native has to happen client-side, after hydration. The <NativeAuthBridge>
// mirrors the result onto <html class="native-app"> so CSS can branch too.

declare global {
  interface Window {
    Capacitor?: {
      isNativePlatform?: () => boolean;
      getPlatform?: () => "ios" | "android" | "web";
    };
  }
}

export function isNativeApp(): boolean {
  if (typeof window === "undefined") return false;
  return window.Capacitor?.isNativePlatform?.() === true;
}

export function nativePlatform(): "ios" | "android" | "web" {
  if (typeof window === "undefined") return "web";
  return window.Capacitor?.getPlatform?.() ?? "web";
}

/** Custom URL scheme registered in ios/App/App/Info.plist (CFBundleURLTypes). */
export const NATIVE_URL_SCHEME = "app.spritzofficial";

/** Class the bridge sets on <html> when running inside the shell. */
export const NATIVE_HTML_CLASS = "native-app";
