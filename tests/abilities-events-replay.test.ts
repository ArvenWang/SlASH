import { beforeAll, describe, expect, test } from "vitest";
import { abilityDefinitions } from "../src/content/abilities/definitions";
import { upgradeDefinitions } from "../src/content/upgrades/definitions";
import { createSeededRandom } from "../src/core/random/seeded-random";
import { DEBUG_TEST_ABILITY, registerDebugTestAbility } from "../src/debug/content/test-ability";
import { DEBUG_UPGRADES } from "../src/debug/content/test-upgrades";
import { activateAbility } from "../src/game/abilities/ability-system";
import {
  createGame,
  drainGameEvents,
  getPlayerAction,
  queueDash,
  stepGame,
  type GameState,
  type Vec2,
} from "../src/game/game";
import { createReplayRecorder, playReplay } from "../src/game/replay/replay";

beforeAll(() => {
  for (const upgrade of DEBUG_UPGRADES) {
    if (!upgradeDefinitions.has(upgrade.id)) upgradeDefinitions.register(upgrade);
  }
  registerDebugTestAbility();
});

describe("ability and modifier architecture", () => {
  test("wraps Dash Slash as primary and applies only allowed modifier fields", () => {
    const state = createGame(0);
    state.run.selectedUpgrades = DEBUG_UPGRADES.map((upgrade) => upgrade.id);
    expect(queueDash(state, { x: 10, z: 0 })).toBe("started");
    expect(state.player.abilities.primary?.abilityId).toBe("dash-slash");
    expect(state.player.dash?.recoveryMs).toBeCloseTo(96);
    expect(state.player.dash?.hitRadius).toBeCloseTo(0.495);
  });

  test("registers a debug ability without changing the player state shape", () => {
    const state = createGame(0);
    state.player.abilities.secondary = {
      abilityId: DEBUG_TEST_ABILITY.id,
      cooldownRemainingMs: 0,
    };
    expect(activateAbility(state, "secondary", { x: 3, z: -2 })).toBe("started");
    expect(state.player.position).toEqual({ x: 3, z: -2 });
    expect(abilityDefinitions.get(DEBUG_TEST_ABILITY.id).executionProfile).toBe("debug-target-blink-v1");
  });
});

describe("gameplay event 2.0", () => {
  test("emits deterministic metadata and self-contained presentation facts", () => {
    const state = createGame(0);
    drainGameEvents(state);
    queueDash(state, { x: 19, z: 0 });
    const event = drainGameEvents(state)[0];
    expect(event?.type).toBe("dash-started");
    if (!event || event.type !== "dash-started") throw new Error("Expected dash-started event.");
    expect(event.id).toBe("0:2");
    expect(event.tick).toBe(0);
    expect(event.abilityId).toBe("dash-slash");
    expect(event.direction).toEqual({ x: 1, z: 0 });
    expect(event.anticipatedHits.map((hit) => hit.entityId)).toEqual(["s1-enemy-03", "s1-enemy-04"]);

    let killEvent = null;
    for (let tick = 0; tick < 20 && killEvent === null; tick += 1) {
      stepGame(state);
      killEvent = drainGameEvents(state).find((candidate) => candidate.type === "enemy-killed") ?? null;
    }
    expect(killEvent?.type).toBe("enemy-killed");
    if (!killEvent || killEvent.type !== "enemy-killed") throw new Error("Expected enemy-killed event.");
    expect(killEvent.attackId).toBe("dash-slash");
    expect(killEvent.direction).toEqual({ x: 1, z: 0 });
  });
});

describe("seed and replay", () => {
  test("reproduces the same random stream from a seed and snapshot", () => {
    const first = createSeededRandom(1234);
    const prefix = [first.next(), first.next()];
    const snapshot = first.snapshot();
    const suffix = [first.next(), first.next(), first.next()];
    const restored = createSeededRandom(1234, snapshot);
    expect(prefix).toHaveLength(2);
    expect([restored.next(), restored.next(), restored.next()]).toEqual(suffix);
  });

  test("records and exactly replays a complete Stage 1", () => {
    const state = createGame(0);
    const recorder = createReplayRecorder(state);
    drainGameEvents(state);

    for (let guard = 0; guard < 2_400 && state.stage.phase === "playing"; guard += 1) {
      if (getPlayerAction(state) === "ready") {
        recorder.dispatch({
          type: "activate-ability",
          slot: "primary",
          target: chooseDashTarget(state),
        });
      }
      stepGame(state);
      drainGameEvents(state);
    }

    expect(state.stage.phase).toBe("stage-cleared");
    expect(state.combat.kills).toBe(8);
    const log = recorder.finish();
    const replay = playReplay(log);
    expect(replay.matched).toBe(true);
    expect(replay.state.stage.phase).toBe("stage-cleared");
    expect(replay.state.combat.kills).toBe(8);
  });
});

function chooseDashTarget(state: GameState): Vec2 {
  const player = state.player.position;
  let best: { target: Vec2; score: number; travel: number } | null = null;
  for (const enemy of state.enemies) {
    if (!enemy.alive) continue;
    const target = extendToArenaBoundary(player, enemy.position, state.stage.arena);
    if (!target) continue;
    const score = state.enemies.reduce((count, candidate) => (
      count + (candidate.alive && distanceSquaredPointToSegment(candidate.position, player, target) <= 1.02 ** 2 ? 1 : 0)
    ), 0);
    const travel = Math.hypot(target.x - player.x, target.z - player.z);
    if (!best || score > best.score || (score === best.score && travel > best.travel)) {
      best = { target, score, travel };
    }
  }
  return best?.target ?? { x: -player.x, z: -player.z };
}

function extendToArenaBoundary(
  player: Vec2,
  enemy: Vec2,
  arena: GameState["stage"]["arena"],
): Vec2 | null {
  const dx = enemy.x - player.x;
  const dz = enemy.z - player.z;
  const length = Math.hypot(dx, dz);
  if (length <= 1e-6) return null;
  const dirX = dx / length;
  const dirZ = dz / length;
  const margin = 0.5;
  const candidates: number[] = [];
  if (dirX > 1e-6) candidates.push((arena.maxX - margin - player.x) / dirX);
  if (dirX < -1e-6) candidates.push((arena.minX + margin - player.x) / dirX);
  if (dirZ > 1e-6) candidates.push((arena.maxZ - margin - player.z) / dirZ);
  if (dirZ < -1e-6) candidates.push((arena.minZ + margin - player.z) / dirZ);
  const distance = Math.min(...candidates.filter((value) => value > 0));
  return Number.isFinite(distance)
    ? { x: player.x + dirX * distance, z: player.z + dirZ * distance }
    : null;
}

function distanceSquaredPointToSegment(point: Vec2, start: Vec2, end: Vec2): number {
  const dx = end.x - start.x;
  const dz = end.z - start.z;
  const lengthSquared = dx * dx + dz * dz;
  if (lengthSquared <= 1e-8) return Number.POSITIVE_INFINITY;
  const ratio = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.z - start.z) * dz) / lengthSquared));
  const x = start.x + dx * ratio;
  const z = start.z + dz * ratio;
  return (point.x - x) ** 2 + (point.z - z) ** 2;
}
