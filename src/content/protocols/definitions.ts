export type RunProtocolMode = "standard" | "assist" | "threat";

export interface ThreatProtocolDefinition {
  readonly level: 1 | 2 | 3 | 4 | 5;
  readonly id: string;
  readonly title: string;
  readonly effect: string;
}

export const ASSIST_PROTOCOL_RULES = {
  rebootPerAct: 1,
  telegraphScale: 1.25,
  projectileSpeedScale: 0.85,
} as const;

export const THREAT_PROTOCOL_DEFINITIONS: readonly ThreatProtocolDefinition[] = [
  {
    level: 1,
    id: "threat-01-elite-density",
    title: "ELITE DENSITY / 精英密度",
    effect: "每个三选一压力层额外将 1 个 Combat 选项提升为 Elite；开场层与安全层不变。",
  },
  {
    level: 2,
    id: "threat-02-live-current",
    title: "LIVE CURRENT / 延长电流",
    effect: "所有 Hazard 的 Active 持续时间 +20%；Telegraph 不缩短。",
  },
  {
    level: 3,
    id: "threat-03-boss-variation",
    title: "BOSS VARIATION / 首领变式",
    effect: "Boss 启用公开变式：额外冲锋、强化炮台、额外镜像或更密集的终局攻击。",
  },
  {
    level: 4,
    id: "threat-04-signal-loss",
    title: "SIGNAL LOSS / 情报衰减",
    effect: "Planning 的有效 Intel 深度 -1，最低为 0；已获得资源不被删除。",
  },
  {
    level: 5,
    id: "threat-05-redline",
    title: "REDLINE / 红线协议",
    effect: "每个非 Boss Combat 开场增加 1 条提前 1.4 秒显示的 Arc Rail；完整规则用于本地纪录。",
  },
];
