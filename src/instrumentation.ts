/**
 * Next.js instrumentation entry point (Phase 6 telemetry).
 *
 * Next.js calls register() BEFORE any route module is imported. This is the
 * ONLY safe point to call useAzureMonitor() because OTel patches node:http at
 * import time — any HTTP module imported first will not be traced.
 *
 * The NEXT_RUNTIME guard restricts the Node-only bootstrap to the Node.js
 * runtime (server). Edge runtime does not support @azure/monitor-opentelemetry.
 *
 * Reference: RESEARCH.md §Pattern 1 — Pitfall 1.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./instrumentation.node')
  }
}
