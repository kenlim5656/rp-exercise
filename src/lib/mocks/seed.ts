import crypto from "node:crypto";

/** Deterministic pseudo-random float in [0, 1) derived from a string key.
 * Used throughout the mock modules so re-running the same input file always
 * produces the same simulated BQ/Clay/CRM payloads (the plan's determinism
 * requirement). */
export function hashUnit(key: string): number {
  const hash = crypto.createHash("sha256").update(key).digest();
  return hash.readUInt32BE(0) / 0xffffffff;
}

/** Deterministically pick one item from `options` based on `key`. */
export function hashPick<T>(key: string, options: readonly T[]): T {
  const idx = Math.floor(hashUnit(key) * options.length) % options.length;
  return options[idx];
}

export function hashId(prefix: string, key: string): string {
  return `${prefix}-${crypto.createHash("sha256").update(key).digest("hex").slice(0, 10)}`;
}
