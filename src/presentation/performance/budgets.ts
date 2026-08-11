import { DefinitionRegistry } from "../../content/registry";
import type { DiagnosticsSnapshot } from "../../diagnostics";
import type { GameState } from "../../game/domain/types";
import type { ProfiledVfxSnapshot } from "../vfx/profiled-vfx-runtime";

export interface PerformanceBudgetDefinition {
  readonly id: string;
  readonly maximumActive: number;
}

export const performanceBudgetRegistry = new DefinitionRegistry<PerformanceBudgetDefinition>([
  { id: "characters", maximumActive: 21 },
  { id: "vfx", maximumActive: 96 },
  { id: "environment", maximumActive: 1 },
  { id: "projectiles", maximumActive: 32 },
  { id: "obstacles", maximumActive: 8 },
  { id: "hazards", maximumActive: 8 },
  { id: "corpses", maximumActive: 20 },
  { id: "decals", maximumActive: 28 },
]);

export interface PerformanceBudgetSnapshot {
  readonly frameMetric: "visible-rAF-frame-time";
  readonly frame: DiagnosticsSnapshot["frame"];
  readonly renderer: DiagnosticsSnapshot["renderer"];
  readonly categories: Readonly<Record<string, {
    active: number;
    budget: number;
    status: "within-budget" | "over-budget";
  }>>;
  readonly pools: ProfiledVfxSnapshot["base"]["pools"];
}

export function createPerformanceBudgetSnapshot(input: {
  readonly diagnostics: DiagnosticsSnapshot;
  readonly gameState: GameState;
  readonly vfx: ProfiledVfxSnapshot;
}): PerformanceBudgetSnapshot {
  const activeCharacters = 1 + input.gameState.enemies.filter((enemy) => enemy.alive).length;
  const active: Record<string, number> = {
    characters: activeCharacters,
    vfx: input.vfx.base.activeEffects,
    environment: 1,
    projectiles: input.gameState.projectiles.filter((projectile) => projectile.alive).length,
    obstacles: input.gameState.obstacles.filter((obstacle) => obstacle.active).length,
    hazards: input.gameState.hazards.filter((hazard) => hazard.active).length,
    corpses: input.gameState.enemies.filter((enemy) => !enemy.alive).length,
    decals: input.vfx.base.persistentDecals,
  };
  const categories = Object.fromEntries(performanceBudgetRegistry.list().map((budget) => {
    const count = active[budget.id] ?? 0;
    return [budget.id, {
      active: count,
      budget: budget.maximumActive,
      status: (count <= budget.maximumActive ? "within-budget" : "over-budget") as
        "within-budget" | "over-budget",
    }];
  }));
  return {
    // This is deliberately named visible rAF frame time. WebGLRenderer.info
    // does not expose true GPU timing, so the debug UI must not label it GPU ms.
    frameMetric: "visible-rAF-frame-time",
    frame: input.diagnostics.frame,
    renderer: input.diagnostics.renderer,
    categories,
    pools: input.vfx.base.pools,
  };
}
