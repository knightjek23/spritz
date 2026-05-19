// Clerk auth middleware. Protects collection + Pro-only routes.
// Public routes: home, scan, search, fragrance detail, sign-in, sign-up,
// pricing, all webhooks (Clerk verifies via secret), all public API.

import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isProtected = createRouteMatcher([
  "/collection(.*)",
  "/api/collection(.*)",
  "/api/stripe/checkout",
]);

export default clerkMiddleware((auth, req) => {
  if (isProtected(req)) auth().protect();
});

export const config = {
  matcher: [
    // Skip Next internals + static files unless found in search params.
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
