Original prompt: 阅读“赛博朋克游戏设计分析”对话与最终 PRD，在 `/Users/nefish/Desktop/Coding/Slash` 实现以视觉表现为最高优先级的 3D Web 赛博武士直线突刺击杀 Visual Vertical Slice。

# Project Slash — Agent Progress

更新时间：2026-08-12

## 当前进展

- 2026-08-12 V5R 严格视觉重设计专项与最终综合门已完成：四视图叠加、64px/LOD、14 个 Rig 压力姿势、Hero 12 / Enemy 11 动作、七状态刀刃/握持、场景层级与非生产模型替换 Fixture 均有当前证据；专项浏览器错误为 0。Hero 主体 LOD 降低 58.0%，Enemy 降低 60.0%；场景战场亮度 +8.7%、平台边缘密度 +9.6%，背景亮度基本不变。最终一次综合验证为 12 文件 / 45 测试、生产构建、资产审计、10 项生产浏览器流程和 diff 检查全部通过；用户真人视觉签核仍是独立终门。
- 2026-08-12 用户已确认启动 3D 视觉重设计，并要求先完善最终验收标准。`docs/ACCEPTANCE_STANDARD.md` 已升级为 v2.0，新增 VR-H01–VR-H10 硬门、100 分评分、四视图/模型/Rig/动画/武器/场景/模块替换/游戏内一致性证据门，以及“每节一次小验证、最后一次整体验收”的节奏。`docs/CHARACTER_ART_BIBLE.md` 升级为 v1.4 V5R：保留 V5 风格，正式生产改为四视图 A-Pose、身体与武器分离、标准语义骨架。
- 用户补充确认现有主角刀过大且握持插槽错误。旧刀约为角色身高 93% 的规则已废止；新硬门为武器总长 `58–66%`，首轮比较 `58% / 62% / 66%`，并强制主/副握点、护手、刀根、刀尖和拖尾锚点。旧验收中“刀长 90–96%”与“环境关闭不再修改”的冲突条款已纠正。
- Tripo 正式生成与 Rig v2.5 已完成：Hero 选择静态任务 `7f067cd3-0125-4787-ada2-0761e4a5bf6e`、78 骨 Rig；Enemy 选择静态任务 `869b0a04-3a94-44c8-922e-2ccc399c674c`、55 骨 Rig。生成用 Key 仅进入临时进程环境，未写入仓库、清单或日志；会话结束时已显式清除，余额剩余 50。
- V5R 正式资产输入已经完成第一轮：主角/敌人各有一张四视图 A-Pose、四张 1024×1024 Tripo 输入；敌人左视图曾混入相邻手臂，已收紧裁切并重新目视通过。主角核心动作、Vector Focus/三段链斩/死亡、敌人动作/切割、数值化 58/62/66% 武器比例和 Transit Cathedral v2 场景目标图均已落盘。
- `docs/CHARACTER_ANIMATION_SPEC.md` 已锁定正式 Clip 清单、状态、接触与验收；`docs/architecture/VISUAL_ASSET_CONTRACT.md` 已定义 Character Asset、Skeleton Profile、Weapon/Grip、Animation Set、动态 Ground/Bounds 与 Environment Profile 的替换合同。生产默认已切到 `gltf-hero-v5r` / `gltf-enemy-v5r`，程序化角色只保留回退。
- V5R 场景重设计已接入 `transit-platform-v5r` 视觉配置：Transit/City 后移并降权，中央巨柱移出主战斗视线；Arena 新增宏观服务板、双维护舱、格栅、紧固件和分层边缘立面，独立碰撞面未改变。
- Phase 2A 已在 `codex/phase2a-foundation` 分支完成实现与整体技术验收。本阶段建立了可扩展 Gameplay 与视觉生产架构，V5R 视觉重设计也已接入正式资产；当前仅保留用户真人视觉签核这一独立终门。
- 2026-08-11 已补齐启动生命周期：普通本地地址默认停在 `title`，Game Tick、敌人移动和碰撞不推进；点击任意启动页区域、Enter 或 Space 后才重置为干净 Stage 1、进入 `playing`，并用同一次可信手势解锁 Web Audio。自动化可显式使用 `?autostart=1`，`?validation=1` 也会自动开战。
- Vector Focus 已按新架构恢复，不是把旧单体 `main.ts` 合回：Ultimate 使用通用 Ability Resource、Active Ability 选点/路线状态、Command、Event 2.0、Replay v2 与 Presentation Profile。旧版规则保持为 14/32/54/80/100 多杀充能、100 满能、3 秒三点选路、0.12 倍敌人世界时间、三段链斩、180ms 收招，链斩击杀不自充能。
- HUD 已恢复 000–100 能量条、Ready/Selecting/Executing 状态、三点槽位与倒计时；Space 可进入/取消选点，Escape/右键可取消，第三点触发真实链斩。路线、标记、强化残影、到达环、程序化音效、镜头冲击与 Post FX 均通过注册 Profile 接入。
- Git 实现提交 `1695906` 已推送至 `origin/codex/phase2a-foundation`；本地预览服务当前未运行，需要检查时可按项目命令重新启动。用户真人视觉签核仍未完成。
- Phase 2A-0 基线层已完成：新增 Vitest 独立测试，锁定三关定义、初始状态、代表性 Dash 与事件顺序；生产镜头参数已有单一事实源，输入延迟脚本不再复制旧镜头，也不会因截图失败丢失测量报告。
- Phase 2A-0 小规模验证已通过：3 个基线测试、TypeScript 检查和 100 次真实输入均通过；本轮 P95 输入到逻辑 1.1ms、输入到可见结果 16.7ms，浏览器问题 0。该项除非相关输入/镜头代码再次变化，不重复运行。
- Phase 2A Gameplay V2 已完成第一轮迁移：三关内容改由 `LevelDefinition + EncounterDefinition + SpawnDefinition` 驱动；Enemy 使用 Definition ID 与 `DirectChaseBehavior`；`GameState` 升级为 V2，并建立 Projectile / Obstacle / Hazard 正式 Domain 入口。
- 新增稳定 Definition Registry、稳定敌人 ID 工厂，以及 Circle / Segment / AABB / OBB / Convex Polygon 的真实碰撞与扫掠计算。现有 Dash 已复用新碰撞模块，三关定义、初始快照、代表性 Dash 和事件顺序指纹保持不变。
- Phase 2A Ability / Event / Replay 已完成：现有 Dash Slash 已成为正式 Primary Ability；Ability Slot、受控 Modifier、确定性 Seed、Command Dispatch、Event 2.0 和完整关卡 Replay 已接入。调试技能与测试升级仅存在于 `src/debug/content/`，不会伪装为生产内容。
- `render_game_to_text` 现已暴露 Encounter、Run Seed / Tick、Ability Slot 以及 Projectile / Obstacle / Hazard 状态；现有表现层直接消费事件携带的命中位置与方向，不再从后续可变状态反推视觉事实。
- Phase 2A Runtime / Presentation Registry 已完成：Gameplay Definition 不再携带模型与特效细节；Character、Animation、Enemy、Ability、VFX、Audio、Environment、Lighting、Post FX 的当前映射统一注册并做交叉完整性检查。
- `main.ts` 已收缩为启动入口，应用装配层只连接 Game / Input / Debug / Renderer / Presentation Runtime。角色、HUD、事件表现、指针投影与视觉生命周期已进入独立 Presentation Runtime；当前视觉参数只迁移、不重新设计，仍明确为未获用户签核。
- Phase 2A Character Provider / Animation 2.0 已升级到 V5R 生产资产：`gltf-hero-v5r` / `gltf-enemy-v5r` 使用 `SkeletonUtils.clone()`、每实例材质与 `AnimationMixer`，统一暴露武器挂点、残影源、死亡能力和释放接口；程序化 Provider 仅作回退。
- 角色动画使用统一语义骨架与真实项目自制 Clip：Hero 12 个、Enemy 11 个，覆盖 Idle / Turn / Anticipation / Action / Arrival / Recovery / Focus / Chain / Hit / Death。Tripo 预设动作因脚部和重心异常被明确拒绝；旧随机骨骼名驱动已删除。
- Phase 2A Visual Profile / Pool / Labs 已完成：当前材质 Token、Material Profile、Lighting、Environment、VFX、Audio、Post FX 与 Impact Profile 均为数据化定义；现有数值和效果保持不变，后续视觉迭代可以替换 Profile，而不再修改 Gameplay。
- 新增通用 Object Pool 与六类正式预算入口，现有 Kill Impact Flash 已真实复用池对象；`render_game_to_text` 明确输出 `visible-rAF-frame-time`、Renderer、分类预算和 Pool 使用量，不把普通帧时间冒充 GPU 时间。环境 Scene 已按 Arena / Transit / City / Weather / Lighting 模块分组。
- Character Lab 已升级为 Animation Lab；另有真实 VFX Lab、Environment Lab 和 Content Sandbox。它们可以选择 Provider、状态、速度、Loop、冻结帧、Gameplay Camera、VFX、昼夜检查 Profile、雨雾、Level、Enemy、Ability 与 Debug Upgrade。
- `docs/architecture/` 已补齐 Gameplay、Content、Ability、Presentation、Character、Animation、Level、Replay、Performance 与独立 Architecture Review；文档记录真实代码路径、接口、扩展示例和当前尚未实现的机制，不用空文档冒充架构完成。
- 架构 Critic 在 Phase 2A 范围内通过：Gameplay/Content 无 Presentation/Three.js 反向依赖，64 个本地 TypeScript 模块无循环依赖；新增自动守门会持续检查边界、循环和 `main.ts` Bootstrap 职责。
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
- Phase 2A 整体验证已闭合：全量单测/构建、Replay、真实 GLB、五项 Lab、死亡重开与完整三关、100 次输入、七项浏览器矩阵、生命周期、1080p / 1440p 性能和资产许可均通过。第一轮稳定性实测已提供约 10 分钟数据；用户明确要求停止继续重复长测，第二轮已中止。
- 本地生产预览：`http://127.0.0.1:4176/`。

## 已完成内容

### 角色、动作与可读性

- 主角常态改为双脚接地、骨盆下沉、胸肩向目标压前、刀手贴近腰侧的低位 Ready；Dash/Arrival/Recovery 不会突然站直或出现 Pose Pop。
- 敌人保持前冲跑姿；18 人同屏使用连续相位差和 4 组姿态偏置，躯干前倾、肩线、步幅与武器高度不会整齐复制。
- 主角造型为连续大壳体、近黑软层、单一深灰大面和少量视窗能量；敌人为连续躯干、炭灰大甲、完整朱红倒 V、单红肩与短阔刀。
- V5 细化没有增加碎甲或装饰线：新增几何只用于锁骨/胸腰/骨盆、肘膝和腕踝过渡；近景不再暴露圆形端盖。
- 主角刀总长 2.046m（角色高的 62%）、Grip 11%；暗金属刀脊与单侧冷白切削边分离。刀尖、切削边、护手、主握点和拖尾锚点均由独立 Weapon Definition 提供；手掌按正握朝向护手，失真指骨由可替换 Grip Attachment 收口。
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
  - 1920×1080：59.95 FPS，P95 18.6ms，P99 18.7ms，最慢 50.0ms；同轮空白 rAF P95 18.6ms，游戏相对基线增加 0ms，校准门与绝对 P99/Worst 门通过。
  - 2560×1440：59.95 FPS，P95 18.6ms，P99 18.7ms，最慢 48.3ms；通过。
- 当前系统 Chrome 的空白可见 rAF P95 从历史 18.1ms 漂移为 18.6ms，旧 18.33ms 门连空白页也会失败。验证工具现显式绑定同机同分辨率空白基线，限制游戏 P95 最多增加 0.5ms，并继续保留 P95 <25ms、P99 与 Worst 绝对门；原始失败报告与校准报告均保留，未平滑或删改数据。
- 敌人接触阴影改为单个 Instanced soft layer，避免 20 个分节角色重复进入方向光阴影 pass；Stage 3 绘制调用约从 882 降至 519，保持贴地感。
- 系统 Chrome 1920×1080 / 2560×1440 / 1366×768、高画质/兼容模式、Firefox、WebKit、390×844 触屏全部通过真实输入，控制台零错误。
- Resize / DPR、可信键盘全屏、Chrome renderer freeze/resume、WebGL Context Loss/Restore 和恢复后 Gameplay 均通过。
- `validation/licenses/asset-audit.txt` 已通过：生产包无第三方二进制美术/音频、无运行时外链、无密钥模式；依赖许可证为 MIT / Apache-2.0。

## 下一步计划

1. 由用户在本地预览完成主观视觉签核；自动门通过不能替代真人对角色、动作、握法和整体画面的判断。
2. 用户确认后再决定是否提交、推送，以及是否继续做下一轮模型材质/动作精修；不主动扩展 UI 或新玩法。
3. 若用户指出具体视觉缺陷，只回到受影响模块修正并做对应小验证，不重跑已通过的长稳、性能或全浏览器矩阵。

## 遇到的问题

- 能量条缺失并非 CSS 隐藏：旧 Vector Focus 位于已分叉的 `origin/codex/tripo-vector-focus`，Phase 2A 只迁移了资产与架构，没有迁移旧 `game/main/index/styles/audio/vfx` 玩法代码。直接 Cherry-pick 会把旧地图、镜头与单体架构一并带回，因此本轮按新边界重新实现。
- 第一轮稳定性脚本实际等待约 10 分钟，但最后一笔样本停在 570.34 秒，导致 `duration` 单项失败；游戏数据本身为堆 +0.36MB、几何体恒 93、纹理恒 23、浏览器零错误。脚本已修复，但用户明确要求不再重复长测，第二轮已主动中止。
- Three.js 核心 chunk 约 604.35KB（gzip 152.69KB），生产构建有 `>500KB` 提示；总压缩体积远低于 50MB 加载门，GLTF Provider 已按需拆分，但该提示仍需持续记录。
- Phase 2A 首轮 1080p 原始 P95 为 18.6ms，旧 18.33ms 固定门失败；同轮空白页也为 18.6ms，确认是当前显示/Chrome 调度基线变化而非游戏新增延迟。原始失败证据没有删除，最终使用同机基线校准闭合。
- 当前有真实系统 Chrome、Firefox 和 Playwright WebKit 证据；本机未安装 Edge，WebKit 证据也不能冒充“真人 Safari 点击验收”。这两项需在发布前补实体浏览器或由用户明确接受现有内核级覆盖。
- WebM 录像不录制 Web Audio；音频已有可播放 WAV 与数值报告，但最终混音仍需真人试听。
- 本轮新 Key 已完成模型、Rig 与预设压力动作任务，余额剩余 50；预设动作质量不达标，未继续浪费余额。Key 未写入仓库、日志或进度文档，交付时应提醒用户轮换已在聊天中暴露的 Key。

## 已解决问题

- 修复本地部署后立即开战：新增 `loading → title → playing` 应用生命周期，Title 状态只允许环境/角色表现更新，不推进确定性 Gameplay。
- 恢复 Vector Focus 的资源、Space 输入、选点、慢世界、三段链斩、HUD、路线、VFX、Audio 和 Post FX，并把这些机制接入可复用 Ability/Resource/Command/Event/Replay/Presentation 边界。
- 修复主角站直/单脚悬空、敌群同步复制、刀身厚重且只亮刃线、双方零件/材质过碎的问题。
- 修复尸体跪姿、Dash 主体落后残影、HUD 提前扣数、命中反馈延迟、Firefox/WebKit 首次输入被 AudioContext 阻塞的问题。
- 修复 WebGL Context Loss 后无法恢复、全屏拒绝产生未处理异常、后台恢复长时间步、验证脚本等待隐藏 Loading 层的问题。
- 修复每帧临时 Input/Event/EnemySpeed/HUD 分配和重复 DOM 写入；玩法回归测试保持通过。
- 修复完整三关验收脚本仍使用旧相机与 1600×900 投影的问题；现在与生产相机及 1920×1080 一致，最终真实点击三关已通过。
- 修复旧事件缺少稳定 ID、Run Tick 和完整表现事实的问题；表现层不再根据已经变化的敌人或玩家状态重建击杀位置、攻击方向。
- 将 Dash 的硬编码入口改为可注册 Ability 与通用缓冲命令；Recovery 与 Hit Radius 只能通过白名单 Modifier 字段改变，调试扩展不会污染生产内容注册表。
- 修复 `main.ts` 同时承担玩法推进、输入、调试、Renderer、角色与 HUD 集成的问题；现在各 Runtime 有独立职责，Gameplay Definition 与可替换视觉 Profile 也已解耦。
- 修复程序角色创建与动画类型被写死在 Presentation Runtime 的问题；角色来源现在由 Provider Registry 决定，Gameplay 位置继续拥有唯一真实 Root Motion，动画只控制视觉姿态。
- 恢复并加固 Tripo 生成 / Rig / Animation 三条工具链：只从环境变量读取密钥、支持短连接轮询与 Task ID 恢复；未合入远端 Vector Focus、镜头、地图或玩法代码。
- 修复 VFX、Audio、灯光、Post FX 和环境反应由表现层直接写死调用的问题；Gameplay Event 现在先解析 Presentation Profile，再由对应 Runtime 执行。Kill Impact 的重复 Mesh / Material 分配已进入真实对象池。
- 修复调试工具只能看单一程序角色的问题；Content / Animation / VFX / Environment 都有独立真实运行入口，Debug GUI 也拆成 VISUAL / GAMEPLAY / CONTENT 三组。
- 修复隐藏 Debug GUI 仍通过十个 `.listen()` 每帧重复生成 Gameplay/Presentation Snapshot 的问题；现在只在面板可见时每帧取一次快照，隐藏时停止刷新。
- 修复性能门把显示调度写死为历史 18.33ms 的问题；新增同机空白 rAF 校准、绝对尾帧门、现有报告重评工具和三条回归测试，不通过重复跑场景或静默抬高固定阈值制造通过。
- 完成公开仓库清理、初始提交与 `main` 首次推送；本地大型验证证据未删除，也未进入 Git。

## 未解决问题

- 启动页、Vector Focus、V5R 角色/动作/武器和场景已完成本轮实现，但整体画面仍需用户真人视觉签核；自动截图不冒充最终审美确认。
- 稳定性终点采样脚本门未形式化闭合；按用户要求不再重复长测，保留首轮真实数据与这一限制。
- 用户尚未对 V5R 主角、敌人、动作和最终整体画面完成主观签核；旧 V4 数值通过不再视为当前主观视觉门。
- Tripo Rig 原始预设动作已拒绝；生产使用项目自制语义 Clip。握持附件解决了当前生成模型指骨权重尖刺，但下一轮若更换模型，仍应优先获得更干净的手部拓扑与蒙皮。

## 验证情况

- 2026-08-12 V5R 最终整合：12 个测试文件 / 45 项全部通过；生产构建通过；资产审计四项门全部通过（4 份已声明 GLB、无外链、无密钥模式、依赖许可证已知）；`git diff --check` 通过。最终真实 Chromium 流程 10 项全部通过：Title 默认静止、点击开战、满能、Space 进入/取消、两点路线、第三点执行、路线完成与 Profile 化反馈；浏览器错误 0。证据位于 `validation/final-v5r-integration/`。构建仅保留 Three.js 612.41KB（gzip 155.13KB）既有 Chunk 提示。
- 2026-08-12 V5R 角色小节：`npm run check` 通过；`validation/character-providers-v5r-weapon-grip-final/` 的 Procedural Idle、V5R Idle/Action/Recovery 四场景通过，浏览器错误 0。近景握法证据位于 `validation/character-v5r-weapon-diagnostic-12/`；Hero Ready 双脚落地和 Enemy Threat 证据位于 `validation/character-v5r-pose-final/`。
- 2026-08-12 V5R 场景小节：`transit-platform-v5r` 配置实际生效，`npm run check` 通过，浏览器错误 0；最终画面位于 `validation/environment-v5r-after-2/idle.png`。该项只验证受影响场景，不重复旧性能/浏览器长套件。
- 2026-08-11 启动页 / Vector Focus 收口：`npm test` 为 12 个文件 / 45 项全部通过；`npm run build` 通过，仅保留既有 Three.js 604.35KB Chunk 提示。专项真实 Chromium 流程 10 项全部通过：默认 Title、模拟静止、点击开战、满能 HUD、Space 进入/取消、指针添加两点、第三点执行、路线完成、Profile 化反馈；浏览器错误 0。截图与报告保存在 `/tmp/slash-start-vector-focus-final/`，未重复无关长稳、全浏览器矩阵或性能套件。
- Phase 2A 最终整体门：`npm test` 为 10 个文件 / 33 个测试通过；随后新增的性能校准门 1 个文件 / 3 个测试单独通过。最终 `npm run build` 与 `git diff --check` 通过，仅保留 Three.js 核心 Chunk 提示。
- Phase 2A 架构门：Gameplay/Content 反向依赖、64 模块循环依赖和 `main.ts` Bootstrap 三项通过；Architecture Review 回答 Enemy、Ability、Upgrade、Level、Hero GLB、Dash VFX 与 Projectile 的实际修改范围。
- Phase 2A 最终真实三关：生产构建先由 Enemy 接触致死并用真实 Canvas 点击重开，再用 35 次真实 Canvas 点击完成 Stage 1/2/3，最终 `game-complete`；8/12/18 敌人全清，浏览器问题 0，WebM 与截图已生成到本轮临时证据目录。
- Phase 2A 最终输入：100 次真实 Canvas 点击通过；逻辑 P95 1.1ms、可见 P95 16.5ms、状态保持干净、浏览器问题 0。
- Phase 2A 最终浏览器/生命周期：Chrome 1920×1080、2560×1440、1366×768、Firefox、WebKit、兼容模式和 390×844 触屏七项通过；Resize/DPR、可信全屏、冻结恢复、WebGL 丢失/恢复及恢复后 Gameplay 全部通过。
- Phase 2A 旧基线表现/资产：Procedural Idle、旧 GLTF Idle/Action/Recovery 与 VFX、Night/Day Environment、Content、Animation 五项 Lab 通过；当时两份 GLB 为 Provider Ready、0 Native Clip。该记录只保留迁移历史，不代表当前 V5R 资产状态。
- Phase 2A 最终性能：1080p 原始 59.95 FPS / P95 18.6ms / P99 18.7ms / Worst 50ms；同轮空白页 P95/P99 为 18.6/18.7ms，校准后全部门通过。1440p 为 59.95 FPS / P95 18.6ms / P99 18.7ms / Worst 48.3ms，全部门通过。
- Phase 2A Visual Regression：最新 Phase 1/V5 战场基线与本轮 Idle/Dash 截图在构图、材质、灯光、角色、环境和反馈上无技术性缺失；开场 Banner 差异来自采样时刻。该项只证明重构未明显破坏画面，不代表视觉合格或用户签核。
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
- Phase 2A 旧 GLB 资产门：主角 7,934 triangles / 52 bones；敌人 7,757 triangles / 49 bones；内置 AnimationClip 均为 0。当前生产已由上方 V5R 78/55 骨资产替代。
- Character Provider 浏览器门：Procedural Idle、GLTF Idle、GLTF Action、GLTF Recovery 四个真实 WebGL 场景通过，浏览器问题 0；游戏页 Idle / Post Dash 均保持 `playing`。`npm run check`、`npm run build`、三条 Tripo Python 语法检查和更新后的第一方二进制资产许可门通过。
- Phase 2A Visual Profile / Pool：3 个相关测试文件 / 7 个测试通过；覆盖六类 Pool、容量与复用、Profile 原值、可见帧命名、性能分类预算，以及 Debug Enemy 的 Definition / Behavior / Presentation 扩展。
- Presentation Labs 浏览器门：VFX、Night Environment、Day Inspection Environment、Content Sandbox、Animation 五项通过，浏览器问题 0；Content Lab 真实切换 Stage 2、Stationary Test Enemy、Test Ability 和两个 Debug Upgrade。
- Profile 化游戏冒烟：Idle / Post Dash 均为 `playing`，Dash 的 VFX / Audio / Post FX Profile 各触发一次；Environment 暴露 5 个世界模块与 760 雨粒，Impact Pool 为 8 个预热 / 0 miss，所有分类预算在门内。该采集帧时间受截图等待影响，仅作为运行冒烟，不作为性能结论。
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
- 旧 Tripo 输入/检查台记录：首批 6 张输入与旧 0 Native Clip GLB 曾进入独立 Lab；当前 V5R 四视图、Rig v2.5 与项目自制正式 Clip 已替代该生产路径。
- 发布收口：当前工作树 `npm run build` 通过；资产审计确认两份打包 GLB 均为已声明第一方资产，生产运行时无未声明二进制、无外链、无密钥模式，依赖许可证已知。仅保留 Three.js 核心 chunk 604.35KB 提示。

## 暂勿并行修改

- Phase 2A 实现已收口，当前没有持续编辑锁；在本分支合并/评审前，避免对 `src/game/`、`src/presentation/`、性能门和角色 Provider 做相互覆盖的平行重构。
- 不要删除现有程序化角色、三视图输入或本地验证证据；它们仍是视觉回退与迁移对照。

## 2026-08-12 / V5R 严格视觉重设计专项（自动门已完成，待用户签核）

- 刀刃与握法：Hero 刀长固定为身高 62%；`lengthDirection` 与 `cuttingEdgeDirection` 分离并正交。刀身使用暗刀脊/刀面与单一物理亮刃，正反镜头不会把刀脊误读为开刃；七状态近景均显示刀柄进入掌心、护手在手指前方。
- 手部：Tripo 右手坏权重由模块化闭握附件替代；Rig/模型检查另有开放手型，避免无武器压力姿势出现空手或尖刺。开放手型不改变武器锚点或 Gameplay。
- 模型与 Rig：四视图平均轮廓偏差 Hero 0.55%–0.74%、Enemy 0.43%–1.93%；局部 P95 Hero 1.90%–2.87%、Enemy 0.82%–5.00%，Raw 最大值仍保留。双方 14 个压力姿势已刷新，浏览器错误 0。
- 动画：Hero 12 / Enemy 11 个正式 Clip 已完成关键帧检查；接触动作动态 Bounds 门已校准，Dash/Chain 的有意离地不强制吸地。
- LOD：`distance-lod.ts` 只切换同一 SkinnedMesh 的 Index Buffer，不复制 Skeleton。Hero 主体 10,260 → 4,308 triangles（-58.0%），Enemy 9,751 → 3,897（-60.0%）；64px 近远轮廓无可见身份损失。
- 模块替换：非生产 `fixture-hero-v5r-replacement` 真实改写克隆模型几何，通过 Idle/Action/Hit/Death、武器挂载、浏览器清洁和无 Gameplay/Ability/Enemy/Level 导入检查。
- 场景：Transit/City 进一步后移降权；Arena 增加服务分区倒角、检修盖板和宽场洗光，独立 `arena-hit-surface` 不变。战场平均亮度 +8.7%，平台边缘密度 +9.6%，背景亮度基本不变。
- 最终综合门只执行一次：12 个测试文件 / 45 项通过；生产构建通过；资产、密钥和许可证审计通过；生产预览中 Title/开战/满能/Space/三点路线/三段大招 10 项通过，浏览器错误 0；`git diff --check` 通过。
- 当前证据统一位于本地 `validation/visual-redesign/`；可复用验证脚本、精简审计、正式模型与生产美术资产已纳入 Git，本地大体积截图按仓库规则不提交。实现提交 `1695906` 已推送至 `origin/codex/phase2a-foundation`；用户真人视觉签核未完成。
