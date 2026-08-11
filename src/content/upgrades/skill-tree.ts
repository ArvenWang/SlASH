import type { SkillDefinition, SkillModuleRootDefinition } from "./types";

function skill(
  definition: Omit<SkillDefinition, "cost" | "rarity" | "modifiers" | "tags" | "presentation"> & {
    readonly rarity?: SkillDefinition["rarity"];
    readonly modifiers?: SkillDefinition["modifiers"];
    readonly tags?: readonly string[];
    readonly presentation: Omit<SkillDefinition["presentation"], "name" | "description">;
  },
): SkillDefinition {
  const { presentation, rarity = "common", modifiers = [], tags = [], ...rest } = definition;
  return {
    ...rest,
    cost: 1,
    rarity,
    modifiers,
    tags: ["production", "passive", rest.module, ...tags],
    presentation: {
      ...presentation,
      name: `${presentation.nameZh} / ${presentation.nameEn}`,
      description: `${presentation.effect} 触发：${presentation.trigger} 限制：${presentation.limit}`,
    },
  };
}

export const SKILL_MODULE_ROOTS: readonly SkillModuleRootDefinition[] = [
  {
    id: "root-basic-dash",
    module: "basic",
    nameZh: "普通突进",
    nameEn: "BASIC DASH",
    description: "点击目标点发动直线突进。Transit 无敌，可斩杀裸露普通敌人并抵消普通子弹。",
  },
  {
    id: "root-charged-dash",
    module: "charged",
    nameZh: "破阵突进",
    nameEn: "CHARGED DASH",
    description: "650ms 满蓄后贯穿敌群；任何角度命中现存护甲都卸甲，命中裸露身体则击杀。",
  },
  {
    id: "root-ultimate",
    module: "ultimate",
    nameZh: "矢量专注",
    nameEn: "VECTOR FOCUS",
    description: "100 Energy 时规划 3 段路径并依次执行，不引入第四种主动攻击。",
  },
  {
    id: "root-shared",
    module: "shared",
    nameZh: "战斗核心",
    nameEn: "COMBAT CORE",
    description: "同时改变 Basic Dash 与 Charged Dash 节奏的跨模组被动。",
  },
];

export const FULL_GAME_SKILL_DEFINITIONS: readonly SkillDefinition[] = [
  skill({
    id: "skill-wide-slash-v1", module: "basic", tier: 1, branchId: "basic-corridor", prerequisites: [],
    hookIds: ["basic-corridor-scale"],
    modifiers: [{ hook: "before-dash", field: "hitRadius", operation: "multiply", value: 1.3 }],
    presentation: { code: "B-01", nameZh: "宽刃", nameEn: "WIDE SLASH", effect: "Basic 斩击走廊宽度 +30%。", trigger: "每次 Basic Dash。", limit: "不放大 Charged 或 Ultimate。", prerequisite: "普通突进根节点。" },
  }),
  skill({
    id: "skill-gravity-slash-v1", module: "basic", tier: 2, branchId: "basic-corridor", prerequisites: ["skill-wide-slash-v1"],
    hookIds: ["basic-corridor-edge-pull"],
    presentation: { code: "B-02", nameZh: "磁轨", nameEn: "GRAVITY SLASH", effect: "路径外缘的敌人在 0.35 秒内被拉向刀线。", trigger: "敌人进入加宽走廊的外侧 30%。", limit: "最多拉动 0.6m；不造成伤害、不移动 Boss。", prerequisite: "B-01 宽刃。" },
  }),
  skill({
    id: "skill-curve-dash-v1", module: "basic", tier: 1, branchId: "basic-geometry", prerequisites: [],
    hookIds: ["basic-quadratic-path"],
    presentation: { code: "B-03", nameZh: "弧线冲刺", nameEn: "CURVE DASH", effect: "可用一个控制点把 Basic 的直线路径改成弧线。", trigger: "拥有技能后拖动并释放 Basic 目标。", limit: "单次曲率上限 65°；碰撞、Cross、Echo 读取真实弧线。", prerequisite: "普通突进根节点。" },
  }),
  skill({
    id: "skill-refraction-v1", module: "basic", tier: 1, branchId: "basic-collision", prerequisites: [],
    hookIds: ["dash-obstacle-refraction"],
    presentation: { code: "B-04", nameZh: "折射", nameEn: "REFRACTION", effect: "撞到可折射障碍物时按碰撞法线反射并继续突进。", trigger: "每次 Dash 第一次撞到可折射 Obstacle。", limit: "每次 Dash 最多折射 1 次；反射方向完全由入射角决定。", prerequisite: "普通突进根节点。" },
  }),
  skill({
    id: "skill-prism-momentum-v1", module: "basic", tier: 2, branchId: "basic-collision", prerequisites: ["skill-refraction-v1"],
    hookIds: ["refraction-second-leg-scale", "refraction-kill-recovery"],
    presentation: { code: "B-05", nameZh: "折光续势", nameEn: "PRISM MOMENTUM", effect: "折射第二段宽度 +25%；该段每杀 1 人，本次 Recovery -40ms。", trigger: "发生折射后的第二段路径。", limit: "Recovery 减免最多计算 3 人，并受全局下限约束。", prerequisite: "B-04 折射。" },
  }),
  skill({
    id: "skill-cross-execution-v1", module: "basic", tier: 1, branchId: "basic-path-memory", prerequisites: [],
    hookIds: ["stored-path-cross-execution"],
    presentation: { code: "B-06", nameZh: "交叉处决", nameEn: "CROSS EXECUTION", effect: "保存最近实际路径 2.5 秒；下一条路径交叉时在首个交点触发空间冲击。", trigger: "新路径与唯一 Stored Line 相交。", limit: "不交叉则新线替换旧线；触发后两线立即清空。", prerequisite: "普通突进根节点。" },
  }),
  skill({
    id: "skill-cross-purge-v1", module: "basic", tier: 2, branchId: "basic-path-memory", prerequisites: ["skill-cross-execution-v1"],
    hookIds: ["cross-projectile-purge", "cross-armor-interrupt"],
    presentation: { code: "B-07", nameZh: "交点净空", nameEn: "CROSS PURGE", effect: "Cross 冲击抵消半径 3m 内普通子弹，并打断装甲普通敌人。", trigger: "Cross Execution 成功触发。", limit: "打断 0.45 秒；不卸甲、不打断 Boss。", prerequisite: "B-06 交叉处决。" },
  }),
  skill({
    id: "skill-echo-slash-v1", module: "basic", tier: 1, branchId: "basic-path-memory", prerequisites: [],
    hookIds: ["path-echo-once"],
    presentation: { code: "B-08", nameZh: "残响斩", nameEn: "ECHO SLASH", effect: "完成 Dash 后 0.4 秒沿真实路径再斩一次。", trigger: "Basic 或 Charged 的实际路径完成。", limit: "玩家不移动；Echo 不新建 Stored Line，不复制破甲冲量。", prerequisite: "普通突进根节点。" },
  }),
  skill({
    id: "skill-double-echo-v1", module: "basic", tier: 2, branchId: "basic-path-memory", prerequisites: ["skill-echo-slash-v1"],
    hookIds: ["path-echo-second"],
    presentation: { code: "B-09", nameZh: "双重残响", nameEn: "DOUBLE ECHO", effect: "完成 Dash 后 0.8 秒再回放同一路径一次。", trigger: "第一段 Echo 已排入时间轴。", limit: "第二次不变宽、不写 Stored Line；单条路径最多两次 Echo。", prerequisite: "B-08 残响斩。" },
  }),
  skill({
    id: "skill-impact-burst-v1", module: "basic", tier: 1, branchId: "basic-endpoint", prerequisites: [],
    hookIds: ["basic-endpoint-impact"],
    presentation: { code: "B-10", nameZh: "落点爆发", nameEn: "IMPACT BURST", effect: "路径终点生成半径 2.2m 的一次性切割冲击。", trigger: "终点命中敌人，或敌人进入终点 1.2m 容错区。", limit: "每次 Dash 最多 1 次；不在折射点或卸甲点重复触发。", prerequisite: "普通突进根节点。" },
  }),
  skill({
    id: "skill-projectile-reversal-v1", module: "basic", tier: 1, branchId: "basic-projectile", prerequisites: [],
    hookIds: ["basic-projectile-reversal"],
    presentation: { code: "B-11", nameZh: "弹反", nameEn: "PROJECTILE REVERSAL", effect: "被 Basic 切掉的普通子弹以 1.25 倍速度返回来源。", trigger: "Basic 斩击走廊与可抵消 Projectile 相交。", limit: "每次 Dash 最多返回 8 发；Sniper/Boss 不可反射弹只被抵消。", prerequisite: "普通突进根节点。" },
  }),
  skill({
    id: "skill-rapid-dash-v1", module: "basic", tier: 1, branchId: "basic-tempo", prerequisites: [],
    hookIds: ["basic-distance-scale", "basic-recovery-scale"],
    modifiers: [
      { hook: "before-dash", field: "distance", operation: "multiply", value: 0.65 },
      { hook: "before-dash", field: "recoveryMs", operation: "multiply", value: 0.7 },
    ],
    presentation: { code: "B-12", nameZh: "短距高频", nameEn: "RAPID DASH", effect: "Basic 最大距离 -35%，基础 Recovery -30%。", trigger: "每次 Basic Dash。", limit: "距离与 Recovery 均受 Arena 和全局安全下限约束。", prerequisite: "普通突进根节点。" },
  }),

  skill({
    id: "skill-adaptive-aim-v1", module: "charged", tier: 1, branchId: "charged-control", prerequisites: [],
    hookIds: ["charged-aim-steering"],
    presentation: { code: "C-01", nameZh: "蓄势修正", nameEn: "ADAPTIVE AIM", effect: "Charging 中可以修正锁定方向。", trigger: "按住 Charged 并移动目标。", limit: "最大 120°/s，总修正不超过 60°；不自动瞄准。", prerequisite: "破阵突进根节点。" },
  }),
  skill({
    id: "skill-quick-ignition-v1", module: "charged", tier: 2, branchId: "charged-control", prerequisites: ["skill-adaptive-aim-v1"],
    hookIds: ["charged-threshold-500"],
    presentation: { code: "C-02", nameZh: "快速点火", nameEn: "QUICK IGNITION", effect: "Charged 满蓄阈值从 650ms 降为 500ms。", trigger: "开始一次新的 Charged Charging。", limit: "不缩短未达阈值取消窗口以外的动作，也不增加 Recovery。", prerequisite: "C-01 蓄势修正。" },
  }),
  skill({
    id: "skill-overdrive-v1", module: "charged", tier: 3, branchId: "charged-control", prerequisites: ["skill-quick-ignition-v1"], rarity: "rare",
    hookIds: ["charged-overhold-width"],
    presentation: { code: "C-03", nameZh: "过载推进", nameEn: "OVERDRIVE", effect: "满蓄后可继续保持 350ms；保持到上限时走廊宽度 +40%。", trigger: "达到满蓄后继续按住 Charged。", limit: "增幅线性增长；过载期间仍原地、无无敌且可被击杀。", prerequisite: "C-02 快速点火。" },
  }),
  skill({
    id: "skill-breach-momentum-v1", module: "charged", tier: 1, branchId: "charged-breach", prerequisites: [],
    hookIds: ["charged-armor-break-recovery"],
    presentation: { code: "C-04", nameZh: "破甲动能", nameEn: "BREACH MOMENTUM", effect: "本次 Charged 每卸 1 块甲，额外 Recovery -80ms。", trigger: "Charged 命中任意角度的现存 Armor Coverage。", limit: "每次 Charged 最多计算 3 块；不改变基础破甲条件。", prerequisite: "破阵突进根节点。" },
  }),
  skill({
    id: "skill-chain-breach-v1", module: "charged", tier: 2, branchId: "charged-breach", prerequisites: ["skill-breach-momentum-v1"],
    hookIds: ["charged-chain-breach-width"],
    presentation: { code: "C-05", nameZh: "连锁破阵", nameEn: "CHAIN BREACH", effect: "每卸 1 块甲，本次 Charged 剩余路径宽度 +15%。", trigger: "甲片被 Breach Drive 实际击落。", limit: "最多 +45%；同一敌人每次 Charged 仍只结算一次。", prerequisite: "C-04 破甲动能。" },
  }),
  skill({
    id: "skill-armor-shrapnel-v1", module: "charged", tier: 3, branchId: "charged-breach", prerequisites: ["skill-chain-breach-v1"], rarity: "rare",
    hookIds: ["charged-armor-shrapnel"],
    presentation: { code: "C-06", nameZh: "甲片飞刃", nameEn: "ARMOR SHRAPNEL", effect: "脱落甲片飞向 6m 内最近的裸露普通敌人并将其击杀。", trigger: "Charged 实际卸下一块 Armor Part。", limit: "每次 Charged 最多 6 枚；不破甲、不攻击 Boss。", prerequisite: "C-05 连锁破阵。" },
  }),
  skill({
    id: "skill-execution-tempo-v1", module: "charged", tier: 1, branchId: "charged-execution", prerequisites: [],
    hookIds: ["charged-execution-recovery"],
    presentation: { code: "C-07", nameZh: "处决节奏", nameEn: "EXECUTION TEMPO", effect: "本次 Charged 第一次裸露区击杀会取消其比 Basic 多出的 200ms Recovery。", trigger: "Charged 命中没有护甲覆盖的身体区域并击杀。", limit: "每次 Charged 最多触发 1 次；基础 Recovery 仍保留。", prerequisite: "破阵突进根节点。" },
  }),
  skill({
    id: "skill-predator-drive-v1", module: "charged", tier: 2, branchId: "charged-execution", prerequisites: ["skill-execution-tempo-v1"],
    hookIds: ["charged-rear-execution-hunt-charge"],
    presentation: { code: "C-08", nameZh: "猎杀蓄势", nameEn: "PREDATOR DRIVE", effect: "背袭处决储存 1 层猎杀充能，使下一次 Charged 阈值 -35%。", trigger: "Charged 从目标背部命中裸露身体并击杀。", limit: "最多 1 层，持续 4 秒；下一次开始蓄力时消耗。", prerequisite: "C-07 处决节奏。" },
  }),
  skill({
    id: "skill-backline-battery-v1", module: "charged", tier: 3, branchId: "charged-execution", prerequisites: ["skill-predator-drive-v1"], rarity: "rare",
    hookIds: ["charged-rear-execution-energy"],
    presentation: { code: "C-09", nameZh: "背线回充", nameEn: "BACKLINE BATTERY", effect: "恢复 15 Ultimate Energy。", trigger: "每次 Charged 的第一次背袭处决。", limit: "每次 Charged 最多 15；Energy 不超过 100。", prerequisite: "C-08 猎杀蓄势。" },
  }),

  skill({
    id: "skill-additional-ultimate-slash-v1", module: "ultimate", tier: 1, branchId: "ultimate-planning", prerequisites: [],
    hookIds: ["ultimate-segment-count-four"],
    presentation: { code: "U-01", nameZh: "追加突进", nameEn: "ADDITIONAL SLASH", effect: "Ultimate 规划点和执行段数从 3 增为 4。", trigger: "进入 Vector Focus Planning。", limit: "最多 4 段；不增加 Energy 上限。", prerequisite: "矢量专注根节点。" },
  }),
  skill({
    id: "skill-tactical-window-v1", module: "ultimate", tier: 2, branchId: "ultimate-planning", prerequisites: ["skill-additional-ultimate-slash-v1"],
    hookIds: ["ultimate-planning-duration"],
    presentation: { code: "U-02", nameZh: "战术延时", nameEn: "TACTICAL WINDOW", effect: "Ultimate Planning 时间 +0.75 秒。", trigger: "进入 Vector Focus Planning。", limit: "世界时间仍为 0.12 倍，不进一步减速。", prerequisite: "U-01 追加突进。" },
  }),
  skill({
    id: "skill-vector-echo-v1", module: "ultimate", tier: 2, branchId: "ultimate-synergy", prerequisites: ["skill-additional-ultimate-slash-v1", "skill-echo-slash-v1"], rarity: "rare",
    hookIds: ["ultimate-final-vector-echo"],
    presentation: { code: "U-03", nameZh: "矢量残响", nameEn: "VECTOR ECHO", effect: "Ultimate 最后一段在 0.4 秒后回放一次斩击。", trigger: "Vector Focus 全部段数执行完成。", limit: "不移动玩家、不写 Stored Line、不为当前 Ultimate 自充能。", prerequisite: "U-01 追加突进 + B-08 残响斩。" },
  }),
  skill({
    id: "skill-cross-cascade-v1", module: "ultimate", tier: 2, branchId: "ultimate-synergy", prerequisites: ["skill-additional-ultimate-slash-v1", "skill-cross-execution-v1"], rarity: "rare",
    hookIds: ["ultimate-internal-cross"],
    presentation: { code: "U-04", nameZh: "交叉级联", nameEn: "CROSS CASCADE", effect: "Ultimate 内部路径第一次交叉时触发 Cross 冲击。", trigger: "同一次 Vector Focus 的两段真实路径相交。", limit: "每次 Ultimate 最多 1 次；结束后不保留 Stored Line。", prerequisite: "U-01 追加突进 + B-06 交叉处决。" },
  }),
  skill({
    id: "skill-projectile-return-v1", module: "ultimate", tier: 2, branchId: "ultimate-projectile", prerequisites: ["skill-projectile-reversal-v1"], rarity: "rare",
    hookIds: ["ultimate-projectile-return"],
    presentation: { code: "U-05", nameZh: "终式回弹", nameEn: "PROJECTILE RETURN", effect: "Ultimate 切掉的普通子弹集中返回各自来源。", trigger: "任一 Ultimate 段与可反射 Projectile 相交。", limit: "每段最多 8 发；不可反射弹只被抵消。", prerequisite: "B-11 弹反。" },
  }),
  skill({
    id: "skill-residual-charge-v1", module: "ultimate", tier: 2, branchId: "ultimate-energy", prerequisites: ["skill-additional-ultimate-slash-v1"],
    hookIds: ["ultimate-residual-energy"],
    presentation: { code: "U-06", nameZh: "余能回流", nameEn: "RESIDUAL CHARGE", effect: "Ultimate 结束时保留 20 Energy。", trigger: "本次 Vector Focus 共击杀至少 3 名敌人。", limit: "少于 3 杀归零；本次 Ultimate 击杀仍不自充能。", prerequisite: "U-01 追加突进。" },
  }),

  skill({
    id: "skill-kill-momentum-v1", module: "shared", tier: 1, branchId: "shared-tempo", prerequisites: [], rarity: "rare",
    hookIds: ["dash-kill-momentum"],
    presentation: { code: "S-01", nameZh: "杀意", nameEn: "KILL MOMENTUM", effect: "一次 Dash 每击杀 1 人，使下一次 Basic 或 Charged Recovery -35ms。", trigger: "Basic 或 Charged 路径击杀敌人。", limit: "最多记录 5 人；下一次 Dash 使用后清空并受 Recovery 下限约束。", prerequisite: "战斗核心根节点。" },
  }),
];

export const FULL_GAME_SKILL_IDS = FULL_GAME_SKILL_DEFINITIONS.map((definition) => definition.id);

export function fullGameSkillById(id: string): SkillDefinition {
  const definition = FULL_GAME_SKILL_DEFINITIONS.find((candidate) => candidate.id === id);
  if (!definition) throw new Error(`Unknown full-game skill id: ${id}`);
  return definition;
}
