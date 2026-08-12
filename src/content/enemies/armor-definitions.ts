import { DefinitionRegistry } from "../registry";

export interface ArmorPartDefinition {
  readonly id: string;
  /** Signed center angle relative to enemy facing: 0 front, +PI/2 right,
   * -PI/2 left, PI rear. */
  readonly centerAngleRadians: number;
  readonly coverageArcRadians: number;
  readonly presentationSlot: "front" | "left" | "right" | "rear";
}

export interface ArmorProfileDefinition {
  readonly id: string;
  readonly parts: readonly ArmorPartDefinition[];
}

export const VANGUARD_FRONT_ARMOR_PROFILE_ID = "armor-vanguard-front-v1";
export const BASTION_TRIPLE_ARMOR_PROFILE_ID = "armor-bastion-triple-v1";
export const REAR_GUARD_ARMOR_PROFILE_ID = "armor-rear-guard-v1";
export const FORTRESS_QUAD_ARMOR_PROFILE_ID = "armor-fortress-quad-v1";
export const SIEGE_CHOIR_TRIPLE_ARMOR_PROFILE_ID = "armor-siege-choir-triple-v1";

export const armorProfileDefinitions = new DefinitionRegistry<ArmorProfileDefinition>([
  {
    id: VANGUARD_FRONT_ARMOR_PROFILE_ID,
    parts: [
      {
        id: "front-plate",
        centerAngleRadians: 0,
        coverageArcRadians: 140 * Math.PI / 180,
        presentationSlot: "front",
      },
    ],
  },
  {
    id: BASTION_TRIPLE_ARMOR_PROFILE_ID,
    parts: [
      { id: "front-plate", centerAngleRadians: 0, coverageArcRadians: 100 * Math.PI / 180, presentationSlot: "front" },
      { id: "left-plate", centerAngleRadians: -Math.PI / 2, coverageArcRadians: 70 * Math.PI / 180, presentationSlot: "left" },
      { id: "right-plate", centerAngleRadians: Math.PI / 2, coverageArcRadians: 70 * Math.PI / 180, presentationSlot: "right" },
    ],
  },
  {
    id: REAR_GUARD_ARMOR_PROFILE_ID,
    parts: [
      { id: "rear-plate", centerAngleRadians: Math.PI, coverageArcRadians: 90 * Math.PI / 180, presentationSlot: "rear" },
    ],
  },
  {
    id: FORTRESS_QUAD_ARMOR_PROFILE_ID,
    parts: [
      { id: "front-plate", centerAngleRadians: 0, coverageArcRadians: 88 * Math.PI / 180, presentationSlot: "front" },
      { id: "left-plate", centerAngleRadians: -Math.PI / 2, coverageArcRadians: 62 * Math.PI / 180, presentationSlot: "left" },
      { id: "right-plate", centerAngleRadians: Math.PI / 2, coverageArcRadians: 62 * Math.PI / 180, presentationSlot: "right" },
      { id: "rear-plate", centerAngleRadians: Math.PI, coverageArcRadians: 88 * Math.PI / 180, presentationSlot: "rear" },
    ],
  },
  {
    id: SIEGE_CHOIR_TRIPLE_ARMOR_PROFILE_ID,
    parts: [
      { id: "front-plate", centerAngleRadians: 0, coverageArcRadians: 92 * Math.PI / 180, presentationSlot: "front" },
      { id: "left-plate", centerAngleRadians: -Math.PI / 2, coverageArcRadians: 82 * Math.PI / 180, presentationSlot: "left" },
      { id: "right-plate", centerAngleRadians: Math.PI / 2, coverageArcRadians: 82 * Math.PI / 180, presentationSlot: "right" },
    ],
  },
]);
