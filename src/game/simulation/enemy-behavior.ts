import { enemyDefinitions, type EnemyDefinition } from "../../content/enemies/definitions";
import { DefinitionRegistry } from "../../content/registry";
import type { EnemyState, GameState } from "../domain/types";

const EPSILON = 1e-8;

export interface EnemyBehaviorContext {
  readonly state: GameState;
  readonly enemy: EnemyState;
  readonly definition: EnemyDefinition;
  readonly deltaMs: number;
}

export interface EnemyBehavior {
  readonly id: string;
  update(context: EnemyBehaviorContext): void;
}

export const enemyBehaviors = new DefinitionRegistry<EnemyBehavior>([
  {
    id: "direct-chase",
    update({ state, enemy, deltaMs }) {
      const target = state.player.position;
      const directionX = target.x - enemy.position.x;
      const directionZ = target.z - enemy.position.z;
      const distance = Math.hypot(directionX, directionZ);
      if (distance <= EPSILON) return;
      enemy.facing.x = directionX / distance;
      enemy.facing.z = directionZ / distance;
      const movement = Math.min(distance, enemy.speed * (deltaMs / 1000));
      enemy.position.x += enemy.facing.x * movement;
      enemy.position.z += enemy.facing.z * movement;
    },
  },
]);

export function moveEnemiesWithBehaviors(state: GameState, deltaMs: number): void {
  for (const enemy of state.enemies) {
    if (!enemy.alive) continue;
    const definition = enemyDefinitions.get(enemy.definitionId);
    enemyBehaviors.get(definition.movementProfile).update({ state, enemy, definition, deltaMs });
  }
}
