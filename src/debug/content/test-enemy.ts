import type { EnemyDefinition } from "../../content/enemies/definitions";
import { enemyDefinitions } from "../../content/enemies/definitions";
import { enemyPresentationRegistry } from "../../presentation/registry";
import { enemyBehaviors } from "../../game/simulation/enemy-behavior";

export const DEBUG_STATIONARY_ENEMY: EnemyDefinition = {
  id: "debug-stationary-target",
  archetype: "debug-target",
  radius: 0.55,
  baseMoveSpeed: 0,
  turnSpeedRadiansPerSecond: 0,
  movementProfile: "debug-stationary",
  attackProfile: "contact-lethal",
  armorProfileId: null,
  energyReward: 0,
  tags: ["debug", "enemy", "stationary"],
};

export function registerDebugTestEnemy(): void {
  if (!enemyDefinitions.has(DEBUG_STATIONARY_ENEMY.id)) {
    enemyDefinitions.register(DEBUG_STATIONARY_ENEMY);
  }
  if (!enemyBehaviors.has(DEBUG_STATIONARY_ENEMY.movementProfile)) {
    enemyBehaviors.register({
      id: DEBUG_STATIONARY_ENEMY.movementProfile,
      update() {
        // Intentionally stationary: this real behavior isolates hit testing.
      },
    });
  }
  if (!enemyPresentationRegistry.has(DEBUG_STATIONARY_ENEMY.id)) {
    enemyPresentationRegistry.register({
      id: DEBUG_STATIONARY_ENEMY.id,
      characterId: "enemy-procedural-v5",
      animationSetId: "enemy-procedural-v5",
      vfxProfileId: "enemy-cut-humanoid-v1",
      audioProfileId: "enemy-cyber-grunt-v1",
      deathProfileId: "humanoid-soft-v1",
    });
  }
}
