import type { RouteNodeState } from "../../game/run/types";
import {
  FULL_GAME_BOSS_ENCOUNTERS,
  bossDefinitionForAct,
} from "../bosses/definitions";
import { enemyDefinitions } from "../enemies/definitions";
import { eventForRouteNode } from "../events/definitions";
import { DefinitionRegistry } from "../registry";
import {
  FULL_GAME_NON_BOSS_ENCOUNTERS,
  derivedEncounterTags,
  pressureForEncounter,
} from "./full-game-library";
import type { FullGameEncounterCategory, FullGameEncounterDefinition } from "./types";

export const fullGameEncounterDefinitions = new DefinitionRegistry<FullGameEncounterDefinition>(
  [...FULL_GAME_NON_BOSS_ENCOUNTERS, ...FULL_GAME_BOSS_ENCOUNTERS],
);

export const ARRIVAL_PINCER_ENCOUNTER = fullGameEncounterDefinitions.get(
  "encounter-act1-arrival-pincer-v1",
);

export interface RouteThreatPreview {
  readonly title: string;
  readonly summary: string;
  readonly tags: readonly string[];
  readonly waveCount: number;
  readonly hostileCount: number;
  readonly armoredHostileCount: number;
  readonly projectileSourceCount: number;
  readonly obstacleSourceCount: number;
  readonly hazardSourceCount: number;
  readonly pressure: number;
  readonly challengeCondition: string | null;
  readonly challengeReward: string | null;
  readonly available: boolean;
}

export function encounterPool(
  actIndex: number,
  category: Exclude<FullGameEncounterCategory, "boss">,
): readonly FullGameEncounterDefinition[] {
  return FULL_GAME_NON_BOSS_ENCOUNTERS.filter((definition) => (
    definition.actIndex === actIndex && definition.category === category
  ));
}

/** Maps a route slot to authored content without storing duplicate definitions
 * in the route graph. Seed changes rotate the library while the same seed and
 * node always resolve to the same template. */
export function encounterForRouteNode(
  node: RouteNodeState,
  runSeed = 0,
): FullGameEncounterDefinition | null {
  if (node.kind === "event" || node.kind === "forge") return null;
  if (node.kind === "boss") {
    return fullGameEncounterDefinitions.get(bossDefinitionForAct(node.actIndex).encounterId);
  }
  const category = node.kind === "combat" ? "standard" : node.kind;
  const pool = encounterPool(node.actIndex, category);
  if (pool.length === 0) throw new Error(`No ${category} encounter content for Act ${node.actIndex + 1}.`);
  const seedOffset = stableRouteHash(runSeed, `act:${node.actIndex}:category:${category}`) % pool.length;
  const authoredOrdinal = category === "elite"
    ? (node.layerIndex <= 1 ? 0 : 1)
    : category === "challenge"
      ? 0
      : standardRouteOrdinal(node);
  return pool[(seedOffset + authoredOrdinal) % pool.length]!;
}

export function threatPreviewForRouteNode(node: RouteNodeState, runSeed = 0): RouteThreatPreview {
  const encounter = encounterForRouteNode(node, runSeed);
  if (!encounter) {
    if (node.kind === "forge") {
      return nonCombatPreview(
        "FORGE / 构筑重接",
        "可免费移动最多 2 个已锁定技能点；移除前置会级联移除其后继。Reroute Token 可主动增加本次移动上限。",
        ["FORGE", "RESPEC", "NO COMBAT"],
      );
    }
    if (node.kind === "event") {
      const event = eventForRouteNode(node, runSeed);
      return nonCombatPreview(
        event.title,
        `${event.situation} 可选：${event.choices.map((choice) => choice.title).join(" / ")}。`,
        ["EVENT", "2 CHOICES", "NO COMBAT"],
      );
    }
    throw new Error(`Missing route content for ${node.id}.`);
  }

  if (node.kind === "boss") {
    const boss = bossDefinitionForAct(node.actIndex);
    return {
      title: boss.title,
      summary: boss.summary,
      tags: [...boss.tags, `${boss.phases.length} PHASES`],
      waveCount: encounter.waves.length,
      hostileCount: boss.threatPreview.maximumConcurrentHostiles,
      armoredHostileCount: boss.threatPreview.armorPartCount > 0 ? 1 : 0,
      projectileSourceCount: boss.threatPreview.projectileSourceCount,
      obstacleSourceCount: boss.threatPreview.obstacleSourceCount,
      hazardSourceCount: boss.threatPreview.hazardSourceCount,
      pressure: 0,
      challengeCondition: boss.phases.map((phase) => phase.objective).join(" → "),
      challengeReward: node.reward === "run-victory" ? "完成本次 Run" : "进入下一幕",
      available: true,
    };
  }

  const spawns = encounter.waves.flatMap((wave) => wave.spawns);
  const enemies = spawns.map((spawn) => enemyDefinitions.get(spawn.enemyDefinitionId));
  const pressure = pressureForEncounter(encounter).totalPressure;
  return {
    title: encounter.title,
    summary: encounter.summary,
    tags: [...derivedEncounterTags(encounter), `${encounter.waves.length} WAVES`],
    waveCount: encounter.waves.length,
    hostileCount: spawns.length,
    armoredHostileCount: enemies.filter((enemy) => enemy.armorProfileId !== null).length,
    projectileSourceCount: enemies.filter((enemy) => enemy.tags.includes("projectile")).length,
    obstacleSourceCount: encounter.initialObstacles.length + enemies.filter((enemy) => enemy.tags.includes("obstacle")).length,
    hazardSourceCount: encounter.initialHazards.length + enemies.filter((enemy) => enemy.tags.includes("hazard")).length,
    pressure,
    challengeCondition: encounter.challenge?.description ?? null,
    challengeReward: encounter.challenge?.reward.summary ?? null,
    available: true,
  };
}

function nonCombatPreview(
  title: string,
  summary: string,
  tags: readonly string[],
): RouteThreatPreview {
  return {
    title,
    summary,
    tags,
    waveCount: 0,
    hostileCount: 0,
    armoredHostileCount: 0,
    projectileSourceCount: 0,
    obstacleSourceCount: 0,
    hazardSourceCount: 0,
    pressure: 0,
    challengeCondition: null,
    challengeReward: null,
    available: true,
  };
}

function stableRouteHash(seed: number, value: string): number {
  let hash = Math.trunc(seed) >>> 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = Math.imul(hash ^ value.charCodeAt(index), 0x45d9f3b) >>> 0;
    hash ^= hash >>> 16;
  }
  return hash >>> 0;
}

function standardRouteOrdinal(node: RouteNodeState): number {
  const layerOffset = node.layerIndex === 0
    ? 0
    : node.layerIndex === 1
      ? 2
      : node.layerIndex === 3
        ? 5
        : node.layerIndex === 4
          ? 8
          : node.layerIndex * 3;
  return layerOffset + node.nodeIndex;
}
