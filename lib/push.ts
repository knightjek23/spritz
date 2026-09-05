// Push notifications, client side. No-ops on the web.
//
// Wraps @capacitor/push-notifications so the rest of the app never imports
// it directly: dynamic imports keep the plugin out of the web bundle, and
// every function here returns a harmless value outside the shell.
//
// Permission is a one-shot on iOS: decline the OS prompt and the only way
// back is Settings. That is why the prompt is only ever triggered from the
// primer (components/push-primer.tsx) after the person has said yes to a
// concrete promise, never on launch.

import { isNativeApp, nativePlatform } from "./native";

export type PushPermission = "prompt" | "granted" | "denied" | "unavailable";

/** Storage key for how many times the primer was dismissed with Not now. */
export const PRIMER_DISMISS_KEY = "spritz:push-primer:dismissed";
export const PRIMER_DISMISS_CAP = 3;

export async function getPushPermission(): Promise<PushPermission> {
  if (!isNativeApp()) return "unavailable";
  const { PushNotifications } = await import("@capacitor/push-notifications");
  const { receive } = await PushNotifications.checkPermissions();
  if (receive === "granted") return "granted";
  if (receive === "denied") return "denied";
  return "prompt";
}

/**
 * Show the OS prompt (if not already answered), register with APNs, and
 * hand the token to the server. Resolves to the resulting permission.
 *
 * The token itself arrives asynchronously through the `registration`
 * listener that NativeAuthBridge owns; this function only kicks it off.
 */
export async function requestPushAndRegister(): Promise<PushPermission> {
  if (!isNativeApp()) return "unavailable";
  const { PushNotifications } = await import("@capacitor/push-notifications");
  const { receive } = await PushNotifications.requestPermissions();
  if (receive !== "granted") return receive === "denied" ? "denied" : "prompt";
  await PushNotifications.register();
  return "granted";
}

/** POST the device token to the server. Called from the registration listener. */
export async function saveTokenToServer(token: string): Promise<boolean> {
  const platform = nativePlatform();
  if (platform === "web") return false;
  const res = await fetch("/api/push/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token, platform }),
  });
  return res.ok;
}

/** Turn notifications off server-side. The OS permission is left alone. */
export async function disablePush(): Promise<boolean> {
  const res = await fetch("/api/push/register", { method: "DELETE" });
  return res.ok;
}

/** Server's view: does this user have an enabled token? */
export async function isPushEnabledOnServer(): Promise<boolean> {
  const res = await fetch("/api/push/register", { cache: "no-store" });
  if (!res.ok) return false;
  const data = (await res.json().catch(() => null)) as { enabled?: boolean } | null;
  return data?.enabled === true;
}

/** Record that a notification tap opened the app. */
export async function reportPushOpened(sendId: string): Promise<void> {
  await fetch("/api/push/opened", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sendId }),
  }).catch(() => {});
}

export function primerDismissCount(): number {
  try {
    return Number(localStorage.getItem(PRIMER_DISMISS_KEY) ?? "0") || 0;
  } catch {
    return 0;
  }
}

export function recordPrimerDismiss(): void {
  try {
    localStorage.setItem(PRIMER_DISMISS_KEY, String(primerDismissCount() + 1));
  } catch {
    /* storage unavailable */
  }
}
