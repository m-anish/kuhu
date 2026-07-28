// One version string, read by both sides.
//
// The Worker imports this at build time and serves it from /api/version; the
// browser imports the *cached* copy and shows it. So if the two disagree, the
// app on that phone is running stale code — which is a fact rather than a
// guess, and the app says so and offers to fix itself.
//
// Bump this whenever app/ or src/ changes in a way a phone should pick up.
export const APP_VERSION = '2026.07.28-3';
