// Exercises lib/fcm.ts without touching Google: `npm run test:fcm`.
//
// Stubs global fetch so the OAuth exchange and the FCM send are answered
// locally, then checks the request shape and the status/reason/tokenDead
// mapping for the cases the campaign depends on: a 200, an uninstalled
// device (UNREGISTERED -> disable), a malformed message (INVALID_ARGUMENT
// -> keep the token), throttling (429 -> keep), and access-token caching
// across two sends. A throwaway RSA key is generated per run; nothing here
// needs FCM_SERVICE_ACCOUNT_JSON from the real project.
//
// Same `server-only` stub as scripts/test-account-purge.ts, for the same
// reason.

import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { generateKeyPairSync } from "node:crypto";

const req = createRequire(process.cwd() + "/package.json");
try {
  const serverOnlyPath = req.resolve("server-only");
  req.cache[serverOnlyPath] = {
    id: serverOnlyPath,
    filename: serverOnlyPath,
    loaded: true,
    exports: {},
    children: [],
    paths: [],
  } as unknown as ReturnType<typeof createRequire>["cache"][string];
} catch {
  /* not installed */
}

const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
process.env.FCM_SERVICE_ACCOUNT_JSON = JSON.stringify({
  project_id: "spritz-test",
  client_email: "fcm-test@spritz-test.iam.gserviceaccount.com",
  // Literal \n, the way a shell paste arrives, to prove the normaliser.
  private_key: pem.replace(/\n/g, "\\n"),
});

type Call = { url: string; init: RequestInit };
const calls: Call[] = [];
let nextSend: { status: number; body: unknown } = {
  status: 200,
  body: { name: "projects/x/messages/1" },
};
let tokenExchanges = 0;

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;
  calls.push({ url, init: init ?? {} });
  if (url === "https://oauth2.googleapis.com/token") {
    tokenExchanges++;
    const params = new URLSearchParams(String(init?.body));
    assert.equal(
      params.get("grant_type"),
      "urn:ietf:params:oauth:grant-type:jwt-bearer",
    );
    assert.ok(
      (params.get("assertion") ?? "").split(".").length === 3,
      "assertion is a JWT",
    );
    return new Response(
      JSON.stringify({ access_token: "ya29.test", expires_in: 3600 }),
      { status: 200 },
    );
  }
  if (
    url.startsWith(
      "https://fcm.googleapis.com/v1/projects/spritz-test/messages:send",
    )
  ) {
    return new Response(JSON.stringify(nextSend.body), {
      status: nextSend.status,
    });
  }
  throw new Error(`unexpected fetch ${url}`);
}) as typeof fetch;

async function main() {
  const { sendFcm, fcmErrorCode, ANDROID_CHANNEL_ID } =
    await import("../lib/fcm");

  const payload = {
    title: "Sauvage by Dior",
    body: "Here's how it wears, and what to compare it to.",
    path: "/fragrance/abc",
    sendId: "send-1",
  };

  let pass = 0;
  function ok(name: string) {
    pass++;
    console.log(`  ok  ${name}`);
  }

  // 1. Success, and the request shape the Android app and channel depend on.
  {
    const r = await sendFcm("device-token-1", payload);
    assert.deepEqual(r, { status: 200, reason: null, tokenDead: false });
    const send = calls.find((c) => c.url.includes("messages:send"))!;
    assert.equal(
      (send.init.headers as Record<string, string>).authorization,
      "Bearer ya29.test",
    );
    const msg = JSON.parse(String(send.init.body)).message;
    assert.equal(msg.token, "device-token-1");
    assert.deepEqual(msg.notification, {
      title: payload.title,
      body: payload.body,
    });
    assert.deepEqual(msg.data, { path: payload.path, sendId: payload.sendId });
    assert.equal(msg.android.priority, "HIGH");
    assert.equal(msg.android.notification.channel_id, ANDROID_CHANNEL_ID);
    assert.equal(msg.android.notification.icon, "ic_stat_spritz");
    ok("200 -> sent; payload carries token, notification, data, channel, icon");
  }

  // 2. Second send reuses the cached access token.
  {
    await sendFcm("device-token-2", payload);
    assert.equal(tokenExchanges, 1);
    ok("access token cached across sends");
  }

  // 3. Uninstalled device: UNREGISTERED in the FcmError detail -> dead.
  {
    nextSend = {
      status: 404,
      body: {
        error: {
          code: 404,
          message: "Requested entity was not found.",
          status: "NOT_FOUND",
          details: [
            {
              "@type": "type.googleapis.com/google.firebase.fcm.v1.FcmError",
              errorCode: "UNREGISTERED",
            },
          ],
        },
      },
    };
    const r = await sendFcm("stale-token", payload);
    assert.deepEqual(r, {
      status: 404,
      reason: "UNREGISTERED",
      tokenDead: true,
    });
    ok("404 UNREGISTERED -> tokenDead");
  }

  // 4. Malformed message: INVALID_ARGUMENT must NOT disable the token.
  {
    nextSend = {
      status: 400,
      body: {
        error: {
          code: 400,
          message: "Invalid JSON payload received.",
          status: "INVALID_ARGUMENT",
          details: [
            {
              "@type": "type.googleapis.com/google.firebase.fcm.v1.FcmError",
              errorCode: "INVALID_ARGUMENT",
            },
          ],
        },
      },
    };
    const r = await sendFcm("device-token-3", payload);
    assert.deepEqual(r, {
      status: 400,
      reason: "INVALID_ARGUMENT",
      tokenDead: false,
    });
    ok("400 INVALID_ARGUMENT -> recorded, token kept");
  }

  // 5. Throttled: keep the token.
  {
    nextSend = {
      status: 429,
      body: { error: { code: 429, status: "RESOURCE_EXHAUSTED" } },
    };
    const r = await sendFcm("device-token-4", payload);
    assert.deepEqual(r, {
      status: 429,
      reason: "RESOURCE_EXHAUSTED",
      tokenDead: false,
    });
    ok("429 -> recorded, token kept");
  }

  // 6. Non-JSON error body does not throw.
  {
    nextSend = { status: 503, body: "Service Unavailable" };
    const r = await sendFcm("device-token-5", payload);
    assert.equal(r.status, 503);
    assert.equal(r.tokenDead, false);
    ok("503 with text body -> recorded, token kept");
  }

  // 7. fcmErrorCode prefers the FcmError detail over the gRPC status.
  {
    assert.equal(fcmErrorCode(null), null);
    assert.equal(
      fcmErrorCode({ error: { status: "UNAVAILABLE" } }),
      "UNAVAILABLE",
    );
    assert.equal(
      fcmErrorCode({
        error: {
          status: "NOT_FOUND",
          details: [{ errorCode: "UNREGISTERED" }],
        },
      }),
      "UNREGISTERED",
    );
    ok("fcmErrorCode picks the specific code");
  }

  console.log(`\n${pass} checks passed`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
