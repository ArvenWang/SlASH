import type { RouteNodeState } from "../../game/run/types";
import { DefinitionRegistry } from "../registry";

export type RunResourceId = "next-combat-energy" | "reroute-token" | "intel";

export interface EventChoiceDefinition {
  readonly id: string;
  readonly title: string;
  readonly summary: string;
  readonly effects: readonly {
    readonly resourceId: RunResourceId;
    readonly amount: number;
    readonly maximum: number;
  }[];
}

export interface EventDefinition {
  readonly id: string;
  readonly title: string;
  readonly situation: string;
  readonly choices: readonly [EventChoiceDefinition, EventChoiceDefinition];
}

export const eventDefinitions = new DefinitionRegistry<EventDefinition>([
  {
    id: "event-signal-cache-v1",
    title: "SIGNAL CACHE / 信号缓存",
    situation: "一组离线控制核仍保留下一段轨道的作战数据，但剩余电荷只够导出一种资源。",
    choices: [
      {
        id: "cache-energy",
        title: "导出战斗电荷",
        summary: "下一场 Combat 开始时获得 25 Ultimate Energy；未进入 Combat 前持续保留，累计上限 100。",
        effects: [{ resourceId: "next-combat-energy", amount: 25, maximum: 100 }],
      },
      {
        id: "cache-intel",
        title: "导出路线情报",
        summary: "Intel +1；Planning Board 额外显示更远一层的确定节点类型与奖励，上限 3 层。",
        effects: [{ resourceId: "intel", amount: 1, maximum: 3 }],
      },
    ],
  },
  {
    id: "event-broken-switch-v1",
    title: "BROKEN SWITCH / 断裂道岔",
    situation: "道岔执行器可以被拆成一次构筑重接凭证，也可以直接给武器电容过充。",
    choices: [
      {
        id: "switch-reroute",
        title: "保留重接凭证",
        summary: "Reroute Token +1；在 Forge 中主动消耗后，本次可移动点数 +1，上限持有 2。",
        effects: [{ resourceId: "reroute-token", amount: 1, maximum: 2 }],
      },
      {
        id: "switch-energy",
        title: "烧毁执行器",
        summary: "下一场 Combat 开始时获得 40 Ultimate Energy；累计上限 100。",
        effects: [{ resourceId: "next-combat-energy", amount: 40, maximum: 100 }],
      },
    ],
  },
  {
    id: "event-archive-ghost-v1",
    title: "ARCHIVE GHOST / 档案残影",
    situation: "残影能解析更深路线，也能重建一枚锻炉认证密钥；二者只能保留其一。",
    choices: [
      {
        id: "ghost-deep-intel",
        title: "扩展预测深度",
        summary: "Intel +2；Planning Board 最多向前显示 3 层确定路线信息。",
        effects: [{ resourceId: "intel", amount: 2, maximum: 3 }],
      },
      {
        id: "ghost-reroute",
        title: "重建锻炉密钥",
        summary: "Reroute Token +1；只在玩家明确点击使用时消耗。",
        effects: [{ resourceId: "reroute-token", amount: 1, maximum: 2 }],
      },
    ],
  },
  {
    id: "event-redline-capacitor-v1",
    title: "REDLINE CAPACITOR / 红线电容",
    situation: "高压电容足以让下一战提前进入 Vector Focus，也可以换取一次额外构筑移动。",
    choices: [
      {
        id: "capacitor-energy",
        title: "接入武器回路",
        summary: "下一场 Combat 开始时获得 50 Ultimate Energy；累计上限 100。",
        effects: [{ resourceId: "next-combat-energy", amount: 50, maximum: 100 }],
      },
      {
        id: "capacitor-reroute",
        title: "封装认证脉冲",
        summary: "Reroute Token +1；Forge 使用后本次移动上限 +1。",
        effects: [{ resourceId: "reroute-token", amount: 1, maximum: 2 }],
      },
    ],
  },
]);

export function eventForRouteNode(node: RouteNodeState, runSeed: number): EventDefinition {
  const definitions = eventDefinitions.list();
  if (definitions.length === 0) throw new Error("Event content registry is empty.");
  let hash = runSeed >>> 0;
  for (let index = 0; index < node.id.length; index += 1) {
    hash = Math.imul(hash ^ node.id.charCodeAt(index), 0x45d9f3b) >>> 0;
  }
  return definitions[hash % definitions.length]!;
}
