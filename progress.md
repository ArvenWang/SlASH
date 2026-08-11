Original prompt: 阅读“赛博朋克游戏设计分析”对话与最终 PRD，在 `/Users/nefish/Desktop/Coding/Slash` 实现以视觉表现为最高优先级的 3D Web 赛博武士直线突刺击杀 Visual Vertical Slice。

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
