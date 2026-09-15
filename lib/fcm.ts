// FCM sender. SERVER ONLY.
//
// Talks to Firebase Cloud Messaging's HTTP v1 API directly, per D35: the
// Android twin of lib/apns.ts. No push vendor, no SDK on the server, nothing
// on the app beyond the first-party Capacitor plugin (which needs Firebase
// Messaging on Android regardless).
//
// Env (Vercel):
//   FCM_SERVICE_ACCOUNT_JSON  The service-account key file from Firebase
//                             (Project settings > Service accounts >
//                             Generate new private key), pasted whole.
//                             Real newlines or literal "\n" in the private
//                             key both work.
//
// Auth is a two-step Google OAuth dance: sign a JWT with the service
// account's RSA key, exchange it for a one-hour access token. The access
// token is cached for 50 minutes, matching the APNs provider-token policy.
// Google rate-limits the token endpoint, so minting per send is out.

import "server-only";
import { SignJWT, importPKCS8 } from "jose";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/firebase.messaging";

/** Same shape as ApnsPayload so the campaign builds one object for both. */
export interface FcmPayload {
  title: string;
  body: string;
  /** In-app path the tap should open, e.g. /fragrance/<id>. */
  path: string;
  /** push_sends.id, echoed back by the app so the open can be recorded. */
  sendId: string;
}

/** Same shape as ApnsResult. `status` is the FCM HTTP status. */
export interface FcmResult {
  status: number;
  /** FCM's error code on non-200, e.g. "UNREGISTERED", "INVALID_ARGUMENT". */
  reason: string | null;
  /** True when the token should be disabled and never retried. */
  tokenDead: boolean;
}

/**
 * Notification channel the Android app creates before registering
 * (lib/push.ts ensureAndroidChannel). Must match, or Android 8+ drops the
 * notification into the default "Miscellaneous" channel.
 */
export const ANDROID_CHANNEL_ID = "spritz_followups";

interface ServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
}

let cachedAccount: ServiceAccount | null = null;

function serviceAccount(): ServiceAccount {
  if (cachedAccount) return cachedAccount;
  const raw = process.env.FCM_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error("fcm: missing FCM_SERVICE_ACCOUNT_JSON");
  let parsed: Partial<ServiceAccount>;
  try {
    parsed = JSON.parse(raw) as Partial<ServiceAccount>;
  } catch {
    throw new Error("fcm: FCM_SERVICE_ACCOUNT_JSON is not valid JSON");
  }
  if (!parsed.project_id || !parsed.client_email || !parsed.private_key) {
    throw new Error("fcm: FCM_SERVICE_ACCOUNT_JSON lacks project_id, client_email or private_key");
  }
  cachedAccount = {
    project_id: parsed.project_id,
    client_email: parsed.client_email,
    private_key: parsed.private_key.replace(/\\n/g, "\n"),
  };
  return cachedAccount;
}

let cachedAccess: { token: string; mintedAt: number } | null = null;
const ACCESS_TTL_MS = 50 * 60 * 1000;

async function accessToken(): Promise<string> {
  if (cachedAccess && Date.now() - cachedAccess.mintedAt < ACCESS_TTL_MS) return cachedAccess.token;

  const sa = serviceAccount();
  const key = await importPKCS8(sa.private_key, "RS256");
  const assertion = await new SignJWT({ scope: SCOPE })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(sa.client_email)
    .setAudience(TOKEN_URL)
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(key);

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`fcm: token exchange failed ${res.status} ${text.slice(0, 200)}`);
  }
  const data = (await res.json()) as { access_token?: string };
  if (!data.access_token) throw new Error("fcm: token exchange returned no access_token");

  cachedAccess = { token: data.access_token, mintedAt: Date.now() };
  return cachedAccess.token;
}

/**
 * Error codes that mean the token will never work again: UNREGISTERED is
 * the app being uninstalled or the token rotated away. INVALID_ARGUMENT is
 * deliberately NOT here: FCM uses it for a malformed token but also for a
 * malformed message, and a payload bug must not disable every Android
 * token in one cron run. Throttling (429), UNAVAILABLE and INTERNAL are
 * left enabled too.
 */
const DEAD_TOKEN_CODES = new Set(["UNREGISTERED", "NOT_FOUND"]);

/**
 * Pull FCM's error code out of a non-200 body. v1 errors look like
 * { error: { code, message, status, details: [{ "@type": ...FcmError, errorCode }] } }.
 * The FcmError detail is the specific one; `status` is the generic gRPC name.
 */
export function fcmErrorCode(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const err = (body as { error?: unknown }).error;
  if (!err || typeof err !== "object") return null;
  const details = (err as { details?: unknown }).details;
  if (Array.isArray(details)) {
    for (const d of details) {
      const code = (d as { errorCode?: unknown })?.errorCode;
      if (typeof code === "string") return code;
    }
  }
  const status = (err as { status?: unknown }).status;
  return typeof status === "string" ? status : null;
}

/** Send one notification. Never throws on an FCM error; throws on config errors. */
export async function sendFcm(deviceToken: string, payload: FcmPayload): Promise<FcmResult> {
  const sa = serviceAccount();
  const token = await accessToken();

  const body = JSON.stringify({
    message: {
      token: deviceToken,
      notification: { title: payload.title, body: payload.body },
      // Custom keys. The bridge reads these on tap (same names as the
      // APNs payload's top-level keys).
      data: { path: payload.path, sendId: payload.sendId },
      android: {
        priority: "HIGH",
        notification: {
          channel_id: ANDROID_CHANNEL_ID,
          // Monochrome status-bar glyph and accent. Declared in the
          // manifest as defaults too; explicit here so a future manifest
          // edit cannot silently drop them.
          icon: "ic_stat_spritz",
          color: "#1F3F2E",
        },
      },
    },
  });

  const res = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body,
  });

  if (res.ok) return { status: res.status, reason: null, tokenDead: false };

  let parsed: unknown = null;
  try {
    parsed = await res.json();
  } catch {
    /* non-JSON error body */
  }
  const reason = fcmErrorCode(parsed);
  return {
    status: res.status,
    reason,
    tokenDead: reason !== null && DEAD_TOKEN_CODES.has(reason),
  };
}
