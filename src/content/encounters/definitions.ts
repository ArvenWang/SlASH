import { vec2 } from "../../core/math/vec2";
import type { RouteNodeState } from "../../game/run/types";
import { STRIKER_ENEMY_ID } from "../enemies/definitions";
import type { EncounterDefinition } from "../levels/definitions";
import { DefinitionRegistry } from "../registry";

/** First production encounter slice. Later P6 content adds the remaining
 * templates, but this definition is already a real two-wave Act I encounter. */
export const ARRIVAL_PINCER_ENCOUNTER: EncounterDefinition = {
  id: "encounter-act1-arrival-pincer-v1",
  completionRule: "all-hostiles-defeated",
  enemyMoveSpeed: 2.75,
  waves: [
    {
      id: "arrival-pincer-wave-01",
      activation: "immediate",
      warningDurationMs: 750,
      spawns: [
        { id: "striker-01", enemyDefinitionId: STRIKER_ENEMY_ID, position: vec2(-15, -7), facing: vec2(1, 0) },
        { id: "striker-02", enemyDefinitionId: STRIKER_ENEMY_ID, position: vec2(15, -7), facing: vec2(-1, 0) },
        { id: "striker-03", enemyDefinitionId: STRIKER_ENEMY_ID, position: vec2(0, 10), facing: vec2(0, -1) },
      ],
    },
    {
      id: "arrival-pincer-wave-02",
      activation: "after-previous-killed",
      warningDurationMs: 750,
      spawns: [
        { id: "striker-04", enemyDefinitionId: STRIKER_ENEMY_ID, position: vec2(-17, 5), facing: vec2(1, 0) },
        { id: "striker-05", enemyDefinitionId: STRIKER_ENEMY_ID, position: vec2(17, 5), facing: vec2(-1, 0) },
        { id: "striker-06", enemyDefinitionId: STRIKER_ENEMY_ID, position: vec2(-7, -10), facing: vec2(0, 1) },
        { id: "striker-07", enemyDefinitionId: STRIKER_ENEMY_ID, position: vec2(7, -10), facing: vec2(0, 1) },
      ],
    },
  ],
};

export const fullGameEncounterDefinitions = new DefinitionRegistry<EncounterDefinition>([
  ARRIVAL_PINCER_ENCOUNTER,
]);

export interface RouteThreatPreview {
  readonly title: string;
  readonly summary: string;
  readonly tags: readonly string[];
  readonly waveCount: number;
  readonly hostileCount: number;
  readonly available: boolean;
}

/** P1 maps every hostile route kind to the first formal template so the full
 * Title/Planning/Combat/Reward loop is playable. P6 replaces this compatibility
 * mapping with the complete 53-template authored library. */
export function encounterForRouteNode(node: RouteNodeState): EncounterDefinition | null {
  if (node.kind === "event" || node.kind === "forge") return null;
  return ARRIVAL_PINCER_ENCOUNTER;
}

export function threatPreviewForRouteNode(node: RouteNodeState): RouteThreatPreview {
  const encounter = encounterForRouteNode(node);
  if (!encounter) {
    return {
      title: node.kind === "forge" ? "FORGE / 重接" : "EVENT / 事件",
      summary: "该非战斗节点的正式选择内容将在对应内容工作包接入。",
      tags: [node.kind.toUpperCase(), "NON-COMBAT"],
      waveCount: 0,
      hostileCount: 0,
      available: false,
    };
  }
  return {
    title: node.kind === "boss" ? "BOSS CONTACT" : node.kind === "elite" ? "ELITE PRESSURE" : "ARRIVAL PINCER",
    summary: "两波突击兵从相反方向压近；第一波清空后，第二波经过 750ms 预警进入。",
    tags: [node.kind.toUpperCase(), "STRIKER", "MELEE", "2 WAVES"],
    waveCount: encounter.waves.length,
    hostileCount: encounter.waves.reduce((total, wave) => total + wave.spawns.length, 0),
    available: true,
  };
}
