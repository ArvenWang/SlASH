# Project SlASH — Full Game Production Plan

> 版本：v1.0  
> 分支：`codex/full-game-production`  
> 独立工作树：`/Users/nefish/Desktop/Coding/Slash-full-game`  
> 基线：`32521fe` (`codex/phase2a-foundation`)  
> 目标：按 `FULL_GAME_DESIGN.md` 和 `FULL_GAME_ACCEPTANCE.md` 实现、验证并推送完整 Gameplay 分支。

## 0. 执行原则

1. 每个工作包都遵循：设计事实 → 类型 / State → Simulation → Event → Presentation Hook → 自动化 → 真实浏览器。
2. 只存在 Definition 不算完成；必须有真实生命周期与正式关卡引用。
3. 每个里程碑结束更新同一份 `AGENT_PROGRESS.md` 与 `progress.md`。
4. 不在视觉 Agent 的脏工作树中编辑；需要视觉资源时只增加稳定 Presentation ID 和合并合同。
5. 不在一次提交里混合大规模架构、内容和平衡修改。
6. 每个有意义的 Gameplay 变更运行 Web Game Playwright Client，检查 Screenshot、`render_game_to_text` 与 Console。

## 1. 总体依赖图

```text
P0 设计 / 验收锁定
  ↓
P1 Run State + Route Graph + Encounter Scheduler
  ↓
P2 Skill Economy + Skill Graph + Allocation UI
  ↓
P3 Charged Dash + Armor Coverage + Ultimate
  ↓
P4 Projectile / Obstacle / Hazard 生命周期
  ↓
P5 Enemy Movement + Attack Strategies + 10+4 Roster
  ↓
P6 4 Act Content + 28/12/9 Encounter Templates
  ↓
P7 4 Boss Systems
  ↓
P8 Save / Resume / Profile / Practice / Threat Protocol
  ↓
P9 Presentation Hooks + 完整 UI + Touch
  ↓
P10 Balance / Replay / Browser / Performance / Human Gates
  ↓
P11 Visual Branch Integration Contract + Git Push
```

## 2. P0 — 设计与事实源

### 目标

完整定义产品范围、Run、技能、内容、Boss、验收和任务依赖。

### 任务

- [x] 创建独立 Branch / Worktree。
- [x] 完成 `docs/FULL_GAME_DESIGN.md`。
- [x] 完成 `docs/FULL_GAME_ACCEPTANCE.md`。
- [x] 完成本文件。
- [x] 创建 Content ID / 术语词典，阻止命名漂移。
- [x] 更新 Architecture Index。
- [x] 建立 Full Game 机器可读清单与设计验证入口。

### 完成门

- 设计中的所有数量、ID、规则和验收互相一致。
- 技能池 28、Run 上限 12、4 Act / 4 Boss、10+4 Enemy、3/4/2 Entity 数量可机器读取。
- 无“稍后再定”作为核心规则；调参值允许标 `initial tuning`。

## 3. P1 — Run、Route Graph 与 Encounter Scheduler

### 目标

把线性三关 Facade 升级为完整 Run State，同时保持旧三关 Fixture 可兼容验证。

### 主要文件

- `src/content/runs/definitions.ts`
- `src/content/encounters/definitions.ts`
- `src/game/run/run-system.ts`
- `src/game/run/route-generator.ts`
- `src/game/encounters/encounter-system.ts`
- `src/game/domain/types.ts`
- `src/game/game.ts`
- `src/game/replay/replay.ts`

### 任务

- [x] 新增 `RunDefinition / ActDefinition / RouteNodeDefinition / RouteGraphState`。
- [x] 新增 4 Act 稳定 ID 与 6 Layer 拓扑约束。
- [x] Seeded Route Generator，100 Seed 无断路。
- [x] Game Phase 扩展：title / map / allocation / playing / reward / boss / victory / defeat。
- [x] Encounter Runtime State：Current Wave、Pending、Activated、Completed、Triggers。
- [x] 实现 Immediate / Timed / After Previous Killed / Triggered。
- [x] 生成稳定 Spawn / Entity ID，支持 Restart；Replay 升级仍待完成。
- [x] Stage Completion 改为 Required Wave + Hostile；Boss Objective 在 P7 接入。
- [x] Snapshot 暴露 Act、Layer、Node、Route Choice、Wave。
- [x] 保留 Phase 1 三关兼容测试，明确 Content Version 升级。

### 测试

- `tests/run-graph.test.ts`
- `tests/encounter-scheduler.test.ts`
- `tests/full-game-state.test.ts`
- Replay Route / Wave cases

### 完成门

- FG-C01、FG-W01、FG-W02、FG-R01 的 P1 范围通过。
- 真实浏览器可从 Title 到 Map，选择节点并进入至少两 Wave Combat。

## 4. P2 — Skill Economy、Graph 与 Allocation

### 目标

实现 28 节点图、0–12 SP 经济、提交 / 存点 / Forge 重接和真实 UI。

### 主要文件

- `src/content/upgrades/skill-tree.ts`
- `src/game/upgrades/skill-system.ts`
- `src/game/upgrades/hooks/`
- `src/runtime/input-runtime.ts`
- `src/runtime/presentation-runtime.ts`
- `src/styles.css`

### 任务

- [x] Upgrade Definition 扩展：cost、prerequisites、module、tier、hook IDs。
- [x] 28 个稳定 Skill ID 和完整文案。
- [x] `preview / commit / refund-current-visit / forge-reroute` 规则引擎、Forge UI 与 Campaign Command。
- [x] SP 奖励计划与 Elite 12 点封顶。
- [x] 合法性检查：前置、后代级联、战斗锁定、存点。
- [x] 完整 Skill Tree UI，不使用随机三选一。
- [x] Threat Preview 与 Allocation 合并为 Planning Board。
- [x] Safe Save 与 Replay v2 记录 Planning / Skill / Forge Commands。
- [x] 28 个节点的 31 个声明 Hook 全部路由到实际 Gameplay Owner，并由 Hook Registry 防止 UI-only 节点混入完成状态。

### 测试

- 10,000 随机分配 property-style test。
- 28 × 正向 / 负向 Skill Matrix。
- Forge 级联、Save Roundtrip、Replay。
- Desktop / 390px Touch UI。

### 完成门

- FG-S01–S04、FG-UI04 通过。

## 5. P3 — Charged Dash、Armor Coverage、Vector Focus

### 目标

完成三种主动模组的生产规则，不依赖视觉分支未提交代码。

### 主要文件

- `src/game/abilities/charged-dash.ts`
- `src/game/abilities/vector-focus.ts`
- `src/game/combat/armor.ts`
- `src/game/abilities/ability-system.ts`
- `src/content/abilities/definitions.ts`
- `src/game/domain/types.ts`

### 任务

- [x] Ability Activation 扩展：begin-hold / update-target / release / cancel / multi-point-plan。
- [x] Charging Runtime State 与 650ms Fixed Tick Threshold。
- [x] Armor Part Definition / Runtime State / Coverage Shape。
- [x] Charged Path 多目标排序与每敌人一次结算。
- [x] 前 / 侧甲卸甲、无甲背部击杀、后甲优先卸甲。
- [x] Charged / Obstacle / Refraction 组合。
- [x] Ultimate Energy、Planning、Slow World、3 段执行、Cancel。
- [x] 9 个 Charged Hook 与 6 个 Ultimate Hook 已完成；U-05 使用正式 Projectile 生命周期。
- [x] Events：charge、armor-break、rear-execution、energy、planning、segment、ultimate-end。
- [x] Snapshot 已暴露 Charge / Energy / Armor / Ultimate / Scheduled Slash；Replay v2 已支持完整 Campaign 与所有目标命令深拷贝。

### 测试

- Armor Geometry Table（前、侧、后、后甲、多敌人）。
- Hold/Release 边界 Tick。
- Ultimate 3 点 / 4 点、Cancel、Energy、Self-Charge。
- 无 Upgrade Boss 基础能力检查。

### 完成门

- FG-A02、FG-A03 和对应 Skill Matrix 全通过。

## 6. P4 — Projectile、Obstacle、Hazard

### 目标

把已有空 Registry 变成正式可运行 Domain。

### 主要文件

- `src/game/entities/projectile-system.ts`
- `src/game/entities/obstacle-system.ts`
- `src/game/entities/hazard-system.ts`
- `src/content/entities/definitions.ts`
- `src/game/collision/`

### 任务

- [x] 3 Projectile Definition 与 Spawn / Move / Hit / Slash Cancel / Return / Expire / Arena Exit。
- [x] 4 Obstacle Definition 与 Static / Timed / Moving 生命周期。
- [x] Basic / Charged / Ultimate Sweep 对最早 Obstacle Collision 截断路径。
- [x] Knockback 与 Refraction 法线；每次 Dash 最多一次折射。
- [x] Mine / Arc Rail Telegraph / Active / Expire。
- [x] Domain Events 和 32 / 8 / 8 Pressure Caps。
- [x] Presentation Registry、可读实体外观和 Performance Budget。
- [x] Replay Hash / Snapshot / JSON Roundtrip / Content Lab 真实生成入口。

### 完成门

- FG-D01–D03、FG-E04 通过。

## 7. P5 — Enemy Roster 与 Attack Strategies

### 目标

实现 10 Standard + 4 Elite 的可读、可组合行为。

### 主要文件

- `src/content/enemies/definitions.ts`
- `src/content/enemies/attack-definitions.ts`
- `src/game/simulation/enemy-behavior.ts`
- `src/game/enemies/enemy-attack-system.ts`
- `src/runtime/presentation-runtime.ts`

### 任务顺序

1. [x] Striker：现有 Direct Chase 拆成 Movement + Contact / Thrust Attack。
2. [x] Gunner：距离控制 + 普通 Projectile。
3. [x] Lancer：Line Telegraph + Charge + Recovery。
4. [x] Constructor：Barrier 投掷与上限。
5. [x] Mine Layer：放置 / 武装 / 诱爆。
6. [x] Sniper：远距锚定与 Telegraph Projectile。
7. [x] Vanguard：单前甲 Coverage。
8. [x] Bastion：三块甲、转向与后部裸露区。
9. [x] Blink Stalker：预测落点、Teleport Telegraph、突刺。
10. [x] Conductor：区域 Attack Timing Buff。
11. [x] 4 Elite：只增加新机制，不堆 HP。

每类敌人同一工作包必须包含 Definition、Movement、Attack、Events、Presentation Hook、Tests、Content Sandbox 和真实 Combat 截图。

实现状态：14 类单体生命周期与 P6 Encounter 编排均已完成；Spawn Safety、Sniper / Constructor 数量、Pressure Budget 和动态重定位由正式 Validator 约束。

### 完成门

- FG-E01–E04、Content Inventory Enemy 部分通过。

## 8. P6 — 四 Act 与 Encounter Content

### 目标

将系统组合成完整的 28 Standard / 12 Elite / 9 Challenge 内容库。

### 任务

- [x] Act I：6 Standard、2 Elite、2 Challenge。
- [x] Act II：7 Standard、3 Elite、2 Challenge。
- [x] Act III：7 Standard、3 Elite、2 Challenge。
- [x] Act IV：8 Standard、4 Elite、3 Challenge。
- [x] Pressure Cost Validator。
- [x] Spawn Safety Validator。
- [x] Route Threat Tags 自动从内容计算，禁止手写漂移。
- [x] Event / Forge 正式选择与精确结果。
- [x] 每 Act Environment / Lighting / Presentation ID 合同。
- [x] 100 Seed 内容分布和重复率报告。

### 完成门

- FG-C01–C03、FG-W03 自动范围通过。
- 每 Act 真实输入至少完成 3 条不同路线。

完成证据：49 / 49 非 Boss 模板在 100 Seed 中全部被路线映射覆盖，选择层重复卡为 0；432 个静态 Spawn 与 10,000 个动态玩家位置样本违规为 0。真实浏览器使用 Canvas 点击 / 长按完成 4 Act × 3 条不同路线；装甲路线实际执行 Charged 卸甲，Challenge 成败和确定资源进入 Reward。P7 的 4 Boss 不计入本阶段完成数。

## 9. P7 — 四 Boss

### 目标

按机制阶段完成 4 Boss，拒绝 HP 木桩。

### 主要文件

- `src/content/bosses/definitions.ts`
- `src/game/bosses/boss-system.ts`
- `src/game/bosses/rail-hound.ts`
- `src/game/bosses/siege-choir.ts`
- `src/game/bosses/mirror-regent.ts`
- `src/game/bosses/last-conductor.ts`

### 任务

- [x] 通用 Boss Phase / Objective State 与 Event。
- [x] Rail Hound：3 Core Break。
- [x] Siege Choir：Armor Part + Turret + Barrier。
- [x] Mirror Regent：Clone + Recorded Path + Delayed Slash。
- [x] Last Conductor：Barrage / Rail Grid / Armor Shell / Vector Finale。
- [x] Practice Stage Direct Entry。
- [x] 0 Skill 自动可解、Restart / Replay；真人 3 次 / Boss 仍属于最终体验门，不能用自动化代替。

### 完成门

- FG-B01–B03 全部通过。

自动完成证据：固定 Seed、0 Skill 下每个 Boss 100 次，共 400 次，死亡 / 死锁均为 0；真实浏览器以 Canvas 点击、长按松开和 Space 三点选取完成 4 / 4 Practice，Console 0。Rail Hound 侧核窗口、Siege 1.5s 背核、Mirror 0.8s 路径回放、Last Conductor 四阶段均进入 Snapshot、HUD 和截图。FG-B01–B03 的自动门已通过；每 Boss 3 次真人完成仍留在 P10 / 最终人工体验门。

## 10. P8 — Save、Profile、Practice、Difficulty

### 目标

支持完整商业流程与重复游玩。

### 任务

- [x] Profile Save Schema / Version；独立 Envelope、Checksum、损坏原文保留与显式备份重建。
- [x] Safe Node Run Save / Continue；战斗中只保留最后一个安全节点存档。
- [x] 未知 Schema / Content Version 与损坏数据明确拒绝并保留原文；当前无历史生产 Schema，迁移器待首次兼容版本需求再增加。
- [x] Dossier、解锁式 Boss Practice、Victory / Death Records。
- [x] Assist Protocol：每 Act 1 Reboot、Telegraph +25%、Projectile -15%、独立记录。
- [x] Threat Protocol 1–5：路线、Hazard、Boss 变式、Intel、Redline 均为真实 Gameplay 规则。
- [x] 本地统计，不默认联网。
- [x] Settings 持久化：Audio、Quality、Reduced Motion、High Contrast。

### 完成门

- FG-SV01–SV03、对应 UI Flow 通过。

## 11. P9 — 完整 UI、Presentation Hooks 与 Touch

### 目标

所有生产规则均可见、可输入、可理解。

### 任务

- [x] Title / Continue / New Run / Practice / Settings。
- [x] Run Map 与 Threat Preview。
- [x] Skill Tree / Forge。
- [x] Charged Indicator / Armor Part / Ultimate Planning。
- [x] Boss Objective HUD。
- [x] Pause / Resume / Abandon、Defeat / Victory、本局核心统计与稳定死亡来源。
- [ ] Touch 全流程；Ultimate / Cancel 与 44px 已完成，完整 4 Act 触控流程待验收。
- [x] 非颜色提示与灰度检查；弹体、障碍、危险区、护甲、首领弱点均有形状或轮廓合同。
- [x] 为视觉分支提供 Enemy / Attack / Boss / Entity Presentation ID 清单。

### 完成门

- FG-UI01–UI04 通过，Console Error=0。

## 12. P10 — 平衡与全量验证

### 自动化

- [ ] `npm test`
- [ ] `npm run check`
- [ ] `npm run build`
- [ ] Architecture / Content / Replay / Save / Boss / Skill Matrix。
- [ ] Web Game Client 短输入循环。
- [x] 100 Seed × 4 Build 完整 Route / Replay；400 / 400 最终 Hash 一致。
- [ ] Browser Matrix。
- [ ] Worst Case Performance。
- [ ] 30min Stability。

### 真实体验

- [ ] 至少 3 名测试者。
- [ ] 6 套构筑。
- [ ] 4 Boss 各至少 3 次真人完成。
- [ ] 至少 1 次完整 Run。
- [ ] 死亡原因、技能辨识、路线决策调查。

### 完成门

- `FULL_GAME_ACCEPTANCE.md` 所有自动项通过。
- 人工门真实完成或明确留在“用户需亲自执行”的最终外部门，不能冒充完成。

## 13. P11 — 视觉分支集成与 Git

### 集成边界

本玩法分支拥有：

- Gameplay / Content / Simulation / Replay / Save；
- Presentation ID 和事件事实；
- 功能性 UI；
- 基础可读 Profile 映射。

视觉分支拥有：

- GLB、Skeleton、Animation Clip、Weapon、Material、Environment Asset；
- VFX / Audio / Camera / Lighting Profile 的最终数值；
- 不改变 Gameplay Definition 或 State Hash 的表现实现。

### 合并策略

1. 等视觉 Agent 将当前工作提交到稳定分支。
2. 获取其 Commit，不从脏工作树复制文件。
3. 在临时 Integration Branch 合并两个已提交分支。
4. 冲突优先保持 Gameplay Rule 与视觉资产合同，逐文件人工解决。
5. 合并前后以固定 Seed Replay Hash 证明视觉不会改变规则。
6. 分支本身在未集成视觉前也必须可独立构建和运行。

### 推送门

- [ ] 所有本分支要求完成。
- [ ] `git diff --check`。
- [ ] 无密钥、缓存、大型录像。
- [ ] 工作树干净。
- [ ] 推送 `origin/codex/full-game-production`。
- [ ] 核对 Local / Remote SHA。
- [ ] 更新 `AGENT_PROGRESS.md`。

## 14. 当前风险与处理

| 风险 | 影响 | 处理 |
| --- | --- | --- |
| 视觉 Agent 未提交，无法立即集成其新资产 | 本分支暂时使用基线 Presentation | 稳定 ID + Event Contract；最终在提交后合并 |
| `game.ts` 仍承担大量编排 | 新系统继续堆入会形成 God Object | 每个系统独立模块，Game 仅顺序编排 |
| 1HP + 长 Run 容错低 | 新玩家挫败 | Practice / Assist，Standard 不改变核心 |
| 28 Skill 组合爆炸 | 平衡与测试量大 | Typed Hooks、6 代表构筑、Pairwise Matrix、上限 Clamp |
| Boss 与无普通移动冲突 | 可能生成无解地面机制 | Spawn Safety、3m Safe Landing、0 Skill 自动状态机 |
| Web 性能压力 | 新实体和 Boss 拉低帧率 | Pool、Pressure Cap、按 Act 预取、P10 Worst Case |
| 旧三关验证假设固定 Count=3 | 扩展会破坏旧 Fixture | 保留 Legacy Fixture，新增 Full Run Definition；显式升级 Content Version |

## 15. 交付物清单

- 完整 GDD、验收标准、生产计划。
- 生产源码和数据定义。
- 28 Skill、4 Act、10+4 Enemy、3/4/2 Entity、4 Boss。
- 完整 UI / Save / Replay / Practice / Difficulty。
- 可复用验证脚本和精简结果。
- AGENT_PROGRESS / progress 持续更新。
- 已推送的 `codex/full-game-production` 远端分支。
