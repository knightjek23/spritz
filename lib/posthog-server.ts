import "server-only";

// Server-side PostHog capture over the public HTTP API, no SDK dependency.
// Used where the server is the reliable witness (e.g. a new account from the
// Clerk webhook). Never throws and never blocks longer than 3 s: analytics
// must not break the request it rides on.

const HOST = "https://us.i.posthog.com";

export async function captureServer(
  distinctId: string,
  event: string,
  properties: Record<string, unknown> = {},
  timestamp?: Date,
): Promise<void> {
  const apiKey =
    process.env.NEXT_PUBLIC_POSTHOG_KEY ?? process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;
  if (!apiKey) return;
  try {
    await fetch(`${HOST}/i/v0/e/`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        api_key: apiKey,
        event,
        distinct_id: distinctId,
        properties: { ...properties, $lib: "spritz-server" },
        timestamp: (timestamp ?? new Date()).toISOString(),
      }),
      signal: AbortSignal.timeout(3000),
    });
  } catch (err) {
    console.warn("[posthog-server] capture failed:", err);
  }
}
