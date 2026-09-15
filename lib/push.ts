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
//
// Android (D35): Android 13+ has the same one-shot POST_NOTIFICATIONS
// prompt, driven the same way. Android 12 and older have no permission at
// all, so checkPermissions() says "granted" on a fresh install; the opt-in
// flag below is what keeps D21 (consent at the primer) true there.

import { isNativeApp, nativePlatform } from "./native";

export type PushPermission = "prompt" | "granted" | "denied" | "unavailable";

/**
 * Push exists on both shells: APNs on iOS (D19), FCM on Android (D35).
 * Kept as a function so a platform can be gated again in one place; the
 * Android gate lived here from 2026-09-15 until the Firebase project and
 * google-services.json landed, because without them the plugin's
 * register() throws "Default FirebaseApp is not initialized" and Android
 * kills the app. Any new platform goes through the same gate first.
 */
export function isPushSupported(): boolean {
  return isNativeApp();
}

/**
 * Set when the person taps Yes on the primer (or turns the Account toggle
 * on), cleared when they turn it off. iOS does not need it: the OS
 * permission is the record. Android 12 and older do, because there the
 * permission is granted without anyone being asked.
 */
export const OPT_IN_KEY = "spritz:push:opted-in";

export function hasOptedIn(): boolean {
  try {
    return localStorage.getItem(OPT_IN_KEY) === "1";
  } catch {
    return false;
  }
}

function setOptedIn(on: boolean): void {
  try {
    if (on) localStorage.setItem(OPT_IN_KEY, "1");
    else localStorage.removeItem(OPT_IN_KEY);
  } catch {
    /* storage unavailable */
  }
}

/**
 * Whether register-on-launch may run without a fresh Yes. iOS: the OS
 * permission is consent. Android: the permission alone is not, so the
 * local flag has to be there too.
 */
export function mayRegisterOnLaunch(): boolean {
  return nativePlatform() === "ios" || hasOptedIn();
}

/** Android notification channel; must match lib/fcm.ts ANDROID_CHANNEL_ID. */
export const ANDROID_CHANNEL_ID = "spritz_followups";

/**
 * Android 8+ files every notification under a channel and the person
 * manages them per channel in Settings. Without one of our own the
 * follow-up lands in "Miscellaneous". Idempotent; no-op off Android.
 */
export async function ensureAndroidChannel(): Promise<void> {
  if (nativePlatform() !== "android") return;
  const { PushNotifications } = await import("@capacitor/push-notifications");
  await PushNotifications.createChannel({
    id: ANDROID_CHANNEL_ID,
    name: "Scan follow-ups",
    description: "One notification the day after a scan, with how it wears.",
    importance: 4,
    visibility: 1,
  });
}

/** Storage key for how many times the primer was dismissed with Not now. */
export const PRIMER_DISMISS_KEY = "spritz:push-primer:dismissed";
export const PRIMER_DISMISS_CAP = 3;

export async function getPushPermission(): Promise<PushPermission> {
  if (!isPushSupported()) return "unavailable";
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
  if (!isPushSupported()) return "unavailable";
  const { PushNotifications } = await import("@capacitor/push-notifications");
  const { receive } = await PushNotifications.requestPermissions();
  if (receive !== "granted") return receive === "denied" ? "denied" : "prompt";
  await ensureAndroidChannel();
  await PushNotifications.register();
  setOptedIn(true);
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
  if (res.ok) setOptedIn(false);
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
