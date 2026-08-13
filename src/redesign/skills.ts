import { seededUnit, stableHash32 } from "./math";

export const SKILL_POOL_VERSION = "slash-v2.1-skills-1" as const;
export const MAX_EQUIPPED_SKILL_FAMILIES = 4 as const;
export const MAX_SKILL_RANK = 3 as const;
export const REWARD_CHOICE_COUNT = 8 as const;
export const REWARD_CARD_COUNT = 3 as const;

export const SKILL_FAMILIES = [
  "wide-slash",
  "refraction",
  "cross-execution",
  "echo-slash",
  "kill-momentum",
] as const;

export type SkillFamilyId = typeof SKILL_FAMILIES[number];
export type SkillRank = 0 | 1 | 2 | 3;
export type UpgradeRank = Exclude<SkillRank, 0>;
export type CoreUpgradeId = `skill-${SkillFamilyId}-v2-r${UpgradeRank}`;

export interface CoreSkillBuild {
  readonly ranks: Readonly<Record<SkillFamilyId, SkillRank>>;
  readonly equippedFamilyIds: readonly SkillFamilyId[];
  readonly selectedUpgradeIds: readonly CoreUpgradeId[];
}

export interface CoreUpgradeDefinition {
  readonly id: CoreUpgradeId;
  readonly familyId: SkillFamilyId;
  readonly rank: UpgradeRank;
  readonly name: string;
  readonly effect: string;
}

export interface RewardOffer {
  readonly id: string;
  readonly seed: number;
  readonly rewardIndex: number;
  readonly poolVersion: typeof SKILL_POOL_VERSION;
  readonly candidateUpgradeIds: readonly [CoreUpgradeId, CoreUpgradeId, CoreUpgradeId];
}

const COPY: Record<SkillFamilyId, readonly [string, string, string, string]> = {
  "wide-slash": ["宽刃", "冲刺宽度 +30%。", "冲刺宽度 +55%。", "冲刺宽度 +80%。"],
  refraction: ["折射", "反射一次，保留 70% 距离。", "反射保留 90% 距离。", "反射保留 110% 距离，且路径不缩窄。"],
  "cross-execution": ["交叉处决", "路径交叉时触发电光处决。", "交点范围 +35%。", "交点范围 +70%，并清除敌弹。"],
  "echo-slash": ["残响斩", "0.40 秒后沿原路径追加电光斩。", "残响宽度提升至 90%。", "残响宽度提升至 110%。"],
  "kill-momentum": ["杀意", "每名击杀使下次收招缩短 8%。", "每名击杀使下次收招缩短 12%。", "每名击杀使下次收招缩短 16%。"],
};

export const CORE_UPGRADE_DEFINITIONS: readonly CoreUpgradeDefinition[] = SKILL_FAMILIES.flatMap(
  (familyId) => ([1, 2, 3] as const).map((rank): CoreUpgradeDefinition => ({
    id: upgradeId(familyId, rank),
    familyId,
    rank,
    name: COPY[familyId][0],
    effect: COPY[familyId][rank],
  })),
);

const definitionById = new Map(CORE_UPGRADE_DEFINITIONS.map((definition) => [definition.id, definition]));

export function createEmptyBuild(): CoreSkillBuild {
  return {
    ranks: {
      "wide-slash": 0,
      refraction: 0,
      "cross-execution": 0,
      "echo-slash": 0,
      "kill-momentum": 0,
    },
    equippedFamilyIds: [],
    selectedUpgradeIds: [],
  };
}

export function coreUpgradeById(id: string): CoreUpgradeDefinition {
  const definition = definitionById.get(id as CoreUpgradeId);
  if (!definition) throw new Error(`Unknown V2.1 upgrade: ${id}`);
  return definition;
}

export function skillRank(build: CoreSkillBuild, familyId: SkillFamilyId): SkillRank {
  return build.ranks[familyId];
}

export function eligibleCoreUpgrades(build: CoreSkillBuild): CoreUpgradeDefinition[] {
  validateBuild(build);
  const hasOpenSlot = build.equippedFamilyIds.length < MAX_EQUIPPED_SKILL_FAMILIES;
  return SKILL_FAMILIES.flatMap((familyId) => {
    const currentRank = build.ranks[familyId];
    if (currentRank >= MAX_SKILL_RANK) return [];
    if (currentRank === 0 && !hasOpenSlot) return [];
    return [coreUpgradeById(upgradeId(familyId, (currentRank + 1) as UpgradeRank))];
  });
}

export function createRewardOffer(
  seed: number,
  rewardIndex: number,
  build: CoreSkillBuild,
): RewardOffer {
  if (!Number.isSafeInteger(seed)) throw new Error("Reward seed must be a safe integer.");
  if (!Number.isInteger(rewardIndex) || rewardIndex < 0 || rewardIndex >= REWARD_CHOICE_COUNT) {
    throw new Error(`Reward index must be between 0 and ${REWARD_CHOICE_COUNT - 1}.`);
  }
  if (rewardIndex !== build.selectedUpgradeIds.length) {
    throw new Error("Reward index does not match the current build history.");
  }
  const eligible = eligibleCoreUpgrades(build).sort((left, right) => left.id.localeCompare(right.id));
  if (eligible.length < REWARD_CARD_COUNT) {
    throw new Error(`V2.1 build has only ${eligible.length} legal reward families at reward ${rewardIndex}.`);
  }
  const fingerprint = buildFingerprint(build);
  const offerSeed = stableHash32(`${seed}|${rewardIndex}|${SKILL_POOL_VERSION}|${fingerprint}`);
  const random = seededUnit(offerSeed);
  const shuffled = [...eligible];
  for (let index = 0; index < REWARD_CARD_COUNT; index += 1) {
    const selectedIndex = index + Math.floor(random() * (shuffled.length - index));
    [shuffled[index], shuffled[selectedIndex]] = [shuffled[selectedIndex]!, shuffled[index]!];
  }
  const candidateUpgradeIds = [
    shuffled[0]!.id,
    shuffled[1]!.id,
    shuffled[2]!.id,
  ] as const;
  return {
    id: `offer-${rewardIndex}-${offerSeed.toString(16).padStart(8, "0")}`,
    seed,
    rewardIndex,
    poolVersion: SKILL_POOL_VERSION,
    candidateUpgradeIds,
  };
}

export function selectRewardUpgrade(
  build: CoreSkillBuild,
  offer: RewardOffer,
  upgrade: CoreUpgradeId,
): CoreSkillBuild {
  const expected = createRewardOffer(offer.seed, offer.rewardIndex, build);
  if (expected.id !== offer.id || expected.poolVersion !== offer.poolVersion) {
    throw new Error("Reward offer is stale or cannot be reconstructed.");
  }
  if (!offer.candidateUpgradeIds.includes(upgrade)) {
    throw new Error(`Upgrade ${upgrade} is not in the active offer.`);
  }
  const definition = coreUpgradeById(upgrade);
  const currentRank = build.ranks[definition.familyId];
  if (definition.rank !== currentRank + 1) {
    throw new Error(`Upgrade ${upgrade} would skip or repeat a rank.`);
  }
  const isNewFamily = currentRank === 0;
  if (isNewFamily && build.equippedFamilyIds.length >= MAX_EQUIPPED_SKILL_FAMILIES) {
    throw new Error("The four skill-family slots are already full.");
  }
  const next: CoreSkillBuild = {
    ranks: { ...build.ranks, [definition.familyId]: definition.rank },
    equippedFamilyIds: isNewFamily
      ? [...build.equippedFamilyIds, definition.familyId]
      : [...build.equippedFamilyIds],
    selectedUpgradeIds: [...build.selectedUpgradeIds, definition.id],
  };
  validateBuild(next);
  return next;
}

export function validateBuild(build: CoreSkillBuild): void {
  if (build.equippedFamilyIds.length > MAX_EQUIPPED_SKILL_FAMILIES) {
    throw new Error("Build exceeds the four skill-family slots.");
  }
  if (build.selectedUpgradeIds.length > REWARD_CHOICE_COUNT) {
    throw new Error("Build exceeds the eight reward choices.");
  }
  if (new Set(build.equippedFamilyIds).size !== build.equippedFamilyIds.length) {
    throw new Error("Build contains duplicate equipped families.");
  }
  const reconstructed = createEmptyBuild();
  const ranks = { ...reconstructed.ranks };
  const equipped: SkillFamilyId[] = [];
  for (const id of build.selectedUpgradeIds) {
    const definition = coreUpgradeById(id);
    if (definition.rank !== ranks[definition.familyId] + 1) {
      throw new Error(`Build history is not sequential at ${id}.`);
    }
    if (ranks[definition.familyId] === 0) equipped.push(definition.familyId);
    ranks[definition.familyId] = definition.rank;
  }
  if (equipped.length > MAX_EQUIPPED_SKILL_FAMILIES) {
    throw new Error("Build history equips more than four families.");
  }
  for (const familyId of SKILL_FAMILIES) {
    const rank = build.ranks[familyId];
    if (!Number.isInteger(rank) || rank < 0 || rank > MAX_SKILL_RANK || rank !== ranks[familyId]) {
      throw new Error(`Build rank is invalid for ${familyId}.`);
    }
  }
  if (equipped.join("|") !== build.equippedFamilyIds.join("|")) {
    throw new Error("Build equipped-family order does not match its history.");
  }
}

export function wideSlashMultiplier(build: CoreSkillBuild): number {
  return [1, 1.3, 1.55, 1.8][skillRank(build, "wide-slash")]!;
}

export function refractionDistanceMultiplier(build: CoreSkillBuild): number {
  return [0, 0.7, 0.9, 1.1][skillRank(build, "refraction")]!;
}

export function crossExecutionRadius(build: CoreSkillBuild): number {
  return [0, 2.1, 2.835, 3.57][skillRank(build, "cross-execution")]!;
}

export function echoSlashWidthMultiplier(build: CoreSkillBuild): number {
  return [0, 0.75, 0.9, 1.1][skillRank(build, "echo-slash")]!;
}

export function killMomentumReduction(build: CoreSkillBuild, killCount: number): number {
  const perKill = [0, 0.08, 0.12, 0.16][skillRank(build, "kill-momentum")]!;
  return Math.min(0.6, Math.max(0, killCount) * perKill);
}

function upgradeId(familyId: SkillFamilyId, rank: UpgradeRank): CoreUpgradeId {
  return `skill-${familyId}-v2-r${rank}`;
}

function buildFingerprint(build: CoreSkillBuild): string {
  return SKILL_FAMILIES.map((familyId) => `${familyId}:${build.ranks[familyId]}`).join("|");
}
