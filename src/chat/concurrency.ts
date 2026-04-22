import { env } from '@/config/env'

/**
 * AsyncSemaphore — in-process concurrency limiter for the /api/chat route.
 *
 * Per 02-CONTEXT.md §3: a single global semaphore caps concurrent in-flight
 * streams at env().MAX_INFLIGHT_STREAMS (default 20). Over-cap requests
 * receive HTTP 429 with Retry-After — they are NOT queued. This matches
 * ARCHITECTURE §14 line 707 ("surface 'We're busy' in the chat, not a blank
 * failure") and sidesteps the latency tail of an unbounded waiter queue.
 *
 * The FIFO `waiters` array is kept in the implementation for completeness —
 * if a future async `acquire()` method is added (e.g. for per-user limits
 * in v1.1), release() already wakes the oldest waiter correctly. For v1 the
 * route uses tryAcquire() only, so the waiters array stays empty.
 */
export class AsyncSemaphore {
  private count: number
  private readonly initialCap: number
  private readonly waiters: Array<() => void> = []

  constructor(count: number) {
    if (!Number.isFinite(count) || count < 1) {
      throw new RangeError(`AsyncSemaphore count must be a finite integer >= 1 (got ${count})`)
    }
    this.count = count
    this.initialCap = count
  }

  /**
   * Non-blocking acquire. Returns true if a permit was obtained (counter
   * decremented). Returns false at cap — caller should surface HTTP 429.
   */
  tryAcquire(): boolean {
    if (this.count > 0) {
      this.count--
      return true
    }
    return false
  }

  /**
   * Release a permit. If any FIFO waiters are queued (future async-acquire
   * path), wake the oldest and transfer the permit directly. Otherwise,
   * increment the counter — clamped to the initial cap so a stray extra
   * release() cannot inflate capacity beyond the constructor-time budget.
   */
  release(): void {
    const waiter = this.waiters.shift()
    if (waiter) {
      // Transfer the permit directly — count stays decremented.
      waiter()
      return
    }
    // No waiters — increment, but never above the original cap.
    if (this.count < this.initialCap) this.count++
  }

  /** Introspection for tests / diagnostics — current free permit count. */
  get available(): number {
    return this.count
  }
}

/**
 * Module-level singleton — shared across every /api/chat request within this
 * Node process. env() is cached (Phase-1 pattern) so the first-call read is
 * inexpensive; subsequent reads are constant-time.
 *
 * Initialisation is LAZY (first-call get) rather than at module load. This
 * avoids forcing env() validation at test-time module import — tests that
 * exercise other parts of src/chat without touching the singleton do not
 * need a populated .env.local. The singleton is created on first tryAcquire()
 * or first read of `available`.
 *
 * __resetForTests() reconstructs the singleton with a fresh counter — useful
 * for testing cap exhaustion across multiple acquire/release cycles without
 * leaking state between cases. NOT intended for production code paths.
 */
let instance: AsyncSemaphore | null = null

function getInstance(): AsyncSemaphore {
  if (!instance) instance = new AsyncSemaphore(env().MAX_INFLIGHT_STREAMS)
  return instance
}

export const chatSemaphore = {
  tryAcquire: (): boolean => getInstance().tryAcquire(),
  release: (): void => getInstance().release(),
  get available(): number {
    return getInstance().available
  },
}

/** Exposed for tests only — reconstructs the singleton. */
/** @internal */
export function __resetForTests(count?: number): void {
  instance = new AsyncSemaphore(count ?? env().MAX_INFLIGHT_STREAMS)
}
