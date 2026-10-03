// Deterministic randomness so sample datasets (and their planted anomalies)
// are identical on every load and in tests.

export type Rng = () => number

/** mulberry32: tiny, fast, good enough for mock data. */
export function createRng(seed: number): Rng {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function int(rng: Rng, min: number, max: number) {
  return Math.floor(rng() * (max - min + 1)) + min
}

export function pick<T>(rng: Rng, items: readonly T[]): T {
  return items[Math.floor(rng() * items.length)]!
}

export function weighted<T>(
  rng: Rng,
  items: readonly (readonly [T, number])[]
): T {
  const total = items.reduce((sum, [, w]) => sum + w, 0)
  let r = rng() * total
  for (const [item, w] of items) {
    r -= w
    if (r <= 0) return item
  }
  return items[items.length - 1]![0]
}

/** Standard normal via Box–Muller. */
export function normal(rng: Rng, mean = 0, sd = 1) {
  const u = 1 - rng()
  const v = rng()
  return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

/** Poisson-ish count around `mean` (normal approximation, never negative). */
export function count(rng: Rng, mean: number) {
  return Math.max(0, Math.round(normal(rng, mean, Math.sqrt(mean))))
}

export function round(value: number, digits = 2) {
  const f = 10 ** digits
  return Math.round(value * f) / f
}
