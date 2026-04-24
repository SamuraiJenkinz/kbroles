/**
 * Node.js-only Azure Monitor / OTel bootstrap (Phase 6 telemetry).
 *
 * Called exclusively from src/instrumentation.ts via dynamic import so it
 * only runs on the Node.js runtime — never on Edge.
 *
 * Order matters:
 *   1. loadSecrets() — populates process.env.APPLICATIONINSIGHTS_CONNECTION_STRING
 *      from AWS Secrets Manager (module-cached; zero per-request cost after
 *      the first call). Phase 5.1 implementation; module-level cache is safe.
 *   2. useAzureMonitor() — patches node:http BEFORE any route handler module
 *      is resolved. MUST be called before HTTP modules load (RESEARCH.md
 *      Pitfall 1).
 *
 * Local-dev / CI fallback:
 *   When APPLICATIONINSIGHTS_CONNECTION_STRING is absent (no secret configured,
 *   CI without the AWS secret), the function logs a console.info and returns
 *   without calling useAzureMonitor(). Application runs normally without
 *   telemetry. Tests do NOT require a live App Insights resource.
 *
 * Reference: RESEARCH.md §Pattern 1 — §Code Examples.
 */
import { loadSecrets } from './config/secrets'
import { useAzureMonitor } from '@azure/monitor-opentelemetry'

export async function initAzureMonitor(): Promise<void> {
  await loadSecrets()

  const connectionString = process.env.APPLICATIONINSIGHTS_CONNECTION_STRING

  if (!connectionString) {
    // eslint-disable-next-line no-console
    console.info(
      '[telemetry] APPLICATIONINSIGHTS_CONNECTION_STRING absent; running without AI exporter (local/CI fallback)',
    )
    return
  }

  useAzureMonitor({
    azureMonitorExporterOptions: { connectionString },
    enableLiveMetrics: true,
    enableStandardMetrics: true,
    samplingRatio: 1,
    instrumentationOptions: {
      http: { enabled: true },
      bunyan: { enabled: false },
      winston: { enabled: false },
    },
  })
}

// Fire-and-forget at module load. register() awaits the module import but
// does not await the top-level call, so startup is non-blocking.
initAzureMonitor().catch((err) =>
  // eslint-disable-next-line no-console
  console.error('[telemetry] init failed', err),
)
