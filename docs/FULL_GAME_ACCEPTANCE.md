# Project SlASH — Full Game Acceptance Standard

> **历史验收：已被 `REDESIGN_V2_ACCEPTANCE.md` 取代。**  
> 本文件只保留未改动战斗机制的历史验证依据；要求公开完整技能树、路线图、详细结算、双语内容或旧视觉表现的项目全部失效。

> 版本：v1.0  
> 更新时间：2026-08-12  
> 适用范围：`codex/full-game-production` 从架构基线到完整商业版 Gameplay 的全部新增内容。  
> 原则：测试、截图、文档和“能启动”都只是证据。只有覆盖真实需求的证据全部满足，本项目才算完成。

## 0. 完成判定

必须同时满足：

1. 所有 Hard Gate 通过。
2. 所有编号验收项有可复查证据，不能写“人工感觉正常”代替。
3. 自动化、真实浏览器、完整 Run 和真人体验门分别报告，不互相冒充。
4. 没有 P0 / P1 缺陷；P2 缺陷必须为 0，或由用户逐项书面接受。
5. Git 分支工作树干净、提交可构建并已推送远端。

## 1. Hard Gates

| ID | 一票否决条件 | 通过证据 |
| --- | --- | --- |
| FG-H01 | 无法从 Title 开始并完成 4 Act / 4 Boss Run | 真实输入完整 Run 录像 + 最终状态 JSON |
| FG-H02 | 任一技能节点只改 UI、不改 Gameplay | 28 节点逐项自动化矩阵 |
| FG-H03 | 单局可超过 12 SP、无前置购买、战斗中可改点 | Skill Economy 测试 |
| FG-H04 | 任一正式 Enemy / Projectile / Obstacle / Hazard 只有 Definition 没有生命周期 | Content Lifecycle 测试与事件日志 |
| FG-H05 | Boss 依赖随机技能、出现无解状态或使用未声明 HP 木桩 | 无升级 Boss 通关测试 + 阶段日志 |
| FG-H06 | 同一 Seed / 命令序列产生不同路线或 State Hash | 100 Seed Replay 矩阵 |
| FG-H07 | Gameplay / Content 导入 Three.js、DOM、Audio 或 Presentation | Architecture Boundary Test |
| FG-H08 | 1080p Worst Case 低于性能硬门或浏览器出现未处理错误 | 性能报告 + Console 报告 |
| FG-H09 | Save / Continue 丢失技能、路线、资源或在版本不兼容时静默重置 | Save Roundtrip / Version 测试 |
| FG-H10 | 使用假按钮、假奖励、不可见致命攻击或只在测试夹具存在的“正式内容” | UI 流程 + 真实生产运行证据 |
| FG-H11 | 覆盖或删除视觉 Agent 未提交工作 | 原工作树前后状态对照 |
| FG-H12 | 未经验证直接推送，或本地与远端提交不一致 | Git Gate 报告 |

## 2. 内容数量与结构

### FG-C01 — Run Structure

- 4 个稳定 Act Definition。
- 每 Act 5 个 Boss 前访问层 + 1 Boss。
- 单局访问节点目标为 24；允许 Event / Forge 导致总数在 22–26 内变化。
- 每 Act 图中总候选节点不少于 12，且每个选择层至少 2 个可达节点。
- 100 个 Seed 中不得出现断路、无 Boss 路径或单一假分支。

证据：`tests/run-graph.test.ts`、100 Seed 图摘要、三张代表性 Run Map 截图。

### FG-C02 — Content Inventory

生产 Registry 最低数量：

- Enemy：10 Standard + 4 Elite；
- Boss：4；
- Projectile：3；
- Obstacle：4；
- Hazard：2；
- Skill Node：28；
- Standard Encounter Template：28；
- Elite Template：12；
- Challenge Template：9。

所有 ID 唯一、可解析、被至少一个正式内容引用；Debug 内容不计入。

### FG-C03 — Route Threat Preview

每个可选节点必须显示：

- 节点类型；
- 主要 Enemy Tags；
- 是否含 Armor / Projectile / Obstacle / Hazard；
- 奖励；
- 已满足的 Intel 级别下的精确数量。

自动化随机抽取 100 个可见节点，显示内容必须与实际 Encounter Definition 一致率 100%。

## 3. Skill Point 与技能树

### FG-S01 — Economy

- Run Start 恰好 2 SP。
- 每 Act 两次保证奖励，共 8 SP。
- Elite 奖励最多 2 SP；第 3 次起转换为非 SP 奖励。
- 任意时刻 `spent + unspent <= 12`。
- 28 个节点全买需要 28 SP，因此正式 Run 不可点满。
- 10,000 次随机合法分配中不得出现负点、超买或失效前置。

### FG-S02 — Allocation State

- 战斗阶段购买 / 退款命令结果必须为 `ignored`。
- 安全节点可以预览和撤销本次访问新增点。
- 离开节点后历史点锁定。
- Forge 每次最多移动 2 点，父节点退款会正确级联后代。
- 存点跨节点、跨 Act、Save / Resume 后保持一致。

### FG-S03 — Node Coverage

28 个节点每个必须有：

- 稳定 ID；
- 名称和完整描述；
- cost=1；
- 明确 prerequisites；
- Gameplay Hook；
- 至少 1 个正向测试；
- 至少 1 个边界 / 不触发测试；
- Snapshot 可观察字段或事实事件。

验收矩阵目标：28 / 28 真实生效，0 个仅展示节点。

### FG-S04 — Build Diversity

使用固定 Seed 完成至少 6 套合法 10–12 点构筑：

1. Refraction + Cross；
2. Wide + Gravity；
3. Charged Chain Breach + Armor Shrapnel；
4. Charged Backline Battery；
5. Basic Projectile Reversal + Ultimate Projectile Return；
6. Rapid + Kill Momentum。

每套构筑至少有 2 项可量化战斗结果不同于无升级基线；不得只是 VFX 差异。

## 4. 三种主动模组

### FG-A01 — Basic Dash

- 点击到 Gameplay Command P95 ≤ 8ms；点击到首个可见反馈 P95 ≤ 50ms。
- Dash duration 始终 35–110ms。
- 基础 Recovery 始终在安全 Clamp 内。
- Transit 全程无敌，Recovery 中不无敌。
- 1 / 5 / 20 路径多杀在 60 / 120 / 144 FPS 下结果一致。
- 普通 Projectile 被路径抵消；Obstacle 不被当作 Projectile 删除。

### FG-A02 — Charged Dash

- 基础满蓄阈值 650ms，误差不超过一个 Fixed Tick。
- Charging 期间玩家坐标不变、Invulnerable=false。
- 0–180ms 快速点按产生 Basic；超过 180ms 后未达阈值 Release 不产生 Dash、不卸甲、不消耗能量。
- 释放后 Transit Invulnerable=true。
- 命中前 / 侧 Armor Coverage：只卸对应甲，不同时击杀。
- 命中无甲背部：击杀。
- 后背有甲：卸甲而非击杀。
- 单次路径命中 5 名敌人时逐个结算，不在第一名停止。
- 同一敌人同一次 Charged 最多结算一次。
- Obstacle 正常终止；拥有 Refraction 时路径按法线反射。

### FG-A03 — Vector Focus

- Energy <100 时不能启动。
- 基础 3 点 / 3 段、Planning 3s、Enemy Time Scale 0.12。
- Escape / 右键在提交前取消且能量不变。
- 第三点提交后按顺序执行，期间不能取消或重复启动。
- 每段使用真实碰撞、无敌与 Projectile 抵消。
- Ultimate 自身击杀不为当前执行自充能。
- 默认结束 Energy=0；Residual Charge 条件满足时 Energy=20。

## 5. Enemy 与攻击公平性

### FG-E01 — Roster Lifecycle

14 个 Standard / Elite Definition 每个必须通过：

1. Spawn Warning；
2. Active；
3. Movement Strategy；
4. Attack Telegraph；
5. Attack Active；
6. Recovery；
7. 被击杀；
8. Event / Snapshot；
9. Replay Match。

### FG-E02 — Telegraph Minimums

| 攻击 | 最短 Telegraph |
| --- | ---: |
| Striker 突刺 | 450ms |
| Gunner 普通弹 | 500ms |
| Lancer 冲锋 | 650ms |
| Constructor Barrier 落地 | 900ms |
| Mine 武装 | 1000ms |
| Sniper | 900ms |
| Blink Stalker | 700ms |
| 普通 Boss Attack | 800ms |

固定 Tick 测试误差最多 1 Tick。Presentation Telegraph 首帧必须与 Gameplay Telegraph Event 同一 Tick 消费。

### FG-E03 — Spawn Safety

- Hostile 激活点与玩家距离 ≥5m；Boss 特殊阶段若更近，必须在激活前将玩家移动到固定安全点。
- Spawn Warning ≥750ms。
- 不与 Active Obstacle、Active Hazard 或另一实体碰撞形状重叠。
- 新 Wave 激活后至少存在一个 3m × 3m 的无 Active Hazard 落点区。
- 10,000 个生成样本违规数必须为 0。

### FG-E04 — Pressure Caps

- 同屏 Projectile ≤32；
- Active Obstacle ≤8；
- Active Hazard ≤8；
- Sniper ≤2；
- Constructor ≤2；
- 同时处于致命 Active 的 Lancer / Blink 攻击总数 ≤3。

超过上限的生成必须排队或拒绝，不能静默突破。

## 6. Projectile、Obstacle、Hazard

### FG-D01 — Projectile

3 类 Projectile 全部验证 Spawn、固定步移动、Arena / Player / Dash 碰撞、寿命、销毁和事件。

- 同 Seed 120Hz 与 60/144Hz real-time wrapper 结果 Hash 一致。
- Dash 切弹事件包含 Projectile ID、位置、方向和来源。
- Shatter Shot 碎片上限在 1000 个压力样本中不突破。

### FG-D02 — Obstacle

4 类 Obstacle 全部验证：

- Collision Shape 与 Gameplay Position；
- Basic / Charged 阻断；
- Knockback 方向；
- Refraction 反射；
- 生命周期或移动轨迹；
- Replay；
- Presentation ID 可解析。

移动 Rail Gate 的视觉 Transform 与 Gameplay Position 最大偏差 ≤0.05 world unit。

### FG-D03 — Hazard

- Mine：1s 武装、550ms 爆炸 Telegraph，Dash Transit 无敌、Recovery 致命。
- Arc Rail：1.4s Telegraph、0.6s Active，状态切换误差 ≤1 Tick。
- Hazard 不因低 FPS 重复伤害或跳过 Active。
- Hazard 到期后从 State、Snapshot 和 Presentation 释放。

## 7. Encounter Scheduler

### FG-W01 — Activation Modes

四种 Wave Activation 均有正式生产用例：

- Immediate；
- Timed；
- After Previous Killed；
- Triggered。

每种模式验证 Activation Tick、Spawn 顺序、Entity ID、Death / Restart / Replay。

### FG-W02 — Completion

Stage Clear 仅在以下条件同时成立时发生：

- 所有 Required Wave 已完成；
- 所有 Hostile 死亡；
- Boss Objective 完成；
- 玩家不在 Dash；
- 没有 Pending Required Spawn。

测试至少覆盖 10 种“表面敌人清空但仍不应过关”的状态。

### FG-W03 — Pacing

对每 Act 至少 20 次自动路线样本与 5 次真人样本：

| 类型 | 熟练目标 | P95 上限 |
| --- | --- | --- |
| Standard Encounter | 45–90s | 120s |
| Elite / Challenge | 75–120s | 180s |
| Act I–III Boss | 120–240s | 300s |
| Final Boss | 180–300s | 420s |
| Full Run | 35–50min | 70min |

自动脚本只验证规则和上限；真人样本决定节奏是否合格。

## 8. Boss

### FG-B01 — Phase Objectives

4 个 Boss 每个必须有：

- 稳定 Boss Definition；
- 显式 Phase State；
- Objective Progress；
- Telegraph / Active / Recovery；
- Break Event；
- Victory Event；
- Restart / Replay；
- `render_game_to_text` 状态。

### FG-B02 — No-Upgrade Solvability

使用 0 Skill、三种基础主动模组和固定 Seed：

- 每个 Boss 必须可完成；
- 不允许依赖 Refraction、Cross、Echo 或随机节点；
- 自动状态机完成 100 次，死锁 / 无可攻击窗口 / 路线封死次数为 0；
- 真人至少各完成 3 次。

### FG-B03 — Boss Specific

- Rail Hound：3 次 Core Break，暴露窗口 ≥900ms。
- Siege Choir：三块 Coverage 独立；任意两块卸甲后背部暴露 1500ms。
- Mirror Regent：Mirror Slash 提前 ≥600ms 可读，命中真实体 3 次结束。
- Last Conductor：四阶段按顺序；Finale 强制 Energy=100，三点 Vector Focus 成功后结束。

## 9. Save、Resume、Profile

### FG-SV01 — Safe Save

只允许在 Title、Act Entry、安全节点、Boss 前保存。1000 次随机 Roundtrip 后以下字段完全一致：

- Seed、Route Graph、Current Node；
- SP、Owned Nodes、Resources；
- Act / Layer；
- Boss 边界状态；
- Threat Protocol、Assist 标记；
- Content Version。

### FG-SV02 — Versioning

- 未知 Schema / Content Version 必须显示可理解错误并保留原数据。
- 有迁移器时，迁移前后生成报告。
- 禁止 `try/catch → 清空 localStorage`。

### FG-SV03 — Profile

解锁项只能影响内容可用性、Practice、Dossier、外观和 Threat Protocol；自动扫描不得发现永久 Dash Damage / HP / Recovery 数值加成。

当前自动证据：Profile v1 Roundtrip、损坏原文保留与显式备份重建通过；本地档案记录 14 类敌人、4 个 Boss、Practice、Run / Clear / Death、技能和路线选择；序列化扫描不含永久战斗数值字段。Standard / Assist / Threat 与 Reboot 已进入 Run Save v2，并通过 1,000 次混合协议安全节点 Roundtrip。

## 10. UI、输入与可访问性

### FG-UI01 — 完整流程

真实输入验证：

```text
Title → New Run → Initial Planning → Combat → Reward → Planning Board
→ Act Boss → Next Act → Final Boss → Victory → Run Summary → Title
```

Continue、Practice、Settings、Pause、Abandon、Defeat、Restart New Run 也必须形成真实流程。

### FG-UI02 — Input

- Mouse Basic、Hold/Release Charged、Space Ultimate、Escape Cancel；
- Touch Tap Basic、Long Press Charged、Ultimate Button、Planning Select / Cancel；
- 输入映射在 Resize / DPR / Fullscreen 后准确；
- 主要触控目标 ≥44 × 44 CSS px；
- 390 × 844 无横向溢出。

### FG-UI03 — Non-Color Cues

Projectile、Obstacle、Hazard、Armor、Boss Weak Point 至少使用形状 / 轮廓 / 动画中的两种区别，不只靠颜色。灰度截图中关键类型识别率由 3 名测试者达到 90% 以上。

### FG-UI04 — Text

- 所有技能显示 Effect / Trigger / Limit / Prerequisite；
- 路线预览和 Event 显示精确结果；
- 不允许“明显提升”“有机会”等未给数值的正式效果文案；
- 中英文术语使用统一词典。

## 11. Replay、确定性与架构

### FG-R01 — Replay

- Replay Schema 和 Content Version 升级。
- 记录 Route Choice、Allocation、Forge、Ability Hold/Release、Ultimate Planning 和 Pause-safe Command。
- 100 Seed × 4 代表构筑完整回放，最终 Hash Match 率 100%。
- 未知版本直接拒绝，不进行“看似成功”的近似回放。

### FG-R02 — Architecture

- Gameplay / Content 无 Presentation、Runtime、Characters、Scene、Three.js、DOM、Audio import。
- 本地源码 Import Graph 无循环。
- `main.ts` 只 Bootstrap；`game.ts` 不继续承担所有新系统实现。
- 每个 Simulation System 有独立文件和测试。
- 所有 Runtime State 可 `JSON.stringify()`。

### FG-R03 — Snapshot

`render_game_to_text` 必须包含当前可交互事实：

- Act、Layer、Node、Route Choices；
- SP、Owned Skills、Resources；
- Player、Charge、Ultimate；
- Encounter / Wave；
- Enemy Attack / Armor；
- Projectile、Obstacle、Hazard；
- Boss Phase / Objective；
- 坐标系说明。

不得塞入完整历史或不可序列化对象。

## 12. 性能、浏览器与稳定性

### FG-P01 — Worst Case

生产 Worst Case：20 Hostile、32 Projectile、8 Obstacle、8 Hazard、一次 8 Kill、雨/蒸汽/尸体/PostFX。

| 指标 | 1080p High | 1440p High |
| --- | ---: | ---: |
| Median FPS | ≥58 | ≥55 |
| P95 visible frame | ≤25ms 且相对同机空白基线增量 ≤0.5ms | ≤25ms 且增量 ≤0.8ms |
| P99 | ≤33.4ms | ≤40ms |
| Worst | ≤100ms | ≤120ms |
| Draw Calls | ≤650 | ≤700 |
| Browser Errors | 0 | 0 |

### FG-P02 — Load

- 首次可交互 P75 ≤5s（指定测试机、本地冷缓存协议）；
- 生产压缩资源总量 ≤50MB；
- 单一同步初始 Chunk 警告需记录并有拆分结论；
- 新 Boss / Act 资产按 Act 边界预取，不阻塞当前 Combat。

### FG-P03 — Browser Matrix

真实生产构建：

- Chrome 1920×1080 / 2560×1440 / 1366×768；
- Firefox；
- Playwright WebKit；
- 390×844 Touch；
- Compatibility Quality；
- Resize / DPR / Fullscreen；
- Background Freeze / Resume；
- WebGL Context Loss / Restore。

全部流程至少完成一个 Combat、一次 Charged、一次 Ultimate 和一次 Map / Skill 操作，Console Error=0。

### FG-P04 — Stability

- 30 分钟可见完整 Run 稳定性：JS Heap 增长 ≤15MB，Geometry / Texture / Listener 不持续增长。
- 100 次连续 Restart / New Run 无状态泄漏。
- Object Pool Miss 在 Warm-up 后满足各 Profile 预算。

## 13. 人工体验门

自动化不能替代：

1. 3 名测试者各完成至少 3 个 Act，至少 1 名完成完整 Run。
2. 每种敌人第一次出现后，测试者能在 3 次遭遇内描述其攻击和反制，成功率 ≥80%。
3. 6 套代表构筑中至少 5 套被评价为“玩法明显不同”，不是纯数值变化。
4. 4 个 Boss 的失败原因可被测试者复述，≥80% 死亡不能归因为“看不见 / 不知道为何死”。
5. Charged 的撞甲卸甲与无甲背袭处决辨识率 ≥90%。
6. 完整 Run 熟练样本中，路线选择平均思考时间 5–20s；低于 3s 视为选择无意义，高于 30s 视为信息负担过重。

记录原始问卷、录像和问题，不用汇总平均分掩盖 P0/P1 缺陷。

## 14. 缺陷等级

| 级别 | 定义 | 发布要求 |
| --- | --- | --- |
| P0 | 崩溃、存档损坏、无法通关、确定性分歧、安全问题 | 必须为 0 |
| P1 | 技能不生效、无解战斗、不可见致命攻击、Boss 死锁、输入失效 | 必须为 0 |
| P2 | 明显平衡、可读性、UI、性能或兼容问题 | 必须为 0 或用户逐项接受 |
| P3 | 不阻塞的轻微表现 / 文案问题 | 可记录后延期 |

## 15. 强制证据包

最终必须生成并保留：

- `validation/full-game/content-inventory.json`
- `validation/full-game/run-graph-100-seeds.json`
- `validation/full-game/skill-matrix.json`
- `validation/full-game/entity-lifecycle.json`
- `validation/full-game/boss-no-upgrade.json`
- `validation/full-game/replay-matrix.json`
- `validation/full-game/save-roundtrip.json`
- `validation/full-game/full-run/`：录像、截图、最终 State、路线、构筑
- `validation/full-game/browser-matrix/`
- `validation/full-game/performance/`
- `validation/full-game/human-playtest/`
- `validation/full-game/git-gate.txt`

大型本地录像不进入 Git；精简 JSON / Markdown 摘要与可复用验证脚本进入仓库。

## 16. Git Gate

推送前必须：

1. 核对原视觉工作树没有被修改。
2. `npm test`、`npm run check`、`npm run build`、架构门、资产门、Full Game 验证全部通过。
3. `git diff --check` 通过。
4. `git status --short` 只包含本分支预期文件，提交后为空。
5. Commit Message 按里程碑清晰拆分，不提交本地缓存、视频或密钥。
6. 推送 `codex/full-game-production`。
7. 核对 `local HEAD == origin/codex/full-game-production`。
8. 在 `AGENT_PROGRESS.md` 记录 Commit、Remote Ref、全部验证与仍需真人完成的门。
