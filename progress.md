Original prompt: 阅读“赛博朋克游戏设计分析”对话与最终 PRD，在 `/Users/nefish/Desktop/Coding/Slash` 实现以视觉表现为最高优先级的 3D Web 赛博武士直线突刺击杀 Visual Vertical Slice。

## 2026-08-13 — Redesign V2 P0 事实源

- 用户已确认整体重构方向，并要求持续使用多个子代理、小任务快速推进、减少重复验证。
- 当前优先级锁定为：三选一技能获取 → UI 简化 → 干净高台场景；几何体角色与真实重力随后实施。
- 新增当前唯一事实源：
  - `docs/REDESIGN_V2_PRD.md`；
  - `docs/REDESIGN_V2_ACCEPTANCE.md`；
  - `docs/architecture/REDESIGN_V2_BOUNDARIES.md`。
- V1 Full Game 三份文档已明确降级为历史资料。旧 Planning Board、玩家选路、完整技能树、点数分配、Event / Forge 页面、冗余结算和双语 UI 不再有效。
- 当前目标主流程固定为：Title → Combat → 三选一 → 自动下一关 → Boss → 极简 Victory / Defeat。
- 现有 28 个技能的 Hook 可作为已实现内容复用，但不代表 28 个设计均已获用户确认。已确认 Cross Execution、Echo Slash、Kill Momentum；Return Slash 保留观察；Near-Miss、Death Mark、Twin Path 已否决。
- 场景目标固定为超出视野的干净高台平面、相同斜俯视方向、可视范围约扩大 1.5 倍；正式画面不再出现城市、铁轨、列车、雨雾或旧平台外结构。
- 后续角色目标固定为三角形主角、方形敌人、真实垂直物理和持续可见运动；旧 V5R 正式路径最终退出，但本阶段不删除历史资产。
- 验证策略：每个小节仅做一次定向验证，全部完成后一次整体 Run；未修改的历史机制不重复验证。
- 下一小节：新增确定性 Reward Draft / Run Director，落地通关后三选一，并开始极简 UI 迁移。
- 当前编辑锁：V2 文档已完成；下一小节将集中修改 `src/game/rewards/`、`src/game/campaign/`、`src/game/run/` 与 `src/runtime/campaign-ui-runtime.ts`，并同步受影响的 Save / Replay 测试。

## 2026-08-13 — Redesign V2 三选一与首轮 UI 简化

- 已实现确定性 Reward Draft：每次恰好 3 个不同合法候选，同 Seed / 奖励序号 / 构筑 / Pool Version 结果一致；已拥有和未满足前置的技能不会出现，候选不足会明确失败。
- 已实现一次性选择：只接受当前 Offer 中的技能；选择后原子写入 `selectedUpgrades` 和真实 committed skills，重复或过期命令被拒绝。
- 已实现后台 Run Director：玩家不再选择路线；Director 自动选择 Combat / Elite / Challenge / Boss，并确定性跳过 Event / Forge-only 层。
- 玩家流程已改为 Title → Combat → Upgrade Choice → 自动下一场 Combat。开局不再进入 Planning，不再发初始技能点。
- 已新增 27 项单语言短文案候选池；Gravity / Near-Miss 方向禁用。Cross Execution、Echo Slash、Kill Momentum 标记 confirmed，其余为 implemented-review，不能冒充用户已确认。
- Title 已缩减为开始、有效存档时继续、设置；默认不再展示协议、威胁、档案、练习和系统说明。
- 三选一 UI 恰好三张卡，每张只显示中文名称和一行效果。胜负页移除默认统计和 Seed 文案。
- HUD 已切换为中文关键状态，并新增真实可见的能量进度条；能量满后空格大招链路保持。
- V2 Save 升级到 Schema 3 / `full-game-v2`，只允许 title / upgrade-choice / victory；旧 V1/V2 存档不近似迁移、不静默删除原文。
- Replay 升级到 v4 / `full-game-v2`，记录 `select-reward-skill` 并验证最终 Hash。
- 旧 `capture-full-game-ui.mjs` 已反向改写为 V2 短流程门，不再要求 28 节点或 Run Map。
- 定向验证：6 个相关测试文件 / 32 项通过；Production Build 与 whitespace 通过。真实浏览器 V2 短流程通过：Title 停留、直接 Combat、三选一、选择后下一 Combat、中文能量条、桌面/移动无横向溢出、Console 0。
- 本小节没有重跑敌人全矩阵、Boss 400 次、长时性能或全浏览器矩阵。
- 下一小节：删除剩余旧 Campaign UI 死代码与 CSS，并开始 Clean Arena / 远景镜头。

## 2026-08-13 — Redesign V2 UI 正式路径清理

- `campaign-ui-runtime.ts` 从 838 行缩减为 336 行，生产 UI 仅保留主页、设置、暂停、三选一、胜利和失败。
- 已删除 Practice、Dossier、Protocol、Planning、Run Map、Route Card、完整 Skill Tree、Event、Forge、旧 Reward 的渲染与点击路径。
- 暂停页只保留继续和返回主页，不再展示操作教程或完整构筑。
- `styles.css` 从 974 行缩减为 494 行，移除旧流程对应的 Route/Tree/Event/Forge/Protocol/Library/Dossier/统计及移动端死样式。
- Boss / Challenge / Vector Focus 的常驻 HUD 文案已进一步改为单语言中文；内部 Wave ID 不再通过 Banner 暴露。
- 定向验证：TypeScript、whitespace 和一次 V2 浏览器短流程通过；三选一、桌面/移动、Console 继续保持通过。未重跑玩法、Boss、性能和浏览器全矩阵。
- 下一小节：Clean Arena Environment Provider 与自适应远景镜头。

# Project Slash — Agent Progress

更新时间：2026-08-10

## 当前进展

- 已有可运行的 TypeScript + Vite + Three.js Web 游戏：三关（8 / 12 / 18 敌人）、点击地面无限距离直线 Dash、路径多杀、玩家 1HP、Dash 无敌、Recovery/Input Buffer、死亡点击重开、自动过关/通关、HUD、声音、后处理、鼠标与触控输入。
- 环境方向为 Transit Cathedral：深湿金属竞技台、交叉轨道与巨拱、五节列车、近中远城市、雨雾与蒸汽。
- 角色美术已进入 V5：新三视图位于 `art/characters/concepts/hero-turnaround-v5.png` 与 `art/characters/concepts/enemy-turnaround-v5.png`；当前实现重点是连续人体大形、关节衔接、低位蓄势和冲跑动势，不再用旧 V4 数值叠加代替主观视觉判断。
- V5 当前模型已升级为有效连续几何：主角 4,316 triangles、敌人 4,264 triangles；腕踝端盖、过大头部和积木鞋已修正。主角 Ready 为低位双脚架势，Dash 为刀线领先、双腿后拖；敌人 8 人战场可见不同前倾角、步相和武器高度且不再横趴。
- 角色建模路线已切换为 Tripo 候选优先；`tools/tripo_pipeline.py` 已实现不落盘密钥的 P1 多视图生成/立即下载/脱敏清单。现有程序化角色保留为回退版本，Tripo 模型通过主观画面门后才替换。
- 主角与敌人的前/左/后三视图输入已准备完成；新增 Generated Model Lab，可对下载 GLB 自动摆正落地、统一身高并显示三角面、材质、贴图、骨骼和动画信息。
- 用户当前不在电脑前，已明确允许把 Tripo 高精角色生成作为延期项，并在没有其他发布阻塞时同步当前可玩基线；延期项不能记录为视觉通过。
- 公开仓库卫生已完成：本地录像、截图、缓存和大型证据不提交，源码、正式概念、三视图、文档、验证脚本、精简审计与一张真实游戏截图会进入仓库；本地证据未删除。
- GitHub 空仓库已初始化，初始提交 `63ac2a5` 已推送到 `main`，本地分支正在跟踪 `origin/main`。
- Gameplay、浏览器矩阵、生命周期、1080p / 1440p 性能和资产许可审计已闭合；第一轮已有约 10 分钟稳定性数据，用户要求停止重复长测，第二轮已中止。
- 本地生产预览：`http://127.0.0.1:4175/`。

## 已完成内容

- 主角为双脚接地、骨盆下沉、胸肩前压、刀手贴腰的低位 Ready；敌人 18 人同屏使用连续相位差和 4 组姿态偏置。
- 主角与敌人已收成连续大壳体和少量阵营色；主角刀约 3.1008m、实体厚度约 0.012 world-unit、整片冷白发光。
- V5 细化没有增加碎甲或装饰线：新增几何只用于锁骨/胸腰/骨盆、肘膝和腕踝过渡；近景不再暴露圆形端盖。
- V4 概念叠加平均偏差 2.15%–3.92%，最大 4.37%–4.62%；正式证据位于 `validation/character/formal-v4-final/`。
- 100 次真实输入、1 / 5 / 20 多杀、60 / 120 / 144 FPS 一致性、Recovery/Input Buffer、死亡重开与完整三关均通过。
- VFX/Gore 时间轴、4 组尸体落地、雨/蒸汽/湿地反应与分层程序化原创音频均有真实证据。
- 1080p 与 1440p 20 敌人八杀压力测试均约 59.97 FPS；系统 Chrome、Firefox、WebKit、Compatibility 与触屏矩阵通过。
- Resize / Fullscreen / renderer freeze-resume / WebGL Context Restore 通过；生产包资产、密钥与依赖许可审计通过。

## 下一步计划

1. 当前基线发布已完成，不再改动已验证的玩法与视觉实现。
2. Tripo 高精角色生成、筛选、绑骨和接入作为后续美术里程碑保留。
3. 新模型接入后只做针对角色的主观视觉签核与短实机复核。

## 遇到的问题

- 第一轮脚本最后一笔停在 570.34 秒，虽实际运行约 10 分钟且堆仅 +0.36MB、几何体/纹理恒定，`duration` 门仍失败；脚本已修复，但用户要求停止重复长测，第二轮已中止。
- Three.js 核心 chunk 约 573KB，有体积提示但总包远低于 50MB。
- 本机无 Edge；WebKit 自动化不能冒充真人 Safari。发布前需补实体浏览器或明确接受内核级覆盖。
- WebM 不含 Web Audio，最终混音仍需真人试听。
- Tripo API Key 的官方 API 余额为 0，首次生成在任务创建前被余额不足拒绝，消耗 0 分；Chrome 与备用浏览器的 Tripo Studio 当前均未登录，无法使用用户所说的约 600 网页积分。密钥未写入项目。

## 已解决问题

- 已解决主角站直/悬空、敌群同步复制、刀厚且只亮刃线、角色零件过碎、尸体跪姿、HUD 提前扣数、Context Loss 恢复和每帧临时分配等问题。
- 完整三关脚本已改用正式相机与 1920×1080 投影，待最终重跑。
- 已完成公开仓库清理、初始提交和 `main` 首次推送；大型本地证据未删除且未进入 Git。

## 未解决问题

- 稳定性脚本终点门未形式化闭合；按用户要求保留首轮数据且不再重复长测。最终三关录像和固定证据包不再优先于真人试玩。
- 用户尚未完成 V5 角色、动作和整体画面的主观签核；旧 V4 数值通过不再视为当前主观视觉门。
- Tripo 主角候选尚未生成；用户已允许延期，因此不阻塞本轮基线推送，但仍明确记录为未完成美术项。

## 验证情况

- TypeScript、Production Build、Gameplay、Character V4、VFX/Gore、Audio、Browser Matrix、Lifecycle、1080p/1440p Performance、Asset License Audit 均已有通过报告。
- Character V5 当前短视觉证据位于 `validation/character/v5-iteration-7/`；本轮没有重跑已通过的机制/性能/稳定性套件。
- 首轮稳定性数据位于 `validation/performance/memory-10min-final/`；第二轮已中止，不宣称通过。
- Tripo 管线 Python 语法检查通过；失败清单已脱敏，仓库中未发现密钥内容或密钥前缀字符串，且没有生成模型或消耗积分。
- 6 张 Tripo 输入已完成内容和尺寸核对；Generated Model Lab 的 TypeScript 与 whitespace 检查通过。当前尚无真实 GLB，不宣称模型加载已通过。
- 当前 `npm run build` 与 `npm run verify:assets` 通过；生产运行时无外链、无密钥模式，依赖许可证已知，仅有 Three.js 核心 chunk 573.27KB 的既有提示。

## 暂勿并行修改

- Tripo 生成已延期；发布基线已同步，后续工作从当前 `main` 与本进度文档继续。

---

## 2026-08-12 — Full Game Production P0

- 用户目标已升级为完整商业游戏，不再按当前三关 Demo 配置设计。
- 已建立独立工作树 `/Users/nefish/Desktop/Coding/Slash-full-game` 和分支 `codex/full-game-production`，基于 Phase 2A 新架构提交 `32521fe`；原视觉工作树未修改。
- 已新增：
  - `docs/FULL_GAME_DESIGN.md`
  - `docs/FULL_GAME_ACCEPTANCE.md`
  - `docs/FULL_GAME_PRODUCTION_PLAN.md`
- 已锁定规模：4 Act、约 24 个实际节点、4 Boss、28 Skill、保证 10 / 上限 12 SP、10 Standard Enemy、4 Elite、3 Projectile、4 Obstacle、2 Hazard。
- 已锁定 Charged Dash：贯穿敌群；撞甲卸甲；撞裸露区击杀；无甲背部直接处决；后背有甲先卸甲。
- 已执行技术基线：
  - `npm ci`：0 vulnerabilities；
  - `npm test`：11 files / 36 tests passed；
  - `npm run check`：passed；
  - `npm run build`：passed，仅既有 Three.js 604.35kB chunk warning。
- 下一步：P0 机器可读 Manifest / Glossary，然后 P1 Run Graph 与 Encounter Scheduler。
- Gotcha：当前新架构只有 Immediate Wave 和 Direct Chase Enemy 真实运行；Projectile / Obstacle / Hazard / 非 Immediate Wave 只是 Domain 入口，不能计为完成内容。
- P0 补充完成：`FULL_GAME_CONTENT_MANIFEST.json`、`FULL_GAME_GLOSSARY.md`、Architecture Index、`verify:full-game-design`。验证结果为 4 Acts / 28 Skills / 10+4 Enemies / 4 Bosses / 3 Projectiles / 4 Obstacles / 2 Hazards / 53 Encounter Targets，12/28 最大完成比例 0.428571。

## 2026-08-12 — Full Game Production P1 Foundation

- 已实现 4 Act、每 Act 6 Layer 的确定性路线生成与 Run Progress State；100 个 Seed 均通过连通性、奖励和 Boss 可达验证。
- 第一版路线连线曾因旋转目标索引造成部分节点无入边；已改为旋转源投影，并加入回归测试。
- 已实现 Encounter Scheduler 的 Immediate / Timed / After Previous Killed / Triggered、Spawn Warning、实体归属、完成判定与 JSON-safe State。
- 定向验证：`tests/run-graph.test.ts`、`tests/run-system.test.ts`、`tests/encounter-scheduler.test.ts` 共 11 项通过；`npm run check` 通过。
- 当前边界：Route 与 Scheduler 仍需接入正式 GameState、Replay、浏览器 Route Map 和两波真实 Combat，不能计为 P1 完成。

## 2026-08-12 — Planning Board / Skill Allocation Integration

- 根据用户反馈重做 Charged Dash：基础 Breach Drive 本身即支持任意角度撞甲卸甲、裸露区击杀与敌体贯穿；被动只强化蓄力控制、连续破阵和背袭节奏。
- 重做 28 节点及完整 Effect / Trigger / Limit / Prerequisite 文案；Basic 12、Charged 9、Ultimate 6、Shared 1 数量保持不变。
- 实现 Skill Allocation State：2 点开局、12 点封顶、Draft / Committed、存点、历史点锁定、Forge 2 点级联重接和 10,000 次随机合法性测试。
- 默认入口已形成 Title → Planning → Combat → Reward；路线威胁与完整技能树同屏，路线和技能草案原子确认。
- 首个正式 Act I 两波 Striker Encounter 已通过 Scheduler 接入，Spawn ID 在重试中稳定。
- 全量自动化：16 文件 / 57 项通过；TypeScript、Build、Design Manifest 和 whitespace 通过。
- 浏览器：桌面 28/28 技能卡完整、普通点击完成路线 + 2 技能 Draft + Combat；第一波 3 敌人真实生成，Console 0。390×844 无横向溢出，最小触控目标 44px。
- 发现并修复：超长 Planning 面板被垂直居中导致顶部路线卡不可达；现改为顶部自然展开。
- 待完成：通用 Web Game Client 的虚拟时间点击稳定性兼容、Event / Forge 生命周期、Replay、26 个机制型 Skill Hook、Charged / Armor / Ultimate 生产实现。

## 2026-08-12 — Charged Dash / Armor Coverage

- 实现真实 Pointer Hold 生命周期：Tap ≤180ms 走 Basic；明确长按后未满蓄取消；650ms Fixed Tick 满蓄后 Release 执行 Charged；Escape / Pointer Cancel 可取消。
- 实现 Armor Profile / Part Runtime 与首次圆形接触点角度判定；修复“最近点”会把轻微偏心正面撞击误判成侧面的问题。
- 基础 Breach Drive 现为：敌体贯穿、任意角度命中现存甲片只卸甲、裸露区击杀、同敌单次只结算一次、卸甲 Stagger / 轻推 / +4 Energy。
- Vanguard 使用 140° 前甲和受限转向；独立甲片 Presentation Hook 会在甲片脱落后消失，非仅依靠 HUD 文字。
- 9 个 Charged 被动 Hook 全部接入，13 项定向测试通过；完整测试当前为 17 文件 / 71 项（待本里程碑全量复核）。
- 真实浏览器报告：`validation/charged-armor/browser-final/report.json` 机制通过；最终甲片视觉证据在 `validation/charged-armor/browser-armor-visual/`，Console 0。
- Web Game Client 快速点击冒烟通过：状态为 `dash-slash`、`dashing`、`invulnerable=true`，无错误文件。
- 下一步：Vector Focus、Obstacle / Refraction 组合、Replay Schema；当前不宣称 P3 完成。

## 2026-08-12 — Vector Focus

- 实现 Energy 100 才可启动的 Vector Focus：Space 进入 3 秒多点规划，敌人模拟速率降到 0.12，玩家不获得规划期无敌。
- 只有第 3 个合法路径点确认后才消耗 100 Energy；Escape / 右键 / 超时取消均保留能量。执行阶段复用真实 Dash 碰撞与无敌规则，按顺序完成三段移动。
- 接入 5 个当前可独立验证的 Ultimate Hook：Additional Slash、Tactical Window、Vector Echo、Cross Cascade、Residual Charge；Projectile Return 明确留到 P4 Projectile 生命周期，不用伪造目标。
- Ultimate 直接或派生击杀不会为自身充能；Residual Charge 只在至少击杀 3 人后保留 20 Energy。
- Replay 命令快照已覆盖 Charged 与 Ultimate 的所有带坐标命令，避免可变输入对象污染日志；完整 Campaign Replay Schema 仍待 P1/P2 收口。
- 自动化全量通过：18 files / 80 tests；TypeScript、Production Build、设计清单、whitespace 全通过。构建仍只有既有 Three.js 604.35kB chunk 提示。
- 真实浏览器通过：Space 启动、Canvas 选两点、Escape 取消并保留 100 Energy；再次 Space + 三次 Canvas 点击提交，三段执行后到达最终坐标、击杀 3 人、Energy 0、Console 0。
- 下一步：P4 Projectile / Obstacle / Hazard，并由这些真实实体完成 U-05 Projectile Return、B-11 Projectile Reversal、Refraction 和 Charged / Obstacle 组合。

## 2026-08-12 — Projectile / Obstacle / Hazard

- 把 Phase 2A 的空 Registry 落成 3 Projectile、4 Obstacle、2 Hazard 正式内容；Gameplay State、Snapshot、Replay Hash、JSON Roundtrip 与 Content Lab 使用同一份 Definition。
- Projectile 支持 Spawn、120Hz 固定步移动、Swept Player Hit、Arena Exit、Lifetime、Dash Slash Cancel 和事件事实；B-11 最多回返 8 发标准弹，U-05 在每个 Ultimate 段独立计数，二者都返回真实来源。
- Obstacle 支持 Static Reflector、900ms 后启用且持续 7s 的 Deployable Barrier、Circle Anchor 和 Moving Rail Gate；Dash 在最早碰撞点终止并后坐，Refraction 按真实法线反射一次并保留剩余路径。
- Mine 为 1s 武装、进入触发圈后 550ms 爆炸；Arc Rail 为 1.4s Telegraph、0.6s Active。两者仅在非 Dash 状态致命，到期后从 State 与 Presentation 释放。
- Presentation 增加独立 Registry 完整性检查、32 / 8 / 8 Budget 和简单可辨识外观；Content Lab 可真实生成任一 Projectile / Obstacle / Hazard，不再只列 ID。
- 自动化全量：19 files / 100 tests；TypeScript 与 Production Build 通过。Entity 测试覆盖三类弹体寿命、压力上限、60/144Hz Hash、切弹回返、Ultimate Return、障碍碰撞、折射、移动门、Mine / Rail 和 0.12 世界速率。
- 真实浏览器：初始 1 Projectile / 2 Obstacle / 2 Hazard 可见；第一次真实 Canvas 点击完成切弹与回返击杀，第二次真实点击触发法线折射并继续移动；Console 0。Presentation Labs 五项通过。
- 下一步：补齐剩余 Basic / Shared Hook，再让完整 Enemy Roster 通过 Attack Strategy 生产这些实体。

## 2026-08-12 — Complete Passive Hook Matrix

- 28 个技能节点的 31 个 Hook 已全部绑定到真实 Gameplay Owner；新增 `gameplay-hook-registry`，测试会逐项比对 Skill Definition，任何只有文案、没有 Owner 的节点都会失败。
- Curve Dash 采用同一 Basic 输入的快速拖拽：按下位置保留为终点、拖动位置控制弧度，≤180ms 释放执行；继续长按仍是 Charged。二次曲线转角硬限制 65°，实际曲线拆成 10 段参与碰撞、Cross 与 Echo。
- 统一 Actual Path：直线、曲线和折射都使用相同 Segment State；Stored Path 仅保留一条并按世界时间存在 2.5s，非交叉替换，Cross 后立即清空。
- 修正 Cross 的独立可用性：无普通移动时连续直线只能共享起点，无法内部交叉；因此真实内部交叉之外，反向重叠旧线至少 1.5m 也触发，起点自身不触发。该规则已同步 Skill 文案和 GDD。
- Gravity 改成致死走廊之外额外 30% 的 Near-Miss 牵引带，0.35s 最多拉动 0.6m；Echo 0.4s、Double Echo 0.8s 回放实际路径，第二次使用基础宽度且不移动玩家。
- Prism Momentum、Impact Burst、Cross Purge、Kill Momentum 均完成正负条件：折射第二段 +25% 且最多 3 杀减 Recovery；落点仅有接触条件才爆发；Cross Purge 不卸甲；Kill Momentum 最多 5 层并只由下一次 Basic / Charged 消耗。
- 自动化全量：20 files / 111 tests；TypeScript、Build、Design Manifest、whitespace 通过。Hook Registry 覆盖全部声明 Hook。
- 真实浏览器：真实 Drag → 10 段 Curve Stored Path；真实 Click → 非交叉替换；真实 Reverse Click → Cross 击杀偏线目标、清弹、装甲打断且甲片完好；Console 0。Stored Path 在场景内以简单橙线显示。
- 下一步：Forge / Event / Save / Replay，随后完整 Enemy Roster 与 Attack Strategy。

## 2026-08-12 — Event / Forge Campaign Lifecycle

- 新增 4 个确定性 Event，每个严格提供 2 个完整描述的选择；奖励为 Next Combat Energy、Intel 或 Reroute Token，均进入正式 Run State，不使用假按钮或随机占位。
- Next Combat Energy 会一直保留到下一次 Combat，入场时与现有 Energy 合并至 100 上限并只消费一次；Intel 让 Planning Board 额外显示后续 1–3 层确定节点；Reroute Token 只在玩家点击后消耗。
- Forge 复用同一棵 28 节点技能树和 Draft / Commit 规则：默认最多移动 2 个历史点，前置移除会级联计数；Token 只增加本次上限，总 SP 不增加，非法前置与超限操作均拒绝。
- Event / Forge 均不生成敌人或伪战斗；完成后进入统一 Reward，再返回下一层 Planning。Route 预览不再把非战斗卡禁用。
- 新增稳定 Snapshot 字段、命令、事件事实、验证场景和浏览器脚本。100 个 Seed 的全部安全层选项均通过真实生命周期选择测试。
- 自动化全量：21 files / 115 tests；TypeScript、Production Build、Design Manifest、whitespace 全通过。构建仍只有既有 Three.js 605.52kB chunk 提示。
- 真实浏览器：Event 2 个描述完整的选择、一次性结算；Forge 28/28 文案、2 点级联、第三点拦截、Token 扩为 3、三点重接并进入 Reward；390×844 无横向溢出、最小目标 44px、Console 0。
- 真实浏览器发现 Forge 高面板被垂直居中后顶部处于负坐标，已将 Forge 与 Planning 一并改为顶部展开；该问题在修复前会让已实现技能真实不可点击，因此已记录为产品缺陷而非脚本问题。
- 下一步：Campaign Safe Save / Resume 与 Full-game Replay，然后进入完整 Enemy Roster / Attack Strategy。

## 2026-08-12 — Safe Save / Continue / Replay v2

- 新增独立 Run Save v1：Schema Version、Content Version、Checksum 与 State Invariant 四层验证；只允许 Title / Planning / Event / Forge / Reward / Victory，不序列化战斗中间状态。
- Safe Save 会移除瞬时 Dash、Charge、Ultimate Planning、敌人、Projectile、Obstacle、Hazard 与残留事件，但保留 Seed、完整 Route Graph、Act / Layer / Current Node、Skill Draft / Commit、Run Resource、Event History、Ultimate Energy 和命令序列。
- 未知 Schema / Content、损坏 JSON、Checksum 不匹配、非法路线、未知技能、破坏前置或阶段不一致都会返回可理解错误；localStorage 原始字符串不删除、不自动替换。
- Title 新增真实 Continue：显示 Act、Layer、已提交技能数和 Seed；Planning 的路线预选与技能草案会自动安全写入。进入 Combat 后不会覆盖安全存档，因此异常重载回到确认前 Planning，而不是恢复半场战斗。
- Replay 升级到 v2 / full-game-v1，并显式区分 `legacy-stage` 与 `full-game`；Route、Skill、Event、Forge、Charged Hold / Release、Ultimate Planning 全部通过同一 Command Log 重建，不支持版本或模式直接拒绝。
- 自动化全量：23 files / 124 tests；其中 1,000 个 Seed 的安全状态连续 Save → Restore → Save 字节稳定，代表性完整 Campaign 路径的 Event / Forge / Charged / Ultimate 最终 Hash 全部 Match。
- Production Build、TypeScript、Design Manifest、whitespace 通过；仍只有既有 Three.js 605.52kB chunk 提示。
- 真实浏览器通过：首次无 Continue、Planning 写入、整页重载恢复、Combat 不覆盖、战斗重载回安全 Planning、损坏存档显示明确错误且原始值保留；Console 0。
- 当前边界：Threat Protocol、Assist、Boss Boundary 和 Profile 尚未实现，因此 FG-SV01–SV03 仍需在这些系统接入后扩展；100 Seed × 4 Build 完整 Replay Matrix 等完整内容后执行。
- 下一步：P5 Enemy Roster / Attack Strategy，让正式敌人真实生产已完成的 Projectile / Obstacle / Hazard。

## 2026-08-12 — Complete Enemy Roster / Attack Strategies

- 生产 Enemy Registry 现为 10 Standard + 4 Elite，另保留 Phase 1 Legacy Grunt 兼容夹具；14 类正式敌人全部具备 Movement、Attack Profile、Energy、Armor、Presentation 和 Content Lab 路由。
- 新增固定 Tick Attack State Machine：Cooldown → Telegraph → Active → Recovery；状态保存锁定目标 / 方向、阶段剩余、Attack Sequence、Combo Step 与 Conductor 前摇倍率，并进入 Game Event、Snapshot、Replay Hash。
- Striker / Vanguard / Bastion / Fortress 的接触伤害只在真实 Active 攻击段生效；Charging 仍会被 Active 攻击杀死，但敌人普通贴近不再绕过 Telegraph 直接致命。
- Gunner / Twin Gunner / Sniper 真实生成 Standard / Sniper Projectile；Constructor / Architect 真实生成 900ms 后激活、7s 后消失的 Barrier；Mine Layer 真实生成 1s 武装、触发后 550ms 爆炸的 Mine。
- Lancer 使用锁定线与冲锋；Redline Lancer 的第二段至少 500ms 前摇并重新读取玩家位置；Blink Stalker 在 700ms 以上残影前摇后移动到预测落点附近再突刺。
- Conductor 每 2s 左右为 8m 内友军设置一次性 0.8 Telegraph Multiplier；各 Profile 的基础前摇预留 20%，所以受 Buff 后仍满足 Striker 450 / Gunner 500 / Lancer 650 / Sniper 900 / Blink 700ms 硬下限。
- Elite 不增加 HP：Twin 是三发 18° 扇射，Architect 是两墙与移动墙，Fortress 是前 / 左 / 右 / 后四块独立 Coverage，Redline 是两段冲锋。
- 同时处于 Telegraph / Active 的 Lancer + Blink 总数硬封顶 3；既有 Projectile / Obstacle / Hazard 全局上限继续生效。
- Presentation 增加状态驱动的地面环 + 锁定线两种非颜色提示；Active 改变强度。敌人角色朝向改为读取 Gameplay Facing，避免视觉胸甲方向与真实 Coverage 不一致。
- 自动化全量：24 files / 147 tests；14 类逐项生命周期、受 Buff 后硬下限、三威胁并发、双段重锁、18° 扇射、移动双墙、四甲与移动确定性均通过。TypeScript、Build、Design Manifest、whitespace 通过。
- 真实浏览器逐类验证 14 / 14 可见 Telegraph 和实际动作产物，Gunner Projectile、Constructor Barrier、Fortress Armor 均有截图，Console 0。首次脚本因 50ms 小步导致数千次软件渲染而主动中止，改成不跨越最短前摇的 200ms 批次后保持同一判定门。
- 当前边界：Campaign 仍只复用首个 Striker Encounter；P6 必须把 Roster 编入 28 Standard / 12 Elite / 9 Challenge 模板并完成 Spawn Safety / Pressure Validator，不能把单体生命周期误报为完整内容。
- 下一步：P6 Encounter Content 与精确 Route Threat Preview。

## 2026-08-12 — Four-Act Encounter Content / Challenges

- 已将 Campaign 从单一 Striker 模板替换为 49 个正式非 Boss Encounter：28 Standard、12 Elite、9 Challenge；Act 分布严格为 6/2/2、7/3/2、7/3/2、8/4/3。
- 每个模板都有稳定 ID、独立中英标题、完整说明、两波敌人配方、Formation、Environment / Lighting / Presentation 合同，以及按需配置的 Anchor、Reflector、Barrier、Moving Gate、Mine 或 Arc Rail。
- Route Mapping 由 Seed + Act + Category + Route Slot 确定；100 Seed 已覆盖 49 / 49 模板，单个选择层不会出现两个相同 Encounter 选项。Threat Preview 的 Hostile / Wave / Armor / Projectile / Obstacle / Hazard / Pressure 全部从最终 Definition 自动计算。
- Pressure Validator 使用 GDD 的敌人和场景 Cost，模板总压力全部落在各 Act Standard / Elite 范围；同屏实体上限继续由 Runtime 硬门独立执行。
- Spawn Safety Validator 检查 750ms Warning、玩家出生距离、Arena、同波碰撞、Active Geometry、Sniper / Constructor 上限和 3m × 3m 安全落点；432 个 Authoring Spawn 与 10,000 个动态玩家位置样本违规 0。实际激活时若玩家靠近设计点，会选取最近的确定性安全候选点。
- 9 个 Challenge 不是标题变体：Clean Line、Projectile Cuts、Charged Multi-Break、No Ultimate 均记录真实事件与指标，状态显示在战斗 HUD；成功后确定发放 Reroute Token、25 Next Combat Energy 或 Intel，失败仍正常过关但无额外奖励。
- 自动化全量当前为 26 files / 160 tests；新增 Encounter / Challenge 专项 14 项。TypeScript、Build、设计清单、100 Seed 内容报告和 whitespace 均通过。
- 浏览器 Challenge 闭环通过：Planning 显示条件/奖励/精确威胁，战斗 HUD 实时显示条件，真实无 Ultimate 清场后 Reward 发放 Intel +1；390×844 无横向溢出，Console 0。
- 浏览器 Route Matrix 使用真实 Canvas pointer click / hold / release 完成 4 Act × 3 条不同路线；Act III / IV 装甲路线真实执行 Charged 卸甲。Conductor Debut 在朴素自动玩家下发生 2 次死亡重试后完成，作为后续 P10 难度调优观察项保留，不隐去失败。
- 当前边界（P6 结束时）：当时 4 Boss 尚未实现；现已由下方 P7 记录取代。

## 2026-08-12 — Four Mechanic Bosses / Practice

- 4 个 Boss 现已全部接入正式 Route 与 Encounter Registry；Boss 节点不再锁定。统一 Runtime 保存 Definition、Phase、Action Phase、Objective、Break、Core Window、Mechanics State 与 Victory，并完整进入 JSON Snapshot / Replay Hash。
- Rail Hound 使用 800ms 锁定线、单段后双段冲锋和 1.5s 侧核窗口；冲锋终点被限制在双侧均可进入的安全内框，修复了靠墙后侧核不可达的真实死锁风险；3 次 Core Break 结束。
- Siege Choir 使用前 / 左 / 右三块独立 Coverage、两座可击杀 Gunner 炮台和周期 Barrier；Charged 实际卸掉任意两块后开放 1.5s 背核，连续完成两轮。
- Mirror Regent 同屏为 1 真 + 3 假，真实体有独立尺寸 / 节拍；只读取已经完成的 Dash Path Segments，先显示 800ms 路径再回放致命 Mirror Slash，命中真实体 3 次结束。
- Last Conductor 依序执行 Barrage、Rail Grid、Armor Shell、Vector Finale；最终阶段将 Energy 强制设为 100，只有用基础 Vector Focus 按顺序经过 3 个可见节点才完成，失败尝试会重置目标并重新补能，避免软锁。
- Title 新增 4 个真实 Boss Practice 入口和返回 Title 流程；Practice 使用同一生产输入、Simulation、Presentation、Restart 和 Replay，不是独立假场景。
- 自动门：`verify:bosses` 在固定 Seed、0 Skill 下完成 4 × 100 = 400 次，死亡 0、死锁 0；测试覆盖阶段事件、破核事件、胜利事件，以及失败 → Restart → 完整战斗 → Replay Hash Match。
- 真实浏览器：4 / 4 Boss 由 Playwright 在生产 Canvas 上真实点击、长按松开和按 Space 选择三点完成；HUD、Rail 锁定线、Siege 背核环、Mirror Path、Rail Grid / Finale 三节点均有截图；390×844 无横向溢出，Console 0。
- 当前边界：自动 FG-B01–B03 已通过；每个 Boss 至少 3 次真人完成、失败原因复述与 120–300s 节奏目标仍属于最终人工体验门，不能用 400 次全知状态机代替。
- 下一步：P8 Profile / Dossier / Threat / Assist / Settings / Statistics，再进入完整 Run Replay Matrix 与最终质量门。

## 2026-08-13 — Redesign V2 Clean Arena 与自适应镜头

- 正式关卡运行时已从旧 Transit Cathedral 切换到 `clean-arena-v2`，并使用对应的 `clean-arena-neutral-v2` 灯光配置；正式画面不再创建 city、transit、train 或 weather 模块，雨量与雾密度均为 0。
- Gameplay 继续使用 40×25 的逻辑竞技区（X：-20～20，Z：-12.5～12.5）；Clean Arena Provider 另行创建 1600×1400 的视觉大平面。视觉延伸不扩大碰撞、出生或玩法边界，逻辑空间与表现空间保持分离。
- 镜头改为按逻辑竞技区和当前画幅实时计算：桌面保持原斜俯视方向并采用至少 1.5× 旧镜头距离的远景；竖屏会独立调整距离、视野角和取景范围，以容纳竞技区并避免直接套用桌面参数。
- 真实浏览器已覆盖 1920×1080、1366×768、390×844 三种画幅：均进入正式 Combat、识别 `clean-arena-v2`，旧 city / transit / train / weather 均未出现，无横向溢出，Console 0。
- 定向测试复跑通过：`clean-arena-provider-v2` 与 `camera-fit-v2` 共 2 个测试文件、13 项测试通过；本轮没有据此扩大声明到玩法、Boss、性能或全浏览器矩阵。
- 当前角色仍是现有 V5R 正式运行时，本轮尚未替换为 Redesign V2 目标角色；Clean Arena 与镜头画面也尚未获得最终主观视觉签核，因此这里只确认运行时切换、自适应取景和定向验证完成，不代表整体视觉已最终通过。

## 2026-08-13 — Redesign V2 第一阶段整体收口

- 旧完整局自动玩家已迁移到 V2：开始后直接 Combat，每次清场只走三选一 `select-reward-skill`，随后由 Run Director 自动进入下一战；不再发送玩家选路、Planning、技能点、Event、Forge 或旧 Reward 确认命令。
- 固定 Seed 911 的标准完整局已真实完成：23 个实际战斗节点、4 个 Boss、22 次三选一、最终 22 个技能、254 条命令、11,655 Tick，最终 Victory 且 Replay Hash Match。
- 旧 100 Seed × 4 套预设构筑矩阵已改为 3 个 Seed 的 V2 完整局确定性回放门；3 / 3 通过。构筑由实际三选一决定，不再向状态注入旧技能点 Build。
- 三选一后程容量另以 100 Seed × 19 次连续 Offer 检查，均保持三个合法候选；这只证明当前标准局所需的候选跑道，不代替后续技能内容取舍。
- 过程中两次完整局失败都定位为旧验证玩家不兼容：其一错误选择会改变路径几何的技能后仍使用旧 Boss 固定路线，其二在 Mirror Regent 的危险回放窗口原地等待。只调整验证玩家的安全选择与等待条件，未改生产 Boss 或技能规则迎合测试。
- 第一阶段整体验证已完成；下一阶段开始 Primitive Character Provider、三角形主角 / 方形敌人和真实垂直物理。当前整体视觉仍未获用户最终签核。
