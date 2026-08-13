import {
  BOSS_DASH_DAMAGE,
  BOSS_MAXIMUM_HP,
  clampToSupportedArena,
  isSupported,
} from "./config";
import {
  BASIC_DASH_DISTANCE,
  CHARGED_DASH_DISTANCE,
  ULTIMATE_DASH_DISTANCE,
  firstPathIntersection,
  planDashPath,
  pointAlongPath,
} from "./path";
import {
  BOSS_HOVER_HEIGHT,
  ENEMY_HOVER_HEIGHT,
  FALL_DEFEAT_HEIGHT,
  PLAYER_HOVER_HEIGHT,
  advanceVerticalBody,
  launchBody,
  moveToward,
  steerToward,
} from "./physics";
import { encounterAt } from "./run";
import type { BossArchetype, EnemyArchetype } from "./run";
import {
  crossExecutionRadius,
  createRewardOffer,
  echoSlashWidthMultiplier,
  killMomentumReduction,
  selectRewardUpgrade,
  skillRank,
} from "./skills";
import type { CoreUpgradeId } from "./skills";
import {
  FIXED_STEP_MS,
  createInitialState,
  createPlayer,
  drainEvents,
  emit,
  nextEntityId,
} from "./state";
import type {
  BossPartState,
  BossState,
  DashKind,
  DashState,
  EnemyState,
  GameCommand,
  GameCommandResult,
  GameEvent,
  GameState,
  ObstacleState,
  PathSegmentState,
  ProjectileState,
} from "./state";
import type { Vec2 } from "./math";
import {
  EPSILON,
  add,
  clamp,
  distance,
  distanceSquaredToSegment,
  normalize,
  rotate,
  scale,
  stableHash32,
  subtract,
} from "./math";
import { CHARGE_THRESHOLD_MS } from "./public-constants";

export { createInitialState, drainEvents } from "./state";
export type { GameCommand, GameCommandResult, GameEvent, GameState } from "./state";

const MAX_REALTIME_DELTA_MS = 250;
const BASIC_DASH_SPEED = 58;
const CHARGED_DASH_SPEED = 76;
const ULTIMATE_DASH_SPEED = 96;
const BASIC_RECOVERY_MS = 310;
const CHARGED_RECOVERY_MS = 390;
const ULTIMATE_RECOVERY_MS = 520;
const CLEAR_DELAY_MS = 620;
const PLAYER_INVULNERABILITY_MS = 850;
const ECHO_DELAY_MS = 400;
const STORED_PATH_MS = 2_500;

export function createGame(seed = Math.floor(Math.random() * 0x7fffffff)): GameState {
  return createInitialState(seed);
}

export function dispatch(state: GameState, command: GameCommand): GameCommandResult {
  if (command.type === "aim") {
    if (!Number.isFinite(command.target.x) || !Number.isFinite(command.target.z)) return "ignored";
    state.player.aimTarget = { ...command.target };
    updatePlayerFacing(state);
    if (state.player.action === "charging") state.player.chargeTarget = { ...command.target };
    return "ignored";
  }
  if (command.type === "start-run") {
    if (state.phase !== "title") return "ignored";
    resetRunState(state);
    state.phase = "combat";
    emit(state, { type: "run-started", seed: state.run.seed });
    startEncounter(state, 0);
    return "run-started";
  }
  if (command.type === "restart-run") {
    const seed = state.run.seed;
    Object.assign(state, createInitialState(seed));
    state.phase = "combat";
    emit(state, { type: "run-started", seed });
    startEncounter(state, 0);
    return "run-restarted";
  }
  if (command.type === "return-title") {
    const seed = state.run.seed;
    Object.assign(state, createInitialState(seed));
    return "returned-to-title";
  }
  if (command.type === "select-upgrade") {
    return selectUpgrade(state, command.offerId, command.upgradeId);
  }
  if (state.phase !== "combat" || state.player.action === "dead") return "ignored";

  if (command.type === "begin-primary") {
    if (state.player.action !== "ready") return "ignored";
    state.player.aimTarget = { ...command.target };
    updatePlayerFacing(state);
    state.player.action = "charging";
    state.player.actionElapsedMs = 0;
    state.player.chargeStartedTick = state.tick;
    state.player.chargeTarget = { ...command.target };
    return "charge-started";
  }
  if (command.type === "release-primary") {
    if (state.player.action !== "charging") return "ignored";
    state.player.aimTarget = { ...command.target };
    updatePlayerFacing(state);
    const charged = state.player.actionElapsedMs >= CHARGE_THRESHOLD_MS;
    startDash(state, charged ? "charged" : "basic", command.target);
    return "dash-started";
  }
  if (command.type === "cancel-primary") {
    if (state.player.action !== "charging") return "ignored";
    setPlayerReady(state);
    return "charge-cancelled";
  }
  if (command.type === "start-ultimate") {
    if (state.player.action !== "ready" || state.player.ultimateEnergy < 100) return "ignored";
    state.player.action = "ultimate-planning";
    state.player.actionElapsedMs = 0;
    state.player.ultimatePlanningMs = 3_500;
    state.player.ultimatePoints = [];
    return "ultimate-started";
  }
  if (command.type === "add-ultimate-point") {
    if (state.player.action !== "ultimate-planning" || state.player.ultimatePoints.length >= 3) return "ignored";
    state.player.ultimatePoints.push({ ...command.target });
    if (state.player.ultimatePoints.length < 3) return "ultimate-point-added";
    startUltimateDash(state);
    return "ultimate-executing";
  }
  if (command.type === "cancel-ultimate") {
    if (state.player.action !== "ultimate-planning") return "ignored";
    setPlayerReady(state);
    state.player.ultimatePoints = [];
    return "ultimate-cancelled";
  }
  return "ignored";
}

export function advance(state: GameState, realDeltaMs: number): GameEvent[] {
  const safeDelta = Number.isFinite(realDeltaMs)
    ? Math.min(MAX_REALTIME_DELTA_MS, Math.max(0, realDeltaMs))
    : 0;
  state.accumulatorMs += safeDelta;
  while (state.accumulatorMs + EPSILON >= FIXED_STEP_MS) {
    step(state, FIXED_STEP_MS);
    state.accumulatorMs -= FIXED_STEP_MS;
  }
  return drainEvents(state);
}

export function step(state: GameState, deltaMs = FIXED_STEP_MS): void {
  const safeDeltaMs = Math.max(0, deltaMs);
  const deltaSeconds = safeDeltaMs / 1_000;
  state.tick += 1;
  state.elapsedMs += safeDeltaMs;
  updatePlayerFacing(state);
  advancePlayer(state, safeDeltaMs, deltaSeconds);
  if (state.phase === "combat") {
    state.run.encounterElapsedMs += safeDeltaMs;
    advancePendingSpawns(state);
    advanceEnemies(state, safeDeltaMs, deltaSeconds);
    advanceBoss(state, safeDeltaMs, deltaSeconds);
    advanceProjectiles(state, safeDeltaMs, deltaSeconds);
    advanceScheduledSlashes(state, safeDeltaMs);
    advanceStoredPath(state, safeDeltaMs);
    resolvePlayerContact(state);
    updateCombatCompletion(state, safeDeltaMs);
  }
}

function resetRunState(state: GameState): void {
  const fresh = createInitialState(state.run.seed);
  Object.assign(state, fresh);
}

function startEncounter(state: GameState, index: number): void {
  const definition = encounterAt(index);
  state.phase = "combat";
  state.run.encounterIndex = index;
  state.run.encounterElapsedMs = 0;
  state.run.clearElapsedMs = 0;
  state.run.activeOffer = null;
  state.player = createPlayerForEncounter(state.player);
  state.enemies = [];
  state.projectiles = [];
  state.boss = null;
  state.pendingSpawns = definition.enemies.map((spawn) => ({
    archetype: spawn.archetype,
    position: { ...spawn.position },
    atMs: spawn.delayMs ?? 0,
    spawned: false,
  }));
  state.obstacles = definition.obstacles.map((spawn, obstacleIndex): ObstacleState => ({
    id: `${definition.id}-obstacle-${obstacleIndex + 1}`,
    archetype: spawn.archetype,
    position: { ...spawn.position },
    rotationRadians: spawn.rotationRadians ?? 0,
    pulsePhase: stableHash32(`${state.run.seed}|${definition.id}|obstacle|${obstacleIndex}`) / 0xffffffff * Math.PI * 2,
  }));
  state.scheduledSlashes = [];
  state.storedPath = null;
  if (definition.boss) state.boss = createBoss(state, definition.boss);
  emit(state, { type: "encounter-started", encounter: definition });
}

function createPlayerForEncounter(previous: GameState["player"]): GameState["player"] {
  const player = createPlayer();
  player.hp = previous.hp;
  player.maximumHp = previous.maximumHp;
  player.ultimateEnergy = previous.ultimateEnergy;
  player.aimTarget = { ...previous.aimTarget };
  return player;
}

function advancePendingSpawns(state: GameState): void {
  for (const spawn of state.pendingSpawns) {
    if (spawn.spawned || spawn.atMs > state.run.encounterElapsedMs + EPSILON) continue;
    spawn.spawned = true;
    spawnEnemy(state, spawn.archetype, spawn.position, 0);
  }
}

function spawnEnemy(
  state: GameState,
  archetype: EnemyArchetype,
  position: Vec2,
  splitGeneration: 0 | 1,
): EnemyState {
  const shard = archetype === "splitter-shard";
  const enemy: EnemyState = {
    id: nextEntityId(state, archetype),
    archetype,
    position: { ...position },
    facing: normalize(subtract(state.player.position, position)),
    radius: shard ? 0.56 : archetype === "slammer" ? 1.18 : archetype === "splitter" ? 1.05 : 0.82,
    alive: true,
    phase: "idle",
    phaseElapsedMs: 0,
    phaseDurationMs: initialEnemyDelay(archetype, state, position),
    attackSequence: 0,
    lockedTarget: null,
    angularVelocity: archetype === "spinner" ? 2.7 : 0.45,
    rotationRadians: stableHash32(`${state.run.seed}|${state.run.encounterIndex}|${position.x}|${position.z}`) / 0xffffffff * Math.PI * 2,
    splitGeneration,
    deathElapsedMs: 0,
    height: shard ? 0.45 : ENEMY_HOVER_HEIGHT,
    verticalVelocity: 0,
    gravity: -24,
    supported: true,
    grounded: false,
  };
  state.enemies.push(enemy);
  return enemy;
}

function initialEnemyDelay(archetype: EnemyArchetype, state: GameState, position: Vec2): number {
  return 320 + stableHash32(`${state.run.seed}|${state.run.encounterIndex}|${archetype}|${position.x}|${position.z}`) % 520;
}

function advancePlayer(state: GameState, deltaMs: number, deltaSeconds: number): void {
  const player = state.player;
  player.invulnerabilityMs = Math.max(0, player.invulnerabilityMs - deltaMs);
  player.actionElapsedMs += deltaMs;
  if (player.action === "charging") {
    player.chargeTarget = { ...player.aimTarget };
  } else if (player.action === "ultimate-planning") {
    player.ultimatePlanningMs = Math.max(0, player.ultimatePlanningMs - deltaMs);
    if (player.ultimatePlanningMs <= 0) {
      player.ultimatePoints = [];
      setPlayerReady(state);
    }
  } else if (player.action === "dashing" && player.dash) {
    advanceDash(state, deltaMs);
  } else if (player.action === "recovering") {
    player.recoveryMs = Math.max(0, player.recoveryMs - deltaMs);
    if (player.recoveryMs <= 0) setPlayerReady(state);
  }

  advanceVerticalBody(player, player.position, deltaSeconds, {
    targetHeight: PLAYER_HOVER_HEIGHT,
    spring: 52,
    damping: 11.5,
  });
  if (player.height <= FALL_DEFEAT_HEIGHT && player.action !== "dead") {
    player.hp = 0;
    player.action = "dead";
    state.phase = "defeat";
    emit(state, { type: "player-defeated" });
  }
}

function startDash(state: GameState, kind: "basic" | "charged", target: Vec2): void {
  const maximumDistance = kind === "charged" ? CHARGED_DASH_DISTANCE : BASIC_DASH_DISTANCE;
  const path = planDashPath(
    state.player.position,
    target,
    maximumDistance,
    state.player.radius,
    state.run.build,
    state.obstacles,
  );
  beginDash(state, kind, path.segments, path.hitRadius, kind === "charged" ? BOSS_DASH_DAMAGE.charged : BOSS_DASH_DAMAGE.basic);
}

function startUltimateDash(state: GameState): void {
  const segments: PathSegmentState[] = [];
  let origin = { ...state.player.position };
  for (const target of state.player.ultimatePoints) {
    const planned = planDashPath(
      origin,
      target,
      ULTIMATE_DASH_DISTANCE,
      state.player.radius,
      state.run.build,
      state.obstacles,
    );
    segments.push(...planned.segments);
    origin = { ...(planned.segments.at(-1)?.to ?? origin) };
  }
  state.player.ultimateEnergy = 0;
  state.player.ultimatePoints = [];
  beginDash(
    state,
    "ultimate",
    segments,
    1.15 * (skillRank(state.run.build, "wide-slash") > 0 ? 1.12 : 1),
    BOSS_DASH_DAMAGE.ultimate,
  );
}

function beginDash(
  state: GameState,
  kind: "basic" | "charged" | "ultimate",
  segments: readonly PathSegmentState[],
  hitRadius: number,
  damage: number,
): void {
  const totalLength = pathLength(segments);
  const speed = kind === "charged" ? CHARGED_DASH_SPEED : kind === "ultimate" ? ULTIMATE_DASH_SPEED : BASIC_DASH_SPEED;
  const pendingCrossPosition = skillRank(state.run.build, "cross-execution") > 0 && state.storedPath
    ? firstPathIntersection(segments, state.storedPath.segments)
    : null;
  if (pendingCrossPosition) state.storedPath = null;
  const dash: DashState = {
    id: ++state.dashSequence,
    kind,
    segments: segments.map(copySegment),
    hitRadius,
    damage,
    totalDurationMs: Math.max(90, totalLength / speed * 1_000),
    elapsedMs: 0,
    resolvedEnemyIds: [],
    bossContactResolved: false,
    killCount: 0,
    pendingCross: pendingCrossPosition
      ? { position: pendingCrossPosition, radius: crossExecutionRadius(state.run.build), triggered: false }
      : null,
  };
  state.player.dash = dash;
  state.player.action = "dashing";
  state.player.actionElapsedMs = 0;
  state.player.chargeStartedTick = null;
  state.player.chargeTarget = null;
  emit(state, { type: "dash-started", dash: structuredClone(dash) });
  for (const segment of dash.segments) {
    if (segment.reflectionPoint && segment.reflectionNormal) {
      emit(state, { type: "dash-reflected", position: { ...segment.reflectionPoint }, normal: { ...segment.reflectionNormal } });
    }
  }
}

function advanceDash(state: GameState, deltaMs: number): void {
  const dash = state.player.dash;
  if (!dash) return;
  const totalLength = pathLength(dash.segments);
  const previousDistance = totalLength * clamp(dash.elapsedMs / dash.totalDurationMs, 0, 1);
  dash.elapsedMs = Math.min(dash.totalDurationMs, dash.elapsedMs + deltaMs);
  const currentDistance = totalLength * clamp(dash.elapsedMs / dash.totalDurationMs, 0, 1);
  const previousPosition = pointAlongPath(dash.segments, previousDistance);
  const currentPosition = pointAlongPath(dash.segments, currentDistance);
  state.player.position = currentPosition;
  resolveDashStrip(state, dash, previousPosition, currentPosition);
  if (dash.pendingCross && !dash.pendingCross.triggered && distanceSquaredToSegment(
    dash.pendingCross.position,
    previousPosition,
    currentPosition,
  ) <= Math.max(0.08, dash.hitRadius * 0.12) ** 2) {
    dash.pendingCross.triggered = true;
    resolveCross(state, dash.pendingCross.position, dash.pendingCross.radius);
  }
  if (dash.elapsedMs + EPSILON < dash.totalDurationMs) return;

  if (skillRank(state.run.build, "echo-slash") > 0 && dash.kind !== "echo") {
    state.scheduledSlashes.push({
      id: `echo-${dash.id}`,
      executeAtMs: state.elapsedMs + ECHO_DELAY_MS,
      segments: dash.segments.map(copySegment),
      hitRadius: dash.hitRadius * echoSlashWidthMultiplier(state.run.build),
      kind: "echo",
    });
  }
  if (skillRank(state.run.build, "cross-execution") > 0 && !dash.pendingCross?.triggered) {
    state.storedPath = { segments: dash.segments.map(copySegment), remainingMs: STORED_PATH_MS };
  }
  const baseRecovery = dash.kind === "charged"
    ? CHARGED_RECOVERY_MS
    : dash.kind === "ultimate"
      ? ULTIMATE_RECOVERY_MS
      : BASIC_RECOVERY_MS;
  const recovery = baseRecovery * (1 - killMomentumReduction(state.run.build, dash.killCount));
  state.player.dash = null;
  state.player.action = "recovering";
  state.player.actionElapsedMs = 0;
  state.player.recoveryMs = recovery;
}

function resolveDashStrip(state: GameState, dash: DashState, from: Vec2, to: Vec2): void {
  for (const enemy of state.enemies) {
    if (!enemy.alive || dash.resolvedEnemyIds.includes(enemy.id)) continue;
    if (distanceSquaredToSegment(enemy.position, from, to) > (enemy.radius + dash.hitRadius) ** 2) continue;
    dash.resolvedEnemyIds.push(enemy.id);
    const enemyCountBeforeKill = state.enemies.length;
    killEnemy(state, enemy, dash.kind);
    // A splitter's children belong to the result of this hit, not new targets
    // for the same continuous dash. They become hittable on the next attack.
    for (const spawned of state.enemies.slice(enemyCountBeforeKill)) {
      dash.resolvedEnemyIds.push(spawned.id);
    }
    dash.killCount += 1;
  }
  for (const projectile of state.projectiles) {
    if (!projectile.alive) continue;
    if (distanceSquaredToSegment(projectile.position, from, to) > (projectile.radius + dash.hitRadius) ** 2) continue;
    projectile.alive = false;
    emit(state, { type: "projectile-cut", projectileId: projectile.id, position: { ...projectile.position } });
  }
  const boss = state.boss;
  if (boss && boss.actionPhase !== "defeated" && !dash.bossContactResolved
    && distanceSquaredToSegment(boss.position, from, to) <= (boss.radius + dash.hitRadius) ** 2) {
    dash.bossContactResolved = true;
    resolveBossContact(state, boss, dash);
  }
}

function killEnemy(state: GameState, enemy: EnemyState, kind: DashKind): void {
  if (!enemy.alive) return;
  enemy.alive = false;
  enemy.phase = "dead";
  enemy.deathElapsedMs = 0;
  enemy.supported = false;
  state.run.totalKills += 1;
  state.player.ultimateEnergy = Math.min(100, state.player.ultimateEnergy + (enemy.archetype === "splitter-shard" ? 5 : 10));
  emit(state, { type: "enemy-killed", enemyId: enemy.id, position: { ...enemy.position }, kind });
  if (enemy.archetype === "splitter" && enemy.splitGeneration === 0) {
    const tangent = rotate(enemy.facing, Math.PI * 0.5);
    const first = spawnEnemy(state, "splitter-shard", add(enemy.position, scale(tangent, 1.25)), 1);
    const second = spawnEnemy(state, "splitter-shard", add(enemy.position, scale(tangent, -1.25)), 1);
    first.verticalVelocity = 4.5;
    second.verticalVelocity = 4.5;
    emit(state, { type: "enemy-split", enemyId: enemy.id, shardIds: [first.id, second.id] });
  }
}

function resolveCross(state: GameState, position: Vec2, radius: number): void {
  emit(state, { type: "cross-triggered", position: { ...position }, radius });
  for (const enemy of state.enemies) {
    if (enemy.alive && distance(enemy.position, position) <= enemy.radius + radius) killEnemy(state, enemy, "basic");
  }
  if (skillRank(state.run.build, "cross-execution") >= 3) {
    for (const projectile of state.projectiles) {
      if (projectile.alive && distance(projectile.position, position) <= projectile.radius + radius) {
        projectile.alive = false;
        emit(state, { type: "projectile-cut", projectileId: projectile.id, position: { ...projectile.position } });
      }
    }
  }
}

function advanceStoredPath(state: GameState, deltaMs: number): void {
  if (!state.storedPath) return;
  state.storedPath.remainingMs = Math.max(0, state.storedPath.remainingMs - deltaMs);
  if (state.storedPath.remainingMs <= 0) state.storedPath = null;
}

function advanceScheduledSlashes(state: GameState, _deltaMs: number): void {
  const due = state.scheduledSlashes.filter((slash) => slash.executeAtMs <= state.elapsedMs + EPSILON);
  state.scheduledSlashes = state.scheduledSlashes.filter((slash) => slash.executeAtMs > state.elapsedMs + EPSILON);
  for (const slash of due) {
    emit(state, { type: "echo-triggered", segments: slash.segments.map(copySegment), hitRadius: slash.hitRadius });
    for (const segment of slash.segments) {
      for (const enemy of state.enemies) {
        if (enemy.alive && distanceSquaredToSegment(enemy.position, segment.from, segment.to) <= (enemy.radius + slash.hitRadius) ** 2) {
          killEnemy(state, enemy, "echo");
        }
      }
      for (const projectile of state.projectiles) {
        if (projectile.alive && distanceSquaredToSegment(projectile.position, segment.from, segment.to) <= (projectile.radius + slash.hitRadius) ** 2) {
          projectile.alive = false;
          emit(state, { type: "projectile-cut", projectileId: projectile.id, position: { ...projectile.position } });
        }
      }
    }
  }
}

function advanceEnemies(state: GameState, deltaMs: number, deltaSeconds: number): void {
  for (const enemy of state.enemies) {
    enemy.rotationRadians += enemy.angularVelocity * deltaSeconds;
    if (!enemy.alive) {
      enemy.deathElapsedMs += deltaMs;
      advanceVerticalBody(enemy, enemy.position, deltaSeconds, { targetHeight: 0, supportEnabled: false });
      continue;
    }
    advanceVerticalBody(enemy, enemy.position, deltaSeconds, {
      targetHeight: enemy.archetype === "splitter-shard" ? 0.46 : ENEMY_HOVER_HEIGHT,
      supportEnabled: enemy.phase !== "airborne",
    });
    if (enemy.height <= FALL_DEFEAT_HEIGHT) {
      killEnemy(state, enemy, "basic");
      continue;
    }
    enemy.phaseElapsedMs += deltaMs;
    if (enemy.phase === "idle") {
      advanceEnemyIdle(state, enemy, deltaSeconds);
      if (enemy.phaseElapsedMs >= enemy.phaseDurationMs) beginEnemyTelegraph(state, enemy);
    } else if (enemy.phase === "telegraph") {
      if (enemy.lockedTarget) enemy.facing = steerToward(enemy.facing, normalize(subtract(enemy.lockedTarget, enemy.position)), deltaSeconds * 4.8);
      if (enemy.phaseElapsedMs >= enemy.phaseDurationMs) beginEnemyAttack(state, enemy);
    } else if (enemy.phase === "active") {
      advanceEnemyAttack(state, enemy, deltaSeconds);
      if (enemy.phaseElapsedMs >= enemy.phaseDurationMs) setEnemyPhase(enemy, "recovery", enemyRecoveryDuration(enemy.archetype));
    } else if (enemy.phase === "airborne") {
      advanceSlammerAirborne(state, enemy, deltaSeconds);
    } else if (enemy.phase === "recovery" && enemy.phaseElapsedMs >= enemy.phaseDurationMs) {
      setEnemyPhase(enemy, "idle", enemyCooldown(enemy.archetype, enemy.attackSequence));
    }
  }
}

function advanceEnemyIdle(state: GameState, enemy: EnemyState, deltaSeconds: number): void {
  const player = state.player.position;
  if (enemy.archetype === "chaser" || enemy.archetype === "splitter-shard") {
    const motion = moveToward(enemy.position, player, enemy.archetype === "splitter-shard" ? 5.3 : 3.4, deltaSeconds);
    enemy.position = motion.position;
    enemy.facing = steerToward(enemy.facing, motion.facing, deltaSeconds * 4);
  } else if (enemy.archetype === "splitter") {
    const motion = moveToward(enemy.position, player, 1.9, deltaSeconds);
    enemy.position = motion.position;
    enemy.facing = steerToward(enemy.facing, motion.facing, deltaSeconds * 3);
  } else if (enemy.archetype === "shooter") {
    const desiredDistance = 14;
    const playerDistance = distance(enemy.position, player);
    const radial = normalize(subtract(enemy.position, player));
    const tangent = rotate(radial, enemy.attackSequence % 2 === 0 ? Math.PI * 0.5 : -Math.PI * 0.5);
    const desired = playerDistance < desiredDistance - 2
      ? add(enemy.position, scale(radial, 5))
      : add(enemy.position, scale(tangent, 4));
    const motion = moveToward(enemy.position, desired, 2.6, deltaSeconds);
    enemy.position = motion.position;
    enemy.facing = steerToward(enemy.facing, normalize(subtract(player, enemy.position)), deltaSeconds * 5);
  } else if (enemy.archetype === "spinner") {
    enemy.angularVelocity = 2.8;
  }
}

function beginEnemyTelegraph(state: GameState, enemy: EnemyState): void {
  enemy.lockedTarget = { ...state.player.position };
  const duration = enemy.archetype === "shooter" ? 760
    : enemy.archetype === "spinner" ? 900
      : enemy.archetype === "slammer" ? 820
        : 560;
  setEnemyPhase(enemy, "telegraph", duration);
}

function beginEnemyAttack(state: GameState, enemy: EnemyState): void {
  enemy.attackSequence += 1;
  if (enemy.archetype === "slammer") {
    launchBody(enemy, 13.5);
    setEnemyPhase(enemy, "airborne", 2_200);
    return;
  }
  if (enemy.archetype === "shooter") {
    spawnProjectile(state, enemy.id, "pulse", enemy.position, normalize(subtract(enemy.lockedTarget ?? state.player.position, enemy.position)), 11.5, 0.34, 4_500);
  } else if (enemy.archetype === "spinner") {
    for (let index = 0; index < 8; index += 1) {
      spawnProjectile(state, enemy.id, "radial", enemy.position, rotate({ x: 0, z: 1 }, index * Math.PI * 0.25 + enemy.rotationRadians), 8.4, 0.3, 4_200);
    }
  }
  setEnemyPhase(enemy, "active", enemyActiveDuration(enemy.archetype));
}

function advanceEnemyAttack(state: GameState, enemy: EnemyState, deltaSeconds: number): void {
  if (enemy.archetype === "chaser" || enemy.archetype === "splitter" || enemy.archetype === "splitter-shard") {
    const target = enemy.lockedTarget ?? state.player.position;
    const speed = enemy.archetype === "splitter-shard" ? 15 : enemy.archetype === "splitter" ? 10 : 18;
    const motion = moveToward(enemy.position, target, speed, deltaSeconds);
    enemy.position = motion.position;
    enemy.facing = motion.facing;
  } else if (enemy.archetype === "spinner") {
    enemy.angularVelocity = 8.5;
  }
}

function advanceSlammerAirborne(state: GameState, enemy: EnemyState, deltaSeconds: number): void {
  const target = enemy.lockedTarget ?? state.player.position;
  const motion = moveToward(enemy.position, target, 8.5, deltaSeconds);
  enemy.position = motion.position;
  enemy.facing = motion.facing;
  if (enemy.verticalVelocity < 0 && enemy.height <= ENEMY_HOVER_HEIGHT + 0.08) {
    enemy.height = ENEMY_HOVER_HEIGHT;
    enemy.verticalVelocity = 0;
    enemy.supported = true;
    const radius = 4.2;
    emit(state, { type: "slam-impact", sourceId: enemy.id, position: { ...enemy.position }, radius });
    if (distance(state.player.position, enemy.position) <= radius + state.player.radius) damagePlayer(state, enemy.id);
    setEnemyPhase(enemy, "recovery", 950);
  }
}

function resolvePlayerContact(state: GameState): void {
  if (state.player.invulnerabilityMs > 0 || state.player.action === "dashing" || state.player.action === "dead") return;
  for (const enemy of state.enemies) {
    if (!enemy.alive || enemy.phase !== "active") continue;
    if (distance(enemy.position, state.player.position) <= enemy.radius + state.player.radius) {
      damagePlayer(state, enemy.id);
      break;
    }
  }
  const boss = state.boss;
  if (boss && boss.actionPhase === "active" && distance(boss.position, state.player.position) <= boss.radius + state.player.radius) {
    damagePlayer(state, boss.id);
  }
}

function spawnProjectile(
  state: GameState,
  sourceId: string,
  kind: ProjectileState["kind"],
  position: Vec2,
  direction: Vec2,
  speed: number,
  radius: number,
  lifetimeMs: number,
): void {
  state.projectiles.push({
    id: nextEntityId(state, "projectile"),
    sourceId,
    kind,
    position: { ...position },
    velocity: scale(normalize(direction), speed),
    radius,
    ageMs: 0,
    lifetimeMs,
    alive: true,
    height: kind === "boss" ? 1.1 : 0.78,
    verticalVelocity: 0,
    gravity: 0,
    supported: true,
    grounded: false,
  });
}

function advanceProjectiles(state: GameState, deltaMs: number, deltaSeconds: number): void {
  for (const projectile of state.projectiles) {
    if (!projectile.alive) continue;
    projectile.ageMs += deltaMs;
    projectile.position = add(projectile.position, scale(projectile.velocity, deltaSeconds));
    if (projectile.ageMs >= projectile.lifetimeMs || !isSupported(projectile.position, -3)) {
      projectile.alive = false;
      continue;
    }
    if (state.player.action !== "dashing" && state.player.invulnerabilityMs <= 0
      && distance(projectile.position, state.player.position) <= projectile.radius + state.player.radius) {
      projectile.alive = false;
      damagePlayer(state, projectile.sourceId);
    }
  }
  state.projectiles = state.projectiles.filter((projectile) => projectile.alive);
}

function damagePlayer(state: GameState, sourceId: string): void {
  const player = state.player;
  if (player.invulnerabilityMs > 0 || player.action === "dashing" || player.action === "dead") return;
  player.hp = Math.max(0, player.hp - 1);
  player.invulnerabilityMs = PLAYER_INVULNERABILITY_MS;
  emit(state, { type: "player-hit", sourceId, hp: player.hp });
  if (player.hp <= 0) {
    player.action = "dead";
    state.phase = "defeat";
    emit(state, { type: "player-defeated" });
  }
}

function createBoss(state: GameState, archetype: BossArchetype): BossState {
  const maximumHp = BOSS_MAXIMUM_HP[archetype];
  return {
    id: nextEntityId(state, archetype),
    archetype,
    position: archetype === "prism-hound" ? { x: 0, z: -12 } : { x: 0, z: -8 },
    facing: { x: 0, z: 1 },
    radius: archetype === "cube-fortress" ? 2.7 : archetype === "singularity-crown" ? 2.9 : 2.25,
    currentHp: maximumHp,
    maximumHp,
    vulnerable: false,
    actionPhase: "telegraph",
    actionElapsedMs: 0,
    actionDurationMs: bossTelegraphDuration(archetype),
    attackSequence: 0,
    phaseIndex: 0,
    lockedTarget: { ...state.player.position },
    parts: createBossParts(archetype),
    orbitRadians: 0,
    hitFlashMs: 0,
    shieldFlashMs: 0,
    defeatedElapsedMs: 0,
    height: BOSS_HOVER_HEIGHT,
    verticalVelocity: 0,
    gravity: -24,
    supported: true,
    grounded: false,
  };
}

function createBossParts(archetype: BossArchetype): BossPartState[] {
  const count = archetype === "cube-fortress" ? 4 : archetype === "singularity-crown" ? 6 : 2;
  return Array.from({ length: count }, (_, index) => ({
    id: `${archetype}-part-${index + 1}`,
    role: archetype === "cube-fortress" ? "armor" : archetype === "singularity-crown" ? "ring" : "weapon",
    localPosition: rotate({ x: archetype === "cube-fortress" ? 3.3 : 2.8, z: 0 }, index * Math.PI * 2 / count),
    alive: true,
    rotationRadians: index * Math.PI * 2 / count,
    height: archetype === "cube-fortress" ? 0.8 : 1,
    verticalVelocity: 0,
    gravity: -24,
    supported: true,
    grounded: false,
  }));
}

function advanceBoss(state: GameState, deltaMs: number, deltaSeconds: number): void {
  const boss = state.boss;
  if (!boss) return;
  boss.hitFlashMs = Math.max(0, boss.hitFlashMs - deltaMs);
  boss.shieldFlashMs = Math.max(0, boss.shieldFlashMs - deltaMs);
  boss.orbitRadians += deltaSeconds * (boss.archetype === "cube-fortress" ? 0.75 : 1.15);
  for (const part of boss.parts) part.rotationRadians += deltaSeconds * (part.alive ? 1.7 : 0.25);
  if (boss.actionPhase === "defeated") {
    boss.defeatedElapsedMs += deltaMs;
    advanceVerticalBody(boss, boss.position, deltaSeconds, { targetHeight: 0, supportEnabled: false });
    return;
  }
  advanceVerticalBody(boss, boss.position, deltaSeconds, {
    targetHeight: BOSS_HOVER_HEIGHT,
    supportEnabled: !(boss.archetype === "singularity-crown" && boss.actionPhase === "active" && boss.attackSequence % 3 === 2),
  });
  boss.actionElapsedMs += deltaMs;
  if (boss.actionPhase === "telegraph") {
    boss.facing = steerToward(boss.facing, normalize(subtract(boss.lockedTarget ?? state.player.position, boss.position)), deltaSeconds * 3.6);
    if (boss.actionElapsedMs >= boss.actionDurationMs) beginBossActive(state, boss);
  } else if (boss.actionPhase === "active") {
    advanceBossActive(state, boss, deltaMs, deltaSeconds);
    if (boss.actionElapsedMs >= boss.actionDurationMs) setBossAction(state, boss, "recovery", bossRecoveryDuration(boss.archetype));
  } else if (boss.actionPhase === "recovery") {
    if (boss.archetype === "cube-fortress" && boss.parts.every((part) => !part.alive)) {
      setBossAction(state, boss, "vulnerable", 3_200);
    } else if (boss.actionElapsedMs >= boss.actionDurationMs) {
      setBossAction(state, boss, "vulnerable", bossVulnerabilityDuration(boss.archetype));
    }
  } else if (boss.actionPhase === "vulnerable" && boss.actionElapsedMs >= boss.actionDurationMs) {
    boss.phaseIndex = Math.min(2, Math.floor((1 - boss.currentHp / boss.maximumHp) * 3));
    if (boss.archetype === "cube-fortress" && boss.currentHp > 0) rebuildCubeArmor(boss);
    boss.attackSequence += 1;
    boss.lockedTarget = { ...state.player.position };
    setBossAction(state, boss, "telegraph", bossTelegraphDuration(boss.archetype));
  }
}

function beginBossActive(state: GameState, boss: BossState): void {
  boss.vulnerable = false;
  if (boss.archetype === "prism-hound") {
    boss.lockedTarget = clampToSupportedArena(boss.lockedTarget ?? state.player.position, 4);
  } else if (boss.archetype === "cube-fortress") {
    const count = 8 + boss.phaseIndex * 4;
    for (let index = 0; index < count; index += 1) {
      spawnProjectile(state, boss.id, "boss", boss.position, rotate({ x: 0, z: 1 }, index * Math.PI * 2 / count + boss.orbitRadians), 8.5 + boss.phaseIndex, 0.38, 5_000);
    }
  } else if (boss.attackSequence % 3 === 0) {
    for (let index = 0; index < 12; index += 1) {
      spawnProjectile(state, boss.id, "boss", boss.position, rotate({ x: 0, z: 1 }, index * Math.PI / 6 + boss.orbitRadians), 9.2, 0.4, 5_000);
    }
  } else if (boss.attackSequence % 3 === 1) {
    spawnEnemy(state, "splitter", add(boss.position, { x: -6, z: 2 }), 0);
    spawnEnemy(state, "splitter", add(boss.position, { x: 6, z: 2 }), 0);
  } else {
    boss.lockedTarget = { ...state.player.position };
    launchBody(boss, 15.5);
  }
  setBossAction(state, boss, "active", bossActiveDuration(boss.archetype));
}

function advanceBossActive(state: GameState, boss: BossState, _deltaMs: number, deltaSeconds: number): void {
  if (boss.archetype === "prism-hound") {
    const motion = moveToward(boss.position, boss.lockedTarget ?? state.player.position, 25 + boss.phaseIndex * 2, deltaSeconds);
    boss.position = motion.position;
    boss.facing = motion.facing;
    if (boss.actionElapsedMs > 420 && boss.actionElapsedMs - FIXED_STEP_MS <= 420) {
      for (const offset of [-0.2, 0.2]) {
        spawnProjectile(state, boss.id, "boss", boss.position, rotate(boss.facing, offset), 12, 0.34, 4_500);
      }
    }
  } else if (boss.archetype === "singularity-crown" && boss.attackSequence % 3 === 2) {
    const motion = moveToward(boss.position, boss.lockedTarget ?? state.player.position, 9, deltaSeconds);
    boss.position = motion.position;
    if (boss.verticalVelocity < 0 && boss.height <= BOSS_HOVER_HEIGHT + 0.1) {
      boss.height = BOSS_HOVER_HEIGHT;
      boss.verticalVelocity = 0;
      boss.supported = true;
      const radius = 6.2;
      emit(state, { type: "slam-impact", sourceId: boss.id, position: { ...boss.position }, radius });
      if (distance(state.player.position, boss.position) <= radius + state.player.radius) damagePlayer(state, boss.id);
      setBossAction(state, boss, "recovery", bossRecoveryDuration(boss.archetype));
    }
  }
}

function resolveBossContact(state: GameState, boss: BossState, dash: DashState): void {
  if (boss.archetype === "cube-fortress" && !boss.vulnerable) {
    const alivePart = boss.parts.find((part) => part.alive);
    if (alivePart) {
      alivePart.alive = false;
      alivePart.supported = false;
      emit(state, { type: "boss-part-broken", bossId: boss.id, partId: alivePart.id, position: add(boss.position, alivePart.localPosition) });
      if (boss.parts.every((part) => !part.alive)) setBossAction(state, boss, "vulnerable", 3_200);
      return;
    }
    // Regression gate: an empty or fully dead armor collection means the core
    // is open immediately; the same contact must damage it rather than being lost.
    setBossAction(state, boss, "vulnerable", 3_200);
  }
  if (!boss.vulnerable) {
    boss.shieldFlashMs = 180;
    emit(state, { type: "boss-shielded", bossId: boss.id, position: { ...boss.position } });
    return;
  }
  applyBossDamage(state, boss, dash.damage);
}

function applyBossDamage(state: GameState, boss: BossState, requestedDamage: number): void {
  if (!boss.vulnerable || boss.actionPhase === "defeated") return;
  const damage = Math.max(0, Math.floor(requestedDamage));
  if (damage <= 0) return;
  boss.currentHp = Math.max(0, boss.currentHp - damage);
  boss.hitFlashMs = 180;
  state.run.totalBossDamage += damage;
  state.player.ultimateEnergy = Math.min(100, state.player.ultimateEnergy + damage * 8);
  emit(state, { type: "boss-hit", bossId: boss.id, damage, hp: boss.currentHp, maximumHp: boss.maximumHp });
  if (boss.currentHp <= 0) defeatBoss(state, boss);
}

function defeatBoss(state: GameState, boss: BossState): void {
  boss.currentHp = 0;
  boss.vulnerable = false;
  boss.actionPhase = "defeated";
  boss.actionElapsedMs = 0;
  boss.supported = false;
  for (const part of boss.parts) {
    part.alive = false;
    part.supported = false;
  }
  emit(state, { type: "boss-defeated", bossId: boss.id });
}

function setBossAction(
  state: GameState,
  boss: BossState,
  actionPhase: BossState["actionPhase"],
  durationMs: number,
): void {
  boss.actionPhase = actionPhase;
  boss.actionElapsedMs = 0;
  boss.actionDurationMs = durationMs;
  boss.vulnerable = actionPhase === "vulnerable";
  emit(state, { type: "boss-phase", bossId: boss.id, phaseIndex: boss.phaseIndex, actionPhase });
}

function rebuildCubeArmor(boss: BossState): void {
  const rebuildCount = boss.phaseIndex >= 2 ? 2 : 3;
  boss.parts.forEach((part, index) => {
    part.alive = index < rebuildCount;
    part.supported = part.alive;
    if (part.alive) {
      part.height = 0.8;
      part.verticalVelocity = 0;
    }
  });
}

function updateCombatCompletion(state: GameState, deltaMs: number): void {
  const allSpawned = state.pendingSpawns.every((spawn) => spawn.spawned);
  const enemiesCleared = allSpawned && state.enemies.every((enemy) => !enemy.alive);
  const bossCleared = !state.boss || state.boss.actionPhase === "defeated";
  if (!enemiesCleared || !bossCleared || state.player.action === "dead") {
    state.run.clearElapsedMs = 0;
    return;
  }
  state.run.clearElapsedMs += deltaMs;
  if (state.run.clearElapsedMs < CLEAR_DELAY_MS) return;
  const definition = encounterAt(state.run.encounterIndex);
  if (!state.run.completedEncounterIds.includes(definition.id)) state.run.completedEncounterIds.push(definition.id);
  if (state.run.encounterIndex >= 8) {
    state.phase = "victory";
    emit(state, { type: "victory" });
    return;
  }
  const offer = createRewardOffer(state.run.seed, state.run.selectedUpgradeIds.length, state.run.build);
  state.run.activeOffer = offer;
  state.phase = "reward";
  emit(state, { type: "reward-opened", offer });
}

function selectUpgrade(state: GameState, offerId: string, upgradeId: CoreUpgradeId): GameCommandResult {
  const offer = state.run.activeOffer;
  if (state.phase !== "reward" || !offer || offer.id !== offerId) return "ignored";
  let nextBuild;
  try {
    nextBuild = selectRewardUpgrade(state.run.build, offer, upgradeId);
  } catch {
    return "ignored";
  }
  state.run.build = nextBuild;
  state.run.selectedUpgradeIds = [...nextBuild.selectedUpgradeIds];
  state.run.activeOffer = null;
  emit(state, { type: "reward-selected", upgradeId });
  startEncounter(state, state.run.encounterIndex + 1);
  return "upgrade-selected";
}

function updatePlayerFacing(state: GameState): void {
  const offset = subtract(state.player.aimTarget, state.player.position);
  if (Math.hypot(offset.x, offset.z) > 0.05) state.player.facing = normalize(offset, state.player.facing);
}

function setPlayerReady(state: GameState): void {
  state.player.action = "ready";
  state.player.actionElapsedMs = 0;
  state.player.chargeStartedTick = null;
  state.player.chargeTarget = null;
  state.player.dash = null;
  state.player.recoveryMs = 0;
}

function setEnemyPhase(enemy: EnemyState, phase: EnemyState["phase"], durationMs: number): void {
  enemy.phase = phase;
  enemy.phaseElapsedMs = 0;
  enemy.phaseDurationMs = durationMs;
  if (phase === "idle") enemy.lockedTarget = null;
}

function enemyCooldown(archetype: EnemyArchetype, sequence: number): number {
  const base = archetype === "shooter" ? 1_250 : archetype === "spinner" ? 1_600 : archetype === "slammer" ? 1_700 : 1_000;
  return base + sequence % 3 * 130;
}

function enemyActiveDuration(archetype: EnemyArchetype): number {
  if (archetype === "shooter") return 220;
  if (archetype === "spinner") return 720;
  return 520;
}

function enemyRecoveryDuration(archetype: EnemyArchetype): number {
  if (archetype === "spinner") return 850;
  if (archetype === "shooter") return 560;
  return 650;
}

function bossTelegraphDuration(archetype: BossArchetype): number {
  return archetype === "prism-hound" ? 920 : archetype === "cube-fortress" ? 1_050 : 1_080;
}

function bossActiveDuration(archetype: BossArchetype): number {
  return archetype === "prism-hound" ? 780 : archetype === "cube-fortress" ? 860 : 1_050;
}

function bossRecoveryDuration(archetype: BossArchetype): number {
  return archetype === "prism-hound" ? 520 : archetype === "cube-fortress" ? 620 : 680;
}

function bossVulnerabilityDuration(archetype: BossArchetype): number {
  return archetype === "prism-hound" ? 1_700 : archetype === "cube-fortress" ? 2_600 : 1_850;
}

function pathLength(segments: readonly PathSegmentState[]): number {
  return segments.reduce((total, segment) => total + distance(segment.from, segment.to), 0);
}

function copySegment(segment: PathSegmentState): PathSegmentState {
  return {
    from: { ...segment.from },
    to: { ...segment.to },
    reflected: segment.reflected,
    reflectionPoint: segment.reflectionPoint ? { ...segment.reflectionPoint } : null,
    reflectionNormal: segment.reflectionNormal ? { ...segment.reflectionNormal } : null,
  };
}

export function renderGameToText(state: GameState): string {
  const encounter = state.phase === "title" ? null : encounterAt(state.run.encounterIndex);
  return JSON.stringify({
    coordinateSystem: "x right, z down-screen, height up; arena x -32..32 z -20..20",
    phase: state.phase,
    encounter: encounter ? {
      id: encounter.id,
      index: encounter.index,
      chapter: encounter.chapter,
      chapterEncounter: encounter.chapterEncounter,
      kind: encounter.kind,
    } : null,
    player: {
      position: state.player.position,
      height: round(state.player.height),
      verticalVelocity: round(state.player.verticalVelocity),
      supported: state.player.supported,
      facing: state.player.facing,
      action: state.player.action,
      hp: state.player.hp,
      energy: round(state.player.ultimateEnergy),
      dash: state.player.dash ? {
        kind: state.player.dash.kind,
        hitRadius: round(state.player.dash.hitRadius),
        segments: state.player.dash.segments,
      } : null,
    },
    enemies: state.enemies.filter((enemy) => enemy.alive).map((enemy) => ({
      id: enemy.id,
      archetype: enemy.archetype,
      position: enemy.position,
      height: round(enemy.height),
      verticalVelocity: round(enemy.verticalVelocity),
      supported: enemy.supported,
      phase: enemy.phase,
    })),
    boss: state.boss ? {
      id: state.boss.id,
      archetype: state.boss.archetype,
      position: state.boss.position,
      height: round(state.boss.height),
      hp: state.boss.currentHp,
      maximumHp: state.boss.maximumHp,
      vulnerable: state.boss.vulnerable,
      actionPhase: state.boss.actionPhase,
      livingPartIds: state.boss.parts.filter((part) => part.alive).map((part) => part.id),
    } : null,
    projectiles: state.projectiles.filter((projectile) => projectile.alive).map((projectile) => ({
      id: projectile.id,
      kind: projectile.kind,
      position: projectile.position,
      velocity: projectile.velocity,
    })),
    obstacles: state.obstacles.map((obstacle) => ({ id: obstacle.id, archetype: obstacle.archetype, position: obstacle.position })),
    build: state.run.build,
    reward: state.run.activeOffer,
    completedEncounterIds: state.run.completedEncounterIds,
  });
}

export function gameplayHash(state: GameState): string {
  const copy = structuredClone(state);
  copy.events = [];
  copy.accumulatorMs = 0;
  return stableHash32(JSON.stringify(copy)).toString(16).padStart(8, "0");
}

export function createBossRegressionState(archetype: BossArchetype): GameState {
  const state = createInitialState(91_127);
  state.phase = "combat";
  const encounterIndex = archetype === "prism-hound" ? 2 : archetype === "cube-fortress" ? 5 : 8;
  state.run.encounterIndex = encounterIndex;
  state.boss = createBoss(state, archetype);
  state.pendingSpawns = [];
  state.enemies = [];
  state.obstacles = [];
  return state;
}

export function forceBossCoreWindow(state: GameState): void {
  const boss = state.boss;
  if (!boss || boss.actionPhase === "defeated") throw new Error("A living Boss is required.");
  setBossAction(state, boss, "vulnerable", 60_000);
}

export function resolveBossRegressionContact(
  state: GameState,
  kind: "basic" | "charged" | "ultimate" = "basic",
): void {
  const boss = state.boss;
  if (!boss) throw new Error("A Boss is required.");
  const dash: DashState = {
    id: ++state.dashSequence,
    kind,
    segments: [{
      from: { x: boss.position.x - 4, z: boss.position.z },
      to: { x: boss.position.x + 4, z: boss.position.z },
      reflected: false,
      reflectionPoint: null,
      reflectionNormal: null,
    }],
    hitRadius: 1,
    damage: BOSS_DASH_DAMAGE[kind],
    totalDurationMs: 100,
    elapsedMs: 0,
    resolvedEnemyIds: [],
    bossContactResolved: false,
    killCount: 0,
    pendingCross: null,
  };
  resolveBossContact(state, boss, dash);
}

function round(value: number): number {
  return Math.round(value * 1_000) / 1_000;
}
