import type { EnemyDefinitionId } from "../../core/ids";
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
} from "../enemies/definitions";

export interface EnemyDossierDefinition {
  readonly enemyDefinitionId: EnemyDefinitionId;
  readonly title: string;
  readonly classification: "STANDARD" | "ELITE";
  readonly behavior: string;
  readonly counterplay: string;
}

export const ENEMY_DOSSIER_DEFINITIONS: readonly EnemyDossierDefinition[] = [
  {
    enemyDefinitionId: STRIKER_ENEMY_ID,
    title: "STRIKER / 突击兵",
    classification: "STANDARD",
    behavior: "短距离锁定后直刺；只有 Active 冲刺接触致命。",
    counterplay: "读完地面环与方向线后横切其路径，或在 Recovery 穿过本体。",
  },
  {
    enemyDefinitionId: GUNNER_ENEMY_ID,
    title: "GUNNER / 射手",
    classification: "STANDARD",
    behavior: "保持中距离并发射可切除的普通弹。",
    counterplay: "Dash 可抵消弹体；Projectile Reversal 可将合格弹体送回来源。",
  },
  {
    enemyDefinitionId: LANCER_ENEMY_ID,
    title: "LANCER / 枪骑兵",
    classification: "STANDARD",
    behavior: "以不少于 650ms 的锁定线预告高速冲锋。",
    counterplay: "锁线完成后再改变路线；不要在 Recovery 中停在其正前方。",
  },
  {
    enemyDefinitionId: CONSTRUCTOR_ENEMY_ID,
    title: "CONSTRUCTOR / 构筑者",
    classification: "STANDARD",
    behavior: "在玩家与自身之间部署会阻断 Dash 的临时 Barrier。",
    counterplay: "改变入射角绕过；拥有 Refraction 时可把墙转化为第二段路径。",
  },
  {
    enemyDefinitionId: MINE_LAYER_ENEMY_ID,
    title: "MINE LAYER / 布雷者",
    classification: "STANDARD",
    behavior: "持续绕行并留下先武装、再触发的实体地雷。",
    counterplay: "Dash Transit 不受爆炸伤害，但落点和 Recovery 不能停在危险区内。",
  },
  {
    enemyDefinitionId: SNIPER_ENEMY_ID,
    title: "SNIPER / 狙击手",
    classification: "STANDARD",
    behavior: "长前摇后发射高速、可切除的直线弹。",
    counterplay: "用锁定线预判射轴；沿弹道反向 Dash 可同时切弹并接近来源。",
  },
  {
    enemyDefinitionId: VANGUARD_ENEMY_ID,
    title: "VANGUARD / 先锋甲兵",
    classification: "STANDARD",
    behavior: "正面有一块真实 Coverage，普通 Dash 撞甲被阻挡。",
    counterplay: "Charged 命中前甲会卸甲并贯穿；从无甲背部命中可直接处决。",
  },
  {
    enemyDefinitionId: BASTION_ENEMY_ID,
    title: "BASTION / 棱堡",
    classification: "STANDARD",
    behavior: "前、左、右三块甲独立覆盖，只留下后部裸露区。",
    counterplay: "寻找后线处决，或用连续 Charged 逐块卸甲，裸露区随后可被任意 Dash 击杀。",
  },
  {
    enemyDefinitionId: BLINK_STALKER_ENEMY_ID,
    title: "BLINK STALKER / 闪袭者",
    classification: "STANDARD",
    behavior: "锁定玩家前方预测点，闪现到位后立即突刺。",
    counterplay: "Telegraph 期间改变最终落点；闪现不是不可读瞬移，目标点会提前显示。",
  },
  {
    enemyDefinitionId: CONDUCTOR_ENEMY_ID,
    title: "CONDUCTOR / 协律者",
    classification: "STANDARD",
    behavior: "周期强化附近友军，使其下一次 Telegraph 缩短 20%。",
    counterplay: "优先切除；缩短后仍受各攻击的最低公平前摇限制。",
  },
  {
    enemyDefinitionId: REDLINE_LANCER_ELITE_ID,
    title: "REDLINE LANCER / 红线枪骑",
    classification: "ELITE",
    behavior: "连续两段冲锋，每段都会重新锁定当前位置。",
    counterplay: "不要把第一段后的站位当作安全区；等第二条锁线出现后再确定回切路线。",
  },
  {
    enemyDefinitionId: TWIN_GUNNER_ELITE_ID,
    title: "TWIN GUNNER / 双联射手",
    classification: "ELITE",
    behavior: "一次释放三发 18° 扇形弹幕，压缩直线落点。",
    counterplay: "从扇面侧缘切入；切弹类被动可把高密度弹幕转化为反击资源。",
  },
  {
    enemyDefinitionId: ARCHITECT_ELITE_ID,
    title: "ARCHITECT / 架构师",
    classification: "ELITE",
    behavior: "维持两面 Barrier，并让较旧的一面沿横向移动。",
    counterplay: "持续重新评估路径；Refraction 可利用移动墙，但不要假设第二落点仍然空闲。",
  },
  {
    enemyDefinitionId: FORTRESS_ELITE_ID,
    title: "FORTRESS / 要塞体",
    classification: "ELITE",
    behavior: "前、后、左、右四块独立 Coverage 完整包围本体。",
    counterplay: "必须先用 Charged 卸掉接触方向的甲；随后穿过对应裸露区完成击杀。",
  },
];
