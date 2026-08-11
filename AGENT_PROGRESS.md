Original prompt: 阅读“赛博朋克游戏设计分析”对话与最终 PRD，在 `/Users/nefish/Desktop/Coding/Slash` 实现以视觉表现为最高优先级的 3D Web 赛博武士直线突刺击杀 Visual Vertical Slice。

# Project Slash — Agent Progress

更新时间：2026-08-11

## 当前进展

- Phase 2A 已在 `codex/phase2a-foundation` 分支启动。本阶段只建立可扩展 Gameplay 与视觉生产架构，不把当前画面描述为视觉合格，也不合入 Vector Focus、镜头或关卡改动。
- Phase 2A-0 基线层已完成：新增 Vitest 独立测试，锁定三关定义、初始状态、代表性 Dash 与事件顺序；生产镜头参数已有单一事实源，输入延迟脚本不再复制旧镜头，也不会因截图失败丢失测量报告。
- Phase 2A-0 小规模验证已通过：3 个基线测试、TypeScript 检查和 100 次真实输入均通过；本轮 P95 输入到逻辑 1.1ms、输入到可见结果 16.7ms，浏览器问题 0。该项除非相关输入/镜头代码再次变化，不重复运行。
- Phase 2A Gameplay V2 已完成第一轮迁移：三关内容改由 `LevelDefinition + EncounterDefinition + SpawnDefinition` 驱动；Enemy 使用 Definition ID 与 `DirectChaseBehavior`；`GameState` 升级为 V2，并建立 Projectile / Obstacle / Hazard 正式 Domain 入口。
- 新增稳定 Definition Registry、稳定敌人 ID 工厂，以及 Circle / Segment / AABB / OBB / Convex Polygon 的真实碰撞与扫掠计算。现有 Dash 已复用新碰撞模块，三关定义、初始快照、代表性 Dash 和事件顺序指纹保持不变。
- Phase 2A Ability / Event / Replay 已完成：现有 Dash Slash 已成为正式 Primary Ability；Ability Slot、受控 Modifier、确定性 Seed、Command Dispatch、Event 2.0 和完整关卡 Replay 已接入。调试技能与测试升级仅存在于 `src/debug/content/`，不会伪装为生产内容。
- `render_game_to_text` 现已暴露 Encounter、Run Seed / Tick、Ability Slot 以及 Projectile / Obstacle / Hazard 状态；现有表现层直接消费事件携带的命中位置与方向，不再从后续可变状态反推视觉事实。
- Phase 2A Runtime / Presentation Registry 已完成：Gameplay Definition 不再携带模型与特效细节；Character、Animation、Enemy、Ability、VFX、Audio、Environment、Lighting、Post FX 的当前映射统一注册并做交叉完整性检查。
- `main.ts` 已收缩为启动入口，应用装配层只连接 Game / Input / Debug / Renderer / Presentation Runtime。角色、HUD、事件表现、指针投影与视觉生命周期已进入独立 Presentation Runtime；当前视觉参数只迁移、不重新设计，仍明确为未获用户签核。
- Phase 2A Character Provider / Animation 2.0 已完成：程序化 Hero / Enemy 继续作为默认生产 Provider；两份 Tripo Rigged GLB 已作为按需加载 Provider 接入，使用 `SkeletonUtils.clone()`、每实例材质与 `AnimationMixer`，并统一暴露武器挂点、残影源、死亡能力和释放接口。
- 角色动画已改为明确的 Idle / Anticipation / Action / Arrival / Recovery / Hit / Death 状态机；当前程序动画成为 Additive Driver，GLB 的 Base Clip 可通过相同 Controller 淡入淡出。两份生产 GLB 原文件没有 AnimationClip，因此明确走自制骨骼驱动，不把缺失 Clip 冒充完成。
- 已有可运行的 TypeScript + Vite + Three.js Web 游戏：三关（8 / 12 / 18 敌人）、点击地面无限距离直线 Dash、路径多杀、玩家 1HP、Dash 无敌、Recovery/Input Buffer、死亡点击重开、自动过关/通关、HUD、声音、后处理、鼠标与触控输入。
- 环境方向为 Transit Cathedral：深湿金属竞技台、交叉轨道与巨拱、五节列车、近中远城市、雨雾与蒸汽。
- 角色美术已进入 V5：新三视图位于 `art/characters/concepts/hero-turnaround-v5.png` 与 `art/characters/concepts/enemy-turnaround-v5.png`；当前实现重点是连续人体大形、关节衔接、低位蓄势和冲跑动势，不再用旧 V4 数值叠加代替主观视觉判断。
- V5 当前模型已升级为有效连续几何：主角 4,316 triangles、敌人 4,264 triangles；腕踝端盖、过大头部和积木鞋已修正。主角 Ready 为低位双脚架势，Dash 为刀线领先、双腿后拖；敌人 8 人战场可见不同前倾角、步相和武器高度且不再横趴。
- 用户已要求把后续角色建模切换为 Tripo 生成候选。已建立 `tools/tripo_pipeline.py`：密钥只从进程环境读取，不写入项目；P1 多视图首轮计划为主角三视图、8,000 面、标准 PBR，当前程序化角色保留为可回退版本，生成模型未证明更好前不替换。
- Tripo 输入已准备完整：主角和敌人各有独立的前、左、后三视图，位于 `art/characters/tripo-inputs/hero-v5/` 与 `art/characters/tripo-inputs/enemy-v5/`；敌人侧视图已去除相邻视图肢体污染。
- 新增 `validation/tools/tripo-model-lab.html` 与 `src/tripo-model-lab.ts`：下载的 GLB 可自动统一至 3.3m、落地居中、正/侧/背/三分之四观察，并显示三角面、材质、贴图、骨骼和动画信息。该工具只服务新模型视觉筛选，不重跑既有机制/性能套件。
- 用户当前不在电脑前，已明确授权把 Tripo 高精角色候选作为延期项，并在没有其他发布阻塞时同步当前可玩基线到 GitHub。延期不等于视觉验收通过，当前程序化角色不会冒充 Tripo 成果。
- 公开仓库卫生已完成：本地 `output/`、`.playwright-cli/` 与大型 `validation/` 证据不提交；保留正式源码、概念图、三视图输入、验收文档、可复用验证脚本、精简许可证审计和一张真实游戏截图。所有本地证据仍保留，未删除。
- GitHub 公开空仓库已初始化：初始提交 `63ac2a5` 已推送到 `https://github.com/ArvenWang/SlASH.git` 的 `main` 分支，本地 `main` 正在跟踪 `origin/main`。
- Gameplay、浏览器矩阵、生命周期、1080p / 1440p 性能和资产许可审计已闭合。第一轮稳定性实测已提供约 10 分钟数据；用户明确要求停止继续重复长测，第二轮已中止。
- 本地生产预览：`http://127.0.0.1:4175/`。

## 已完成内容

### 角色、动作与可读性

- 主角常态改为双脚接地、骨盆下沉、胸肩向目标压前、刀手贴近腰侧的低位 Ready；Dash/Arrival/Recovery 不会突然站直或出现 Pose Pop。
- 敌人保持前冲跑姿；18 人同屏使用连续相位差和 4 组姿态偏置，躯干前倾、肩线、步幅与武器高度不会整齐复制。
- 主角造型为连续大壳体、近黑软层、单一深灰大面和少量视窗能量；敌人为连续躯干、炭灰大甲、完整朱红倒 V、单红肩与短阔刀。
- V5 细化没有增加碎甲或装饰线：新增几何只用于锁骨/胸腰/骨盆、肘膝和腕踝过渡；近景不再暴露圆形端盖。
- 主角刀约 3.1008m（角色高的 93.96%），实体厚度约 0.012 world-unit，整片发光；敌刀约 1.1002m（角色高的 34.85%）。
- V4 概念叠加平均偏差 2.15%–3.92%，最大 4.37%–4.62%；工具使用新 V4 人工地标与实时 WebGL 投影，不复用旧 V3 标尺。
- 1080p 战场中主角约 95.7px 高，1600×900 约 79.8px；角色仍是画面亮度焦点，竞技场边界完整可见。

### Gameplay / VFX / Gore / Audio

- 100 次真实输入：逻辑 P95 0.2ms，首个可见结果 P95 14.8ms；直线 Dash、边界钳制、35–110ms 时长、80–180ms Recovery、最后一次输入缓冲均通过。
- 1 / 5 / 20 路径多杀在 60 / 120 / 144 FPS 下结果一致；Recovery 期间真实可受伤，Dash 期间无敌。
- 真实生产 Canvas 点击已验证死亡重开；完整三关通过真实鼠标投影点击到达 `game-complete`，Stage 3 为 18 杀 / 0 存活。
- 命中时间轴已同步：0–50ms 刀口接触与火花，80–150ms 切面、上下身负空间和方向性血幕，约 650ms 只保留两大尸块与血池。
- 尸体有 4 组确定性落地家族，全部贴地、无跪姿；Dash 会扰动雨幕、蒸汽和湿地窄反射。
- 程序化原创音频包含 Rain/City、Blade Hum、Dash/Aircut/Metal、Flesh/Blood、6 组击杀变体、多杀强化、Death 与 Mute；离线真实 Chromium 证据峰值、RMS、变体与静音门均通过。

### 性能、兼容性与商业审计

- 20 敌人 + 八杀 + Rain/Steam/Blood/Corpses/Camera/Post FX 的 60 秒可见系统 Chrome 压力测试：
  - 1920×1080：59.97 FPS，P95 18.1ms，P99 18.6ms，最慢 32.6ms；通过。
  - 2560×1440：59.97 FPS，P95 18.3ms，P99 18.6ms，最慢 31.8ms；通过。
- 同机空白可见 Chrome rAF 基线为 59.98 FPS / P95 18.1ms；1080p 门按 60Hz 16.67ms + 10% 调度容差（18.33ms）判定，原始游戏帧时间未平滑或删改。
- 敌人接触阴影改为单个 Instanced soft layer，避免 20 个分节角色重复进入方向光阴影 pass；Stage 3 绘制调用约从 882 降至 519，保持贴地感。
- 系统 Chrome 1920×1080 / 2560×1440 / 1366×768、高画质/兼容模式、Firefox、WebKit、390×844 触屏全部通过真实输入，控制台零错误。
- Resize / DPR、可信键盘全屏、Chrome renderer freeze/resume、WebGL Context Loss/Restore 和恢复后 Gameplay 均通过。
- `validation/licenses/asset-audit.txt` 已通过：生产包无第三方二进制美术/音频、无运行时外链、无密钥模式；依赖许可证为 MIT / Apache-2.0。

## 下一步计划

1. 建立可持续的 VFX、Audio、材质、灯光与环境 Profile、通用 Pool、性能预算及真实调试 Labs。
2. 补齐架构文档、扩展操作说明和接力状态。
3. 只执行一次整体验证，确认三关、Replay、GLB、浏览器、性能与资产门。

## 遇到的问题

- 第一轮稳定性脚本实际等待约 10 分钟，但最后一笔样本停在 570.34 秒，导致 `duration` 单项失败；游戏数据本身为堆 +0.36MB、几何体恒 93、纹理恒 23、浏览器零错误。脚本已修复，但用户明确要求不再重复长测，第二轮已主动中止。
- Three.js 核心 chunk 约 573KB，生产构建有 `>500KB` 提示；总压缩体积远低于 50MB 加载门，但仍需在最终报告中记录。
- 当前有真实系统 Chrome、Firefox 和 Playwright WebKit 证据；本机未安装 Edge，WebKit 证据也不能冒充“真人 Safari 点击验收”。这两项需在发布前补实体浏览器或由用户明确接受现有内核级覆盖。
- WebM 录像不录制 Web Audio；音频已有可播放 WAV 与数值报告，但最终混音仍需真人试听。
- 用户提供的 Tripo API Key 经官方余额接口确认 API 余额为 0；首次生成在创建任务前即被余额不足拒绝，消耗 0 分。Chrome 与备用浏览器的 Tripo Studio 均未登录，无法访问用户所说的约 600 网页积分。密钥未写入仓库、日志或进度文档。

## 已解决问题

- 修复主角站直/单脚悬空、敌群同步复制、刀身厚重且只亮刃线、双方零件/材质过碎的问题。
- 修复尸体跪姿、Dash 主体落后残影、HUD 提前扣数、命中反馈延迟、Firefox/WebKit 首次输入被 AudioContext 阻塞的问题。
- 修复 WebGL Context Loss 后无法恢复、全屏拒绝产生未处理异常、后台恢复长时间步、验证脚本等待隐藏 Loading 层的问题。
- 修复每帧临时 Input/Event/EnemySpeed/HUD 分配和重复 DOM 写入；玩法回归测试保持通过。
- 修复完整三关验收脚本仍使用旧相机与 1600×900 投影的问题；现在与生产相机及 1920×1080 一致，待最终重跑。
- 修复旧事件缺少稳定 ID、Run Tick 和完整表现事实的问题；表现层不再根据已经变化的敌人或玩家状态重建击杀位置、攻击方向。
- 将 Dash 的硬编码入口改为可注册 Ability 与通用缓冲命令；Recovery 与 Hit Radius 只能通过白名单 Modifier 字段改变，调试扩展不会污染生产内容注册表。
- 修复 `main.ts` 同时承担玩法推进、输入、调试、Renderer、角色与 HUD 集成的问题；现在各 Runtime 有独立职责，Gameplay Definition 与可替换视觉 Profile 也已解耦。
- 修复程序角色创建与动画类型被写死在 Presentation Runtime 的问题；角色来源现在由 Provider Registry 决定，Gameplay 位置继续拥有唯一真实 Root Motion，动画只控制视觉姿态。
- 恢复并加固 Tripo 生成 / Rig / Animation 三条工具链：只从环境变量读取密钥、支持短连接轮询与 Task ID 恢复；未合入远端 Vector Focus、镜头、地图或玩法代码。
- 完成公开仓库清理、初始提交与 `main` 首次推送；本地大型验证证据未删除，也未进入 Git。

## 未解决问题

- 稳定性终点采样脚本门未形式化闭合；按用户要求不再重复长测，保留首轮真实数据与这一限制。
- 最新完整三关 1920×1080 录像和固定目录证据包尚未重跑；当前优先交给用户实际试玩。
- 用户尚未对 V5 主角、敌人、动作和最终整体画面完成主观签核；旧 V4 数值通过不再视为当前主观视觉门。
- Tripo 主角候选尚未生成；用户已明确允许本轮延期，因此它不再阻塞当前基线推送，但仍是未完成美术项。失败记录是脱敏的本地文件，不会提交到 GitHub。

## 验证情况

- Phase 2A-0：`npm run test:baseline` 通过，1 个测试文件 / 3 个测试全部通过。
- Phase 2A-0：`npm run check` 通过。
- Phase 2A-0：100 次真实 Canvas 输入通过；逻辑 P95 1.1ms、首个可见结果 P95 16.7ms、截图与浏览器清洁门通过。证据保存在本次临时目录，不进入仓库。
- Phase 2A Gameplay V2：3 个测试文件 / 11 个测试通过；包含 Phase 1 指纹、Content/Domain、DirectChase 与五种碰撞形状。
- Phase 2A Gameplay V2：`npm run check`、`npm run build` 通过；运行时烟雾检查为 Idle / Post Dash 均保持 `playing`，浏览器问题 0。未重复浏览器矩阵或性能测试。
- Phase 2A Ability / Event / Replay：4 个测试文件 / 16 个测试通过；包含 Dash Ability、白名单 Modifier、独立调试 Ability、Event 2.0 元数据、Seed 恢复，以及 Stage 1 完整录制与确定性回放。
- Phase 2A Ability / Event / Replay：`npm run check`、`npm run build` 通过；一次真实运行冒烟中 Idle / Post Dash 均为 `playing`，Primary Ability 为 `dash-slash`，浏览器问题 0。未重复输入延迟、性能或浏览器矩阵。
- Phase 2A Runtime / Presentation Registry：4 个相关测试文件 / 12 个测试通过；包含 Phase 1 指纹、Content Domain、Registry 完整性、稳定 GameState 引用和无敌人移动的真实玩家时间线。
- Phase 2A Runtime / Presentation Registry：`npm run check`、`npm run build` 通过；真实页面 Idle / Post Dash 均为 `playing`、Primary Ability 为 `dash-slash`、浏览器问题 0。未重复性能、输入延迟或浏览器矩阵。
- Phase 2A Character Provider / Animation 2.0：3 个相关测试文件 / 9 个测试通过；包含真实二进制 GLB 导出再加载、独立 Skeleton / Material / Mixer、Idle → Action → Recovery、Death 终态和 Phase 1 指纹。
- 两份生产 GLB 资产门：主角 7,934 triangles / 1 material / 3×2048 texture / 52 bones / 3.3m；敌人 7,757 triangles / 1 material / 3×2048 texture / 49 bones / 3.157m；均落地、+Z、无外链，内置 AnimationClip 均为 0。
- Character Provider 浏览器门：Procedural Idle、GLTF Idle、GLTF Action、GLTF Recovery 四个真实 WebGL 场景通过，浏览器问题 0；游戏页 Idle / Post Dash 均保持 `playing`。`npm run check`、`npm run build`、三条 Tripo Python 语法检查和更新后的第一方二进制资产许可门通过。
- `npm run check`：通过。
- `npm run build`：通过；仅有 Three.js 核心 chunk 体积提示。
- `git diff --check`：通过。
- Gameplay：`validation/final-gameplay-flow/` 与 `validation/automated/gameplay/` 通过。
- Character V4：`validation/character/formal-v4-final/report.json` 为 `passed`，`browserIssues=[]`，主观门明确为待人工签核。
- Character V5 当前视觉迭代：`validation/character/v5-iteration-7/`；真实战场短复核见其中 `gameplay-ready.png`。本轮只确认建模与姿态变化，没有重跑机制/性能/稳定性套件。
- Gore/VFX：`validation/kill-timeline-v38-gore-final/`，浏览器问题为 0。
- Audio：`validation/audio-phase1/`，浏览器问题为 0。
- Browser：`validation/compatibility/browser-matrix-final/` 7 组配置全部通过。
- Lifecycle：`validation/compatibility/lifecycle-stability/report.json` 全部门通过。
- Performance：`validation/performance/final-1080p-calibrated/` 与 `validation/performance/final-1440p/` 通过；空白基线见 `validation/performance/blank-raf-baseline/`。
- License：`validation/licenses/asset-audit.txt` 通过。
- Tripo 管线：Python 语法检查通过；首次 API 调用由官方余额接口返回 0 并在创建任务前拒绝，确认无模型文件、无积分消耗、仓库内无密钥内容或密钥前缀字符串。
- Tripo 输入/检查台：6 张角色输入均已核对尺寸与内容；`npm run check` 通过，`git diff --check` 通过。尚无真实 GLB，因此没有伪造加载通过结论。
- 发布收口：当前工作树 `npm run build` 通过；`npm run verify:assets` 通过，确认生产运行时无第三方二进制美术/音频、无外链、无密钥模式，依赖许可证已知。仅保留既有 Three.js 核心 chunk 573.27KB 提示。

## 暂勿并行修改

- Phase 2A 正在迁移 Gameplay 与 Presentation 边界；不要并行修改 `src/game/`、`src/main.ts`、`src/presentation/`、测试基线或 Tripo 角色管线。
- 不要删除现有程序化角色、三视图输入或本地验证证据；它们仍是视觉回退与迁移对照。
