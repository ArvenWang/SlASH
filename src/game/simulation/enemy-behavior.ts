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
    update({ state, enemy, definition, deltaMs }) {
      const target = state.player.position;
      const directionX = target.x - enemy.position.x;
      const directionZ = target.z - enemy.position.z;
      const distance = Math.hypot(directionX, directionZ);
      if (distance <= EPSILON) return;
      const desiredX = directionX / distance;
      const desiredZ = directionZ / distance;
      const turnDelta = Math.atan2(
        enemy.facing.x * desiredZ - enemy.facing.z * desiredX,
        enemy.facing.x * desiredX + enemy.facing.z * desiredZ,
      );
      const maximumTurn = Math.max(0, definition.turnSpeedRadiansPerSecond * deltaMs / 1000);
      if (Math.abs(turnDelta) <= maximumTurn) {
        enemy.facing.x = desiredX;
        enemy.facing.z = desiredZ;
      } else {
        const appliedTurn = Math.min(maximumTurn, Math.max(-maximumTurn, turnDelta));
        const cosine = Math.cos(appliedTurn);
        const sine = Math.sin(appliedTurn);
        const nextFacingX = enemy.facing.x * cosine - enemy.facing.z * sine;
        const nextFacingZ = enemy.facing.x * sine + enemy.facing.z * cosine;
        enemy.facing.x = nextFacingX;
        enemy.facing.z = nextFacingZ;
      }
      const movement = Math.min(distance, enemy.speed * (deltaMs / 1000));
      enemy.position.x += enemy.facing.x * movement;
      enemy.position.z += enemy.facing.z * movement;
    },
  },
]);

export function moveEnemiesWithBehaviors(state: GameState, deltaMs: number): void {
  for (const enemy of state.enemies) {
    if (!enemy.alive) continue;
    if (enemy.staggerRemainingMs > 0) {
      enemy.staggerRemainingMs = Math.max(0, enemy.staggerRemainingMs - deltaMs);
      continue;
    }
    const definition = enemyDefinitions.get(enemy.definitionId);
    enemyBehaviors.get(definition.movementProfile).update({ state, enemy, definition, deltaMs });
  }
}
