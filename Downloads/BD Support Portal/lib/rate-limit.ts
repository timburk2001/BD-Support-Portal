/**
 * In-memory token-bucket rate limiter.
 *
 * LIMITATION: state is per-process. In a serverless/edge deployment each
 * cold-start begins with a full bucket, so the effective limit is
 * per-instance rather than globally enforced. Replace with a Redis or
 * Upstash-backed implementation if stricter global enforcement is needed.
 */

interface Bucket {
  tokens: number
  lastRefill: number
}

const buckets = new Map<string, Bucket>()

const CAPACITY = 30
const WINDOW_MS = 60_000

export function checkRateLimit(key: string): { ok: boolean; remaining: number } {
  const now = Date.now()
  let bucket = buckets.get(key)

  if (!bucket) {
    bucket = { tokens: CAPACITY - 1, lastRefill: now }
    buckets.set(key, bucket)
    return { ok: true, remaining: CAPACITY - 1 }
  }

  const elapsed = now - bucket.lastRefill
  const refill = Math.floor((elapsed / WINDOW_MS) * CAPACITY)

  if (refill > 0) {
    bucket.tokens = Math.min(CAPACITY, bucket.tokens + refill)
    bucket.lastRefill = now
  }

  if (bucket.tokens <= 0) {
    return { ok: false, remaining: 0 }
  }

  bucket.tokens--
  return { ok: true, remaining: bucket.tokens }
}
