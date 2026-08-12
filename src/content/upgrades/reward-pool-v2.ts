import type { UpgradeId } from "../../core/ids";
import { fullGameSkillById } from "./skill-tree";
import type { SkillDefinition } from "./types";

export const REWARD_POOL_V2_POOL_VERSION = "reward-pool-v2.0.0" as const;

export type RewardPoolV2ProductStatus = "confirmed" | "implemented-review";

export interface RewardPoolV2Entry {
  readonly id: UpgradeId;
  readonly productStatus: RewardPoolV2ProductStatus;
  readonly name: string;
  readonly effect: string;
}

function reward(
  id: UpgradeId,
  productStatus: RewardPoolV2ProductStatus,
  name: string,
  effect: string,
): RewardPoolV2Entry {
  return { id, productStatus, name, effect };
}

export const REWARD_POOL_V2_ENTRIES = [
  reward("skill-wide-slash-v1", "implemented-review", "宽刃", "普通突进的斩击宽度扩大30%。"),
  reward("skill-curve-dash-v1", "implemented-review", "弧线冲刺", "普通突进可以沿弧线路径发动。"),
  reward("skill-refraction-v1", "implemented-review", "折射", "突进撞上障碍后折射一次并继续前进。"),
  reward("skill-prism-momentum-v1", "implemented-review", "折光续势", "折射后斩击更宽，击杀还能缩短收招。"),
  reward("skill-cross-execution-v1", "confirmed", "交叉处决", "两次突进路径相交时引爆交叉冲击。"),
  reward("skill-cross-purge-v1", "implemented-review", "交点净空", "交叉冲击清除附近子弹并打断装甲敌人。"),
  reward("skill-echo-slash-v1", "confirmed", "残响斩", "突进结束后，沿原路径追加一次斩击。"),
  reward("skill-double-echo-v1", "implemented-review", "双重残响", "同一路径会再追加第二次残响斩击。"),
  reward("skill-impact-burst-v1", "implemented-review", "落点爆发", "突进终点会爆发一次范围斩击。"),
  reward("skill-projectile-reversal-v1", "implemented-review", "弹反", "被斩中的普通子弹会加速飞回来源。"),
  reward("skill-rapid-dash-v1", "implemented-review", "短距高频", "普通突进距离缩短，收招速度显著加快。"),
  reward("skill-adaptive-aim-v1", "implemented-review", "蓄势修正", "蓄力期间可以持续修正突进方向。"),
  reward("skill-quick-ignition-v1", "implemented-review", "快速点火", "破阵突进更快达到满蓄状态。"),
  reward("skill-overdrive-v1", "implemented-review", "过载推进", "继续蓄力可让破阵突进的斩击更宽。"),
  reward("skill-breach-momentum-v1", "implemented-review", "破甲动能", "破阵突进每次卸甲都会缩短收招。"),
  reward("skill-chain-breach-v1", "implemented-review", "连锁破阵", "连续卸甲会逐步扩大本次斩击宽度。"),
  reward("skill-armor-shrapnel-v1", "implemented-review", "甲片飞刃", "脱落甲片会飞向附近的裸露敌人。"),
  reward("skill-execution-tempo-v1", "implemented-review", "处决节奏", "破阵突进首次处决会大幅缩短收招。"),
  reward("skill-predator-drive-v1", "implemented-review", "猎杀蓄势", "背袭处决会加快下一次破阵突进蓄力。"),
  reward("skill-backline-battery-v1", "implemented-review", "背线回充", "破阵突进首次背袭处决恢复15点能量。"),
  reward("skill-additional-ultimate-slash-v1", "implemented-review", "追加突进", "大招的规划与执行段数增加一段。"),
  reward("skill-tactical-window-v1", "implemented-review", "战术延时", "大招的路径规划时间延长0.75秒。"),
  reward("skill-vector-echo-v1", "implemented-review", "矢量残响", "大招最后一段会沿原路径追加一次斩击。"),
  reward("skill-cross-cascade-v1", "implemented-review", "交叉级联", "大招路径首次相交时引爆交叉冲击。"),
  reward("skill-projectile-return-v1", "implemented-review", "终式回弹", "大招斩中的普通子弹会飞回来源。"),
  reward("skill-residual-charge-v1", "implemented-review", "余能回流", "大招击杀至少三名敌人后保留20点能量。"),
  reward("skill-kill-momentum-v1", "confirmed", "杀意", "一次突进击杀越多，下一次收招越快。"),
] as const satisfies readonly RewardPoolV2Entry[];

export const REWARD_POOL_V2_ENABLED_IDS: readonly UpgradeId[] = REWARD_POOL_V2_ENTRIES.map(
  (entry) => entry.id,
);

// This is the implemented Gravity/Near-Miss direction rejected for V2 rewards.
export const REWARD_POOL_V2_DISABLED_IDS = ["skill-gravity-slash-v1"] as const satisfies readonly UpgradeId[];

export const REWARD_POOL_V2 = {
  poolVersion: REWARD_POOL_V2_POOL_VERSION,
  enabledIds: REWARD_POOL_V2_ENABLED_IDS,
  disabledIds: REWARD_POOL_V2_DISABLED_IDS,
  entries: REWARD_POOL_V2_ENTRIES,
} as const;

const rewardEntryById = new Map<UpgradeId, RewardPoolV2Entry>(
  REWARD_POOL_V2_ENTRIES.map((entry) => [entry.id, entry]),
);

export function rewardPoolV2EntryById(id: UpgradeId): RewardPoolV2Entry {
  const entry = rewardEntryById.get(id);
  if (!entry) throw new Error(`Skill is not enabled in ${REWARD_POOL_V2_POOL_VERSION}: ${id}`);
  return entry;
}

export function rewardPoolV2SkillDefinitionById(id: UpgradeId): SkillDefinition {
  rewardPoolV2EntryById(id);
  return fullGameSkillById(id);
}
