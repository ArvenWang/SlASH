# Project SlASH — Full Game Design

> 文档状态：v1.0 生产设计事实源  
> 更新时间：2026-08-12  
> 目标：把现有三关 Visual Vertical Slice 扩展为一款可以完整通关、重复构筑、可持续平衡的商业化 Web Roguelite。  
> 约束：本文件定义 Gameplay 与 Content；角色模型、动画、场景资产和最终视觉由 Presentation Registry 映射，不反向改变规则。

## 0. 已锁定的产品边界

1. 玩家始终只有三种主动攻击模组：`Basic Dash`、`Charged Dash`、`Ultimate / Vector Focus`。
2. Dash 同时承担移动和攻击；不增加传统 WASD 行走来修补关卡问题。
3. 玩家默认 1 Integrity，非 Dash Transit 状态被致命攻击命中即结束本局。
4. Dash Transit 期间无敌；普通 Projectile 与 Slash Corridor 相交时被抵消。
5. Obstacle 不是 Projectile。撞到 Obstacle 时 Dash 终止并击退；拥有 Refraction 时按真实入射角折射。
6. 普通敌人以“一条正确斩线即可击杀”为核心，不通过堆叠普通 HP 延长战斗。
7. Boss 使用装甲、弱点、阶段和空间目标，不使用传统高血量木桩。
8. 所有 Roguelite 成长都是三种主动模组的被动 Modifier，不增加第四个主动按钮。
9. 同一局最多获得 12 Skill Point，而可购买节点为 28 个；任何路线都不可能点满。
10. 规则必须确定、可序列化、可 Replay；Gameplay 不依赖 Three.js、DOM、音频或真实时间。

## 1. 游戏定位与体验目标

### 1.1 类型

俯视角 / 斜俯视 3D 高速动作 Roguelite。核心体验不是持续输出，而是：

> 观察战场 → 选择一条斩线 → 在一瞬间完成移动、闪避和击杀 → 承担落点 Recovery 风险。

### 1.2 单局目标

| 项目 | 标准目标 |
| --- | --- |
| 完整 Run | 4 Act，4 个 Boss |
| 实际访问节点 | 约 24 个，因路线选择有小幅变化 |
| 熟练玩家时长 | 35–50 分钟 |
| 首次通关时长 | 45–70 分钟 |
| 单局最大 Skill Point | 12 |
| 可购买技能节点 | 28 |
| 标准敌人种类 | 10 |
| Elite 变体 | 4 |
| Boss | 4 |
| 环境机制 | 6 个正式 Obstacle / Hazard 家族 |

### 1.3 体验支柱

- **线条决策**：每次输入都是路径问题，不是面向目标持续输出。
- **空间反转**：墙、障碍物、装甲和弹幕既是威胁，也是构筑可利用的材料。
- **一击清晰**：敌人是否会死、卸甲、反弹或阻断必须在输入前可预测。
- **有限构筑**：玩家只能完成少数分支，Run 身份来自取舍而非全点满。
- **机械 Boss**：Boss 检查路线理解和三种主动模组，而非数值 DPS。

## 2. 完整 Run 结构

### 2.1 四个 Act

| Act | 名称 | 主要教学 / 压力 | 核心敌人 | Boss |
| --- | --- | --- | --- | --- |
| I | Arrival Yard / 抵达站场 | 追击、普通弹幕、基础路线 | Striker、Gunner、Lancer | Rail Hound / 轨道猎犬 |
| II | Compression Forge / 压缩锻炉 | 临时障碍、地面危险、窄通道 | Constructor、Mine Layer、Sniper | Siege Choir / 围城合唱体 |
| III | Mirror Archive / 镜像档案库 | 装甲覆盖、背袭、位移欺骗 | Vanguard、Bastion、Blink Stalker | Mirror Regent / 镜像执政官 |
| IV | Redline Cathedral / 红线大教堂 | 全机制混合、Elite 组合、最终考试 | Conductor、前三区混编 | The Last Conductor / 末班指挥者 |

### 2.2 每个 Act 的路线层

每个 Act 使用同一个稳定拓扑，由 Seed 决定节点内容和连线，但必须满足内容约束：

```text
Act Entry
   ↓
Layer 1：2 个 Combat 选择
   ↓
Layer 2：2–3 个 Combat / Elite 选择
   ↓
Layer 3：2 个 Event / Forge / Challenge 选择
   ↓
Layer 4：2–3 个 Combat / Elite 选择
   ↓
Layer 5：2 个 Pre-Boss Combat 选择
   ↓
Boss
```

玩家每个 Act 实际访问 5 个 Boss 前节点和 1 个 Boss，共 6 个；完整 Run 约 24 个节点。

### 2.3 节点类型

| 节点 | 是否战斗 | 作用 | 必须公开的信息 |
| --- | --- | --- | --- |
| Combat | 是 | 标准敌群与环境组合 | Enemy Tags、Projectile、Armor、Obstacle、Hazard |
| Elite | 是 | 强化敌人或高压组合；提供额外奖励机会 | Elite 规则、关键反制、奖励类型 |
| Challenge | 是 | 限时、路线限制或特定目标 | 成功条件、失败后果、时间 |
| Event | 否 | 二选一规则交换，不提供假随机按钮 | 精确收益、精确代价 |
| Forge | 否 | 调整已提交构筑 | 可移动最多 2 点，不增加总点数 |
| Boss | 是 | Act 机制考试 | 阶段目标、可攻击窗口、致命区域 |

### 2.4 路线生成约束

- 每个 Act 至少出现 3 个 Combat、1 个非战斗节点、1 个 Elite 或 Challenge、1 个 Boss。
- Layer 1 不出现 Elite、Boss 或复杂三机制混合。
- 任意相邻两层必须至少有两条可达路线，不能生成单一假分支。
- 同一条路线不得连续出现两个 Event / Forge，避免长时间没有战斗。
- Act III 之前不生成“多块后甲 + Sniper + 移动墙”的完整高阶组合。
- 相同 Seed 必须生成完全相同的节点、连线、敌群、障碍物和奖励。
- 路线预览只显示下一层的确定威胁，不泄露未连接节点或未来随机结果。

## 3. Skill Point 经济与分配流程

### 3.1 点数总量

```text
Run Start：2 点
每个 Act 第 1 个战斗节点完成：+1 点 × 4
每个 Act 第 4 个战斗节点完成：+1 点 × 4
Elite 额外奖励：最多 +2 点 / Run
---------------------------------
保证点数：10
理论上限：12
技能池：28
最大完成比例：42.86%
```

最终 Boss 之前一定能使用全部保证点数。Elite 奖励超过 2 次时改为 `Reroute Token` 或 Ultimate 起始能量，不能突破 12 点上限。

### 3.2 分配流程：Planning Board

技能分配与下一节点选择合并成一个清晰的安全阶段，不再先盲点技能、再看到下一场威胁：

1. 新 Run 先进入 `Initial Planning`：同时显示 Act I 两个入口的完整 Threat Tag 与 2 个初始 SP。
2. 每次战斗或事件结算后，先显示本次奖励，再进入 `Planning Board`。
3. 左侧是下一层可选路线；右侧是 Basic / Charged / Ultimate 三列完整技能树。玩家先点选一个“暂定路线”，系统据此高亮直接相关的技能，但不替玩家推荐唯一答案。
4. 点击技能只进入 `Draft`。面板必须同时显示 Effect、Trigger、Limit、Prerequisite，以及购买前后的准确数值差异。
5. 本次 Planning 新增的点可任意撤销；以前已提交的点显示为 `Committed`，普通 Planning 中不能退款。
6. 玩家可以保留未消费点。未消费点、Draft 和暂定路线都必须在确认区明确显示。
7. `LOCK BUILD & ENTER` 是一个原子确认：同时提交本次 Draft 并锁定下一节点；确认前任何操作都不改变正式 Build。
8. 战斗中技能树只读，购买、退款、Forge 命令一律拒绝。

这样玩家每次花点都能回答一个明确问题：**下一场已知威胁是什么，我要用哪个被动去改变三种基础主动模组？**

### 3.3 Forge 重接

- 每次 Forge 最多把 2 个已提交点移动到其他合法节点。
- 移除父节点时，其所有失去前置的后代必须同时计入移动数量。
- Forge 不增加总点数，也不能绕过前置。
- 每个 Act 最多生成一个 Forge；完整 Run 最多访问两个。

### 3.4 节点价格和状态

- 所有可购买被动固定为 1 SP。
- 基础模组和基础兼容规则为 0 SP。
- 不使用隐藏的“本分支累计投入”门槛；所有前置按稳定 Node ID 明示。
- 状态只有：Base、Available、Draft、Committed、Locked、Not In Pool。
- 颜色不是唯一状态提示；每个状态同时使用文字标签、边框样式和连接线样式。

## 4. 三种主动模组

### 4.1 Basic Dash

| 项目 | 规则 |
| --- | --- |
| 输入 | 点击 / 轻触目标点 |
| 路径 | 基础为直线，目标钳制到 Arena |
| Transit | 无敌；斩杀普通敌人；抵消普通 Projectile |
| Enemy Armor | 命中装甲覆盖区不能杀死，也不能卸甲 |
| Obstacle | 路径在碰撞点终止并产生 Knockback；Refraction 可改写 |
| Recovery | 落点后进入可受伤窗口，允许最后一次输入 Buffer |

### 4.2 Charged Dash / Breach Drive

#### 输入

- 按住目标点进入 Charging；基础满蓄力阈值 650ms。
- Charging 期间原地锁定、无无敌、可被致命攻击打断。
- 0–180ms 的快速点按按 Basic Dash 处理；超过 180ms 即视为明确蓄力意图，此后未达满蓄阈值松开只取消，不偷偷回退成 Basic Dash。
- 达到阈值松开后进入 Dash Transit 无敌。

#### Armor Coverage 结算

1. 每块护甲拥有独立稳定 ID、碰撞区域和完整 / 脱落状态。
2. Charged 路径命中仍有护甲的区域：击落对应护甲，本次接触不同时击杀。
3. 命中没有护甲覆盖的区域：直接击杀；无甲背部是最常见情形。
4. 后背存在护甲时先卸后甲，不无条件秒杀。
5. 被击落区域持续暴露；之后任何有效 Slash 命中该区域均可击杀。
6. 同一次 Charged 对路径上的每名敌人独立结算；敌人身体不终止路线。
7. 同一敌人同一次 Charged 默认只结算一次，防止宽 Corridor 同帧卸掉多块甲。
8. Obstacle 仍可终止或折射 Charged 路径。

以上全部属于 `Breach Drive` 的 0 SP 基础能力，不由任何被动节点解锁。正面、侧面或背面只要实际命中仍存在的 Armor Coverage，就一定卸掉该块甲；只有实际命中裸露身体才击杀。

#### 基础代价

- 基础 Recovery 比 Basic 多 200ms。
- 基础方向在按下瞬间锁定；需要 `Adaptive Aim` 才能在 Charging 中修正。
- Charging 不抵消 Projectile。

### 4.3 Ultimate / Vector Focus

| 项目 | 规则 |
| --- | --- |
| 资源 | 0–100 Energy；普通击杀、卸甲和特定技能可提供能量 |
| 输入 | Energy 100 时按 Space / Ultimate 按钮 |
| Planning | 基础 3 个路径点，3 秒选点，敌人世界时间降到 0.12 倍 |
| Execute | 按顺序执行 3 段真实 Dash，每段具有 Transit 无敌和 Projectile 抵消 |
| 取消 | Escape / 右键取消且不消耗能量；第三点确认后不能取消 |
| 结束 | 基础能量归零；默认不把每段保存为 Cross 旧线 |
| 充能限制 | Ultimate 自身击杀默认不为当前 Ultimate 自充能 |

## 5. 完整技能树（28 个可购买节点）

### 5.1 Basic Dash：12 个

| ID | 节点 | 前置 | 效果 |
| --- | --- | --- | --- |
| B-01 | Wide Slash / 宽刃 | Basic Root | Basic Corridor 宽度 +30%。 |
| B-02 | Gravity Slash / 磁轨 | B-01 | 路径外圈敌人被轻吸向刀线 0.35 秒；不直接伤害。 |
| B-03 | Curve Dash / 弧线冲刺 | Basic Root | 目标点输入生成可控弧线；碰撞、Cross、Echo 使用真实弧线。 |
| B-04 | Refraction / 折射 | Basic Root | 每次 Dash 第一次撞可折射 Obstacle 时按法线反射并继续。 |
| B-05 | Prism Momentum / 折光续势 | B-04 | 折射第二段宽度 +25%；第二段每击杀 1 人减少本次 Recovery 40ms，最多 3 人。 |
| B-06 | Cross Execution / 交叉处决 | Basic Root | 保存最近实际路径 2.5 秒；下一条不交叉则替换，交叉则在首个交点触发空间冲击并清空两线。 |
| B-07 | Cross Purge / 交点净空 | B-06 | Cross 冲击同时抵消 3m 内普通 Projectile，并打断非 Boss 装甲敌人 0.45 秒；不卸甲。 |
| B-08 | Echo Slash / 残响斩 | Basic Root | 0.4 秒后回放实际路径一次；玩家不移动，不新建 Stored Line。 |
| B-09 | Double Echo / 双重残响 | B-08 | 0.8 秒时再回放一次相同路径；第二次不变宽、不写 Stored Line。 |
| B-10 | Impact Burst / 落点爆发 | Basic Root | 路径终点命中敌人或进入 1.2m 容错区时触发一次 2.2m 冲击。 |
| B-11 | Projectile Reversal / 弹反 | Basic Root | Basic 切掉的普通 Projectile 以 1.25 倍速度返回来源；每次 Dash 最多 8 枚。 |
| B-12 | Rapid Dash / 短距高频 | Basic Root | Basic 最大距离 -35%，基础 Recovery -30%；受全局下限约束。 |

### 5.2 Charged Dash：9 个

| ID | 节点 | 前置 | 效果 |
| --- | --- | --- | --- |
| C-01 | Adaptive Aim / 蓄势修正 | Charged Root | Charging 中可按最大 120°/s 修正，总修正不超过 60°；不自动瞄准。 |
| C-02 | Quick Ignition / 快速点火 | C-01 | 满蓄阈值从 650ms 降到 500ms；不增加 Recovery。 |
| C-03 | Overdrive / 过载推进 | C-02 | 满蓄后可额外保持最多 350ms；保持到上限时 Corridor +40%，期间仍原地且可被击杀。 |
| C-04 | Breach Momentum / 破甲动能 | Charged Root | 每卸 1 块甲减少 Charged 额外 Recovery 80ms，最多 3 块。 |
| C-05 | Chain Breach / 连锁破阵 | C-04 | 每卸 1 块甲，本次 Charged 剩余路径宽度 +15%，最多 +45%；同一敌人仍只结算一次。 |
| C-06 | Armor Shrapnel / 甲片飞刃 | C-05 | 每块脱落甲片攻击 6m 内最近的裸露普通敌人；每次 Charged 最多 6 枚，不伤 Boss、不破甲。 |
| C-07 | Execution Tempo / 处决节奏 | Charged Root | 本次 Charged 至少一次裸露区击杀时，取消其相对 Basic 多出的 Recovery。 |
| C-08 | Predator Drive / 猎杀蓄势 | C-07 | 背袭处决储存 1 层，持续 4 秒；下一次 Charged 蓄力阈值 -35%，开始蓄力时消耗。 |
| C-09 | Backline Battery / 背线回充 | C-08 | 每次 Charged 第一次背袭处决恢复 15 Ultimate Energy。 |

### 5.3 Ultimate：6 个

| ID | 节点 | 前置 | 效果 |
| --- | --- | --- | --- |
| U-01 | Additional Ultimate Slash / 大招追加突进 | Ultimate Root | 路径点和执行段数 +1，最多 4 段。 |
| U-02 | Tactical Window / 战术延时 | U-01 | Planning 时间 +0.75 秒；不进一步降低世界时间。 |
| U-03 | Vector Echo / 矢量残响 | U-01 + B-08 | 最后一段 0.4 秒后回放斩击；不移动、不写 Stored Line。 |
| U-04 | Cross Cascade / 交叉级联 | U-01 + B-06 | 每次 Ultimate 内部第一次路径交叉触发一次 Cross 冲击；结束不留旧线。 |
| U-05 | Projectile Return / 终式回弹 | B-11 | Ultimate 切掉的普通 Projectile 集中返回来源；每段最多 8 枚。 |
| U-06 | Residual Charge / 余能回流 | U-01 | Ultimate 击杀至少 3 人时，结束保留 20 Energy。 |

### 5.4 跨模组：1 个

| ID | 节点 | 前置 | 效果 |
| --- | --- | --- | --- |
| S-01 | Kill Momentum / 杀意 | Combat Root | 一次 Dash 每击杀 1 人，使下一次 Basic / Charged Recovery -35ms，最多 5 人；使用后清空。 |

### 5.5 免费基础兼容

- Cross、Echo 和 Ultimate 联动读取真实完成的直线、弧线或折射路径。
- 拥有 Cross 后 Charged 实际路径直接参与 Stored Line，不另收点。
- Echo 继承路径几何，但不复制玩家位移、Charged 破甲冲量或 Cross 消耗权。
- Impact Burst 只在整条真实路径终点触发，不在每次卸甲或折射点触发。
- Charged Root 已经拥有任意角度的 Coverage 破甲、敌体贯穿和裸露区击杀；C-04～C-06 只强化连续破阵，不负责解锁这些基础规则。
- 同名效果采用稳定叠加顺序：基础值 → Module Modifier → Conditional Modifier → 全局安全 Clamp。

## 6. 敌人系统

### 6.1 共同规则

- 每个攻击拥有 `telegraph → active → recovery` 三段，全部使用固定 Tick。
- 敌人不能在屏幕外无提示生成致命攻击。
- Spawn Warning 不少于 750ms，且不得在玩家 5m 内直接激活。
- 普通敌人被有效裸露 Slash 一击击杀。
- Elite 不通过单纯增加 HP；通过额外攻击模式、装甲或更复杂节奏强化。
- 每种敌人必须有可见轮廓、阵营色、Telegraph、攻击事件和 `render_game_to_text` 状态。

### 6.2 十类正式敌人

| ID | 名称 | 首次出现 | 移动 | 攻击 / 机制 | 主要反制 |
| --- | --- | --- | --- | --- | --- |
| enemy-striker-v1 | Striker / 突击兵 | Act I | 直接追击 | 接触致命；靠近后短前摇突刺 | 路径多杀、落点控制 |
| enemy-gunner-v1 | Gunner / 枪手 | Act I | 保持中距 | 每 1.8s 发射一枚可斩普通子弹 | 切弹、Shatter Shot、优先击杀 |
| enemy-lancer-v1 | Lancer / 长枪手 | Act I | 侧移校准 | 650ms 直线冲锋 Telegraph，冲锋接触致命 | 垂直切线、利用其 Recovery |
| enemy-constructor-v1 | Constructor / 构筑者 | Act II | 远离玩家 | 投掷实体 Barrier，落地 900ms 后成为 7s Obstacle | 绕行、Refraction、优先击杀 |
| enemy-minelayer-v1 | Mine Layer / 布雷者 | Act II | 环绕移动 | 每 2.4s 放置 Mine；1s 武装，进入半径后 550ms 爆炸 | 不在危险区落点、诱爆 |
| enemy-sniper-v1 | Sniper / 狙击手 | Act II | 锚定远处 | 900ms 激光瞄准后发射高速可斩 Projectile | 切弹、Dash 穿线、打断 |
| enemy-vanguard-v1 | Vanguard / 前锋甲兵 | Act III | 面向玩家推进 | 前方 140° 胸甲；背部裸露 | Charged 卸甲或背袭处决 |
| enemy-bastion-v1 | Bastion / 堡垒甲兵 | Act III | 缓慢旋转 | 前甲 + 两侧甲；后方 70° 裸露；周期性护甲转向 | 多次卸甲、快速背袭 |
| enemy-blink-stalker-v1 | Blink Stalker / 闪现猎手 | Act III | 分段追踪 | 700ms 残影 Telegraph 后闪现到预测落点附近，再突刺 | 改变落点、延迟 Echo |
| enemy-conductor-v1 | Conductor / 指挥者 | Act IV | 远距回避 | 每 2s 为附近敌人减少下一次攻击前摇 20%；自身无远攻 | 优先斩杀、路线穿群 |

### 6.3 四类 Elite

| ID | 来源 | 强化机制 | 明确限制 |
| --- | --- | --- | --- |
| elite-redline-lancer-v1 | Lancer | 两段折返冲锋，第二段读取玩家新位置 | 两段之间至少 500ms Telegraph |
| elite-twin-gunner-v1 | Gunner | 一次发射三枚 18° 扇形普通子弹 | 同屏该 Elite 最多 2 名 |
| elite-architect-v1 | Constructor | 同时维持两块 Barrier，并周期性移动一块 | Barrier 总数受场景全局上限 8 限制 |
| elite-fortress-v1 | Bastion | 额外后甲；必须卸掉至少一块甲才能创造裸露区域 | 不增加基础移动速度和普通 HP |

## 7. Projectile、Obstacle 与 Hazard

### 7.1 Projectile

| ID | 来源 | 速度 / 寿命 | Dash 交互 |
| --- | --- | --- | --- |
| projectile-standard-round-v1 | Gunner | 11m/s，4s | 普通 Dash 可斩掉 |
| projectile-sniper-round-v1 | Sniper | 24m/s，2.2s | 可斩，但 Telegraph 更长、碰撞更窄 |
| projectile-boss-shard-v1 | Boss | 14m/s，5s | 可斩；Boss 特定阶段可能成扇形 |

### 7.2 Obstacle

| ID | 名称 | 形状 / 生命周期 | 规则 |
| --- | --- | --- | --- |
| obstacle-static-reflector-v1 | Reflector Wall | OBB，关卡常驻 | Basic / Charged 撞击终止；Refraction 可反射 |
| obstacle-deployable-barrier-v1 | Deployable Barrier | OBB，7s | Constructor 生成；到期前不可普通斩掉 |
| obstacle-anchor-pillar-v1 | Anchor Pillar | Circle，关卡常驻 | 改变路线，适合折射构筑 |
| obstacle-rail-gate-v1 | Moving Rail Gate | OBB，按时间轨迹移动 | 位置归 Gameplay，视觉列车只消费状态 |

### 7.3 Hazard

| ID | 名称 | 生命周期 | 规则 |
| --- | --- | --- | --- |
| hazard-armed-mine-v1 | Armed Mine | 1s 武装；触发后 550ms 爆炸 | Dash Transit 无敌；落点 / Recovery 中命中致命 |
| hazard-arc-rail-v1 | Arc Rail | 1.4s Telegraph，0.6s Active | Active 区域非 Dash 状态致命；周期由关卡定义 |

## 8. Encounter 设计规则

### 8.1 压力预算

每个敌人与场景机制拥有 Pressure Cost：

| 内容 | Cost |
| --- | ---: |
| Striker | 1.0 |
| Gunner | 1.4 |
| Lancer | 1.7 |
| Constructor | 2.0 |
| Mine Layer | 1.8 |
| Sniper | 2.2 |
| Vanguard | 2.0 |
| Bastion | 2.8 |
| Blink Stalker | 2.4 |
| Conductor | 2.5 |
| Elite Modifier | +1.5 |
| Active Moving Gate | +1.5 |
| Active Arc Rail | +1.2 |

目标预算：

- Act I Standard：8–11；Elite：12–14。
- Act II Standard：11–14；Elite：15–17。
- Act III Standard：14–17；Elite：18–20。
- Act IV Standard：17–20；Elite：21–24。

### 8.2 组合限制

- 同一 Wave 最多 2 名 Sniper。
- 同一 Wave 最多 2 名 Constructor；全场 Active Barrier 最多 8。
- Blink Stalker 与 Lancer 的同时 Telegraph 总数最多 3。
- Boss 以外，同屏 Projectile 最多 32、Hazard 最多 8、Obstacle 最多 8。
- 新 Wave 激活时至少保留一个 3m × 3m 的安全落点区域。
- Spawn 不得与玩家、现有 Obstacle 或 Active Hazard 重叠。

### 8.3 Wave Scheduler

- `immediate`：Encounter 开始后 Spawn Warning，延迟到达后激活。
- `timed`：达到定义 Tick 后激活；上一 Wave 未清完也可出现，但必须受 Pressure 上限约束。
- `after-previous-killed`：上一 Wave 所有 Hostile 死亡后开始 Warning。
- `triggered`：由稳定 Trigger ID 的 Gameplay Event 激活。
- Stage Clear 只在所有必需 Wave 已完成、所有 Hostile 死亡、Boss 目标完成且玩家不在 Dash 时发生。

## 9. 四个 Boss

### 9.1 Act I — Rail Hound / 轨道猎犬

**目的**：检查 Basic Dash、Telegraph 阅读和落点选择。

阶段：

1. Boss 用 800ms Telegraph 沿锁定线冲锋；冲锋结束有 900ms Recovery，侧面核心暴露。
2. 玩家在暴露窗口斩中核心，完成 1 次 Break；Boss 改用两段冲锋。
3. 完成 3 次 Core Break 后 Boss 被处决。

边界：

- 每个暴露窗口至少允许一次基础最大距离 Dash 完成命中。
- 失败冲锋不能立即反向命中玩家；转向前至少 450ms。
- 不要求任何被动技能。

### 9.2 Act II — Siege Choir / 围城合唱体

**目的**：检查 Projectile、Obstacle 与 Charged Dash。

结构：中央核心 + 两个可击杀炮台单元。

1. 炮台发射普通弹幕，中央体周期性部署 Barrier。
2. 中央体拥有前、左、右三块独立 Armor Coverage；Charged 命中对应区域卸甲。
3. 卸掉任意两块甲后，中央体进入 1.5s 旋转失衡，背部核心暴露。
4. 裸露区一次有效 Slash 完成当前阶段；共 2 个阶段。

边界：

- 炮台可先击杀以降低压力，但不是必杀目标。
- Barrier 总数最多 4，且不会封死所有路线。
- 不要求 Charged 被动；基础 Breach Drive 足够。

### 9.3 Act III — Mirror Regent / 镜像执政官

**目的**：检查真实路径、延迟攻击和空间辨识。

阶段：

1. Boss 生成 3 个镜像体，只有真实体拥有轻微不同的 Telegraph Rhythm；Gameplay 同时在状态中标记可验证的 `isReal`，Presentation 提供可读线索。
2. Boss 记录玩家最近一条实际 Dash Path，并在 0.8s 后沿该路径生成致命 Mirror Slash。
3. 玩家必须在回放前换位，并命中真实体；每次命中清空镜像和记录路径。
4. 第 3 次命中后处决。

边界：

- Mirror Slash 的宽度、开始时间和方向必须在视觉上提前 600ms 可读。
- 不拥有 Echo / Cross 的玩家也能完成。
- Boss 不读取鼠标像素，只读取已经发生的 Gameplay Path。

### 9.4 Act IV — The Last Conductor / 末班指挥者

**目的**：完整检查三种主动模组与全部 Domain。

四阶段：

1. **Barrage**：普通弹幕 + Striker 支援；击杀两个支援并穿过核心完成 Break。
2. **Rail Grid**：Moving Gates + Arc Rails；到达三个安全节点使护盾失效。
3. **Armor Shell**：四块 Armor Coverage 轮流朝向玩家；卸掉任意三块后核心暴露，裸露命中完成 Break。
4. **Vector Finale**：Boss 锁定三个空间核心并将玩家 Ultimate 充满；玩家用基础 Vector Focus 依次经过三点。路径确认后执行，最终段处决 Boss。

边界：

- 每阶段 45–75 秒目标；完整 Boss 3–5 分钟。
- 最终阶段强制提供 100 Energy，因此不依赖玩家此前资源状态。
- 任何随机被动都不是通关前置。
- 阶段切换无敌时间不超过 1.2 秒，且不使用无意义长演出隐藏加载。

## 10. 关卡内容矩阵

### 10.1 Act I

- Arena：开放站场、少量 Anchor Pillar。
- 引入顺序：Striker → Gunner → Lancer。
- Standard 模板 6 个，Elite 模板 2 个，Challenge 2 个。
- Boss 前组合不超过 1 名 Lancer + 2 名 Gunner + Striker 群。

### 10.2 Act II

- Arena：狭窄轨道、Deployable Barrier、Mine 与 Arc Rail。
- 引入顺序：Constructor → Mine Layer → Sniper。
- Standard 模板 7 个，Elite 模板 3 个，Challenge 2 个。
- 至少一个 Encounter 展示“Barrier 是可利用折射板”的路线。

### 10.3 Act III

- Arena：镜面分区、对称轴、可读背袭通道。
- 引入顺序：Vanguard → Bastion → Blink Stalker。
- Standard 模板 7 个，Elite 模板 3 个，Challenge 2 个。
- 所有装甲敌人的 Coverage 必须在模型与 HUD Indicator 上一致。

### 10.4 Act IV

- Arena：前三 Act 机制混合，但每个 Encounter 只选择一个主机制和一个辅机制。
- 新增 Conductor，混编前九类敌人。
- Standard 模板 8 个，Elite 模板 4 个，Challenge 3 个。
- Pre-Boss 不重复最终 Boss 的完整四阶段组合。

总内容底线：28 个 Standard 模板、12 个 Elite 模板、9 个 Challenge 模板、4 个 Boss。

## 11. Event 与 Challenge

### 11.1 Event 原则

- 每个选择展示精确结果，不使用“也许获得强大力量”式模糊文案。
- 不提供 HP +10% 等破坏一击核心的奖励。
- 允许的收益：Reroute Token、起始 Ultimate Energy、下一节点 Threat Preview 扩展、一次失败保护（Assist 模式）、外观 / Dossier 解锁。
- 允许的代价：下一节点增加一个明确 Threat Tag、暂时锁定一个 Skill Branch、失去一个未提交 Skill Point。

### 11.2 Challenge 示例

| ID | 名称 | 成功条件 | 失败后果 |
| --- | --- | --- | --- |
| challenge-clean-line-v1 | Clean Line | 45 秒内完成且不撞 Obstacle | 正常过关，无额外奖励 |
| challenge-bullet-weave-v1 | Bullet Weave | 切掉 12 枚普通 Projectile 并清场 | 正常过关 |
| challenge-breach-chain-v1 | Breach Chain | 单次 Charged 卸掉至少 2 块甲 | 正常过关 |
| challenge-no-ultimate-v1 | Silent Core | 不使用 Ultimate 清场 | 正常过关 |

成功奖励从：Reroute Token、25 起始 Energy、额外路线情报中选择一个确定项。

## 12. 能量、资源与局外进度

### 12.1 Ultimate Energy

- 普通敌人击杀：按定义 4–8 Energy。
- Elite 击杀：12 Energy。
- Boss Break：20 Energy。
- Charged 卸甲：基础 4 Energy，每次 Dash 最多 12。
- 不能超过 100；Ultimate Planning 取消不消耗。

### 12.2 Run Resource

- `Skill Point`：仅本局，0–12。
- `Reroute Token`：仅本局，用于 Forge 额外移动 1 点或重掷下一层路线一次；最多 2。
- `Intel`：仅本局，使下一层预览显示具体数量而非仅 Threat Tag；最多 3。

### 12.3 Profile Progression

第一版局外进度不永久增加战斗数值：

- 解锁 Enemy Dossier、Boss Practice、Seeded Challenge、Threat Protocol 和外观。
- 新技能节点若未来扩展，只解锁进入可购买池，不赠送 Skill Point。
- 首次通关解锁 Threat Protocol 1–5；每级增加明确规则而不是隐藏数值。

## 13. 难度与辅助模式

### 13.1 Standard

- 目标为本文全部默认数值。
- 死亡结束 Run。

### 13.2 Practice

- 可直接选择已见过的 Enemy、Encounter 或 Boss 阶段。
- 不写正式通关记录，不解锁 Threat Protocol。

### 13.3 Assist Protocol

可独立开启：

- 每 Act 一次 Reboot；
- Telegraph +25%；
- Projectile Speed -15%；
- 不改变玩家 Dash 伤害和敌人核心规则。

Assist 记录独立标记，但可以解锁剧情与基础内容。

### 13.4 Threat Protocol

通关后逐级开启，示例：

1. Elite 出现率提高。
2. Hazard Active 时间 +20%。
3. Boss 增加一项已公开模式。
4. 每 Act 路线预览减少一项 Intel。
5. 完整 Redline 组合与排行榜规则。

## 14. UI 与信息设计

必须提供：

- Title / Continue / New Run / Practice / Settings。
- Seed 与当前 Act / Layer。
- Run Map：节点连线、类型、威胁标签、奖励、已访问路线。
- Skill Tree：28 节点、SP、前置、Owned / Available / Locked、精确效果。
- Combat HUD：Ultimate 0–100、Charged 阈值、当前被动触发提示、Boss 目标。
- Threat Telegraph：Projectile、Obstacle、Hazard、Armor 使用不同形状，不只依赖颜色。
- Pause：完整控制说明、当前构筑、Restart / Abandon Run。
- Victory / Defeat：Seed、路线、技能、用时、击杀、Boss Break、失败来源。

触控要求：

- 轻触目标点为 Basic。
- 长按显示 Charged 进度，达到阈值后松开发动。
- Ultimate 使用独立屏幕按钮；Planning 中轻触选点，取消按钮始终可见。
- 所有主要点击目标最小 44 × 44 CSS px。

## 15. Save、Resume 与统计

- Profile Save 与 Run Save 分离，均带 Schema Version 和 Content Version。
- 只在安全节点、Act Entry、Boss 前写 Run Save；不保存战斗中间状态。
- Continue 必须恢复 Seed、路线图、当前节点、Skill Point、已提交技能、资源和 Boss 进度边界。
- 破坏性版本更新必须显式拒绝或迁移旧 Save，不能静默重置。
- 本地统计：Run 数、Clear、Best Time、Boss 死亡来源、技能选择率、节点选择率。
- 不默认上传遥测；若未来联网，必须另行取得同意并提供隐私说明。

## 16. Presentation 边界

- 本分支实现 Gameplay State、Events、Presentation ID 和基础可读表现映射。
- 角色 / Boss 最终 GLB、骨骼、动画、材质和环境资产由独立视觉分支提供。
- Gameplay Definition 不出现模型路径、颜色、粒子数量、音量或镜头参数。
- 每个新 Gameplay Event 必须提供足够事实：实体 ID、位置、方向、阶段、Armor Part ID、攻击 ID、时间。
- 在视觉资产尚未合并时，可复用已验收 Provider，但不得使用“看不见的攻击”通过 Gameplay 验收。

## 17. 非目标

首个完整商业版本不包含：

- 联机合作或 PvP；
- 多角色 / 多武器职业系统；
- 付费内购、抽卡或广告；
- 开放世界、NavMesh 追踪或传统任务日志；
- 无限技能等级、装备词条或伤害数字堆叠；
- 依赖服务器才能运行的核心战斗。

## 18. 完整 Definition of Done

只有同时满足以下条件，才可以称为“从 Demo 进入完整游戏阶段”：

1. 4 Act 分支 Run、约 24 个实际节点和 4 个 Boss 可从 Title 完整打通。
2. 28 个技能节点全部真实修改规则，单局点数严格不超过 12。
3. 10 类敌人、4 类 Elite、3 Projectile、4 Obstacle、2 Hazard 全部有真实生命周期。
4. Encounter Scheduler 支持 Immediate / Timed / After Previous Killed / Triggered。
5. Charged Armor Coverage、Cross、Echo、Refraction 和 Ultimate 联动均按本文规则实现。
6. Route、Run、Save、Replay 对同一 Seed 保持确定性。
7. UI、鼠标、键盘和触控形成完整流程，没有假按钮或仅展示不生效的选项。
8. 所有量化门通过 `docs/FULL_GAME_ACCEPTANCE.md`，并生成要求的证据包。
9. 与视觉分支合并时不改变 Gameplay Hash；若内容版本变化，显式升级 Replay / Save 版本。
10. 分支提交完整、工作树干净并推送远端。
