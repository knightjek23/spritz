// PostHog analytics, loaded via the official JS snippet — no npm
// dependency, nothing added to the client bundle beyond the loader.
//
// Renders nothing unless NEXT_PUBLIC_POSTHOG_KEY is set, so dev and
// preview environments stay clean by default. Set the key in production
// before launch: without it there is zero funnel measurement
// (landing → sign-up → scan → save).
//
// `defaults: '2025-05-24'` opts into history-change pageview capture, so
// App Router client-side navigations are tracked as pageviews too.
//
// Traffic goes through the /ingest reverse proxy (rewrites in
// next.config.mjs) so ad blockers don't drop events. Every event carries a
// `platform` super property (ios | android | web) read from the Capacitor
// bridge, which is injected before page scripts run. Identity is attached
// by <PostHogIdentify> once Clerk knows who the user is.
//
// The key is read from NEXT_PUBLIC_POSTHOG_KEY, falling back to
// NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN (PostHog's newer name for the same
// value). Until 2026-10-27 only the first name was read while .env.local
// used the second, so analytics was silently off.

import Script from "next/script";

export function Analytics() {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY ?? process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;
  if (!key) return null;

  return (
    <Script id="posthog-init" strategy="afterInteractive">
      {`!function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.async=!0,p.src=s.api_host+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+".people (stub)"},o="capture identify alias people.set people.set_once set_config register register_once unregister opt_out_capturing has_opted_out_capturing opt_in_capturing reset isFeatureEnabled onFeatureFlags getFeatureFlag getFeatureFlagPayload reloadFeatureFlags group updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures getActiveMatchingSurveys getSurveys getNextSurveyStep onSessionId".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);
posthog.init(${JSON.stringify(key)},{api_host:'/ingest',ui_host:'https://us.posthog.com',defaults:'2025-05-24',person_profiles:'identified_only',disable_session_recording:true});
posthog.register({platform:(window.Capacitor&&window.Capacitor.getPlatform&&window.Capacitor.getPlatform())||'web'});`}
    </Script>
  );
}
