import { enemyDefinitions, type EnemyDefinition } from "../../content/enemies/definitions";
import { DefinitionRegistry } from "../../content/registry";
import type { EnemyState, GameState } from "../domain/types";
import { clampPointToArena } from "../collision/arena";
import { enemyAttackControlsMovement } from "../enemies/enemy-attack-system";

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
  steeringBehavior("slow-chase", 0, 0, 0),
  steeringBehavior("keep-range", 9, 2, 0.55),
  steeringBehavior("strafe-align", 8, 1.6, 0.9),
  steeringBehavior("retreat-range", 12, 1.8, 0.4),
  steeringBehavior("orbit", 7, 1.4, 1),
  steeringBehavior("far-anchor", 15, 2.4, 0.18),
  steeringBehavior("segmented-track", 6.5, 2.2, 0.75, true),
  steeringBehavior("far-evade", 14, 2, 0.7),
]);

export function moveEnemiesWithBehaviors(state: GameState, deltaMs: number): void {
  for (const enemy of state.enemies) {
    if (!enemy.alive) continue;
    if (enemy.staggerRemainingMs > 0) {
      enemy.staggerRemainingMs = Math.max(0, enemy.staggerRemainingMs - deltaMs);
      continue;
    }
    const definition = enemyDefinitions.get(enemy.definitionId);
    if (enemyAttackControlsMovement(state, enemy, definition, deltaMs)) continue;
    enemyBehaviors.get(definition.movementProfile).update({ state, enemy, definition, deltaMs });
  }
}

function steeringBehavior(
  id: string,
  desiredRange: number,
  rangeBand: number,
  tangentWeight: number,
  segmented = false,
): EnemyBehavior {
  return {
    id,
    update({ state, enemy, definition, deltaMs }) {
      const toPlayerX = state.player.position.x - enemy.position.x;
      const toPlayerZ = state.player.position.z - enemy.position.z;
      const distance = Math.hypot(toPlayerX, toPlayerZ);
      if (distance <= EPSILON) return;
      const toward = { x: toPlayerX / distance, z: toPlayerZ / distance };
      turnToward(enemy, toward, definition.turnSpeedRadiansPerSecond, deltaMs);
      if (id === "slow-chase") {
        moveEnemy(state, enemy, enemy.facing, enemy.speed, deltaMs);
        return;
      }
      const sign = enemy.tactical?.movementSign ?? 1;
      const tangent = { x: -toward.z * sign, z: toward.x * sign };
      let radial = 0;
      if (distance < desiredRange - rangeBand) radial = -1;
      else if (distance > desiredRange + rangeBand) radial = 1;
      let tangentScale = tangentWeight;
      if (segmented) {
        const movingBurst = (state.tick + stableOffset(enemy.id)) % 120 < 54;
        if (!movingBurst) {
          radial = 0;
          tangentScale *= 0.25;
        }
      }
      const direction = normalized({
        x: toward.x * radial + tangent.x * tangentScale,
        z: toward.z * radial + tangent.z * tangentScale,
      }, tangent);
      const speedScale = radial === 0 && tangentScale < 0.3 ? 0.35 : 1;
      moveEnemy(state, enemy, direction, enemy.speed * speedScale, deltaMs);
    },
  };
}

function turnToward(enemy: EnemyState, desired: { x: number; z: number }, turnSpeed: number, deltaMs: number): void {
  const turnDelta = Math.atan2(
    enemy.facing.x * desired.z - enemy.facing.z * desired.x,
    enemy.facing.x * desired.x + enemy.facing.z * desired.z,
  );
  const maximumTurn = Math.max(0, turnSpeed * Math.max(0, deltaMs) / 1000);
  if (Math.abs(turnDelta) <= maximumTurn) {
    enemy.facing.x = desired.x;
    enemy.facing.z = desired.z;
    return;
  }
  const appliedTurn = Math.min(maximumTurn, Math.max(-maximumTurn, turnDelta));
  const cosine = Math.cos(appliedTurn);
  const sine = Math.sin(appliedTurn);
  enemy.facing = {
    x: enemy.facing.x * cosine - enemy.facing.z * sine,
    z: enemy.facing.x * sine + enemy.facing.z * cosine,
  };
}

function moveEnemy(
  state: GameState,
  enemy: EnemyState,
  direction: { x: number; z: number },
  speed: number,
  deltaMs: number,
): void {
  const seconds = Math.max(0, deltaMs) / 1000;
  enemy.position = clampPointToArena({
    x: enemy.position.x + direction.x * speed * seconds,
    z: enemy.position.z + direction.z * speed * seconds,
  }, state.stage.arena, enemy.radius);
}

function normalized(value: { x: number; z: number }, fallback: { x: number; z: number }) {
  const length = Math.hypot(value.x, value.z);
  return length <= EPSILON ? fallback : { x: value.x / length, z: value.z / length };
}

function stableOffset(value: string): number {
  let result = 0;
  for (let index = 0; index < value.length; index += 1) result = (result * 31 + value.charCodeAt(index)) >>> 0;
  return result % 120;
}
