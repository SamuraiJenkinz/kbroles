/**
 * Business-event telemetry wrapper (Phase 6).
 *
 * Provides a SINGLE choke point for custom event emission so no other module
 * calls @opentelemetry/api directly. This keeps the OTel surface auditable
 * and lets tests mock the wrapper without touching the OTel internals.
 *
 * Each trackEvent() call:
 *   1. Emits an OTel INTERNAL span with event name + dimensions + measurements
 *      as span attributes. Azure Monitor surfaces INTERNAL spans as
 *      customEvents in the App Insights portal when the span name matches the
 *      event name (RESEARCH.md §Pattern 2).
 *   2. Dual-emits to pino so local dev (pino-pretty) and CI logs show the
 *      event without needing a live App Insights resource.
 *
 * Caller contract:
 *   - Dimensions must be PII-safe: pass hashes, enums, IDs — never raw user
 *     input, email addresses, or free-text. The PII scrubber in logger.ts
 *     provides a backstop but is NOT a licence to forward raw fields.
 *   - The wrapper is SYNCHRONOUS — streaming route handlers cannot await
 *     per-event calls. span.end() schedules export to the batch exporter
 *     without blocking.
 *
 * Reference: RESEARCH.md §Pattern 2 — §Code Examples.
 */
import { trace, SpanKind } from '@opentelemetry/api'
import { logger } from './logger'

const tracer = trace.getTracer('kb-assistant', '1.0.0')

/** Custom dimension values. undefined entries are stripped before emission. */
export type EventDimensions = Record<string, string | undefined>

/** Numeric measurements attached to the event. Non-finite values are stripped. */
export type EventMeasurements = Record<string, number>

/**
 * Structured extras that flow ONLY to pino — NOT to OTel span attributes.
 *
 * Use for non-string / non-number values (arrays, objects) that would be
 * coerced to '[object Object]' or silently dropped by the OTel attribute
 * filter but serialise correctly in pino's JSON output.
 *
 * PII contract: extras must be PII-safe — same rules as dimensions (hashes,
 * enums, IDs only). The pino scrubber is a backstop only; callers MUST NOT
 * forward raw user input, email addresses, or citation quote text here.
 */
export type EventExtras = Record<string, unknown>

/**
 * Emit a named business event to Azure Monitor (via OTel span) and to pino.
 *
 * @param name        - Event name (e.g. 'chat_request_completed', 'thumbs_rating').
 * @param dimensions  - String dimensions. undefined values are stripped (App
 *                      Insights would render them as the literal string
 *                      'undefined' which pollutes the schema).
 *                      Empty-string values are also stripped (noise dimensions).
 * @param measurements - Numeric measurements. Non-finite values (NaN, ±Infinity)
 *                      are stripped to prevent schema pollution.
 * @param extras      - Structured fields (arrays, objects) that flow ONLY to
 *                      pino, NOT to OTel span attributes. App Insights
 *                      customDimensions is a flat string map — adding array or
 *                      object values would coerce to '[object Object]'. Pino
 *                      serialises them correctly as JSON. Must be PII-safe.
 */
export function trackEvent(
  name: string,
  dimensions: EventDimensions = {},
  measurements: EventMeasurements = {},
  extras: EventExtras = {},
): void {
  // Build the attribute map: start with the canonical event.name attribute
  // then add all valid dimension and measurement values.
  const attrs: Record<string, string | number> = { 'event.name': name }

  for (const [k, v] of Object.entries(dimensions)) {
    // Strip undefined and empty-string values — App Insights treats undefined
    // as the literal string 'undefined' which pollutes the dimension schema.
    if (typeof v === 'string' && v.length > 0) attrs[k] = v
  }

  for (const [k, v] of Object.entries(measurements)) {
    // Strip NaN and ±Infinity — these crash KQL aggregation functions in
    // App Insights workbooks and indicate a caller bug.
    if (Number.isFinite(v)) attrs[k] = v
  }

  const span = tracer.startSpan(name, { kind: SpanKind.INTERNAL, attributes: attrs })
  span.end()

  // Dual-emit to pino so local dev sees the event in pino-pretty output.
  // Reuses the Phase 2 PII scrubber in logger.ts — the scrubber is a
  // backstop only; callers MUST pass PII-safe fields (hashes, enums, IDs).
  // extras flow ONLY to pino — pino serialises arrays/objects to JSON;
  // App Insights would coerce them to '[object Object]' which is useless.
  logger.info({ event: name, ...dimensions, ...measurements, ...extras }, name)
}
