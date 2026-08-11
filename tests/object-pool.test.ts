import { describe, expect, test } from "vitest";
import { ObjectPool, ObjectPoolRegistry, type PoolCategory } from "../src/core/pool/object-pool";

describe("object pool", () => {
  test("prewarms, reuses, caps and reports misses without hidden allocation", () => {
    let created = 0;
    let destroyed = 0;
    const pool = new ObjectPool({
      id: "impact-test",
      category: "impact-vfx",
      maximum: 2,
      prewarm: 1,
      create: () => ({ id: ++created, value: 0 }),
      reset: (entry) => { entry.value = 0; },
      destroy: () => { destroyed += 1; },
    });
    const first = pool.acquire();
    const second = pool.acquire();
    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    expect(pool.acquire()).toBeNull();
    if (!first) throw new Error("Expected pooled value.");
    first.value = 12;
    pool.release(first);
    expect(pool.acquire()).toBe(first);
    expect(first.value).toBe(0);
    expect(pool.snapshot()).toMatchObject({ active: 2, total: 2, maximum: 2, misses: 1 });
    pool.dispose();
    expect(destroyed).toBe(2);
  });

  test("supports every declared production pool category through one registry", () => {
    const categories: readonly PoolCategory[] = [
      "projectile",
      "blood-particle",
      "impact-vfx",
      "decal",
      "temporary-mesh",
      "corpse-fragment",
    ];
    const registry = new ObjectPoolRegistry();
    for (const category of categories) {
      registry.register(new ObjectPool({
        id: `test-${category}`,
        category,
        maximum: 1,
        create: () => ({}),
      }));
    }
    expect(registry.snapshot().map((pool) => pool.category)).toEqual(categories);
    registry.dispose();
  });
});
