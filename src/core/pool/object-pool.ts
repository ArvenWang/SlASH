export type PoolCategory =
  | "projectile"
  | "blood-particle"
  | "impact-vfx"
  | "decal"
  | "temporary-mesh"
  | "corpse-fragment";

export interface ObjectPoolStats {
  readonly id: string;
  readonly category: PoolCategory;
  readonly active: number;
  readonly available: number;
  readonly total: number;
  readonly maximum: number;
  readonly misses: number;
}

export interface ObjectPoolOptions<T> {
  readonly id: string;
  readonly category: PoolCategory;
  readonly maximum: number;
  readonly create: () => T;
  readonly reset?: (value: T) => void;
  readonly destroy?: (value: T) => void;
  readonly prewarm?: number;
}

export class ObjectPool<T extends object> {
  private readonly active = new Set<T>();
  private readonly available: T[] = [];
  private misses = 0;

  constructor(private readonly options: ObjectPoolOptions<T>) {
    if (!Number.isInteger(options.maximum) || options.maximum <= 0) {
      throw new Error(`Object pool ${options.id} requires a positive integer maximum.`);
    }
    const prewarm = Math.min(options.maximum, Math.max(0, Math.floor(options.prewarm ?? 0)));
    for (let index = 0; index < prewarm; index += 1) this.available.push(options.create());
  }

  acquire(): T | null {
    let value = this.available.pop() ?? null;
    if (!value && this.active.size < this.options.maximum) value = this.options.create();
    if (!value) {
      this.misses += 1;
      return null;
    }
    this.active.add(value);
    return value;
  }

  release(value: T): void {
    if (!this.active.delete(value)) throw new Error(`Object pool ${this.options.id} released an inactive value.`);
    this.options.reset?.(value);
    this.available.push(value);
  }

  snapshot(): ObjectPoolStats {
    return {
      id: this.options.id,
      category: this.options.category,
      active: this.active.size,
      available: this.available.length,
      total: this.active.size + this.available.length,
      maximum: this.options.maximum,
      misses: this.misses,
    };
  }

  dispose(): void {
    for (const value of this.active) this.options.destroy?.(value);
    for (const value of this.available) this.options.destroy?.(value);
    this.active.clear();
    this.available.length = 0;
  }
}

export class ObjectPoolRegistry {
  private readonly pools = new Map<string, { snapshot(): ObjectPoolStats; dispose(): void }>();

  register(pool: { snapshot(): ObjectPoolStats; dispose(): void }): void {
    const id = pool.snapshot().id;
    if (this.pools.has(id)) throw new Error(`Duplicate object pool id: ${id}`);
    this.pools.set(id, pool);
  }

  snapshot(): readonly ObjectPoolStats[] {
    return [...this.pools.values()].map((pool) => pool.snapshot());
  }

  dispose(): void {
    for (const pool of this.pools.values()) pool.dispose();
    this.pools.clear();
  }
}
