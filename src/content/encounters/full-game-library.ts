import type { EnemyDefinitionId } from "../../core/ids";
import { copyVec2, vec2, type Vec2 } from "../../core/math/vec2";
import {
  ARCHITECT_ELITE_ID,
  BASTION_ENEMY_ID,
  BLINK_STALKER_ENEMY_ID,
  CONDUCTOR_ENEMY_ID,
  CONSTRUCTOR_ENEMY_ID,
  FORTRESS_ELITE_ID,
  GUNNER_ENEMY_ID,
  LANCER_ENEMY_ID,
  MINE_LAYER_ENEMY_ID,
  REDLINE_LANCER_ELITE_ID,
  SNIPER_ENEMY_ID,
  STRIKER_ENEMY_ID,
  TWIN_GUNNER_ELITE_ID,
  VANGUARD_ENEMY_ID,
  enemyDefinitions,
} from "../enemies/definitions";
import {
  ANCHOR_PILLAR_OBSTACLE_ID,
  ARC_RAIL_HAZARD_ID,
  ARMED_MINE_HAZARD_ID,
  DEPLOYABLE_BARRIER_OBSTACLE_ID,
  RAIL_GATE_OBSTACLE_ID,
  STATIC_REFLECTOR_OBSTACLE_ID,
} from "../entities/definitions";
import type { EncounterWave } from "../levels/definitions";
import type {
  ChallengeRuleDefinition,
  EncounterHazardSpawnDefinition,
  EncounterObstacleSpawnDefinition,
  EncounterPressureSummary,
  FullGameEncounterCategory,
  FullGameEncounterDefinition,
} from "./types";

const S = STRIKER_ENEMY_ID;
const G = GUNNER_ENEMY_ID;
const L = LANCER_ENEMY_ID;
const C = CONSTRUCTOR_ENEMY_ID;
const M = MINE_LAYER_ENEMY_ID;
const N = SNIPER_ENEMY_ID;
const V = VANGUARD_ENEMY_ID;
const B = BASTION_ENEMY_ID;
const K = BLINK_STALKER_ENEMY_ID;
const O = CONDUCTOR_ENEMY_ID;
const ER = REDLINE_LANCER_ELITE_ID;
const ET = TWIN_GUNNER_ELITE_ID;
const EA = ARCHITECT_ELITE_ID;
const EF = FORTRESS_ELITE_ID;

interface EncounterRecipe {
  readonly slug: string;
  readonly actIndex: number;
  readonly category: Exclude<FullGameEncounterCategory, "boss">;
  readonly title: string;
  readonly summary: string;
  readonly designTags: readonly string[];
  readonly waves: readonly (readonly EnemyDefinitionId[])[];
  readonly formation: number;
  readonly obstacles?: readonly EncounterObstacleSpawnDefinition[];
  readonly hazards?: readonly EncounterHazardSpawnDefinition[];
  readonly challenge?: ChallengeRuleDefinition;
}

interface ActPresentationContract {
  readonly environmentId: string;
  readonly lightingProfileId: string;
  readonly presentationId: string;
}

export const FULL_GAME_ACT_PRESENTATION_CONTRACTS: readonly ActPresentationContract[] = [
  {
    environmentId: "transit-cathedral-arrival-v1",
    lightingProfileId: "arrival-yard-cold-rain-v1",
    presentationId: "encounter-arrival-yard-v1",
  },
  {
    environmentId: "transit-cathedral-forge-v1",
    lightingProfileId: "compression-forge-amber-rail-v1",
    presentationId: "encounter-compression-forge-v1",
  },
  {
    environmentId: "transit-cathedral-archive-v1",
    lightingProfileId: "mirror-archive-white-red-v1",
    presentationId: "encounter-mirror-archive-v1",
  },
  {
    environmentId: "transit-cathedral-redline-v1",
    lightingProfileId: "redline-cathedral-storm-v1",
    presentationId: "encounter-redline-cathedral-v1",
  },
];

const FORMATIONS: readonly (readonly Vec2[])[] = [
  [
    vec2(-16, -7.5), vec2(16, -7.5), vec2(-16, 7.5), vec2(16, 7.5),
    vec2(-8, -10.5), vec2(8, -10.5), vec2(-8, 10.5), vec2(8, 10.5),
    vec2(-18, 0), vec2(18, 0), vec2(-12, 0), vec2(12, 0),
  ],
  [
    vec2(-17, -5), vec2(-17, 5), vec2(17, -5), vec2(17, 5),
    vec2(-7, -10.5), vec2(7, -10.5), vec2(-7, 10.5), vec2(7, 10.5),
    vec2(-12, -7.5), vec2(12, 7.5), vec2(-12, 7.5), vec2(12, -7.5),
  ],
  [
    vec2(-18, -8), vec2(0, -11), vec2(18, -8), vec2(18, 0),
    vec2(18, 8), vec2(0, 11), vec2(-18, 8), vec2(-18, 0),
    vec2(-11, -7), vec2(11, -7), vec2(11, 7), vec2(-11, 7),
  ],
  [
    vec2(-15, -9), vec2(-5, -11), vec2(5, -11), vec2(15, -9),
    vec2(17, 4), vec2(10, 10), vec2(-10, 10), vec2(-17, 4),
    vec2(-17, -3), vec2(17, -3), vec2(-12, 5), vec2(12, 5),
  ],
];

const anchors: readonly EncounterObstacleSpawnDefinition[] = [
  { id: "anchor-west", definitionId: ANCHOR_PILLAR_OBSTACLE_ID, position: vec2(-6.5, 0) },
  { id: "anchor-east", definitionId: ANCHOR_PILLAR_OBSTACLE_ID, position: vec2(6.5, 0) },
];

const reflectors: readonly EncounterObstacleSpawnDefinition[] = [
  { id: "reflector-north", definitionId: STATIC_REFLECTOR_OBSTACLE_ID, position: vec2(-6.5, 4.5), rotationRadians: Math.PI / 2 },
  { id: "reflector-south", definitionId: STATIC_REFLECTOR_OBSTACLE_ID, position: vec2(6.5, -4.5), rotationRadians: Math.PI / 2 },
];

const barrierPair: readonly EncounterObstacleSpawnDefinition[] = [
  { id: "barrier-west", definitionId: DEPLOYABLE_BARRIER_OBSTACLE_ID, position: vec2(-7.5, 4.5), rotationRadians: Math.PI / 2 },
  { id: "barrier-east", definitionId: DEPLOYABLE_BARRIER_OBSTACLE_ID, position: vec2(7.5, -4.5), rotationRadians: Math.PI / 2 },
];

const movingGate: readonly EncounterObstacleSpawnDefinition[] = [
  { id: "moving-gate", definitionId: RAIL_GATE_OBSTACLE_ID, position: vec2(0, 6.5), velocity: vec2(2.2, 0) },
];

const minePair: readonly EncounterHazardSpawnDefinition[] = [
  { id: "mine-west", definitionId: ARMED_MINE_HAZARD_ID, position: vec2(-6.5, -4.5) },
  { id: "mine-east", definitionId: ARMED_MINE_HAZARD_ID, position: vec2(6.5, 4.5) },
];

const arcRail: readonly EncounterHazardSpawnDefinition[] = [
  { id: "arc-rail", definitionId: ARC_RAIL_HAZARD_ID, position: vec2(0, 6.5) },
];

function challenge(
  id: string,
  title: string,
  description: string,
  kind: ChallengeRuleDefinition["kind"],
  target: number,
  reward: ChallengeRuleDefinition["reward"],
  timeLimitMs: number | null = null,
): ChallengeRuleDefinition {
  return { id, title, description, kind, target, reward, timeLimitMs };
}

const rerouteReward = (summary: string): ChallengeRuleDefinition["reward"] => ({
  resourceId: "reroute-token",
  amount: 1,
  maximum: 2,
  summary,
});

const energyReward = (summary: string): ChallengeRuleDefinition["reward"] => ({
  resourceId: "next-combat-energy",
  amount: 25,
  maximum: 100,
  summary,
});

const intelReward = (summary: string): ChallengeRuleDefinition["reward"] => ({
  resourceId: "intel",
  amount: 1,
  maximum: 3,
  summary,
});

const RECIPES: readonly EncounterRecipe[] = [
  // ACT I — 6 Standard / 2 Elite / 2 Challenge
  { slug: "arrival-pincer", actIndex: 0, category: "standard", title: "ARRIVAL PINCER / 入站钳击", summary: "两侧 Striker 迫近，第二波 Gunner 在远端封锁退路；用于建立冲刺、落点与切弹节奏。", designTags: ["INTRO", "PINCER"], waves: [[S, S, S, G], [S, S, S, G]], formation: 0 },
  { slug: "cross-platform-fire", actIndex: 0, category: "standard", title: "CROSS-PLATFORM FIRE / 交台火线", summary: "四名 Gunner 分居斜角，Striker 从纵轴逼迫玩家穿越交叉弹道。", designTags: ["CROSSFIRE", "PROJECTILE"], waves: [[G, S, G, S], [G, S, G, S]], formation: 1 },
  { slug: "first-lance", actIndex: 0, category: "standard", title: "FIRST LANCE / 第一枪骑", summary: "Striker 先压缩空间，随后两名 Lancer 以长前摇直线冲锋检查侧移落点。", designTags: ["CHARGE", "TELEGRAPH"], waves: [[S, S, S, S], [L, S, L]], formation: 2 },
  { slug: "gunner-steps", actIndex: 0, category: "standard", title: "GUNNER STEPS / 枪列换位", summary: "两批远近混合小队交替接管四个角，鼓励沿弹线反向突进。", designTags: ["RANGED", "ROTATION"], waves: [[G, G, S, S], [G, G, S]], formation: 3 },
  { slug: "broken-line", actIndex: 0, category: "standard", title: "BROKEN LINE / 断线站台", summary: "双 Anchor 将开放场切成三条刀路；Lancer 在第二波利用中轴制造可读封锁。", designTags: ["ANCHOR", "LANES"], waves: [[S, G, S, G], [S, L, S]], formation: 0, obstacles: anchors },
  { slug: "converging-signals", actIndex: 0, category: "standard", title: "CONVERGING SIGNALS / 汇聚信号", summary: "Gunner 持续制造弹幕，双 Lancer 延迟进入；玩家必须在三类 Telegraph 之间选择下一刀。", designTags: ["MIXED", "PRE-BOSS"], waves: [[G, S, G, S, G], [L, S, L]], formation: 1 },
  { slug: "redline-initiation", actIndex: 0, category: "elite", title: "REDLINE INITIATION / 红线试炼", summary: "Redline Lancer 进行二段再锁定冲锋，普通单位负责封住其第一次冲锋后的安全区。", designTags: ["ELITE", "DOUBLE-CHARGE"], waves: [[S, G, S, G, S], [ER, S, G, G, S]], formation: 2 },
  { slug: "twin-line", actIndex: 0, category: "elite", title: "TWIN LINE / 双枪列", summary: "Twin Gunner 的三发扇射与四名 Gunner 形成宽弹幕，Striker 迫使玩家主动切入。", designTags: ["ELITE", "VOLLEY"], waves: [[S, G, S, G, S], [ET, G, G, S]], formation: 3 },
  { slug: "clean-line", actIndex: 0, category: "challenge", title: "CLEAN LINE / 净空刀路", summary: "Anchor 将路线压窄；在 45 秒内清场且整场不撞击任何 Obstacle。", designTags: ["CHALLENGE", "PRECISION"], waves: [[S, S, G, S], [S, G, S, G]], formation: 1, obstacles: anchors, challenge: challenge("challenge-clean-line-act1-v1", "CLEAN LINE", "45 秒内完成，且不发生任何障碍物撞击。", "clean-line", 1, rerouteReward("成功：Reroute Token +1。"), 45_000) },
  { slug: "bullet-weave", actIndex: 0, category: "challenge", title: "BULLET WEAVE / 弹雨织线", summary: "五名 Gunner 提供稳定弹源；清场前用 Dash 切掉至少 8 枚敌方 Projectile。", designTags: ["CHALLENGE", "PROJECTILE"], waves: [[G, G, S, G], [G, S, G]], formation: 0, challenge: challenge("challenge-bullet-weave-act1-v1", "BULLET WEAVE", "清场前切掉至少 8 枚敌方 Projectile。", "projectile-cuts", 8, energyReward("成功：下一场战斗 +25 Ultimate Energy。")) },

  // ACT II — 7 Standard / 3 Elite / 2 Challenge
  { slug: "wall-lesson", actIndex: 1, category: "standard", title: "WALL LESSON / 墙面教学", summary: "Constructor 建墙、Gunner 守线、Lancer 逼近；Barrier 既是威胁，也是折射构筑的弹射板。", designTags: ["BARRIER", "REFRACTION"], waves: [[C, S, G, S], [C, G, S, L]], formation: 0 },
  { slug: "minefield-shift", actIndex: 1, category: "standard", title: "MINEFIELD SHIFT / 雷区换轨", summary: "Mine Layer 逐步污染落点，三名 Gunner 迫使玩家在武装完成前切换半场。", designTags: ["MINE", "AREA-DENIAL"], waves: [[M, G, S, G], [M, G, S, S, S]], formation: 1, hazards: minePair },
  { slug: "long-sightline", actIndex: 1, category: "standard", title: "LONG SIGHTLINE / 长距瞄线", summary: "双 Sniper 锁住纵轴，Gunner 与 Striker 让停留和直线撤退都付出代价。", designTags: ["SNIPER", "SIGHTLINE"], waves: [[N, G, S, S], [N, G, S, S]], formation: 2 },
  { slug: "barricade-cross", actIndex: 1, category: "standard", title: "BARRICADE CROSS / 隔墙交叉", summary: "预部署 Barrier 分割场地，Constructor 持续改写路线，Lancer 利用开口冲锋。", designTags: ["BARRIER", "CHARGE"], waves: [[C, S, G, L], [C, S, G, L]], formation: 3, obstacles: barrierPair },
  { slug: "arc-transit", actIndex: 1, category: "standard", title: "ARC TRANSIT / 电弧换乘", summary: "Arc Rail 先以 1.4 秒 Telegraph 切场，Mine Layer 与 Gunner 接管剩余安全带。", designTags: ["ARC-RAIL", "TIMING"], waves: [[M, G, S, S], [M, G, S, S]], formation: 1, hazards: arcRail },
  { slug: "reflector-maze", actIndex: 1, category: "standard", title: "REFLECTOR MAZE / 折射迷阵", summary: "两面固定反射墙改变直线通道，Constructor 的临时墙让路线在战斗中继续变化。", designTags: ["REFLECTOR", "DYNAMIC-GEOMETRY"], waves: [[C, G, S, G], [C, M, G, S, G]], formation: 2, obstacles: reflectors },
  { slug: "compressed-relay", actIndex: 1, category: "standard", title: "COMPRESSED RELAY / 压缩中继", summary: "Constructor、Mine Layer 与 Lancer 分两波接管狭窄轨道，是 Act II 机制综合检查。", designTags: ["MIXED", "PRE-BOSS"], waves: [[C, M, G, S], [C, M, L, L]], formation: 0 },
  { slug: "architect-primer", actIndex: 1, category: "elite", title: "ARCHITECT PRIMER / 架构师样本", summary: "Architect 同时维持两面墙并迁移旧墙；普通 Constructor 延长几何压力。", designTags: ["ELITE", "MOVING-BARRIERS"], waves: [[C, G, S, L, S], [EA, C, G, S, G]], formation: 3 },
  { slug: "twin-marksmen", actIndex: 1, category: "elite", title: "TWIN MARKSMEN / 双线狙阵", summary: "Twin Gunner 与两名 Sniper 形成远程火网，Moving Gate 周期性遮断安全直线。", designTags: ["ELITE", "SNIPER", "MOVING-GATE"], waves: [[N, G, S, G], [ET, N, G, S, S]], formation: 0, obstacles: movingGate },
  { slug: "redline-mine-run", actIndex: 1, category: "elite", title: "REDLINE MINE RUN / 红线雷奔", summary: "Redline Lancer 的二段冲锋穿过逐步武装的雷区，第二波普通 Lancer 继续追击。", designTags: ["ELITE", "MINE", "CHARGE"], waves: [[M, G, S, S, L], [ER, M, L, S, S]], formation: 1, hazards: minePair },
  { slug: "bullet-archive", actIndex: 1, category: "challenge", title: "BULLET ARCHIVE / 弹道档案", summary: "Gunner 与 Sniper 提供两种速度的弹道；清场前切掉至少 12 枚 Projectile。", designTags: ["CHALLENGE", "PROJECTILE"], waves: [[G, G, N, G], [G, G, N, S]], formation: 2, challenge: challenge("challenge-bullet-weave-act2-v1", "BULLET ARCHIVE", "清场前切掉至少 12 枚敌方 Projectile。", "projectile-cuts", 12, intelReward("成功：Intel +1。")) },
  { slug: "clean-rails", actIndex: 1, category: "challenge", title: "CLEAN RAILS / 无碰换轨", summary: "Arc Rail、Mine 与 Barrier 同时压缩落点；45 秒内清场且不撞 Obstacle。", designTags: ["CHALLENGE", "ARC-RAIL", "PRECISION"], waves: [[C, M, G, S], [C, M, G, S]], formation: 3, obstacles: barrierPair, hazards: arcRail, challenge: challenge("challenge-clean-line-act2-v1", "CLEAN RAILS", "45 秒内完成，且不发生任何障碍物撞击。", "clean-line", 1, energyReward("成功：下一场战斗 +25 Ultimate Energy。"), 45_000) },

  // ACT III — 7 Standard / 3 Elite / 2 Challenge
  { slug: "vanguard-front", actIndex: 2, category: "standard", title: "VANGUARD FRONT / 先锋正面", summary: "三名 Vanguard 以可见前甲推进，后方 Gunner 迫使玩家决定先卸甲还是绕后处决。", designTags: ["ARMOR", "FLANK"], waves: [[V, S, V, G, S], [V, G, S, L, S]], formation: 0 },
  { slug: "bastion-triad", actIndex: 2, category: "standard", title: "BASTION TRIAD / 堡垒三面", summary: "Bastion 的前左前三块独立甲与 Vanguard 形成慢速装甲墙，背部通道保持开放。", designTags: ["MULTI-ARMOR", "BREACH"], waves: [[B, V, S, S], [B, V, V, S]], formation: 1 },
  { slug: "blink-intercept", actIndex: 2, category: "standard", title: "BLINK INTERCEPT / 闪现截击", summary: "Blink Stalker 以预测落点闪现，Lancer 与 Gunner 让同一条逃生线不能连续复用。", designTags: ["BLINK", "INTERCEPT"], waves: [[K, G, L, S], [K, K, G, L]], formation: 2 },
  { slug: "armor-corridor", actIndex: 2, category: "standard", title: "ARMOR CORRIDOR / 装甲走廊", summary: "固定反射墙构成背袭通道，Constructor 尝试用临时 Barrier 关闭其中一侧。", designTags: ["ARMOR", "REFLECTOR"], waves: [[B, V, C, S], [B, V, C, S]], formation: 3, obstacles: reflectors },
  { slug: "mirror-fire", actIndex: 2, category: "standard", title: "MIRROR FIRE / 镜域火线", summary: "Blink Stalker 穿越双 Sniper 瞄线，玩家必须在锁定线消失前换位。", designTags: ["BLINK", "SNIPER"], waves: [[N, K, G, S], [N, K, G, S]], formation: 0 },
  { slug: "broken-symmetry", actIndex: 2, category: "standard", title: "BROKEN SYMMETRY / 破缺对称", summary: "Bastion 固守中轴，两侧 Vanguard 与 Blink Stalker 以不同速度破坏镜像式安全预判。", designTags: ["MIXED", "ASYMMETRY"], waves: [[B, V, K, L], [V, K, L]], formation: 1 },
  { slug: "archive-collapse", actIndex: 2, category: "standard", title: "ARCHIVE COLLAPSE / 档案坍塌", summary: "双 Bastion、双 Blink 与远端 Gunner 构成 Act III 的装甲与换位综合检查。", designTags: ["MIXED", "PRE-BOSS"], waves: [[B, K, V, G], [B, K, G]], formation: 2 },
  { slug: "fortress-audit", actIndex: 2, category: "elite", title: "FORTRESS AUDIT / 四甲审计", summary: "Fortress 四面均有独立甲片；两名 Bastion 延长破甲链，Blink Stalker 惩罚原地蓄力。", designTags: ["ELITE", "QUAD-ARMOR"], waves: [[B, V, S, G, B], [EF, V, S, K]], formation: 3 },
  { slug: "architect-armor", actIndex: 2, category: "elite", title: "ARCHITECT ARMOR / 装甲筑城", summary: "Architect 移动双墙保护 Bastion 与 Vanguard；玩家要主动创造可蓄力贯穿的同轴目标。", designTags: ["ELITE", "BARRIER", "ARMOR"], waves: [[C, V, S, G, S], [EA, C, B, V, S]], formation: 0 },
  { slug: "redline-mirrors", actIndex: 2, category: "elite", title: "REDLINE MIRRORS / 红线镜袭", summary: "Redline Lancer 与三名 Blink Stalker 轮流重定向，Vanguard 负责封住低风险正面路线。", designTags: ["ELITE", "BLINK", "CHARGE"], waves: [[K, L, V, S, K], [ER, K, L, V]], formation: 1 },
  { slug: "breach-chain", actIndex: 2, category: "challenge", title: "BREACH CHAIN / 连锁破甲", summary: "装甲单位按同轴波次进入；使用一次 Charged Dash 卸掉至少 2 块 Armor。", designTags: ["CHALLENGE", "ARMOR"], waves: [[V, B, S, G], [V, B, V, S]], formation: 2, challenge: challenge("challenge-breach-chain-act3-v1", "BREACH CHAIN", "任意一次 Charged Dash 中卸掉至少 2 块 Armor。", "charged-multi-break", 2, rerouteReward("成功：Reroute Token +1。")) },
  { slug: "silent-mirror", actIndex: 2, category: "challenge", title: "SILENT MIRROR / 静默镜域", summary: "高速 Blink 与双 Sniper 组成换位考题；不使用 Ultimate 完成清场。", designTags: ["CHALLENGE", "NO-ULTIMATE"], waves: [[K, N, G, K], [K, N, G]], formation: 3, challenge: challenge("challenge-silent-core-act3-v1", "SILENT MIRROR", "整场不执行 Ultimate，并完成清场。", "no-ultimate", 1, intelReward("成功：Intel +1。")) },

  // ACT IV — 8 Standard / 4 Elite / 3 Challenge
  { slug: "conductor-debut", actIndex: 3, category: "standard", title: "CONDUCTOR DEBUT / 指挥者登场", summary: "Conductor 缩短周围单位下一次前摇，基础近远单位用于清楚展示节奏变化。", designTags: ["CONDUCTOR", "TEMPO"], waves: [[O, S, G, S, L], [V, G, V, G, L, S]], formation: 0 },
  { slug: "rail-synthesis", actIndex: 3, category: "standard", title: "RAIL SYNTHESIS / 轨道合成", summary: "Arc Rail 为主机制，Constructor、Mine、Sniper 和装甲单位只各承担一个辅助职责。", designTags: ["ARC-RAIL", "MIXED"], waves: [[C, M, N, S, S], [V, B, K, O]], formation: 1, hazards: arcRail },
  { slug: "armored-barrage", actIndex: 3, category: "standard", title: "ARMORED BARRAGE / 装甲弹幕", summary: "Vanguard 与 Bastion 吸收正面突进，Gunner、Sniper 和 Conductor 在后方持续施压。", designTags: ["ARMOR", "PROJECTILE"], waves: [[V, G, B, G, S], [V, N, G, O, S]], formation: 2 },
  { slug: "moving-gate", actIndex: 3, category: "standard", title: "MOVING GATE / 移动门阵", summary: "Moving Gate 横移改变直线可用性，Constructor 与 Mine Layer 延续几何封锁，Blink 从空隙截击。", designTags: ["MOVING-GATE", "GEOMETRY"], waves: [[C, M, K, L, O], [C, M, K, L]], formation: 3, obstacles: movingGate },
  { slug: "mixed-pressure", actIndex: 3, category: "standard", title: "MIXED PRESSURE / 混合压力", summary: "每类威胁只出现一到两次，以 Conductor 为节奏中心检查玩家对完整敌人语言的掌握。", designTags: ["MIXED", "ROSTER-CHECK"], waves: [[B, V, K, N], [C, M, O, G, G]], formation: 0 },
  { slug: "sniper-choir", actIndex: 3, category: "standard", title: "SNIPER CHOIR / 狙击合唱", summary: "双 Sniper 与四名 Gunner 形成可切除弹幕，Conductor 改变第二波节拍，Vanguard 保护侧翼。", designTags: ["SNIPER", "CONDUCTOR"], waves: [[N, G, G, V, S], [N, G, G, V, O]], formation: 1 },
  { slug: "breach-lattice", actIndex: 3, category: "standard", title: "BREACH LATTICE / 破甲晶格", summary: "双 Bastion、双 Vanguard 与双 Constructor 排成多条贯穿轴，鼓励计划蓄力破甲链。", designTags: ["ARMOR", "BARRIER"], waves: [[B, V, C, S], [B, V, C, S, O]], formation: 2 },
  { slug: "redline-rehearsal", actIndex: 3, category: "standard", title: "REDLINE REHEARSAL / 红线预演", summary: "Lancer、Blink、Bastion 和 Gunner 各自保留独立 Telegraph，不提前复制最终 Boss 四阶段。", designTags: ["MIXED", "PRE-BOSS"], waves: [[L, K, B, G, S], [L, K, G, O, S]], formation: 3 },
  { slug: "redline-command", actIndex: 3, category: "elite", title: "REDLINE COMMAND / 红线号令", summary: "Redline Lancer 在 Conductor 加速下重锁第二段冲锋，普通 Lancer 与 Blink 堵住迟疑落点。", designTags: ["ELITE", "CONDUCTOR", "CHARGE"], waves: [[L, L, K, S, G, S], [ER, O, L, K, G, S]], formation: 0 },
  { slug: "twin-choir", actIndex: 3, category: "elite", title: "TWIN CHOIR / 双枪合唱", summary: "Twin Gunner、双 Sniper 与四名 Gunner 构成最高密度普通弹幕，但仍受 32 Projectile 硬上限。", designTags: ["ELITE", "PROJECTILE", "SNIPER"], waves: [[N, G, G, V, S, S], [ET, O, N, G, G, S, S]], formation: 1 },
  { slug: "architect-grid", actIndex: 3, category: "elite", title: "ARCHITECT GRID / 架构网格", summary: "Architect、Moving Gate 与 Constructor 共同改写几何；Mine 和 Blink 负责惩罚固定解法。", designTags: ["ELITE", "MOVING-GATE", "BARRIER"], waves: [[C, M, K, S, O], [EA, C, M, K, S]], formation: 2, obstacles: movingGate },
  { slug: "fortress-terminal", actIndex: 3, category: "elite", title: "FORTRESS TERMINAL / 终端堡垒", summary: "Fortress 与双 Bastion 构成四向装甲核心，三名 Vanguard 让蓄力贯穿路线值得主动搭建。", designTags: ["ELITE", "QUAD-ARMOR", "PRE-BOSS"], waves: [[B, V, V, S, G], [EF, B, V, O, S]], formation: 3 },
  { slug: "silent-terminal", actIndex: 3, category: "challenge", title: "SILENT TERMINAL / 静默终端", summary: "装甲、Blink、Gunner 与 Conductor 混编；不执行 Ultimate 完成清场。", designTags: ["CHALLENGE", "NO-ULTIMATE"], waves: [[B, V, K, G, S], [V, K, G, O, S]], formation: 0, challenge: challenge("challenge-silent-core-act4-v1", "SILENT TERMINAL", "整场不执行 Ultimate，并完成清场。", "no-ultimate", 1, rerouteReward("成功：Reroute Token +1。")) },
  { slug: "bullet-cathedral", actIndex: 3, category: "challenge", title: "BULLET CATHEDRAL / 弹幕教堂", summary: "双 Sniper、五名 Gunner 与 Conductor 提供持续弹源；清场前切掉至少 16 枚 Projectile。", designTags: ["CHALLENGE", "PROJECTILE"], waves: [[N, G, G, V, S], [N, G, G, G, O, S]], formation: 1, challenge: challenge("challenge-bullet-weave-act4-v1", "BULLET CATHEDRAL", "清场前切掉至少 16 枚敌方 Projectile。", "projectile-cuts", 16, energyReward("成功：下一场战斗 +25 Ultimate Energy。")) },
  { slug: "breach-terminal", actIndex: 3, category: "challenge", title: "BREACH TERMINAL / 终端破甲", summary: "Bastion、Vanguard 与 Constructor 在同轴位置进入；一次 Charged Dash 卸掉至少 3 块 Armor。", designTags: ["CHALLENGE", "ARMOR"], waves: [[B, V, C, V], [B, V, C, O]], formation: 2, challenge: challenge("challenge-breach-chain-act4-v1", "BREACH TERMINAL", "任意一次 Charged Dash 中卸掉至少 3 块 Armor。", "charged-multi-break", 3, intelReward("成功：Intel +1。")) },
];

function wavesForRecipe(recipe: EncounterRecipe): EncounterWave[] {
  const formation = FORMATIONS[recipe.formation % FORMATIONS.length]!;
  return recipe.waves.map((enemyIds, waveIndex) => {
    const offset = waveIndex * 4 + recipe.actIndex * 2;
    return {
      id: `encounter-act${recipe.actIndex + 1}-${recipe.slug}-v1:wave-${String(waveIndex + 1).padStart(2, "0")}`,
      activation: waveIndex === 0 ? "immediate" as const : "after-previous-killed" as const,
      warningDurationMs: 750,
      spawns: enemyIds.map((enemyDefinitionId, spawnIndex) => {
        const position = formation[(spawnIndex + offset) % formation.length]!;
        return {
          id: `wave-${waveIndex + 1}-spawn-${String(spawnIndex + 1).padStart(2, "0")}`,
          enemyDefinitionId,
          position: copyVec2(position),
          facing: facingTowardOrigin(position),
        };
      }),
    };
  });
}

function facingTowardOrigin(position: Vec2): Vec2 {
  const length = Math.hypot(position.x, position.z);
  return length <= 1e-6 ? vec2(0, -1) : vec2(-position.x / length, -position.z / length);
}

function encounterForRecipe(recipe: EncounterRecipe): FullGameEncounterDefinition {
  const contract = FULL_GAME_ACT_PRESENTATION_CONTRACTS[recipe.actIndex];
  if (!contract) throw new Error(`Missing presentation contract for Act ${recipe.actIndex + 1}.`);
  return {
    id: `encounter-act${recipe.actIndex + 1}-${recipe.slug}-v1`,
    actIndex: recipe.actIndex,
    category: recipe.category,
    title: recipe.title,
    summary: recipe.summary,
    designTags: recipe.designTags,
    environmentId: contract.environmentId,
    lightingProfileId: contract.lightingProfileId,
    presentationId: contract.presentationId,
    completionRule: "all-hostiles-defeated",
    enemyMoveSpeed: 2.75 + recipe.actIndex * 0.16,
    waves: wavesForRecipe(recipe),
    initialObstacles: (recipe.obstacles ?? []).map(copyObstacleSpawn),
    initialHazards: (recipe.hazards ?? []).map(copyHazardSpawn),
    challenge: recipe.challenge ?? null,
  };
}

function copyObstacleSpawn(spawn: EncounterObstacleSpawnDefinition): EncounterObstacleSpawnDefinition {
  return {
    ...spawn,
    position: copyVec2(spawn.position),
    velocity: spawn.velocity ? copyVec2(spawn.velocity) : undefined,
  };
}

function copyHazardSpawn(spawn: EncounterHazardSpawnDefinition): EncounterHazardSpawnDefinition {
  return { ...spawn, position: copyVec2(spawn.position) };
}

export const FULL_GAME_NON_BOSS_ENCOUNTERS: readonly FullGameEncounterDefinition[] = RECIPES.map(encounterForRecipe);

export const ENCOUNTER_PRESSURE_COSTS: Readonly<Record<EnemyDefinitionId, number>> = {
  [S]: 1,
  [G]: 1.4,
  [L]: 1.7,
  [C]: 2,
  [M]: 1.8,
  [N]: 2.2,
  [V]: 2,
  [B]: 2.8,
  [K]: 2.4,
  [O]: 2.5,
  [ER]: 3.2,
  [ET]: 2.9,
  [EA]: 3.5,
  [EF]: 4.3,
};

export const ENCOUNTER_PRESSURE_RANGES = [
  { standard: [8, 11] as const, elite: [12, 14] as const },
  { standard: [11, 14] as const, elite: [15, 17] as const },
  { standard: [14, 17] as const, elite: [18, 20] as const },
  { standard: [17, 20] as const, elite: [21, 24] as const },
] as const;

export function pressureForEncounter(definition: FullGameEncounterDefinition): EncounterPressureSummary {
  const enemyPressure = definition.waves.reduce((encounterTotal, wave) => (
    encounterTotal + wave.spawns.reduce((waveTotal, spawn) => {
      const cost = ENCOUNTER_PRESSURE_COSTS[spawn.enemyDefinitionId];
      if (cost === undefined) throw new Error(`Missing pressure cost for ${spawn.enemyDefinitionId}.`);
      return waveTotal + cost;
    }, 0)
  ), 0);
  const environmentPressure = definition.initialObstacles.reduce((total, obstacle) => (
    total + (obstacle.definitionId === RAIL_GATE_OBSTACLE_ID ? 1.5 : 0)
  ), 0) + definition.initialHazards.reduce((total, hazard) => (
    total + (hazard.definitionId === ARC_RAIL_HAZARD_ID ? 1.2 : 0)
  ), 0);
  return {
    enemyPressure: roundPressure(enemyPressure),
    environmentPressure: roundPressure(environmentPressure),
    totalPressure: roundPressure(enemyPressure + environmentPressure),
  };
}

export function expectedPressureRange(definition: FullGameEncounterDefinition): readonly [number, number] | null {
  if (definition.category === "boss") return null;
  const act = ENCOUNTER_PRESSURE_RANGES[definition.actIndex];
  if (!act) throw new Error(`Missing pressure range for Act ${definition.actIndex + 1}.`);
  return definition.category === "elite" ? act.elite : act.standard;
}

export function validateEncounterPressure(definition: FullGameEncounterDefinition): EncounterPressureSummary {
  const summary = pressureForEncounter(definition);
  const range = expectedPressureRange(definition);
  if (range && (summary.totalPressure < range[0] - 1e-6 || summary.totalPressure > range[1] + 1e-6)) {
    throw new Error(
      `${definition.id} pressure ${summary.totalPressure.toFixed(1)} is outside ${range[0]}-${range[1]}.`,
    );
  }
  return summary;
}

export function derivedEncounterTags(definition: FullGameEncounterDefinition): string[] {
  const tags = new Set<string>([definition.category.toUpperCase()]);
  for (const wave of definition.waves) {
    for (const spawn of wave.spawns) {
      const enemy = enemyDefinitions.get(spawn.enemyDefinitionId);
      tags.add(enemy.archetype.toUpperCase().replaceAll("-", " "));
      if (enemy.armorProfileId) tags.add("ARMOR");
      if (enemy.tags.includes("projectile")) tags.add("PROJECTILE");
      if (enemy.tags.includes("obstacle")) tags.add("OBSTACLE");
      if (enemy.tags.includes("hazard")) tags.add("HAZARD");
    }
  }
  if (definition.initialObstacles.length > 0) tags.add("OBSTACLE");
  if (definition.initialHazards.length > 0) tags.add("HAZARD");
  for (const tag of definition.designTags) tags.add(tag);
  return [...tags];
}

function roundPressure(value: number): number {
  return Math.round(value * 10) / 10;
}
