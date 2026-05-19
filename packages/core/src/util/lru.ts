/**
 * Minimal Map-based LRU cache. Insertion order in Map already gives us
 * recency tracking — we just move accessed entries to the tail on `get`.
 */
export class LruCache<K, V> {
  private readonly store = new Map<K, V>();
  constructor(private readonly capacity: number) {
    if (capacity <= 0) throw new Error("LRU capacity must be > 0");
  }

  get(key: K): V | undefined {
    const value = this.store.get(key);
    if (value === undefined) return undefined;
    // Refresh recency: re-insert at tail.
    this.store.delete(key);
    this.store.set(key, value);
    return value;
  }

  set(key: K, value: V): void {
    if (this.store.has(key)) {
      this.store.delete(key);
    } else if (this.store.size >= this.capacity) {
      // Evict least-recent (head of insertion order).
      const oldest = this.store.keys().next().value;
      if (oldest !== undefined) this.store.delete(oldest);
    }
    this.store.set(key, value);
  }

  has(key: K): boolean {
    return this.store.has(key);
  }

  get size(): number {
    return this.store.size;
  }

  clear(): void {
    this.store.clear();
  }
}
