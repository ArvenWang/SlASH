import type { ActDefinitionId, BossDefinitionId, RunDefinitionId } from "../../core/ids";
import { DefinitionRegistry } from "../registry";

export type RouteNodeKind = "combat" | "elite" | "challenge" | "event" | "forge" | "boss";

export interface RouteLayerDefinition {
  readonly index: number;
  readonly nodeCount: number;
  readonly role: "opening-combat" | "pressure-choice" | "safe-choice" | "late-pressure" | "pre-boss" | "boss";
}

export interface ActDefinition {
  readonly id: ActDefinitionId;
  readonly index: number;
  readonly name: string;
  readonly environmentId: string;
  readonly bossDefinitionId: BossDefinitionId;
  readonly layers: readonly RouteLayerDefinition[];
  readonly guaranteedSkillRewardLayers: readonly number[];
}

export interface RunDefinition {
  readonly id: RunDefinitionId;
  readonly contentVersion: "full-game-v1";
  readonly startingSkillPoints: number;
  readonly guaranteedSkillPoints: number;
  readonly maximumSkillPoints: number;
  readonly acts: readonly ActDefinition[];
}

const STANDARD_ROUTE_LAYERS: readonly RouteLayerDefinition[] = [
  { index: 0, nodeCount: 2, role: "opening-combat" },
  { index: 1, nodeCount: 3, role: "pressure-choice" },
  { index: 2, nodeCount: 2, role: "safe-choice" },
  { index: 3, nodeCount: 3, role: "late-pressure" },
  { index: 4, nodeCount: 2, role: "pre-boss" },
  { index: 5, nodeCount: 1, role: "boss" },
];

export const FULL_GAME_ACT_DEFINITIONS: readonly ActDefinition[] = [
  {
    id: "act-01-arrival-yard",
    index: 0,
    name: "ARRIVAL YARD",
    environmentId: "transit-cathedral-arrival-v1",
    bossDefinitionId: "boss-rail-hound-v1",
    layers: STANDARD_ROUTE_LAYERS,
    guaranteedSkillRewardLayers: [0, 4],
  },
  {
    id: "act-02-compression-forge",
    index: 1,
    name: "COMPRESSION FORGE",
    environmentId: "transit-cathedral-forge-v1",
    bossDefinitionId: "boss-siege-choir-v1",
    layers: STANDARD_ROUTE_LAYERS,
    guaranteedSkillRewardLayers: [0, 4],
  },
  {
    id: "act-03-mirror-archive",
    index: 2,
    name: "MIRROR ARCHIVE",
    environmentId: "transit-cathedral-archive-v1",
    bossDefinitionId: "boss-mirror-regent-v1",
    layers: STANDARD_ROUTE_LAYERS,
    guaranteedSkillRewardLayers: [0, 4],
  },
  {
    id: "act-04-redline-cathedral",
    index: 3,
    name: "REDLINE CATHEDRAL",
    environmentId: "transit-cathedral-redline-v1",
    bossDefinitionId: "boss-last-conductor-v1",
    layers: STANDARD_ROUTE_LAYERS,
    guaranteedSkillRewardLayers: [0, 4],
  },
];

export const FULL_GAME_RUN_DEFINITION: RunDefinition = {
  id: "run-redline-ascent-v1",
  contentVersion: "full-game-v1",
  startingSkillPoints: 2,
  guaranteedSkillPoints: 10,
  maximumSkillPoints: 12,
  acts: FULL_GAME_ACT_DEFINITIONS,
};

export const runDefinitions = new DefinitionRegistry<RunDefinition>([FULL_GAME_RUN_DEFINITION]);
