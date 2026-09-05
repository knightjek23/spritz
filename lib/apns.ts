// APNs sender. SERVER ONLY.
//
// Talks to Apple directly over HTTP/2 with a token-based (JWT) provider
// connection, per D19: no push vendor, no SDK in the app beyond the
// first-party Capacitor plugin, nothing new on the privacy label.
//
// Env (Vercel):
//   APNS_KEY_ID       Key ID from developer.apple.com > Keys
//   APNS_TEAM_ID      Apple Developer Team ID
//   APNS_PRIVATE_KEY  Contents of the AuthKey_<id>.p8 file, newlines intact
//   APNS_BUNDLE_ID    app.spritzofficial (the apns-topic)
//   APNS_ENV          "sandbox" for Xcode-installed builds, "production"
//                     for TestFlight and the App Store. A token registered
//                     by one environment is rejected by the other with
//                     BadDeviceToken, so this has to match the build.
//
// The JWT is cached and reused for 50 minutes. Apple accepts tokens up to
// an hour old and rate-limits providers that mint a new one per request.
// The HTTP/2 session is opened per call and closed afterwards; on a
// serverless runtime there is nothing to keep alive between invocations,
// and a daily job sending a few hundred notifications is well inside what
// one session handles.

import "server-only";
import http2 from "node:http2";
import { SignJWT, importPKCS8 } from "jose";

const HOSTS = {
  sandbox: "https://api.sandbox.push.apple.com",
  production: "https://api.push.apple.com",
} as const;

type ApnsEnv = keyof typeof HOSTS;

export interface ApnsPayload {
  title: string;
  body: string;
  /** In-app path the tap should open, e.g. /fragrance/<id>. */
  path: string;
  /** push_sends.id, echoed back by the app so the open can be recorded. */
  sendId: string;
}

export interface ApnsResult {
  status: number;
  /** Apple's reason string on non-200, e.g. "BadDeviceToken", "Unregistered". */
  reason: string | null;
  /** True when the token should be disabled and never retried. */
  tokenDead: boolean;
}

function need(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`apns: missing ${name}`);
  return v;
}

export function apnsEnv(): ApnsEnv {
  const v = process.env.APNS_ENV ?? "sandbox";
  if (v !== "sandbox" && v !== "production") {
    throw new Error(`apns: APNS_ENV must be "sandbox" or "production", got "${v}"`);
  }
  return v;
}

let cachedJwt: { token: string; mintedAt: number } | null = null;
const JWT_TTL_MS = 50 * 60 * 1000;

async function providerToken(): Promise<string> {
  if (cachedJwt && Date.now() - cachedJwt.mintedAt < JWT_TTL_MS) return cachedJwt.token;

  // Vercel stores the value with real newlines; some shells paste it with
  // literal "\n". Accept both.
  const pem = need("APNS_PRIVATE_KEY").replace(/\\n/g, "\n");
  const key = await importPKCS8(pem, "ES256");
  const token = await new SignJWT({})
    .setProtectedHeader({ alg: "ES256", kid: need("APNS_KEY_ID") })
    .setIssuer(need("APNS_TEAM_ID"))
    .setIssuedAt()
    .sign(key);

  cachedJwt = { token, mintedAt: Date.now() };
  return token;
}

/**
 * Reasons that mean the token will never work again. Anything else
 * (throttling, a 5xx, an expired provider token) is left enabled.
 */
const DEAD_TOKEN_REASONS = new Set([
  "BadDeviceToken",
  "Unregistered",
  "DeviceTokenNotForTopic",
  "ExpiredToken",
]);

/** Send one alert notification. Never throws on an APNs error; throws on config errors. */
export async function sendApns(deviceToken: string, payload: ApnsPayload): Promise<ApnsResult> {
  const jwt = await providerToken();
  const topic = need("APNS_BUNDLE_ID");
  const host = HOSTS[apnsEnv()];

  const body = JSON.stringify({
    aps: {
      alert: { title: payload.title, body: payload.body },
      sound: "default",
    },
    // Custom keys ride outside `aps`. The bridge reads these on tap.
    path: payload.path,
    sendId: payload.sendId,
  });

  return new Promise<ApnsResult>((resolve, reject) => {
    const client = http2.connect(host);
    client.on("error", (err) => {
      client.close();
      reject(err);
    });

    const req = client.request({
      ":method": "POST",
      ":path": `/3/device/${deviceToken}`,
      authorization: `bearer ${jwt}`,
      "apns-topic": topic,
      "apns-push-type": "alert",
      "apns-priority": "10",
      "content-type": "application/json",
      "content-length": Buffer.byteLength(body),
    });

    let status = 0;
    let raw = "";
    req.setEncoding("utf8");
    req.on("response", (headers) => {
      status = Number(headers[":status"] ?? 0);
    });
    req.on("data", (chunk) => {
      raw += chunk;
    });
    req.on("end", () => {
      client.close();
      let reason: string | null = null;
      if (status !== 200 && raw) {
        try {
          reason = (JSON.parse(raw) as { reason?: string }).reason ?? null;
        } catch {
          reason = raw.slice(0, 120);
        }
      }
      resolve({
        status,
        reason,
        tokenDead: status === 410 || (reason !== null && DEAD_TOKEN_REASONS.has(reason)),
      });
    });
    req.on("error", (err) => {
      client.close();
      reject(err);
    });
    req.end(body);
  });
}
