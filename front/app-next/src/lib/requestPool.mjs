/** Session-scoped read sharing. Mutations invalidate pending and completed reads. */
export function createRequestPool({ now = Date.now } = {}) {
  const reads = new Map();
  const cooldowns = new Map();
  let generation = 0;
  function invalidate() { generation++; reads.clear(); }
  function clear() { invalidate(); cooldowns.clear(); }
  function defer(key, error, retryAfter) {
    const seconds = Number(retryAfter);
    const date = Date.parse(retryAfter);
    const delay = Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : Number.isFinite(date) ? Math.max(1000, date - now()) : 30000;
    cooldowns.set(key, { until: now() + delay, error });
  }
  function get(key, read, ttlMs = 1000) {
    for (const [storedKey, entry] of reads) {
      if (!entry.pending && entry.until <= now()) reads.delete(storedKey);
    }
    for (const [storedKey, entry] of cooldowns) {
      if (entry.until <= now()) cooldowns.delete(storedKey);
    }
    const cooldown = cooldowns.get(key);
    if (cooldown?.until > now()) return Promise.reject(cooldown.error);
    cooldowns.delete(key);
    const existing = reads.get(key);
    if (existing && (existing.pending || existing.until > now())) return existing.promise;
    const version = generation;
    const entry = { pending: true, until: 0 };
    entry.promise = Promise.resolve().then(read).then(value => {
      entry.pending = false;
      entry.until = now() + ttlMs;
      if (version !== generation && reads.get(key) === entry) reads.delete(key);
      return value;
    }, error => {
      if (reads.get(key) === entry) reads.delete(key);
      throw error;
    });
    reads.set(key, entry);
    return entry.promise;
  }
  return { get, invalidate, clear, defer };
}
