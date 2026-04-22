import pino from 'pino'

// Dev: pino-pretty transport (worker thread — handled by serverExternalPackages
// in next.config.ts so Turbopack does not try to bundle thread-stream).
// Prod: raw JSON to stdout (no transport, no worker thread). App Service
// ingests stdout into App Insights via the OpenTelemetry distro (STACK.md §8).
//
// Fields LOCKED by 02-CONTEXT.md §5 (Structured logging for SC #5):
//   request_id, role, host, validator_flips, refusal_fired,
//   fallback_reason, ingress_status_code, prompt_tokens, completion_tokens,
//   latency_ms.
//
// Explicitly NOT logged (enforced by the logger.test.ts string-grep test):
//   user_question, messages, content, answer, quote — any raw user input or
//   LLM response body. This is SC #5's floor guarantee; Plan 04 Task 2
//   assembles the allowed fields and pipes them through requestLogger().
//
// PHASE 6: add App Insights exporter + custom-event layer on top of this
// logger (see STACK.md §8). The raw JSON stream on stdout is the forward-
// compatible surface — the App Insights distro picks it up without code
// changes in this module.
const isProd = process.env.NODE_ENV === 'production'

export const logger = pino(
  isProd
    ? { level: 'info' }
    : { level: 'debug', transport: { target: 'pino-pretty', options: { colorize: true } } },
)

/**
 * Per-request child logger. Call once at route entry (after request_id has
 * been generated) and pass the returned child around for the remainder of
 * the request lifecycle. Every subsequent .info/.warn/.error call on the
 * child automatically carries request_id, role, and host forward — callers
 * do not need to re-thread those fields into each log line.
 */
export function requestLogger(fields: {
  request_id: string
  role?: string
  host?: string
}) {
  return logger.child(fields)
}
