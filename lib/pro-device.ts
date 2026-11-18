"use client";

// Remembers, on this device, that a Pro account uses it.
//
// The trial pitch (components/pro-intro-sheet.tsx) shows to signed-out
// visitors, which is right for a stranger but wrong for a paying member
// whose session lapsed: they opened the app signed out and got asked to
// start a free trial of something they already pay for. Once a signed-in
// Pro account has been seen here, the pitch stays away even while signed
// out. Cleared when a signed-in non-Pro account is seen, so a family
// iPad that changes hands, or a cancelled plan, gets the normal pitch.
// localStorage: survives restarts and sign-outs, which is the point.

const KEY = "spritz.pro.device";

export function rememberProDevice(isPro: boolean) {
  try {
    if (isPro) window.localStorage.setItem(KEY, "1");
    else window.localStorage.removeItem(KEY);
  } catch {
    // Private mode: the signed-in check still covers Pro accounts.
  }
}

export function wasProOnDevice(): boolean {
  try {
    return window.localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}
