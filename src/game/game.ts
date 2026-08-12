/**
 * Project Slash gameplay core.
 *
 * This module deliberately has no renderer, DOM, audio, or Three.js dependency.
 * Every value in GameState is JSON-safe so that replays, automated tests, and a
 * visual renderer can all consume the same deterministic simulation state.
 */
import { createEnemyEntityId } from "../core/ids";
import { copyVec2, squaredDistance, vec2 } from "../core/math/vec2";
import { createSeededRandom } from "../core/random/seeded-random";
import {
  CHARGED_DASH_ABILITY_ID,
  DASH_SLASH_ABILITY_ID,
  VECTOR_FOCUS_ABILITY_ID,
} from "../content/abilities/definitions";
import {
  STRIKER_ENEMY_ID,
  VANGUARD_ENEMY_ID,
  enemyDefinitions,
} from "../content/enemies/definitions";
import {
  LEVEL_DEFINITIONS,
  levelByIndex,
  type LevelDefinition,
} from "../content/levels/definitions";
import { activateAbility } from "./abilities/ability-system";
import {
  advanceChargedDashHold,
  beginChargedDash,
  cancelChargedDash,
  releaseChargedDash,
  updateChargedDashTarget,
} from "./abilities/charged-dash";
import {
  addVectorFocusPoint,
  advanceVectorFocusPlanning,
  cancelVectorFocus,
  completeVectorFocusSegment,
  startVectorFocus,
} from "./abilities/vector-focus";
import {
  advancePathPassiveTimers,
  consumePendingCrossAlongSegment,
  finalizeRegularDashPathEffects,
} from "./abilities/path-passives";
import { segmentIntersectsCircle } from "./collision/shapes";
import { clampPointToArena } from "./collision/arena";
import type {
  ArenaBounds,
  DashRequestResult,
  GameCommand,
  GameCommandDispatchResult,
  GameCommandResult,
  GameInput,
  GameRules,
  GameSnapshot,
  GameState,
  GameplayAcceptanceCase,
  GameplayAcceptanceCheckResult,
  GameplaySelfCheckResult,
  PlayerAction,
  StageDefinition,
  Vec2,
} from "./domain/types";
import { drainGameEvents, emitGameEvent } from "./events/event-buffer";
import {
  DASH_RECOVERY_MS,
  DEFAULT_RUN_SEED,
  ENEMY_RADIUS,
  FIXED_STEP_MS,
  MAX_DASH_DURATION_MS,
  MAX_DASH_RECOVERY_MS,
  MAX_FRAME_DELTA_MS,
  MIN_DASH_DURATION_MS,
  MIN_DASH_RECOVERY_MS,
  PLAYER_RADIUS,
} from "./rules/constants";
import { moveEnemiesWithBehaviors } from "./simulation/enemy-behavior";
import { advanceObstacles, spawnObstacle } from "./entities/obstacle-system";
import { advanceHazards, spawnHazard } from "./entities/hazard-system";
import {
  advanceProjectiles,
  resolveProjectilesAlongDashSegment,
  spawnProjectile,
  purgeProjectilesInRadius,
  destroyProjectilesAlongSlash,
  type ReturnedProjectileImpact,
} from "./entities/projectile-system";
import {
  ARC_RAIL_HAZARD_ID,
  ARMED_MINE_HAZARD_ID,
  DEPLOYABLE_BARRIER_OBSTACLE_ID,
  STANDARD_ROUND_PROJECTILE_ID,
  STATIC_REFLECTOR_OBSTACLE_ID,
} from "../content/entities/definitions";
import {
  createArmorPartStates,
  hasIntactArmor,
  resolveArmorContact,
} from "./combat/armor";
import {
  acknowledgeCampaignReward,
  advanceCampaignEncounterScheduler,
  campaignAvailableRouteNodes,
  campaignEncounterCanComplete,
  completeCampaignEncounter,
  confirmCampaignForge,
  confirmCampaignPlanning,
  discardCampaignSkillDraft,
  initializeFullGameCampaign,
  markCampaignDefeat,
  previewCampaignRouteNode,
  previewCampaignSkillPurchase,
  previewCampaignSkillRefund,
  resolveCampaignEventChoice,
  restartCampaignEncounter,
  returnCampaignToTitle,
  startBossPractice,
  startFullGameRun,
  synchronizeCampaignChallenge,
  useCampaignForgeToken,
} from "./campaign/campaign-system";
import { skillAllocationSnapshot } from "./upgrades/skill-system";
import type { RouteNodeState } from "./run/types";
import {
  advanceEnemyAttacks,
  createEnemyTacticalState,
  isEnemyContactLethal,
} from "./enemies/enemy-attack-system";
import { enemyAttackProfiles } from "../content/enemies/attack-definitions";
import { encounterForRouteNode } from "../content/encounters/definitions";
import {
  advanceBossSystem,
  isBossControlledEnemy,
  recordBossCompletedDash,
  resolveBossDashContact,
} from "./bosses/boss-system";
import type { BossRuntimeState } from "./bosses/types";

export type {
  ArenaBounds,
  DashRequestResult,
  EnemyState,
  GameEvent,
  GameCommand,
  GameCommandDispatchResult,
  GameCommandResult,
  GameInput,
  GamePhase,
  GameRules,
  GameSnapshot,
  GameState,
  GameplayAcceptanceCase,
  GameplayAcceptanceCheckResult,
  GameplaySelfCheckResult,
  PlayerAction,
  StageDefinition,
  Vec2,
} from "./domain/types";
export { getDashDurationMs } from "./abilities/dash-slash";
export { clampPointToArena } from "./collision/arena";
export { distanceSquaredPointToSegment, segmentIntersectsCircle } from "./collision/shapes";
export { drainGameEvents } from "./events/event-buffer";
export {
  DASH_HIT_RADIUS,
  DASH_RECOVERY_MS,
  DEFAULT_RUN_SEED,
  ENEMY_RADIUS,
  FIXED_STEP_MS,
  MAX_DASH_DURATION_MS,
  MAX_DASH_RECOVERY_MS,
  MAX_FRAME_DELTA_MS,
  MIN_DASH_DURATION_MS,
  MIN_DASH_RECOVERY_MS,
  PLAYER_RADIUS,
} from "./rules/constants";

// The real-time renderer normally advances without a control payload. Reusing
// this immutable object avoids creating one short-lived object every frame.
const EMPTY_GAME_INPUT: Readonly<GameInput> = Object.freeze({});

export const GAME_STATE_VERSION = 2 as const;

const EPSILON = 1e-8;

function point(x: number, z: number): Vec2 {
  return vec2(x, z);
}

function copyPoint(value: Vec2): Vec2 {
  return copyVec2(value);
}

function copyArena(value: ArenaBounds): ArenaBounds {
  return {
    minX: value.minX,
    maxX: value.maxX,
    minZ: value.minZ,
    maxZ: value.maxZ,
  };
}

function normalizeRules(rules: Partial<GameRules> = {}): GameRules {
  const requestedRecovery = finiteOr(rules.recoveryMs ?? DASH_RECOVERY_MS, DASH_RECOVERY_MS);
  return {
    recoveryMs: Math.min(
      MAX_DASH_RECOVERY_MS,
      Math.max(MIN_DASH_RECOVERY_MS, requestedRecovery),
    ),
  };
}

function phaseOneSpawns(level: LevelDefinition) {
  return level.encounters.flatMap((encounter) => (
    encounter.waves.flatMap((wave) => wave.spawns)
  ));
}

/** Compatibility adapter for existing tools. New code consumes LEVEL_DEFINITIONS. */
export const STAGE_DEFINITIONS: readonly StageDefinition[] = LEVEL_DEFINITIONS.map((level) => {
  const encounter = level.encounters[0];
  if (!encounter) throw new Error(`Level ${level.id} has no encounter.`);
  const spawns = phaseOneSpawns(level);
  return {
    id: level.id,
    name: level.name,
    index: level.index,
    enemyCount: spawns.length,
    enemySpeed: encounter.enemyMoveSpeed,
    arena: copyArena(level.arena),
    playerSpawn: copyPoint(level.playerSpawn),
    enemySpawns: spawns.map((spawn) => copyPoint(spawn.position)),
  };
});

function assertStageDefinitions(): void {
  const expectedCounts = [8, 12, 18];
  STAGE_DEFINITIONS.forEach((stage, index) => {
    if (
      stage.index !== index ||
      stage.enemyCount !== expectedCounts[index] ||
      stage.enemySpawns.length !== expectedCounts[index]
    ) {
      throw new Error(`Invalid stage definition at index ${index}.`);
    }
  });
}

assertStageDefinitions();

/** Returns defensive copies so tools/editors cannot mutate live definitions. */
export function createStages(): StageDefinition[] {
  return STAGE_DEFINITIONS.map((stage) => ({
    ...stage,
    arena: copyArena(stage.arena),
    playerSpawn: copyPoint(stage.playerSpawn),
    enemySpawns: stage.enemySpawns.map(copyPoint),
  }));
}

/** Creates a fresh, deterministic, serializable game state. */
export function createGame(stageIndex = 0, rules: Partial<GameRules> = {}): GameState {
  const level = levelByIndex(stageIndex);
  const encounter = level.encounters[0];
  if (!encounter) throw new Error(`Level ${level.id} has no encounter.`);
  const spawns = phaseOneSpawns(level);
  const state: GameState = {
    version: GAME_STATE_VERSION,
    run: {
      seed: DEFAULT_RUN_SEED,
      tick: 0,
      random: createSeededRandom(DEFAULT_RUN_SEED).snapshot(),
      selectedUpgrades: [],
      acquiredResources: {},
      fullGame: null,
    },
    stage: {
      index: stageIndex,
      levelId: level.id,
      name: level.name,
      phase: "playing",
      attempt: 1,
      arena: copyArena(level.arena),
      encounterId: encounter.id,
    },
    tick: 0,
    elapsedMs: 0,
    accumulatorMs: 0,
    rules: normalizeRules(rules),
    player: {
      position: copyPoint(level.playerSpawn),
      facing: point(0, -1),
      radius: PLAYER_RADIUS,
      hp: 1,
      dash: null,
      charge: null,
      recoveryRemainingMs: 0,
      bufferedAbility: null,
      abilities: {
        primary: { abilityId: DASH_SLASH_ABILITY_ID, cooldownRemainingMs: 0 },
        secondary: { abilityId: CHARGED_DASH_ABILITY_ID, cooldownRemainingMs: 0 },
        special: null,
        ultimate: { abilityId: VECTOR_FOCUS_ABILITY_ID, cooldownRemainingMs: 0 },
      },
      ultimateEnergy: 0,
      predatorDriveExpiresAtMs: null,
      killMomentumStacks: 0,
      ultimatePlanning: null,
      ultimateExecution: null,
    },
    enemies: spawns.map((spawn, index) => {
      const definition = enemyDefinitions.get(spawn.enemyDefinitionId);
      return {
        id: createEnemyEntityId(stageIndex, index + 1),
        definitionId: definition.id,
        position: copyPoint(spawn.position),
        facing: copyPoint(spawn.facing ?? point(0, -1)),
        radius: definition.radius,
        speed: encounter.enemyMoveSpeed,
        alive: true,
        state: "active" as const,
        spawnedAtMs: 0,
        killedAtMs: null,
        armorParts: createArmorPartStates(definition.armorProfileId),
        staggerRemainingMs: 0,
      };
    }),
    projectiles: [],
    obstacles: [],
    hazards: [],
    combat: {
      kills: 0,
      totalEnemies: spawns.length,
      scheduledSlashes: [],
      storedPath: null,
      gravityPulls: [],
    },
    eventSequence: 0,
    commandSequence: 0,
    lastEvents: [],
  };
  emitGameEvent(state, { type: "stage-started", stageIndex, levelId: level.id });
  return state;
}

/** Creates the production campaign shell. Legacy createGame remains available
 * as the Phase 1 compatibility fixture and validation harness. */
export function createFullGameGame(
  seed = DEFAULT_RUN_SEED,
  rules: Partial<GameRules> = {},
): GameState {
  const state = createGame(0, rules);
  initializeFullGameCampaign(state, seed);
  return state;
}

/** Validation-only worst-case state: 20 renderable enemies with an authored
 * eight-target line and the remaining hostiles distributed across the arena. */
export function createStressGame(enemyCount = 20, rules: Partial<GameRules> = {}): GameState {
  const state = createGame(2, rules);
  const safeCount = Math.min(40, Math.max(8, Math.round(finiteOr(enemyCount, 20))));
  const firstRowX = [-16, -12, -8, -4, 4, 8, 12, 16];
  const positions: Vec2[] = firstRowX.map((x) => point(x, -8));
  for (let index = positions.length; index < safeCount; index += 1) {
    const column = (index - 8) % 6;
    const row = Math.floor((index - 8) / 6);
    positions.push(point(-15 + column * 6, row % 2 === 0 ? 2.5 : 8));
  }
  state.stage.levelId = "validation-redline-stress";
  state.stage.name = "REDLINE STRESS";
  state.player.position = point(-19, -8);
  state.player.facing = point(1, 0);
  state.enemies = positions.map((position, index) => ({
    id: `stress-enemy-${String(index + 1).padStart(2, "0")}`,
    definitionId: enemyDefinitions.get("enemy-grunt-v1").id,
    position,
    facing: point(1, 0),
    radius: ENEMY_RADIUS,
    speed: 0,
    alive: true,
    state: "active",
    spawnedAtMs: 0,
    killedAtMs: null,
    armorParts: [],
    staggerRemainingMs: 0,
  }));
  state.combat.totalEnemies = safeCount;
  state.combat.kills = 0;
  state.combat.scheduledSlashes = [];
  return state;
}

/** Deterministic browser acceptance scenario for Charged/Armor geometry. */
export function createArmorValidationGame(rules: Partial<GameRules> = {}): GameState {
  const state = createGame(0, rules);
  const definition = enemyDefinitions.get(VANGUARD_ENEMY_ID);
  state.stage.levelId = "validation-armor-coverage";
  state.stage.name = "ARMOR COVERAGE";
  state.stage.encounterId = "validation-armor-coverage-v1";
  state.player.position = point(-8, 0);
  state.player.facing = point(1, 0);
  state.enemies = [{
    id: "validation-vanguard-01",
    definitionId: definition.id,
    position: point(0, 0),
    facing: point(-1, 0),
    radius: definition.radius,
    speed: 0,
    alive: true,
    state: "active",
    spawnedAtMs: 0,
    killedAtMs: null,
    armorParts: createArmorPartStates(definition.armorProfileId),
    staggerRemainingMs: 0,
  }];
  state.combat.kills = 0;
  state.combat.totalEnemies = 1;
  state.combat.scheduledSlashes = [];
  drainGameEvents(state);
  return state;
}

/** Deterministic browser acceptance scenario for Vector Focus planning. */
export function createUltimateValidationGame(rules: Partial<GameRules> = {}): GameState {
  const state = createGame(0, rules);
  const definition = enemyDefinitions.get(STRIKER_ENEMY_ID);
  state.stage.levelId = "validation-vector-focus";
  state.stage.name = "VECTOR FOCUS";
  state.stage.encounterId = "validation-vector-focus-v1";
  state.player.position = point(0, 0);
  state.player.facing = point(1, 0);
  state.player.ultimateEnergy = 100;
  state.enemies = [2, 4, 6].map((x, index) => ({
    id: `validation-vector-target-${index + 1}`,
    definitionId: definition.id,
    position: point(x, 0),
    facing: point(-1, 0),
    radius: definition.radius,
    speed: 0,
    alive: true,
    state: "active" as const,
    spawnedAtMs: 0,
    killedAtMs: null,
    armorParts: [],
    staggerRemainingMs: 0,
  }));
  state.combat.kills = 0;
  state.combat.totalEnemies = state.enemies.length;
  state.combat.scheduledSlashes = [];
  drainGameEvents(state);
  return state;
}

/** Deterministic browser acceptance scenario for Projectile / Obstacle / Hazard. */
export function createEntityValidationGame(rules: Partial<GameRules> = {}): GameState {
  const state = createGame(0, rules);
  const definition = enemyDefinitions.get(STRIKER_ENEMY_ID);
  state.stage.levelId = "validation-entities";
  state.stage.name = "ENTITY MATRIX";
  state.stage.encounterId = "validation-entities-v1";
  state.player.position = point(-12, -5);
  state.player.facing = point(1, 0);
  state.run.selectedUpgrades = [
    "skill-refraction-v1",
    "skill-projectile-reversal-v1",
    "skill-projectile-return-v1",
  ];
  state.enemies = [
    {
      id: "validation-gunner",
      definitionId: definition.id,
      position: point(12, -5),
      facing: point(-1, 0),
      radius: definition.radius,
      speed: 0,
      alive: true,
      state: "active" as const,
      spawnedAtMs: 0,
      killedAtMs: null,
      armorParts: [],
      staggerRemainingMs: 0,
    },
    {
      id: "validation-anchor",
      definitionId: definition.id,
      position: point(17, 9),
      facing: point(-1, 0),
      radius: definition.radius,
      speed: 0,
      alive: true,
      state: "active" as const,
      spawnedAtMs: 0,
      killedAtMs: null,
      armorParts: [],
      staggerRemainingMs: 0,
    },
  ];
  state.projectiles = [];
  state.obstacles = [];
  state.hazards = [];
  state.combat.kills = 0;
  state.combat.totalEnemies = state.enemies.length;
  spawnProjectile(state, {
    id: "validation-standard-round",
    definitionId: STANDARD_ROUND_PROJECTILE_ID,
    position: point(-2, -5),
    direction: point(1, 0),
    sourceId: "validation-gunner",
  });
  spawnObstacle(state, {
    id: "validation-reflector",
    definitionId: STATIC_REFLECTOR_OBSTACLE_ID,
    position: point(0, 4),
  });
  spawnObstacle(state, {
    id: "validation-barrier",
    definitionId: DEPLOYABLE_BARRIER_OBSTACLE_ID,
    position: point(-12, 9),
  });
  spawnHazard(state, {
    id: "validation-mine",
    definitionId: ARMED_MINE_HAZARD_ID,
    position: point(15, 6),
  });
  spawnHazard(state, {
    id: "validation-arc-rail",
    definitionId: ARC_RAIL_HAZARD_ID,
    position: point(0, 10),
  });
  drainGameEvents(state);
  return state;
}

/** Deterministic browser acceptance scenario for Curve / Stored Path / Cross. */
export function createBasicPassiveValidationGame(rules: Partial<GameRules> = {}): GameState {
  const state = createGame(0, rules);
  const strikerDefinition = enemyDefinitions.get(STRIKER_ENEMY_ID);
  const vanguardDefinition = enemyDefinitions.get(VANGUARD_ENEMY_ID);
  state.stage.levelId = "validation-basic-passives";
  state.stage.name = "PATH MEMORY";
  state.stage.encounterId = "validation-basic-passives-v1";
  state.player.position = point(-10, -4);
  state.player.facing = point(1, 0);
  state.run.selectedUpgrades = [
    "skill-curve-dash-v1",
    "skill-cross-execution-v1",
    "skill-cross-purge-v1",
    "skill-echo-slash-v1",
    "skill-double-echo-v1",
  ];
  state.enemies = [
    {
      id: "validation-cross-victim",
      definitionId: strikerDefinition.id,
      position: point(6.2, 4.5),
      facing: point(-1, 0),
      radius: strikerDefinition.radius,
      speed: 0,
      alive: true,
      state: "active" as const,
      spawnedAtMs: 0,
      killedAtMs: null,
      armorParts: [],
      staggerRemainingMs: 0,
    },
    {
      id: "validation-cross-armored",
      definitionId: vanguardDefinition.id,
      position: point(6, 5.8),
      facing: point(1, 0),
      radius: vanguardDefinition.radius,
      speed: 0,
      alive: true,
      state: "active" as const,
      spawnedAtMs: 0,
      killedAtMs: null,
      armorParts: createArmorPartStates(vanguardDefinition.armorProfileId),
      staggerRemainingMs: 0,
    },
    {
      id: "validation-path-anchor",
      definitionId: strikerDefinition.id,
      position: point(18, 10),
      facing: point(-1, 0),
      radius: strikerDefinition.radius,
      speed: 0,
      alive: true,
      state: "active" as const,
      spawnedAtMs: 0,
      killedAtMs: null,
      armorParts: [],
      staggerRemainingMs: 0,
    },
  ];
  state.projectiles = [];
  state.obstacles = [];
  state.hazards = [];
  state.combat.kills = 0;
  state.combat.totalEnemies = state.enemies.length;
  state.combat.scheduledSlashes = [];
  state.combat.storedPath = null;
  state.combat.gravityPulls = [];
  const projectile = spawnProjectile(state, {
    id: "validation-cross-round",
    definitionId: STANDARD_ROUND_PROJECTILE_ID,
    position: point(6, 3.8),
    direction: point(1, 0),
    sourceId: "validation-path-anchor",
  });
  if (projectile) projectile.velocity = point(0, 0);
  drainGameEvents(state);
  return state;
}

/** Validation-only state that enters a generated Event through the same
 * campaign commands used by the player-facing Planning Board. */
export function createCampaignEventValidationGame(rules: Partial<GameRules> = {}): GameState {
  const state = createFullGameGame(3108, rules);
  dispatchGameCommand(state, { type: "start-full-game-run" });
  const node = state.run.fullGame?.routeProgress.route.acts[0]?.layers[2]
    ?.find((candidate) => candidate.kind === "event");
  if (!node) throw new Error("Campaign Event validation fixture has no Event node.");
  positionCampaignValidationAtNode(state, node);
  dispatchGameCommand(state, { type: "preview-route-node", nodeId: node.id });
  dispatchGameCommand(state, { type: "confirm-planning" });
  drainGameEvents(state);
  return state;
}

/** Validation-only Forge state with a legal three-point committed build and
 * one real Reroute Token, ready for pointer-driven respec verification. */
export function createCampaignForgeValidationGame(rules: Partial<GameRules> = {}): GameState {
  let state: GameState | null = null;
  let forgeNode: RouteNodeState | null = null;
  for (let seed = 0; seed < 1_000 && !forgeNode; seed += 1) {
    const candidateState = createFullGameGame(seed, rules);
    const candidateNode = candidateState.run.fullGame?.routeProgress.route.acts[0]?.layers[2]
      ?.find((node) => node.kind === "forge") ?? null;
    if (candidateNode) {
      state = candidateState;
      forgeNode = candidateNode;
    }
  }
  if (!state || !forgeNode || !state.run.fullGame) {
    throw new Error("Campaign Forge validation fixture has no deterministic Forge node.");
  }
  dispatchGameCommand(state, { type: "start-full-game-run" });
  state.run.fullGame.skills.totalEarnedPoints = 3;
  dispatchGameCommand(state, { type: "preview-skill-purchase", skillId: "skill-wide-slash-v1" });
  dispatchGameCommand(state, { type: "preview-skill-purchase", skillId: "skill-gravity-slash-v1" });
  dispatchGameCommand(state, { type: "preview-skill-purchase", skillId: "skill-refraction-v1" });
  positionCampaignValidationAtNode(state, forgeNode);
  state.run.acquiredResources["reroute-token"] = 1;
  dispatchGameCommand(state, { type: "preview-route-node", nodeId: forgeNode.id });
  dispatchGameCommand(state, { type: "confirm-planning" });
  drainGameEvents(state);
  return state;
}

/** Validation-only Planning state with one exact production Challenge already
 * selected. The browser must still confirm the route and complete real combat. */
export function createCampaignEncounterValidationGame(
  encounterId: string,
  rules: Partial<GameRules> = {},
): GameState {
  for (let seed = 0; seed < 2_000; seed += 1) {
    const state = createFullGameGame(seed, rules);
    const node = state.run.fullGame?.routeProgress.route.acts
      .flatMap((act) => act.layers.flatMap((layer) => layer))
      .find((candidate) => (
        encounterForRouteNode(candidate, seed)?.id === encounterId
      ));
    if (!node) continue;
    dispatchGameCommand(state, { type: "start-full-game-run" });
    positionCampaignValidationAtNode(state, node);
    dispatchGameCommand(state, { type: "preview-route-node", nodeId: node.id });
    drainGameEvents(state);
    return state;
  }
  throw new Error(`Campaign Encounter validation fixture cannot route to ${encounterId}.`);
}

export function createCampaignChallengeValidationGame(
  encounterId = "encounter-act3-silent-mirror-v1",
  rules: Partial<GameRules> = {},
): GameState {
  return createCampaignEncounterValidationGame(encounterId, rules);
}

/** Validation-only single-archetype combat using the production movement,
 * attack profile, entity systems, armor, events, and presentation mapping. */
export function createEnemyAttackValidationGame(
  definitionId: string,
  rules: Partial<GameRules> = {},
): GameState {
  const state = createGame(0, rules);
  const definition = enemyDefinitions.get(definitionId);
  if (!definition.tags.includes("standard") && !definition.tags.includes("elite")) {
    throw new Error(`Enemy attack validation requires a formal roster enemy: ${definitionId}`);
  }
  const profile = enemyAttackProfiles.get(definition.attackProfile);
  const preferredRange = profile.action === "melee-lunge"
    ? 3.5
    : profile.action === "blink-lunge"
      ? 9
      : profile.action === "projectile-volley"
        ? 10
        : 8;
  const range = Math.max(profile.minimumRange + 0.5, Math.min(profile.maximumRange - 0.5, preferredRange));
  state.stage.levelId = `validation-enemy-${definition.archetype}`;
  state.stage.name = `ENEMY / ${definition.archetype.toUpperCase()}`;
  state.stage.encounterId = `validation-enemy-${definition.archetype}-v1`;
  state.player.position = point(0, 0);
  state.player.facing = point(1, 0);
  state.enemies = [{
    id: "validation-enemy-subject",
    definitionId: definition.id,
    position: point(range, 0),
    facing: point(-1, 0),
    radius: definition.radius,
    speed: definition.baseMoveSpeed,
    alive: true,
    state: "active",
    spawnedAtMs: 0,
    killedAtMs: null,
    armorParts: createArmorPartStates(definition.armorProfileId),
    staggerRemainingMs: 0,
    tactical: createEnemyTacticalState("validation-enemy-subject", definition.attackProfile),
  }];
  if (profile.action === "support-pulse") {
    const allyDefinition = enemyDefinitions.get(STRIKER_ENEMY_ID);
    state.enemies.push({
      id: "validation-support-target",
      definitionId: allyDefinition.id,
      position: point(range - 2, 1),
      facing: point(-1, 0),
      radius: allyDefinition.radius,
      speed: 0,
      alive: true,
      state: "active",
      spawnedAtMs: 0,
      killedAtMs: null,
      armorParts: [],
      staggerRemainingMs: 0,
      tactical: createEnemyTacticalState("validation-support-target", allyDefinition.attackProfile),
    });
    if (state.enemies[1]?.tactical) state.enemies[1].tactical.phaseDurationMs = 10_000;
  }
  state.projectiles = [];
  state.obstacles = [];
  state.hazards = [];
  state.combat.kills = 0;
  state.combat.totalEnemies = state.enemies.length;
  state.combat.scheduledSlashes = [];
  state.combat.storedPath = null;
  state.combat.gravityPulls = [];
  drainGameEvents(state);
  return state;
}

function positionCampaignValidationAtNode(state: GameState, node: RouteNodeState): void {
  const campaign = state.run.fullGame;
  if (!campaign) throw new Error("Campaign validation requires a full-game state.");
  campaign.phase = "planning";
  campaign.provisionalRouteNodeId = null;
  campaign.routeProgress.phase = "route-map";
  campaign.routeProgress.actIndex = node.actIndex;
  campaign.routeProgress.layerIndex = node.layerIndex;
  campaign.routeProgress.currentNodeId = null;
  campaign.routeProgress.availableNodeIds = [node.id];
  state.stage.phase = "planning";
}

/** Mutates the supplied state in place, preserving references held by a renderer. */
export function restartStage(state: GameState): GameState {
  if (state.run.fullGame !== null) {
    restartCampaignEncounter(state);
    return state;
  }
  const nextAttempt = state.stage.attempt + 1;
  const replacement = createGame(state.stage.index, state.rules);
  replacement.run = {
    seed: state.run.seed,
    tick: state.run.tick,
    random: { ...state.run.random },
    selectedUpgrades: [...state.run.selectedUpgrades],
    acquiredResources: { ...state.run.acquiredResources },
    fullGame: state.run.fullGame === null ? null : structuredClone(state.run.fullGame),
  };
  replacement.eventSequence = state.eventSequence;
  replacement.commandSequence = state.commandSequence;
  replacement.stage.attempt = nextAttempt;
  replacement.lastEvents = [];
  emitGameEvent(replacement, {
    type: "stage-restarted",
    stageIndex: replacement.stage.index,
    levelId: replacement.stage.levelId,
    attempt: nextAttempt,
  });
  Object.assign(state, replacement);
  return state;
}

/** Starts the next stage after a clear. The final stage resolves to game-complete. */
export function advanceStage(state: GameState): GameState {
  if (state.stage.phase !== "stage-cleared") {
    return state;
  }

  const nextIndex = state.stage.index + 1;
  if (nextIndex >= STAGE_DEFINITIONS.length) {
    state.stage.phase = "game-complete";
    return state;
  }

  const replacement = createGame(nextIndex, state.rules);
  replacement.run = {
    seed: state.run.seed,
    tick: state.run.tick,
    random: { ...state.run.random },
    selectedUpgrades: [...state.run.selectedUpgrades],
    acquiredResources: { ...state.run.acquiredResources },
    fullGame: state.run.fullGame === null ? null : structuredClone(state.run.fullGame),
  };
  replacement.eventSequence = state.eventSequence;
  replacement.commandSequence = state.commandSequence;
  replacement.lastEvents = [];
  emitGameEvent(replacement, {
    type: "stage-started",
    stageIndex: replacement.stage.index,
    levelId: replacement.stage.levelId,
  });
  Object.assign(state, replacement);
  return state;
}

function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

/**
 * Queues a click/tap. A ready player starts immediately; otherwise only the
 * newest target is retained and fires as soon as the configured recovery expires.
 */
export function queueDash(state: GameState, target: Vec2): DashRequestResult {
  return activateAbility(state, "primary", target);
}

export function isPlayerInvulnerable(state: GameState): boolean {
  return state.player.hp === 1 && state.player.dash !== null;
}

export function getPlayerAction(state: GameState): PlayerAction {
  if (state.player.hp === 0) {
    return "dead";
  }
  if (state.player.dash !== null) {
    return "dashing";
  }
  if (state.player.ultimatePlanning !== null) {
    return "planning";
  }
  if (state.player.charge !== null) {
    return "charging";
  }
  if (state.player.recoveryRemainingMs > EPSILON) {
    return "recovering";
  }
  return "ready";
}

function resolveEnemiesAlongSegment(
  state: GameState,
  segmentStart: Vec2,
  segmentEnd: Vec2,
): void {
  const dash = state.player.dash;
  if (!dash) return;
  const segmentX = segmentEnd.x - segmentStart.x;
  const segmentZ = segmentEnd.z - segmentStart.z;
  const segmentLengthSquared = Math.max(EPSILON, segmentX * segmentX + segmentZ * segmentZ);
  const candidates = state.enemies
    .filter((enemy) => enemy.alive && !dash.resolvedEnemyIds.includes(enemy.id))
    .sort((first, second) => (
      segmentProjection(first.position, segmentStart, segmentX, segmentZ, segmentLengthSquared) -
      segmentProjection(second.position, segmentStart, segmentX, segmentZ, segmentLengthSquared)
    ));
  for (const enemy of candidates) {
    if (
      !enemy.alive ||
      !segmentIntersectsCircle(
        segmentStart,
        segmentEnd,
        enemy.position,
        dash.hitRadius + enemy.radius,
      )
    ) {
      continue;
    }
    dash.resolvedEnemyIds.push(enemy.id);
    if (resolveBossDashContact(state, enemy, dash, segmentStart, segmentEnd)) continue;
    const contact = resolveArmorContact(
      enemy,
      dash.from,
      dash.to,
      undefined,
      enemy.radius + dash.hitRadius,
    );
    if (contact.armorPart !== null) {
      if (dash.abilityId === CHARGED_DASH_ABILITY_ID) {
        breakEnemyArmor(state, enemy, contact.armorPart, contact.contactRegion);
      } else {
        emitGameEvent(state, {
          type: "armor-blocked",
          enemyId: enemy.id,
          armorPartId: contact.armorPart.id,
          attackId: dash.abilityId,
          position: copyPoint(enemy.position),
        });
      }
      continue;
    }
    killEnemy(state, enemy, dash.abilityId, contact.isRearContact);
  }
}

function breakEnemyArmor(
  state: GameState,
  enemy: GameState["enemies"][number],
  armorPart: GameState["enemies"][number]["armorParts"][number],
  contactRegion: "front" | "left" | "right" | "rear",
): void {
  const dash = state.player.dash;
  if (!dash || !armorPart.intact) return;
  armorPart.intact = false;
  armorPart.brokenAtMs = state.elapsedMs;
  dash.armorBreakCount += 1;
  enemy.staggerRemainingMs = Math.max(enemy.staggerRemainingMs, 450);
  enemy.position = clampPointToArena({
    x: enemy.position.x + state.player.facing.x * 0.8,
    z: enemy.position.z + state.player.facing.z * 0.8,
  }, state.stage.arena, enemy.radius);
  if (dash.armorBreakCount <= 3) {
    changeUltimateEnergy(state, 4, `armor-break:${enemy.id}`);
  }
  if (state.run.selectedUpgrades.includes("skill-breach-momentum-v1")) {
    dash.recoveryMs = Math.max(
      MIN_DASH_RECOVERY_MS,
      state.rules.recoveryMs - dash.killMomentumConsumedStacks * 35,
      dash.recoveryMs - 80,
    );
  }
  if (state.run.selectedUpgrades.includes("skill-chain-breach-v1")) {
    dash.hitRadius = dash.baseHitRadius * (1 + Math.min(3, dash.armorBreakCount) * 0.15);
  }
    emitGameEvent(state, {
      type: "armor-broken",
      enemyId: enemy.id,
      armorPartId: armorPart.id,
      attackId: dash.abilityId,
      position: copyPoint(enemy.position),
      contactRegion,
    });
  if (state.run.selectedUpgrades.includes("skill-armor-shrapnel-v1")) {
    resolveArmorShrapnel(state, enemy);
  }
}

function killEnemy(
  state: GameState,
  enemy: GameState["enemies"][number],
  attackId: string,
  rearExecution: boolean,
): void {
  if (!enemy.alive) return;
  if (isBossControlledEnemy(enemy)) return;
  enemy.alive = false;
  enemy.state = "dead";
  enemy.killedAtMs = state.elapsedMs;
  state.combat.kills += 1;
  const dash = state.player.dash;
  if (
    dash &&
    attackId === dash.abilityId &&
    (dash.abilityId === DASH_SLASH_ABILITY_ID || dash.abilityId === CHARGED_DASH_ABILITY_ID)
  ) {
    dash.killCount += 1;
    if (
      dash.reflectionsUsed > 0 &&
      dash.refractionSecondLegKills < 3 &&
      state.run.selectedUpgrades.includes("skill-prism-momentum-v1")
    ) {
      dash.refractionSecondLegKills += 1;
      dash.recoveryMs = Math.max(MIN_DASH_RECOVERY_MS, dash.recoveryMs - 40);
    }
  }
  if (dash?.abilityId === CHARGED_DASH_ABILITY_ID && attackId === CHARGED_DASH_ABILITY_ID) {
    dash.exposedKillCount += 1;
    if (state.run.selectedUpgrades.includes("skill-execution-tempo-v1")) {
      dash.recoveryMs = state.rules.recoveryMs;
    }
    if (rearExecution) {
      dash.rearExecutionCount += 1;
      if (state.run.selectedUpgrades.includes("skill-predator-drive-v1")) {
        state.player.predatorDriveExpiresAtMs = state.elapsedMs + 4_000;
      }
      if (
        dash.rearExecutionCount === 1 &&
        state.run.selectedUpgrades.includes("skill-backline-battery-v1")
      ) {
        changeUltimateEnergy(state, 15, `backline-battery:${enemy.id}`);
      }
    }
  }
  if (rearExecution && attackId === CHARGED_DASH_ABILITY_ID) {
    emitGameEvent(state, {
      type: "rear-execution",
      enemyId: enemy.id,
      attackId,
      position: copyPoint(enemy.position),
    });
  }
  if (dash?.abilityId === VECTOR_FOCUS_ABILITY_ID && attackId === VECTOR_FOCUS_ABILITY_ID) {
    if (state.player.ultimateExecution) state.player.ultimateExecution.killCount += 1;
  }
  const ultimateDerived = attackId === VECTOR_FOCUS_ABILITY_ID ||
    attackId === "skill-vector-echo-v1" ||
    attackId === "skill-cross-cascade-v1" ||
    attackId === "skill-projectile-return-v1";
  if (!ultimateDerived && (
    state.run.fullGame !== null ||
    attackId === CHARGED_DASH_ABILITY_ID ||
    attackId === "skill-armor-shrapnel-v1"
  )) {
    changeUltimateEnergy(state, enemyDefinitions.get(enemy.definitionId).energyReward, `enemy-kill:${enemy.id}`);
  }
  emitGameEvent(state, {
    type: "enemy-killed",
    enemyId: enemy.id,
    sourceId: "player",
    attackId,
    position: copyPoint(enemy.position),
    direction: copyPoint(state.player.facing),
  });
}

function resolveArmorShrapnel(
  state: GameState,
  sourceEnemy: GameState["enemies"][number],
): void {
  const dash = state.player.dash;
  if (!dash || dash.armorBreakCount > 6) return;
  const target = state.enemies
    .filter((candidate) => {
      if (!candidate.alive || candidate.id === sourceEnemy.id || hasIntactArmor(candidate)) return false;
      const definition = enemyDefinitions.get(candidate.definitionId);
      return definition.tags.includes("standard") && !definition.tags.includes("boss");
    })
    .map((candidate) => ({
      enemy: candidate,
      distanceSquared: squaredDistance(sourceEnemy.position, candidate.position),
    }))
    .filter((candidate) => candidate.distanceSquared <= 36)
    .sort((first, second) => first.distanceSquared - second.distanceSquared)[0]?.enemy;
  if (target) killEnemy(state, target, "skill-armor-shrapnel-v1", false);
}

function changeUltimateEnergy(state: GameState, delta: number, source: string): void {
  const before = state.player.ultimateEnergy;
  const after = Math.min(100, Math.max(0, before + delta));
  if (after === before) return;
  state.player.ultimateEnergy = after;
  emitGameEvent(state, { type: "ultimate-energy-changed", before, after, source });
}

function segmentProjection(
  pointValue: Vec2,
  start: Vec2,
  segmentX: number,
  segmentZ: number,
  segmentLengthSquared: number,
): number {
  return ((pointValue.x - start.x) * segmentX + (pointValue.z - start.z) * segmentZ) / segmentLengthSquared;
}

function resolveScheduledSlashes(state: GameState, deltaMs: number): void {
  if (state.combat.scheduledSlashes.length === 0) return;
  const pending = [];
  for (const slash of state.combat.scheduledSlashes) {
    slash.remainingMs = Math.max(0, slash.remainingMs - Math.max(0, deltaMs));
    if (slash.remainingMs > EPSILON) {
      pending.push(slash);
      continue;
    }
    destroyProjectilesAlongSlash(state, slash.from, slash.to, slash.hitRadius, slash.attackId);
    for (const enemy of state.enemies) {
      if (!enemy.alive || !segmentIntersectsCircle(
        slash.from,
        slash.to,
        enemy.position,
        slash.hitRadius + enemy.radius,
      )) continue;
      const contact = resolveArmorContact(
        enemy,
        slash.from,
        slash.to,
        undefined,
        enemy.radius + slash.hitRadius,
      );
      if (contact.armorPart) {
        emitGameEvent(state, {
          type: "armor-blocked",
          enemyId: enemy.id,
          armorPartId: contact.armorPart.id,
          attackId: slash.attackId,
          position: copyPoint(enemy.position),
        });
      } else {
        killEnemy(state, enemy, slash.attackId, contact.isRearContact);
      }
    }
    emitGameEvent(state, {
      type: "scheduled-slash-triggered",
      attackId: slash.attackId,
      from: copyPoint(slash.from),
      to: copyPoint(slash.to),
    });
  }
  state.combat.scheduledSlashes = pending;
}

function resolveCrossExecution(state: GameState, position: Vec2): void {
  let killedCount = 0;
  let interruptedEnemyCount = 0;
  const purgeEnabled = state.run.selectedUpgrades.includes("skill-cross-purge-v1");
  for (const enemy of state.enemies) {
    if (!enemy.alive || squaredDistance(enemy.position, position) > (2.5 + enemy.radius) ** 2) continue;
    if (isBossControlledEnemy(enemy)) continue;
    if (hasIntactArmor(enemy)) {
      const definition = enemyDefinitions.get(enemy.definitionId);
      if (purgeEnabled && !definition.tags.includes("boss")) {
        enemy.staggerRemainingMs = Math.max(enemy.staggerRemainingMs, 450);
        interruptedEnemyCount += 1;
      }
      continue;
    }
    killEnemy(state, enemy, "skill-cross-execution-v1", false);
    killedCount += 1;
  }
  const purgedProjectileCount = purgeEnabled
    ? purgeProjectilesInRadius(state, position, 3, "skill-cross-purge-v1")
    : 0;
  emitGameEvent(state, {
    type: "cross-execution-triggered",
    position: copyPoint(position),
    killedCount,
    purgedProjectileCount,
    interruptedEnemyCount,
  });
}

function resolveImpactBurst(state: GameState, dash: NonNullable<GameState["player"]["dash"]>): void {
  if (
    dash.abilityId !== DASH_SLASH_ABILITY_ID ||
    !state.run.selectedUpgrades.includes("skill-impact-burst-v1")
  ) return;
  const endpoint = dash.pathSegments.at(-1)?.to ?? dash.to;
  const hasEndpointContact = state.enemies.some((enemy) => (
    squaredDistance(enemy.position, endpoint) <= (1.2 + enemy.radius) ** 2
  ));
  if (!hasEndpointContact) return;
  let killedCount = 0;
  for (const enemy of state.enemies) {
    if (!enemy.alive || squaredDistance(enemy.position, endpoint) > (2.2 + enemy.radius) ** 2) continue;
    if (isBossControlledEnemy(enemy)) continue;
    const armor = enemy.armorParts.find((part) => part.intact);
    if (armor) {
      emitGameEvent(state, {
        type: "armor-blocked",
        enemyId: enemy.id,
        armorPartId: armor.id,
        attackId: "skill-impact-burst-v1",
        position: copyPoint(enemy.position),
      });
      continue;
    }
    killEnemy(state, enemy, "skill-impact-burst-v1", false);
    killedCount += 1;
  }
  emitGameEvent(state, {
    type: "impact-burst-triggered",
    position: copyPoint(endpoint),
    killedCount,
  });
}

function resolveReturnedProjectileImpact(state: GameState, impact: ReturnedProjectileImpact): void {
  const enemy = state.enemies.find((candidate) => candidate.id === impact.enemyId && candidate.alive);
  if (!enemy) return;
  const contact = resolveArmorContact(enemy, impact.from, impact.to, undefined, enemy.radius + impact.radius);
  if (contact.armorPart) {
    emitGameEvent(state, {
      type: "armor-blocked",
      enemyId: enemy.id,
      armorPartId: contact.armorPart.id,
      attackId: impact.attackId,
      position: copyPoint(enemy.position),
    });
    return;
  }
  killEnemy(state, enemy, impact.attackId, contact.isRearContact);
}

function completeDash(state: GameState): void {
  const dash = state.player.dash;
  if (dash === null) {
    return;
  }
  state.player.position = copyPoint(dash.to);
  const completedPathSegment = dash.pathSegments[dash.pathSegmentIndex];
  const nextPathSegment = dash.pathSegments[dash.pathSegmentIndex + 1];
  if (nextPathSegment) {
    dash.pathSegmentIndex += 1;
    dash.from = copyPoint(nextPathSegment.from);
    dash.to = copyPoint(nextPathSegment.to);
    dash.durationMs = nextPathSegment.durationMs;
    dash.elapsedMs = 0;
    const nextDirection = {
      x: nextPathSegment.to.x - nextPathSegment.from.x,
      z: nextPathSegment.to.z - nextPathSegment.from.z,
    };
    const nextLength = Math.hypot(nextDirection.x, nextDirection.z);
    if (nextLength > EPSILON) {
      state.player.facing = { x: nextDirection.x / nextLength, z: nextDirection.z / nextLength };
    }
    if (completedPathSegment?.reflectionAtEnd) {
      dash.reflectionsUsed += 1;
      if (state.run.selectedUpgrades.includes("skill-prism-momentum-v1")) {
        dash.hitRadius = dash.baseHitRadius * 1.25;
      }
      emitGameEvent(state, {
        type: "dash-reflected",
        abilityId: dash.abilityId,
        obstacleId: completedPathSegment.reflectionAtEnd.obstacleId,
        position: copyPoint(completedPathSegment.reflectionAtEnd.position),
        normal: copyPoint(completedPathSegment.reflectionAtEnd.normal),
        from: copyPoint(nextPathSegment.from),
        to: copyPoint(nextPathSegment.to),
      });
    } else {
      emitGameEvent(state, {
        type: "dash-path-segment-started",
        abilityId: dash.abilityId,
        segmentIndex: dash.pathSegmentIndex,
        from: copyPoint(nextPathSegment.from),
        to: copyPoint(nextPathSegment.to),
      });
    }
    return;
  }
  if (completedPathSegment?.terminalImpact) {
    const impact = completedPathSegment.terminalImpact;
    state.player.position = clampPointToArena({
      x: impact.position.x - impact.incomingDirection.x * 0.85,
      z: impact.position.z - impact.incomingDirection.z * 0.85,
    }, state.stage.arena, state.player.radius);
    emitGameEvent(state, {
      type: "dash-obstacle-impact",
      abilityId: dash.abilityId,
      obstacleId: impact.obstacleId,
      position: copyPoint(impact.position),
      normal: copyPoint(impact.normal),
    });
  }
  resolveImpactBurst(state, dash);
  recordBossCompletedDash(state, dash);
  finalizeRegularDashPathEffects(state, dash);
  if (
    state.run.selectedUpgrades.includes("skill-kill-momentum-v1") &&
    (dash.abilityId === DASH_SLASH_ABILITY_ID || dash.abilityId === CHARGED_DASH_ABILITY_ID)
  ) {
    state.player.killMomentumStacks = Math.min(5, dash.killCount);
  }
  state.player.dash = null;
  emitGameEvent(state, {
    type: "dash-ended",
    abilityId: dash.abilityId,
    sourceId: "player",
    position: copyPoint(state.player.position),
  });
  if (dash.abilityId === VECTOR_FOCUS_ABILITY_ID) {
    state.player.recoveryRemainingMs = 0;
    completeVectorFocusSegment(state, dash);
    return;
  }
  state.player.recoveryRemainingMs = dash.recoveryMs;
}

function advancePlayerAction(state: GameState, deltaMs: number): void {
  if (state.player.ultimatePlanning !== null) {
    advanceVectorFocusPlanning(state, deltaMs);
    return;
  }
  if (state.player.charge !== null) {
    advanceChargedDashHold(state, deltaMs);
    return;
  }
  let remainingMs = deltaMs;

  while (remainingMs > EPSILON) {
    const dash = state.player.dash;
    if (dash !== null) {
      const availableMs = Math.max(0, dash.durationMs - dash.elapsedMs);
      const sliceMs = Math.min(remainingMs, availableMs);
      const segmentStart = copyPoint(state.player.position);
      dash.elapsedMs = Math.min(dash.durationMs, dash.elapsedMs + sliceMs);
      const progress =
        dash.durationMs <= EPSILON ? 1 : dash.elapsedMs / dash.durationMs;
      state.player.position = {
        x: dash.from.x + (dash.to.x - dash.from.x) * progress,
        z: dash.from.z + (dash.to.z - dash.from.z) * progress,
      };
      resolveEnemiesAlongSegment(state, segmentStart, state.player.position);
      resolveProjectilesAlongDashSegment(state, segmentStart, state.player.position);
      const crossPosition = consumePendingCrossAlongSegment(dash, segmentStart, state.player.position);
      if (crossPosition) resolveCrossExecution(state, crossPosition);
      remainingMs -= sliceMs;

      if (dash.elapsedMs + EPSILON >= dash.durationMs) {
        completeDash(state);
        continue;
      }
      break;
    }

    if (state.player.recoveryRemainingMs > EPSILON) {
      const sliceMs = Math.min(
        remainingMs,
        state.player.recoveryRemainingMs,
      );
      state.player.recoveryRemainingMs = Math.max(
        0,
        state.player.recoveryRemainingMs - sliceMs,
      );
      remainingMs -= sliceMs;

      if (
        state.player.recoveryRemainingMs <= EPSILON &&
        state.player.bufferedAbility !== null
      ) {
        const buffered = state.player.bufferedAbility;
        activateAbility(state, buffered.slot, buffered.target);
        continue;
      }
      break;
    }

    if (state.player.bufferedAbility !== null) {
      const buffered = state.player.bufferedAbility;
      activateAbility(state, buffered.slot, buffered.target);
      continue;
    }
    break;
  }
}

function aliveEnemyCount(state: GameState): number {
  let count = 0;
  for (const enemy of state.enemies) {
    if (enemy.alive) {
      count += 1;
    }
  }
  return count;
}

function resolveStageCompletion(state: GameState): boolean {
  if (
    aliveEnemyCount(state) !== 0 ||
    state.player.dash !== null ||
    state.player.charge !== null ||
    state.player.ultimatePlanning !== null ||
    state.player.ultimateExecution !== null
  ) {
    return false;
  }

  if (state.run.fullGame !== null) {
    return campaignEncounterCanComplete(state) && completeCampaignEncounter(state);
  }

  state.stage.phase =
    state.stage.index === STAGE_DEFINITIONS.length - 1
      ? "game-complete"
      : "stage-cleared";
  state.player.bufferedAbility = null;
  emitGameEvent(state, {
    type: state.stage.phase,
    stageIndex: state.stage.index,
    levelId: state.stage.levelId,
  });
  return true;
}

function resolvePlayerContact(state: GameState): void {
  if (isPlayerInvulnerable(state)) {
    return;
  }

  for (const enemy of state.enemies) {
    if (!enemy.alive || !isEnemyContactLethal(enemy)) {
      continue;
    }
    const contactRadius = state.player.radius + enemy.radius;
    if (
      squaredDistance(state.player.position, enemy.position) >
      contactRadius * contactRadius + EPSILON
    ) {
      continue;
    }

    killPlayer(state, enemy.id);
    return;
  }
}

function killPlayer(state: GameState, sourceId: string): void {
  if (state.player.hp === 0 || isPlayerInvulnerable(state)) return;
  state.player.hp = 0;
  state.player.dash = null;
  state.player.charge = null;
  state.player.ultimatePlanning = null;
  state.player.ultimateExecution = null;
  state.player.recoveryRemainingMs = 0;
  state.player.bufferedAbility = null;
  state.stage.phase = "dead";
  markCampaignDefeat(state);
  emitGameEvent(state, {
    type: "player-died",
    enemyId: sourceId,
    position: copyPoint(state.player.position),
  });
}

function simulateFixedStep(state: GameState): void {
  if (state.stage.phase !== "playing") {
    return;
  }

  state.tick += 1;
  state.run.tick += 1;
  state.elapsedMs += FIXED_STEP_MS;
  const worldTimeScale = state.player.ultimatePlanning?.worldTimeScale ?? 1;
  const worldDeltaMs = FIXED_STEP_MS * worldTimeScale;
  advanceCampaignEncounterScheduler(state);
  advancePlayerAction(state, FIXED_STEP_MS);
  resolveScheduledSlashes(state, worldDeltaMs);
  advancePathPassiveTimers(state, worldDeltaMs);
  advanceObstacles(state, worldDeltaMs);
  const projectileResult = advanceProjectiles(state, worldDeltaMs);
  for (const impact of projectileResult.returnedImpacts) resolveReturnedProjectileImpact(state, impact);
  if (projectileResult.playerHitBy) killPlayer(state, projectileResult.playerHitBy);
  const lethalHazardId = advanceHazards(state, worldDeltaMs);
  if (lethalHazardId) killPlayer(state, lethalHazardId);
  const lethalBossSourceId = advanceBossSystem(state, worldDeltaMs);
  if (lethalBossSourceId) killPlayer(state, lethalBossSourceId);

  if (state.stage.phase !== "playing") return;

  // A dash can finish a wave during this tick. Running the scheduler again
  // allows an authored zero-warning follow-up to activate deterministically.
  advanceCampaignEncounterScheduler(state);

  if (resolveStageCompletion(state)) {
    return;
  }

  advanceEnemyAttacks(state, worldDeltaMs);
  moveEnemiesWithBehaviors(state, worldDeltaMs);
  resolvePlayerContact(state);
}

export function dispatchGameCommand(
  state: GameState,
  command: GameCommand,
): GameCommandDispatchResult {
  state.commandSequence += 1;
  let result: GameCommandResult = "ignored";
  if (command.type === "activate-ability") {
    result = activateAbility(state, command.slot, command.target);
  } else if (command.type === "restart-stage") {
    const wasCampaign = state.run.fullGame !== null;
    restartStage(state);
    result = wasCampaign && state.stage.phase !== "playing" ? "ignored" : "restarted";
  } else if (command.type === "advance-stage" && state.stage.phase === "stage-cleared") {
    advanceStage(state);
    result = "advanced";
  } else if (command.type === "start-full-game-run") {
    result = startFullGameRun(state);
  } else if (command.type === "start-boss-practice") {
    result = startBossPractice(state, command.bossDefinitionId);
  } else if (command.type === "return-to-title") {
    result = returnCampaignToTitle(state);
  } else if (command.type === "preview-route-node") {
    result = previewCampaignRouteNode(state, command.nodeId);
  } else if (command.type === "preview-skill-purchase") {
    result = previewCampaignSkillPurchase(state, command.skillId);
  } else if (command.type === "preview-skill-refund") {
    result = previewCampaignSkillRefund(state, command.skillId);
  } else if (command.type === "discard-skill-draft") {
    result = discardCampaignSkillDraft(state);
  } else if (command.type === "confirm-planning") {
    result = confirmCampaignPlanning(state);
  } else if (command.type === "acknowledge-reward") {
    result = acknowledgeCampaignReward(state);
  } else if (command.type === "resolve-event-choice") {
    result = resolveCampaignEventChoice(state, command.choiceId);
  } else if (command.type === "use-forge-token") {
    result = useCampaignForgeToken(state);
  } else if (command.type === "confirm-forge") {
    result = confirmCampaignForge(state);
  } else if (command.type === "begin-charge") {
    result = beginChargedDash(state, command.target);
  } else if (command.type === "update-charge-target") {
    result = updateChargedDashTarget(state, command.target);
  } else if (command.type === "release-charge") {
    result = releaseChargedDash(state, command.target);
  } else if (command.type === "cancel-charge") {
    result = cancelChargedDash(state);
  } else if (command.type === "start-ultimate") {
    result = startVectorFocus(state);
  } else if (command.type === "add-ultimate-point") {
    result = addVectorFocusPoint(state, command.target);
  } else if (command.type === "cancel-ultimate") {
    result = cancelVectorFocus(state);
  }
  synchronizeCampaignChallenge(state);
  return { sequence: state.commandSequence, result };
}

function applyControlInput(state: GameState, input: GameInput): boolean {
  if (input.restart === true) {
    dispatchGameCommand(state, { type: "restart-stage" });
    return true;
  }
  if (input.advanceStage === true) {
    const stageBefore = state.stage.index;
    dispatchGameCommand(state, { type: "advance-stage" });
    return state.stage.index !== stageBefore;
  }
  return false;
}

/** Advances exactly one 120 Hz simulation tick. Ideal for deterministic tests. */
export function stepGame(state: GameState, input: GameInput = EMPTY_GAME_INPUT): GameState {
  if (applyControlInput(state, input)) {
    return state;
  }
  if (input.dashTarget !== undefined) {
    dispatchGameCommand(state, {
      type: "activate-ability",
      slot: "primary",
      target: input.dashTarget,
    });
  }
  simulateFixedStep(state);
  return state;
}

/**
 * Real-time wrapper around stepGame's fixed simulation. The 250 ms cap prevents
 * a hidden browser tab from producing a multi-second catch-up spiral.
 */
export function advanceGame(
  state: GameState,
  deltaMs: number,
  input: GameInput = EMPTY_GAME_INPUT,
): GameState {
  if (applyControlInput(state, input)) {
    return state;
  }
  if (input.dashTarget !== undefined) {
    dispatchGameCommand(state, {
      type: "activate-ability",
      slot: "primary",
      target: input.dashTarget,
    });
  }
  if (!Number.isFinite(deltaMs) || deltaMs <= 0 || state.stage.phase !== "playing") {
    return state;
  }

  state.accumulatorMs += Math.min(deltaMs, MAX_FRAME_DELTA_MS);
  while (
    state.accumulatorMs + EPSILON >= FIXED_STEP_MS &&
    state.stage.phase === "playing"
  ) {
    state.accumulatorMs = Math.max(0, state.accumulatorMs - FIXED_STEP_MS);
    simulateFixedStep(state);
  }
  if (state.stage.phase !== "playing") {
    state.accumulatorMs = 0;
  }
  return state;
}

function roundForSnapshot(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function bossDetailsForSnapshot(runtime: BossRuntimeState): NonNullable<NonNullable<GameSnapshot["campaign"]>["boss"]>["details"] {
  const mechanics = runtime.mechanics;
  return {
    chargeIndex: mechanics.kind === "rail-hound" ? mechanics.chargeIndex : null,
    chargesThisCycle: mechanics.kind === "rail-hound" ? mechanics.chargesThisCycle : null,
    round: mechanics.kind === "siege-choir" ? mechanics.round : null,
    armorBreaks: mechanics.kind === "siege-choir"
      ? mechanics.armorBreaksThisRound
      : mechanics.kind === "last-conductor" ? mechanics.armorBreakCount : null,
    realEntityId: mechanics.kind === "mirror-regent" ? mechanics.realEntityId : null,
    cloneEntityIds: mechanics.kind === "mirror-regent" ? [...mechanics.cloneEntityIds] : [],
    supportEntityIds: mechanics.kind === "siege-choir"
      ? [...mechanics.turretEntityIds]
      : mechanics.kind === "last-conductor" ? [...mechanics.barrageSupportEntityIds] : [],
    mirrorSlash: mechanics.kind === "mirror-regent" && mechanics.mirrorSlash ? {
      phase: mechanics.mirrorSlash.phase,
      remainingMs: roundForSnapshot(Math.max(0, mechanics.mirrorSlash.durationMs - mechanics.mirrorSlash.elapsedMs)),
      segments: mechanics.mirrorSlash.segments.map((segment) => ({
        from: copyPoint(segment.from),
        to: copyPoint(segment.to),
      })),
    } : null,
    objectiveNodes: mechanics.kind === "last-conductor"
      ? (runtime.phaseIndex === 1 ? mechanics.railNodes : runtime.phaseIndex === 3 ? mechanics.finaleNodes : [])
        .map((node) => ({ id: node.id, position: copyPoint(node.position), reached: node.reached }))
      : [],
    finaleAttemptInvalid: mechanics.kind === "last-conductor" && mechanics.finaleAttemptInvalid,
  };
}

/** Compact, stable state intended for renderGameToText and browser QA agents. */
export function getGameSnapshot(state: GameState): GameSnapshot {
  const dash = state.player.dash;
  const campaign = state.run.fullGame;
  const allocation = campaign ? skillAllocationSnapshot(campaign.skills) : null;
  return {
    stage: {
      index: state.stage.index,
      number: state.stage.index + 1,
      count: STAGE_DEFINITIONS.length,
      id: state.stage.levelId,
      name: state.stage.name,
    },
    encounter: { id: state.stage.encounterId },
    run: {
      tick: state.run.tick,
      seed: state.run.seed,
      selectedUpgrades: [...state.run.selectedUpgrades],
    },
    phase: state.stage.phase,
    attempt: state.stage.attempt,
    tick: state.tick,
    timeMs: roundForSnapshot(state.elapsedMs),
    rules: { recoveryMs: state.rules.recoveryMs },
    arena: copyArena(state.stage.arena),
    player: {
      x: roundForSnapshot(state.player.position.x),
      z: roundForSnapshot(state.player.position.z),
      hp: state.player.hp,
      action: getPlayerAction(state),
      invulnerable: isPlayerInvulnerable(state),
      recoveryMs: roundForSnapshot(state.player.recoveryRemainingMs),
      facingX: roundForSnapshot(state.player.facing.x),
      facingZ: roundForSnapshot(state.player.facing.z),
    },
    dash:
      dash === null
        ? null
        : {
            fromX: roundForSnapshot(dash.from.x),
            fromZ: roundForSnapshot(dash.from.z),
            toX: roundForSnapshot(dash.to.x),
            toZ: roundForSnapshot(dash.to.z),
            progress: roundForSnapshot(dash.elapsedMs / dash.durationMs),
            durationMs: roundForSnapshot(dash.durationMs),
          },
    bufferedTarget:
      state.player.bufferedAbility === null
        ? null
        : {
            x: roundForSnapshot(state.player.bufferedAbility.target.x),
            z: roundForSnapshot(state.player.bufferedAbility.target.z),
          },
    abilities: {
      primary:
        state.player.abilities.primary === null
          ? null
          : {
              id: state.player.abilities.primary.abilityId,
              cooldownMs: roundForSnapshot(state.player.abilities.primary.cooldownRemainingMs),
            },
      secondary:
        state.player.abilities.secondary === null
          ? null
          : {
              id: state.player.abilities.secondary.abilityId,
              cooldownMs: roundForSnapshot(state.player.abilities.secondary.cooldownRemainingMs),
            },
      special:
        state.player.abilities.special === null
          ? null
          : {
              id: state.player.abilities.special.abilityId,
              cooldownMs: roundForSnapshot(state.player.abilities.special.cooldownRemainingMs),
            },
      ultimate:
        state.player.abilities.ultimate === null
          ? null
          : {
              id: state.player.abilities.ultimate.abilityId,
              cooldownMs: roundForSnapshot(state.player.abilities.ultimate.cooldownRemainingMs),
            },
    },
    kills: state.combat.kills,
    enemyCount: state.combat.totalEnemies,
    aliveEnemies: state.enemies
      .filter((enemy) => enemy.alive)
      .map((enemy) => ({
        id: enemy.id,
        x: roundForSnapshot(enemy.position.x),
        z: roundForSnapshot(enemy.position.z),
      })),
    projectiles: state.projectiles.map((projectile) => ({
      id: projectile.id,
      definitionId: projectile.definitionId,
      x: roundForSnapshot(projectile.position.x),
      z: roundForSnapshot(projectile.position.z),
      faction: projectile.faction,
      alive: projectile.alive,
    })),
    obstacles: state.obstacles.map((obstacle) => ({
      id: obstacle.id,
      definitionId: obstacle.definitionId,
      x: roundForSnapshot(obstacle.position.x),
      z: roundForSnapshot(obstacle.position.z),
      active: obstacle.active,
    })),
    hazards: state.hazards.map((hazard) => ({
      id: hazard.id,
      definitionId: hazard.definitionId,
      x: roundForSnapshot(hazard.position.x),
      z: roundForSnapshot(hazard.position.z),
      phase: hazard.phase,
      active: hazard.active,
    })),
    modules: {
      activeDashAbilityId: state.player.dash?.abilityId ?? null,
      charge: state.player.charge === null ? null : {
        heldMs: roundForSnapshot(state.player.charge.heldMs),
        thresholdMs: roundForSnapshot(state.player.charge.thresholdMs),
        progress: roundForSnapshot(Math.min(1, state.player.charge.heldMs / state.player.charge.thresholdMs)),
        overholdProgress: roundForSnapshot(state.player.charge.overholdLimitMs <= 0
          ? 0
          : Math.max(0, Math.min(1, (
            state.player.charge.heldMs - state.player.charge.thresholdMs
          ) / state.player.charge.overholdLimitMs))),
        directionX: roundForSnapshot(state.player.charge.direction.x),
        directionZ: roundForSnapshot(state.player.charge.direction.z),
      },
      ultimateEnergy: roundForSnapshot(state.player.ultimateEnergy),
      predatorDriveRemainingMs: roundForSnapshot(Math.max(
        0,
        (state.player.predatorDriveExpiresAtMs ?? state.elapsedMs) - state.elapsedMs,
      )),
      killMomentumStacks: state.player.killMomentumStacks,
      armoredEnemies: state.enemies
        .filter((enemy) => enemy.armorParts.length > 0)
        .map((enemy) => ({
          id: enemy.id,
          armorParts: enemy.armorParts.map((part) => ({ id: part.id, intact: part.intact })),
          staggerMs: roundForSnapshot(enemy.staggerRemainingMs),
        })),
      ultimate: state.player.ultimatePlanning !== null ? {
        phase: "planning",
        elapsedMs: roundForSnapshot(state.player.ultimatePlanning.elapsedMs),
        durationMs: roundForSnapshot(state.player.ultimatePlanning.durationMs),
        requiredPointCount: state.player.ultimatePlanning.requiredPointCount,
        points: state.player.ultimatePlanning.points.map(copyPoint),
        segmentIndex: 0,
        killCount: 0,
      } : state.player.ultimateExecution !== null ? {
        phase: "executing",
        elapsedMs: 0,
        durationMs: 0,
        requiredPointCount: state.player.ultimateExecution.points.length,
        points: state.player.ultimateExecution.points.map(copyPoint),
        segmentIndex: state.player.ultimateExecution.segmentIndex,
        killCount: state.player.ultimateExecution.killCount,
      } : null,
      scheduledSlashes: state.combat.scheduledSlashes.map((slash) => ({
        id: slash.id,
        executeAtMs: roundForSnapshot(slash.executeAtMs),
        attackId: slash.attackId,
      })),
      storedPath: state.combat.storedPath === null ? null : {
        id: state.combat.storedPath.id,
        abilityId: state.combat.storedPath.abilityId,
        remainingMs: roundForSnapshot(state.combat.storedPath.remainingMs),
        segmentCount: state.combat.storedPath.segments.length,
      },
      gravityPulls: state.combat.gravityPulls.map((pull) => ({
        enemyId: pull.enemyId,
        remainingMs: roundForSnapshot(Math.max(0, pull.durationMs - pull.elapsedMs)),
      })),
      enemyTactics: state.enemies
        .filter((enemy) => enemy.alive && enemy.tactical !== undefined)
        .map((enemy) => ({
          enemyId: enemy.id,
          attackProfileId: enemy.tactical!.attackProfileId,
          phase: enemy.tactical!.attackPhase,
          remainingMs: roundForSnapshot(Math.max(0, enemy.tactical!.phaseDurationMs - enemy.tactical!.phaseElapsedMs)),
          sequence: enemy.tactical!.attackSequence,
          target: enemy.tactical!.lockedTarget ? copyPoint(enemy.tactical!.lockedTarget) : null,
          comboStep: enemy.tactical!.comboStep,
          nextTelegraphMultiplier: roundForSnapshot(enemy.tactical!.nextTelegraphMultiplier),
        })),
    },
    campaign: campaign === null || allocation === null ? null : {
      phase: campaign.phase,
      actIndex: campaign.routeProgress.actIndex,
      layerIndex: campaign.routeProgress.layerIndex,
      currentNodeId: campaign.routeProgress.currentNodeId,
      provisionalRouteNodeId: campaign.provisionalRouteNodeId,
      availableNodes: campaignAvailableRouteNodes(state).map((node) => ({
        id: node.id,
        kind: node.kind,
        reward: node.reward,
      })),
      completedNodeIds: [...campaign.routeProgress.completedNodeIds],
      skillPoints: {
        earned: allocation.totalEarnedPoints,
        spent: allocation.spentPoints,
        unspent: allocation.unspentPoints,
      },
      committedSkillIds: [...allocation.committedSkillIds],
      draftAddedSkillIds: [...allocation.draftAddedSkillIds],
      draftRemovedSkillIds: [...allocation.draftRemovedSkillIds],
      activeEventDefinitionId: campaign.activeEventDefinitionId,
      eventHistoryCount: campaign.eventHistory.length,
      resources: {
        nextCombatEnergy: state.run.acquiredResources["next-combat-energy"] ?? 0,
        rerouteTokens: state.run.acquiredResources["reroute-token"] ?? 0,
        intel: state.run.acquiredResources.intel ?? 0,
      },
      forge: {
        movesUsed: allocation.forgeMovesUsed,
        moveLimit: allocation.forgeMoveLimit,
        tokensSpentThisVisit: campaign.forgeTokensSpentThisVisit,
      },
      challenge: campaign.activeChallenge === null ? null : {
        definitionId: campaign.activeChallenge.definitionId,
        status: campaign.activeChallenge.status,
        elapsedMs: roundForSnapshot(campaign.activeChallenge.elapsedMs),
        projectileCuts: campaign.activeChallenge.projectileCuts,
        obstacleImpacts: campaign.activeChallenge.obstacleImpacts,
        maximumChargedArmorBreaks: Math.max(
          campaign.activeChallenge.maximumChargedArmorBreaks,
          campaign.activeChallenge.currentChargedArmorBreaks,
        ),
        ultimateExecuted: campaign.activeChallenge.ultimateExecuted,
        failureReason: campaign.activeChallenge.failureReason,
      },
      boss: campaign.activeBoss === null ? null : {
        definitionId: campaign.activeBoss.definitionId,
        entityId: campaign.activeBoss.entityId,
        phaseId: campaign.activeBoss.phaseId,
        phaseIndex: campaign.activeBoss.phaseIndex,
        actionPhase: campaign.activeBoss.actionPhase,
        actionRemainingMs: roundForSnapshot(Math.max(
          0,
          campaign.activeBoss.phaseDurationMs - campaign.activeBoss.phaseElapsedMs,
        )),
        lockedDirection: copyPoint(campaign.activeBoss.lockedDirection),
        lockedTarget: campaign.activeBoss.lockedTarget ? copyPoint(campaign.activeBoss.lockedTarget) : null,
        objectiveCurrent: campaign.activeBoss.objectiveCurrent,
        objectiveTarget: campaign.activeBoss.objectiveTarget,
        breakCount: campaign.activeBoss.breakCount,
        attackSequence: campaign.activeBoss.attackSequence,
        coreExposed: campaign.activeBoss.coreExposed,
        completed: campaign.activeBoss.completed,
        mechanic: campaign.activeBoss.mechanics.kind,
        details: bossDetailsForSnapshot(campaign.activeBoss),
      },
      encounter: campaign.encounterRuntime === null ? null : {
        id: campaign.encounterRuntime.encounterId,
        completed: campaign.encounterRuntime.completed,
        waves: campaign.encounterRuntime.waves.map((wave) => ({
          id: wave.id,
          status: wave.status,
          spawnedEnemyIds: [...wave.spawnedEntityIds],
        })),
      },
    },
  };
}

export function renderGameToText(state: GameState): string {
  return JSON.stringify(getGameSnapshot(state));
}

function selfCheck(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`Gameplay self-check failed: ${message}`);
  }
}

function tickUntil(
  state: GameState,
  predicate: (candidate: GameState) => boolean,
  maximumTicks = 240,
): void {
  for (let tick = 0; tick < maximumTicks && !predicate(state); tick += 1) {
    stepGame(state);
  }
  selfCheck(predicate(state), `condition not reached within ${maximumTicks} ticks`);
}

/**
 * Dependency-free smoke suite. It throws on failure and is safe to call from a
 * browser console, CI script, or future test runner.
 */
export function runGameplaySelfCheck(): GameplaySelfCheckResult {
  const checks: string[] = [];

  const multiKill = createGame(0);
  multiKill.enemies.forEach((enemy, index) => {
    enemy.alive = index < 3;
    enemy.state = index < 3 ? "active" : "dead";
    enemy.killedAtMs = index < 3 ? null : 0;
    enemy.speed = 0;
  });
  multiKill.combat.kills = multiKill.combat.totalEnemies - 3;
  multiKill.enemies[0]!.position = point(2, 0);
  multiKill.enemies[1]!.position = point(4, 0);
  multiKill.enemies[2]!.position = point(6, 0);
  queueDash(multiKill, point(9, 0));
  tickUntil(multiKill, (state) => state.player.dash === null);
  selfCheck(
    multiKill.enemies.slice(0, 3).every((enemy) => !enemy.alive) &&
      multiKill.combat.kills === multiKill.combat.totalEnemies,
    "one swept dash must kill every enemy on the line",
  );
  checks.push("multi-kill swept segment");

  const boundary = createGame(0);
  queueDash(boundary, point(1_000_000, -1_000_000));
  const boundaryDash = boundary.player.dash;
  selfCheck(boundaryDash !== null, "boundary dash should start");
  selfCheck(
    boundaryDash !== null &&
      boundaryDash.to.x === boundary.stage.arena.maxX - boundary.player.radius &&
      boundaryDash.to.z === boundary.stage.arena.minZ + boundary.player.radius,
    "an unlimited requested dash must clamp to the playable arena",
  );
  selfCheck(
    boundaryDash !== null &&
      boundaryDash.durationMs >= MIN_DASH_DURATION_MS &&
      boundaryDash.durationMs <= MAX_DASH_DURATION_MS,
    "dash duration must remain inside 35-110 ms",
  );
  checks.push("arena clamp and dash timing");

  const buffering = createGame(0);
  buffering.enemies.forEach((enemy) => {
    enemy.speed = 0;
  });
  queueDash(buffering, point(5, 1));
  stepGame(buffering, { dashTarget: point(-5, -1) });
  selfCheck(
    buffering.player.bufferedAbility?.target.x === -5,
    "input during dash should enter the buffer",
  );
  tickUntil(
    buffering,
    (state) => state.player.dash === null && state.stage.phase === "playing",
  );
  stepGame(buffering, { dashTarget: point(-7, 2) });
  selfCheck(
    buffering.player.bufferedAbility?.target.x === -7,
    "the last recovery input should replace an older buffered input",
  );
  tickUntil(
    buffering,
    (state) =>
      state.player.dash !== null && state.player.dash.to.x === -7,
  );
  selfCheck(
    buffering.player.bufferedAbility === null,
    "buffer should be consumed after the 120 ms recovery",
  );
  checks.push("recovery and last-input buffer");

  const contact = createGame(0);
  contact.enemies.forEach((enemy, index) => {
    enemy.alive = index === 0;
    enemy.state = index === 0 ? "active" : "dead";
    enemy.speed = 0;
  });
  contact.combat.kills = contact.combat.totalEnemies - 1;
  contact.enemies[0]!.position = point(
    contact.player.position.x + PLAYER_RADIUS + ENEMY_RADIUS - 0.01,
    contact.player.position.z,
  );
  stepGame(contact);
  selfCheck(
    contact.player.hp === 0 && contact.stage.phase === "dead",
    "enemy contact outside a dash must kill the 1 HP player",
  );
  checks.push("contact death");

  const serializable = createGame(2);
  const roundTrip = JSON.parse(JSON.stringify(serializable)) as GameState;
  selfCheck(
    roundTrip.combat.totalEnemies === 18 && roundTrip.player.hp === 1,
    "GameState must survive a JSON round trip",
  );
  checks.push("JSON serialization");

  return { ok: true, checks };
}

function configureLineKillScenario(enemyCount: number): GameState {
  const state = createGame(0);
  state.player.position = point(-9, 0);
  state.enemies = Array.from({ length: enemyCount }, (_, index) => ({
    id: `acceptance-line-${String(index + 1).padStart(2, "0")}`,
    definitionId: enemyDefinitions.get("enemy-grunt-v1").id,
    position: point(-7 + ((index + 1) / (enemyCount + 1)) * 14, 0),
    facing: point(1, 0),
    radius: ENEMY_RADIUS,
    speed: 0,
    alive: true,
    state: "active" as const,
    spawnedAtMs: 0,
    killedAtMs: null,
    armorParts: [],
    staggerRemainingMs: 0,
  }));
  state.combat.kills = 0;
  state.combat.totalEnemies = enemyCount;
  state.combat.scheduledSlashes = [];
  drainGameEvents(state);
  return state;
}

/**
 * Deterministic acceptance suite used by the browser validation harness. It
 * deliberately exercises public frame updates at 60/120/144 Hz instead of
 * calling private hit helpers, proving that fast swept dashes are frame-rate
 * independent for 1, 5 and 20 aligned enemies.
 */
export function runGameplayAcceptanceCheck(): GameplayAcceptanceCheckResult {
  const cases: GameplayAcceptanceCase[] = [];
  const frameRates = [60, 120, 144] as const;

  for (const enemyCount of [1, 5, 20] as const) {
    const killsByRate: number[] = [];
    for (const frameRate of frameRates) {
      const state = configureLineKillScenario(enemyCount);
      const request = queueDash(state, point(9, 0));
      selfCheck(request === "started", `${enemyCount}-enemy dash must start at ${frameRate} Hz`);
      for (let frame = 0; frame < frameRate && state.player.dash !== null; frame += 1) {
        advanceGame(state, 1000 / frameRate);
      }
      selfCheck(
        state.combat.kills === enemyCount && state.enemies.every((enemy) => !enemy.alive),
        `${enemyCount}-enemy swept dash must kill all targets at ${frameRate} Hz`,
      );
      killsByRate.push(state.combat.kills);
    }
    selfCheck(
      killsByRate.every((kills) => kills === enemyCount),
      `${enemyCount}-enemy result must be frame-rate independent`,
    );
    cases.push({
      name: `swept-line-${enemyCount}`,
      passed: true,
      details: { enemyCount, frameRates: [...frameRates], killsByRate },
    });
  }

  for (const requestedRecovery of [40, 80, 120, 180, 260]) {
    const state = createGame(0, { recoveryMs: requestedRecovery });
    const expected = Math.min(
      MAX_DASH_RECOVERY_MS,
      Math.max(MIN_DASH_RECOVERY_MS, requestedRecovery),
    );
    selfCheck(
      state.rules.recoveryMs === expected,
      `recovery ${requestedRecovery}ms must clamp to ${expected}ms`,
    );
    cases.push({
      name: `recovery-rule-${requestedRecovery}`,
      passed: true,
      details: { requestedRecovery, appliedRecovery: state.rules.recoveryMs },
    });
  }

  const vulnerableRecovery = createGame(0, { recoveryMs: 180 });
  vulnerableRecovery.enemies.forEach((enemy, index) => {
    enemy.alive = index === 0;
    enemy.state = index === 0 ? "active" : "dead";
    enemy.speed = 0;
  });
  vulnerableRecovery.combat.kills = vulnerableRecovery.combat.totalEnemies - 1;
  queueDash(vulnerableRecovery, point(7, 0));
  tickUntil(vulnerableRecovery, (state) => state.player.dash === null);
  selfCheck(
    vulnerableRecovery.player.recoveryRemainingMs > 0,
    "recovery vulnerability setup must still be inside recovery",
  );
  vulnerableRecovery.enemies[0]!.position = copyPoint(vulnerableRecovery.player.position);
  stepGame(vulnerableRecovery);
  selfCheck(
    vulnerableRecovery.stage.phase === "dead" && vulnerableRecovery.player.hp === 0,
    "player must be vulnerable during recovery",
  );
  cases.push({
    name: "recovery-is-vulnerable",
    passed: true,
    details: { recoveryMs: 180, playerDied: true },
  });

  const stageCounts = createStages().map((stage) => stage.enemyCount);
  selfCheck(
    stageCounts.join(",") === "8,12,18",
    "Phase 1 stages must contain 8, 12 and 18 enemies",
  );
  cases.push({
    name: "stage-counts",
    passed: true,
    details: { stageCounts },
  });

  const restart = createGame(1);
  const previousAttempt = restart.stage.attempt;
  restartStage(restart);
  selfCheck(
    restart.stage.index === 1
      && restart.stage.attempt === previousAttempt + 1
      && restart.stage.phase === "playing",
    "restart must preserve the stage and increment attempt",
  );
  cases.push({
    name: "restart-stage",
    passed: true,
    details: { stageIndex: restart.stage.index, attempt: restart.stage.attempt },
  });

  return {
    ok: true,
    fixedStepHz: Math.round(1000 / FIXED_STEP_MS),
    cases,
  };
}
