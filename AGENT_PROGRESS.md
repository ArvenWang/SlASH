Original prompt: 阅读“赛博朋克游戏设计分析”对话与最终 PRD，在 `/Users/nefish/Desktop/Coding/Slash` 实现以视觉表现为最高优先级的 3D Web 赛博武士直线突刺击杀 Visual Vertical Slice。

# Project Slash — Agent Progress

更新时间：2026-08-12

## Full Game Production 当前进展

- 用户已把目标从三关 Demo 升级为完整商业游戏：完整 Run / 关卡树、有限点数技能树、敌人、Projectile、Obstacle、Hazard、4 个 Boss、玩法细化、量化验收、真实实现和远端推送。
- 为避免覆盖正在进行的 3D 视觉工作，已从新架构提交 `32521fe` 建立独立工作树 `/Users/nefish/Desktop/Coding/Slash-full-game` 与分支 `codex/full-game-production`。原 `/Users/nefish/Desktop/Coding/Slash` 脏工作树未被修改。
- 已完成三份生产事实源：
  - `docs/FULL_GAME_DESIGN.md`：4 Act、约 24 个实际节点、10+4 Enemy、3 Projectile、4 Obstacle、2 Hazard、4 Boss、28 Skill、最大 12 SP；
  - `docs/FULL_GAME_ACCEPTANCE.md`：Hard Gate、量化功能 / 内容 / 性能 / Replay / Save / Browser / 人工体验门；
  - `docs/FULL_GAME_PRODUCTION_PLAN.md`：P0–P11 实施依赖、文件范围、测试与推送门。
- 已增加 `FULL_GAME_CONTENT_MANIFEST.json`、统一术语表和 `npm run verify:full-game-design`；机器门已确认 4 Act、28 Skill、10+4 Enemy、4 Boss、3/4/2 Entity、53 个 Encounter 目标和 12/28 点数上限一致。
- 技能经济已改为完整 Run：开局 2 点、每 Act 保证 2 点、Elite 最多补 2 点；保证 10、上限 12，只能购买 28 节点中的 42.86%。
- Charged Dash 正式规则锁定为：整条路线贯穿敌群；命中真实 Armor Coverage 就卸对应甲；命中裸露区就击杀；无甲背部可直接处决，后背有甲则先卸后甲。
- 当前已完成根战斗、28 个被动、弹体 / 障碍 / 危险区、事件 / 重接、安全存档、回放、14 类敌人、49 个非首领遭遇、4 个机制型首领、档案 / 设置与三类局内规则；53 / 53 遭遇均有真实生命周期。100 种种子 × 4 套构筑的完整回放矩阵已通过；性能、兼容性和真人体验门仍按计划推进。

## Full Game 已完成内容

- [x] 隔离 Gameplay Worktree / Branch。
- [x] 审计 Phase 2A Content、Level、Ability、Entity、Replay 与 Test 基线。
- [x] 完整 GDD、内容矩阵、技能树和 Boss 规格。
- [x] 可执行生产计划和量化验收标准。
- [x] 机器可读 Content Manifest、术语词典、Architecture Index 与设计一致性验证。
- [x] 独立工作树安装锁定依赖，0 个 npm audit 漏洞。
- [x] 基线 `npm test`：11 文件 / 36 项通过。
- [x] 基线 `npm run check`：通过。
- [x] 基线 `npm run build`：通过；仅保留既有 Three.js 604.35kB Chunk 警告。
- [x] `npm run verify:full-game-design`：通过，最大技能完成比例 0.428571。
- [x] 4 Act / 6 Layer Seeded Route Graph：100 个 Seed 均无断路；每局 52 个候选节点、实际访问 24 个节点。
- [x] Route Progress State：选路、逐层推进、跨 Act、最终 Victory、JSON Roundtrip 均通过。
- [x] Encounter Scheduler：Immediate / Timed / After Previous Killed / Triggered、预警、激活、清场与实体归属均通过。
- [x] P1 定向验证：3 个测试文件 / 11 项通过；TypeScript 检查通过。
- [x] Charged Dash 设计纠偏：0 SP Root 已明确为任意角度撞甲卸甲、撞裸露身体击杀、贯穿敌群；被动不再解锁基础破甲。
- [x] 重做 28 节点：Basic 12 / Charged 9 / Ultimate 6 / Shared 1；移除重复的 Mirror / Armor Phase，新增 Cross Purge、Double Echo、Projectile Reversal、Chain Breach 等清晰节点。
- [x] 新 Planning Board：路线威胁与完整树同屏；Draft / Committed 分离；确认时原子锁定路线和 Build；每张卡直接显示效果、触发、限制、前置。
- [x] Skill Economy 规则引擎：2 点开局、12 点封顶、存点、普通访问历史点锁定、Forge 2 点级联重接、10,000 次随机分配不超买 / 不破坏前置。
- [x] 首个正式两波 Encounter 与 Striker 已接入真实浏览器；稳定 Spawn ID 可在死亡重试后复现。
- [x] 当前全量验证：18 个测试文件 / 80 项通过；TypeScript、Production Build、设计清单和 whitespace 通过。
- [x] 浏览器 Planning 验收：28 / 28 完整文案、4 个 Module、2 个真实路线选项、2 点 Draft、进入 Combat 后 3 个第一波敌人、Console 0；390×844 无横向溢出，最小点击目标 44px。
- [x] Charged Hold / Release 已真实实现：0–180ms Tap 为 Basic；明确长按但未蓄满只取消；650ms 满蓄后松开执行 Breach Drive；Charging 原地、无无敌、可被击杀。
- [x] Armor Coverage 已真实实现：基于首次接触点计算前 / 侧 / 后角度；任意角度撞到现存甲片只卸该甲并贯穿，命中裸露区击杀；同一敌人每次 Charged 只结算一次。
- [x] Charged 9 个被动 Hook 已接入：Adaptive Aim、Quick Ignition、Overdrive、Breach Momentum、Chain Breach、Armor Shrapnel、Execution Tempo、Predator Drive、Backline Battery。
- [x] Vanguard 前甲、Armor Runtime、Stagger / 轻推、能量和独立甲片 Presentation Hook 已接入；敌人转向改为有上限，背袭不会被瞬时 180° 转身无效化。
- [x] Charged / Armor 自动化：13 项覆盖 Tap、Undercharge、蓄力受伤、前 / 侧 / 后 / 后甲、多敌人、后续 Basic、9 个 Charged 被动正负条件。
- [x] Charged / Armor 真实浏览器：真实鼠标长按进入 650ms 满蓄，正面只卸甲且玩家穿过目标、敌人存活、Energy +4；随后真实快速点击穿过暴露区击杀；Console 0。
- [x] Vector Focus 根能力：Energy 100 时 Space 进入 3 秒规划，世界速率 0.12；依次选择 3 点后才扣能量并执行 3 段真实 Dash；Escape / 右键取消不扣能量，大招击杀不自充能。
- [x] Ultimate 被动已接入 5 / 6：Additional Slash、Tactical Window、Vector Echo、Cross Cascade、Residual Charge；Projectile Return 随 P4 Projectile 生命周期完成。
- [x] Vector Focus 自动化：8 项覆盖 Energy、取消、超时、0.12 世界速率、3 / 4 点、顺序无敌执行、自充能限制、Cross、Echo 与 Residual；真实 Space / Canvas / Escape 浏览器流程通过，Console 0。
- [x] P4 Entity Domain：3 Projectile、4 Obstacle、2 Hazard 全部进入正式 Registry 与生命周期；同屏上限固定为 32 / 8 / 8，越界生成明确拒绝。
- [x] Projectile：固定步移动、Swept Player Hit、Dash 切弹、Arena / Lifetime 销毁、B-11 最多 8 发 1.25× 回返、U-05 每段回返且不自充能。
- [x] Obstacle：Static / 900ms Deploy + 7s / Moving Gate；Basic、Charged、Ultimate 都按最早碰撞截断并击退，B-04 依据碰撞法线保留剩余距离折射一次。
- [x] Hazard：Mine 1s 武装 + 550ms 爆炸，Arc Rail 1.4s Telegraph + 0.6s Active；Dash Transit 安全，非 Dash 接触致命，到期从 State / Snapshot / Presentation 移除。
- [x] Entity Presentation / Lab：正式 Presentation Registry、Projectile/Obstacle/Hazard Budget、简单可读的实体外观，以及 Content Lab 的真实 Spawn 控件均已接入。
- [x] P4 自动化：全量 19 文件 / 100 项通过；60/144Hz Entity Hash、JSON Roundtrip、Content Lab、真实两次 Canvas 点击切弹回返与折射、Console 0。
- [x] 28 Skill Gameplay Hook 已全部接入：Basic 12 / Charged 9 / Ultimate 6 / Shared 1；31 个声明 Hook 均有实际 Owner 与定向验证路由，不存在只改 UI 的技能节点。
- [x] Curve Dash 使用不增加主动按钮的快速拖拽手势：按下点为终点、拖动位置为曲率控制，≤180ms 释放执行 Basic 曲线；继续按住仍进入 Charged，曲率硬上限 65°。
- [x] 真实路径统一：直线、Curve 与 Refraction 都写入同一 Path Segment；Cross、Echo、Double Echo、Stored Path、Ultimate Cross 都读取实际完成路径。
- [x] Cross 可用性纠偏：连续直线在无普通移动游戏中无法产生内部交点，因此新增“反向重叠旧线至少 1.5m”作为有效交叉；共享起点不触发，非交叉新线仍替换唯一旧线。
- [x] Gravity 重新定义为致死走廊之外额外 30% 的 Near-Miss 牵引带，0.35s 最多拉 0.6m，为 Echo 创造二次命中，不再出现“已经命中的敌人又被拉”的自相矛盾。
- [x] Basic / Shared 自动化：Wide、Rapid、Curve、Gravity、Prism、Cross / Purge、Echo / Double、Impact Burst、Kill Momentum 共 10 项场景；全量现为 20 文件 / 111 项通过。
- [x] Basic 真实浏览器：真实拖拽产生 10 段 Curve Stored Path；非交叉直线替换旧线；真实反向点击触发 Cross，击杀偏离刀线目标、清除 Projectile、仅打断装甲敌人且不卸甲；Console 0。
- [x] Event 生命周期：4 个确定性事件、每个严格 2 个明确选择；Next Combat Energy、Intel、Reroute Token 均进入真实 Run Resource，选择只结算一次并经 Reward 返回路线。
- [x] Forge 生命周期：默认可级联移动 2 个历史技能点；Reroute Token 由玩家明确消耗后只给本次 +1 Move；确认前为草案，确认后总 SP 不变且前置关系保持合法。
- [x] Planning Intel：按资源等级额外显示当前选项之后 1–3 层的确定节点类型、标题与奖励，不把未知内容写成占位卡。
- [x] 非战斗节点自动化：100 个 Seed 的全部安全层选项均可进入；全量 21 文件 / 115 项通过，TypeScript、Build、Design Manifest、whitespace 通过。
- [x] 非战斗节点真实浏览器：Event 两项完整描述与即时资源变化、Forge 28/28 技能描述、2 点级联上限、Token 扩容、3 点重接及 Reward 继续均通过；390×844 无横向溢出、最小目标 44px、Console 0。
- [x] Safe Run Save v1：只接受 Title / Planning / Event / Forge / Reward / Victory；清除瞬时战斗实体，保留 Seed、完整 Route Graph、当前节点、Skill Draft / Commit、Run Resource、事件历史与安全阶段。
- [x] Save Version / Corruption Gate：Schema、Content、Checksum 与 State Invariant 分层验证；未知版本、损坏 JSON、非法技能或路线显式报错，原始 localStorage 不会被静默清空。
- [x] Continue 产品流程：Title 显示 Act / Layer / Skill / Seed 摘要；真实重载后恢复路线预选和技能草案；Combat 不覆盖最后的安全存档，战斗中重载回到确认前 Planning。
- [x] Replay v2：区分 legacy-stage / full-game，记录 Route、Allocation、Event、Forge、Charged Hold / Release、Ultimate Planning；不支持版本或模式直接拒绝，不做近似播放。
- [x] Save / Replay 自动化：1,000 次安全状态 Roundtrip；真实 Event / Forge Save；完整 Campaign 路径分别重放 Event、Forge、Charged 与 Ultimate 并最终 Hash Match。全量现为 23 文件 / 124 项。
- [x] Save / Continue 真实浏览器：无存档不显示 Continue；写入、整页重载、继续、战斗不覆盖、再次重载回安全节点、损坏存档报错并保留原文均通过；Console 0。
- [x] 10 Standard + 4 Elite Enemy 全部进入生产 Registry；每类都绑定真实 Movement、Attack Profile、Energy、Armor、Presentation 与 Content Lab，不以 Manifest 名单冒充实现。
- [x] Enemy Attack State Machine：Cooldown → Telegraph → Active → Recovery 固定 Tick；锁定目标 / 方向、可中断 Stagger、稳定 Attack Sequence 与 Snapshot / Event 均已接入。
- [x] Standard 行为：Striker 前摇突刺；Gunner 中距单发；Lancer 650ms 以上冲锋；Constructor 900ms 激活 Barrier；Mine Layer 放置 1s 武装雷；Sniper 900ms 以上高速弹；Vanguard 前甲；Bastion 三甲；Blink 预测落点闪现突刺；Conductor 下一次前摇 -20% 且不突破硬下限。
- [x] Elite 行为：Redline Lancer 两段分别锁定；Twin Gunner 三发 18° 扇射；Architect 维持两墙并移动旧墙；Fortress 前 / 左 / 右 / 后四块独立甲，不增加 HP。
- [x] 敌人公平门：Lancer / Blink 同时 Telegraph / Active 上限 3；Projectile / Obstacle / Hazard 继续受 32 / 8 / 8 全局上限；所有受 Conductor 影响后的 Telegraph 仍不低于硬下限。
- [x] 基础可读表现：Telegraph 同时使用地面环与锁定线，Active 改变轮廓强度；角色朝向现与 Gameplay Facing 一致，Armor 可视方向不再与碰撞方向漂移。
- [x] Enemy 自动化：14 类逐项验证 Telegraph / Active / Recovery 与真实产物；双段、扇射、移动双墙、四甲、并发压力、移动确定性均有专项测试。全量现为 24 文件 / 147 项。
- [x] P6 Encounter Content：Act I 6/2/2、Act II 7/3/2、Act III 7/3/2、Act IV 8/4/3，共 28 Standard / 12 Elite / 9 Challenge；每个模板具备独立标题、说明、波次、敌人组合和环境机制。
- [x] Pressure / Spawn Safety：49 / 49 模板在各 Act 预算内；432 个 Authoring Spawn 和 10,000 个动态玩家位置样本违规 0，Wave 激活时会按真实玩家、Obstacle、Hazard 与敌人位置确定性重定位。
- [x] 精确 Threat Preview：敌人数、Wave、Armor、Projectile、Obstacle、Hazard 与 Pressure 全部从实际 Definition 计算；100 Seed 覆盖 49 / 49，任一选择层重复 Encounter 卡为 0。
- [x] Challenge 生命周期：Clean Line、Projectile Cuts、Charged Multi-Break、No Ultimate 四类规则进入运行状态、HUD、Reward 与确定资源；失败不挡正常过关，成功发放 Reroute / 25 Energy / Intel。
- [x] P6 真实浏览器：Challenge Planning / HUD / Reward / 390×844 全通过；4 Act × 3 条不同路线均由真实 Canvas 点击 / 长按完成，装甲路线确实先蓄力卸甲再处决，Console 0。
- [x] P7 通用 Boss Runtime：稳定 Definition、显式 Phase / Objective / Telegraph / Active / Recovery / Core Window、Break / Victory Event、Snapshot、Restart 与 Replay 均接入正式 Campaign。
- [x] Rail Hound：800ms 锁定冲锋；第一次后升级为二段冲锋；终点保留双侧可达空间，1.5s 侧核窗口，3 次 Core Break 结束。
- [x] Siege Choir：中央三块独立 Coverage、两座可击杀炮台和周期 Barrier；Charged 卸任意 2 块甲后开放 1.5s 背核，完成 2 轮。
- [x] Mirror Regent：1 个真实体 + 3 镜像，真实体具有不同尺寸 / 节拍；记录实际 Dash Segments，800ms Telegraph 后回放致命 Mirror Slash，真实体命中 3 次结束。
- [x] Last Conductor：Barrage、Rail Grid、Armor Shell、Vector Finale 四阶段严格顺序；Finale 强制 Energy 100，只有按序通过 3 个可见节点的 Vector Focus 才结束。
- [x] Boss Practice：Title 可直接进入 4 个零技能练习，完成后可返回 Title；自动门 4 Boss × 100 次，共 400 次，死亡 / 死锁 0；Boss 失败重开后的 Replay 最终 Hash Match。
- [x] P7 真实浏览器：4 / 4 Boss 使用真实 Canvas 点击、长按松开和 Space 三点选取完成；Boss HUD、锁定线、背核、Mirror Path、Rail / Finale 节点均可见；390×844 无横向溢出，Console 0。
- [x] P7 全量自动化：27 个测试文件 / 168 项通过；TypeScript、Production Build、53 项 Design Manifest、49 Encounter 报告、400 次 Boss 报告与 whitespace 全通过；构建仅保留已知 Three core 605.52kB 警告。
- [x] P8 Run Protocol：Standard 死亡结束本局；Assist 每区 1 次重启、敌人前摇 +25%、敌弹速度 -15%、不进入标准纪录；Threat 1–5 依次改变精英路线、危险区寿命、4 个 Boss 公开变式、有效情报和开场 Arc Rail。
- [x] P8 Profile：独立 Profile v1、Checksum、损坏原文保留、玩家确认后备份重建；记录敌人 / 首领发现、练习解锁、通关、死亡来源、技能和路线选择，不含永久战斗数值。
- [x] P8 Dossier / Practice / Settings：14 类敌人和 4 个首领条目、见过后解锁首领练习、Audio / Quality / Reduced Motion / High Contrast 持久化；新页面已按用户要求改为中文为主并压缩文案。
- [x] P8 Save / Replay：Run Save 升级为 v2 并校验 Protocol / Reboot；Replay 升级为 v3 并记录 Title Protocol 命令；1,000 次混合协议 Safe Save Roundtrip 与 Protocol Replay Hash 通过。
- [x] P8 当前自动化：28 个测试文件 / 176 项通过；TypeScript、Build 通过；Profile / Protocol 浏览器门覆盖 Assist 重启、档案、设置、损坏恢复、44px 与 390×844，Console 0。
- [x] P9 第一批产品流程：Esc Pause / Resume / Abandon、当前构筑与操作说明、触控 Ultimate / Cancel 52px 按钮、Defeat / Victory 本局击杀 / 卸甲 / 切弹 / Boss Break 统计；390×844 真实页面、最小 44px 与 Console 0 通过。
- [x] P9 收口：4 区 52 个候选节点路线图、稳定死亡来源、中文主界面、弹体方向标、实体轮廓、危险区地面标记、护甲片与首领弱点形状提示；灰度实体截图与非颜色结构门通过。
- [x] P10 完整局基线：标准规则从标题进入，完成 4 区 / 24 节点 / 4 首领，最终回放 Hash 一致；100 种种子 × 4 套代表构筑共 400 局全部完成并一致。
- [x] P10 浏览器与性能：Chrome 三分辨率、Firefox、WebKit、兼容模式、390×844 触控共 7 / 7 通过；Resize / 全屏 / 冻结恢复 / WebGL 恢复通过；1080p 与 1440p 60 秒压力场景均通过；5 分钟 retained heap 仅增长 320,792 bytes，Geometry / Texture 数量稳定。
- [x] P11 视觉整合：稳定视觉提交 `b5229ec` 已在临时分支合并为 `d60d02b`；玩法 / Content / Replay 文件保持玩法分支版本，V5R 角色、语义骨架动画、武器、角色 LOD、尸体分离和场景视觉配置已进入正式运行时。
- [x] P11 合并后回归：30 文件 / 178 项通过；固定 Seed 911 的完整局为 24 节点 / 4 首领 / 回放一致；7 / 7 浏览器、生命周期、100 次输入、角色 Provider 与资产许可通过；1080p 60 秒为 59.82 FPS、P95 17.1ms、P99 18.3ms、Worst 66.8ms，1440p 为 59.80 FPS、P95 17.8ms、P99 18.5ms、Worst 83.3ms，均满足 Full Game 门。
- [x] Git 交付：`codex/full-game-production` 已推送到 `origin`；首次同步核对本地与远端均为 `1cf2678`，最终进展提交后再次执行 SHA 核对。

## Full Game 下一步计划

1. 真人体验门、30 分钟可见完整局和灰度辨识由真实测试者执行，不冒充自动完成。
2. 根据真人测试结果继续做平衡与可读性调整。

## Full Game 当前问题与边界

- 视觉分支已按稳定提交合并；冲突中保留了完整玩法规则，并将 V5R 表现层接到 14 类敌人的统一 Presentation 映射。
- 53 / 53 遭遇已接入；完整标准局和 400 局回放矩阵已完成。P95 真人时长和每首领 3 次真人门仍需真实测试者。
- Run Save v2 与 Profile v1 已覆盖 Protocol、Assist、设置和统计边界；仍需在最终完整 Run 矩阵中再次验证跨 Act Reboot 与首次标准通关解锁 Threat 的端到端流程。
- 回放 v3 已通过 100 种种子 × 4 套构筑完整局矩阵，最终 Hash 一致率 100%。
- 现有 `game.ts` 仍承担较多编排；新增系统必须进入独立模块，不能继续形成 God Object。
- Route Graph 第一版曾因错误旋转目标映射造成部分 Seed 节点不可达；已改成旋转源投影，并用 100 Seed 回归锁住该问题。
- Planning Board 第一版因高内容面板仍采用垂直居中，导致顶部路线卡被推到视口外；真实浏览器已发现并改为顶部展开，普通点击回归通过。
- Forge 第一版复用了超高技能树却遗漏顶部对齐，导致上半部节点位于负坐标；真实浏览器点击门捕获后已修复，并加入桌面与移动端回归。
- `develop-web-game` 通用 Client 的 selector click 在其虚拟时间 shim 下仍会等待稳定性超时；同一页面已用普通 Playwright 点击（无 force）完整通过，因此记录为验证工具兼容问题，不冒充产品输入失败。
- 人工体验门最终需要真实测试者；自动化不能代替，但在到达该阶段前仍可继续完成所有代码和自动门。

## Full Game 暂勿并行修改

- 推送前不应再并行修改 `codex/full-game-production`。

---

## Phase 2A 历史基线（保留供接力）

更新时间：2026-08-11

## 当前进展

- Phase 2A 已在 `codex/phase2a-foundation` 分支完成实现与整体技术验收。本阶段建立可扩展 Gameplay 与视觉生产架构，不把当前画面描述为视觉合格，也未合入 Vector Focus、镜头或关卡改动。
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
  - 1920×1080：59.95 FPS，P95 18.6ms，P99 18.7ms，最慢 50.0ms；同轮空白 rAF P95 18.6ms，游戏相对基线增加 0ms，校准门与绝对 P99/Worst 门通过。
  - 2560×1440：59.95 FPS，P95 18.6ms，P99 18.7ms，最慢 48.3ms；通过。
- 当前系统 Chrome 的空白可见 rAF P95 从历史 18.1ms 漂移为 18.6ms，旧 18.33ms 门连空白页也会失败。验证工具现显式绑定同机同分辨率空白基线，限制游戏 P95 最多增加 0.5ms，并继续保留 P95 <25ms、P99 与 Worst 绝对门；原始失败报告与校准报告均保留，未平滑或删改数据。
- 敌人接触阴影改为单个 Instanced soft layer，避免 20 个分节角色重复进入方向光阴影 pass；Stage 3 绘制调用约从 882 降至 519，保持贴地感。
- 系统 Chrome 1920×1080 / 2560×1440 / 1366×768、高画质/兼容模式、Firefox、WebKit、390×844 触屏全部通过真实输入，控制台零错误。
- Resize / DPR、可信键盘全屏、Chrome renderer freeze/resume、WebGL Context Loss/Restore 和恢复后 Gameplay 均通过。
- `validation/licenses/asset-audit.txt` 已通过：生产包无第三方二进制美术/音频、无运行时外链、无密钥模式；依赖许可证为 MIT / Apache-2.0。

## 下一步计划

1. 由用户确定下一轮整体视觉方向；优先在 Animation / VFX / Environment Lab 中迭代 Profile、Provider 与动作，再回到战场上下文验收。
2. 玩法扩展按真实垂直切片推进：建议先选一个新 Enemy + Attack Strategy、一个新 Ability/Projectile、一个非 Immediate Encounter，逐个证明现有边界，而不是同时堆大量空系统。
3. 发布前补真人视觉签核、真人音频试听，以及实体 Edge / Safari 门；当前内核级自动化不能替代这些人工门。

## 遇到的问题

- 第一轮稳定性脚本实际等待约 10 分钟，但最后一笔样本停在 570.34 秒，导致 `duration` 单项失败；游戏数据本身为堆 +0.36MB、几何体恒 93、纹理恒 23、浏览器零错误。脚本已修复，但用户明确要求不再重复长测，第二轮已主动中止。
- Three.js 核心 chunk 约 604.35KB（gzip 152.69KB），生产构建有 `>500KB` 提示；总压缩体积远低于 50MB 加载门，GLTF Provider 已按需拆分，但该提示仍需持续记录。
- Phase 2A 首轮 1080p 原始 P95 为 18.6ms，旧 18.33ms 固定门失败；同轮空白页也为 18.6ms，确认是当前显示/Chrome 调度基线变化而非游戏新增延迟。原始失败证据没有删除，最终使用同机基线校准闭合。
- 当前有真实系统 Chrome、Firefox 和 Playwright WebKit 证据；本机未安装 Edge，WebKit 证据也不能冒充“真人 Safari 点击验收”。这两项需在发布前补实体浏览器或由用户明确接受现有内核级覆盖。
- WebM 录像不录制 Web Audio；音频已有可播放 WAV 与数值报告，但最终混音仍需真人试听。
- 用户提供的 Tripo API Key 经官方余额接口确认 API 余额为 0；首次生成在创建任务前即被余额不足拒绝，消耗 0 分。Chrome 与备用浏览器的 Tripo Studio 均未登录，无法访问用户所说的约 600 网页积分。密钥未写入仓库、日志或进度文档。

## 已解决问题

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

- 稳定性终点采样脚本门未形式化闭合；按用户要求不再重复长测，保留首轮真实数据与这一限制。
- 用户尚未对 V5 主角、敌人、动作和最终整体画面完成主观签核；旧 V4 数值通过不再视为当前主观视觉门。
- 两份 Tripo Rigged GLB 已接入 Provider，但原文件都没有 AnimationClip，且尚未获得视觉签核；当前自制骨骼驱动和程序角色回退不是最终美术完成证明。

## 验证情况

- Phase 2A 最终整体门：`npm test` 为 10 个文件 / 33 个测试通过；随后新增的性能校准门 1 个文件 / 3 个测试单独通过。最终 `npm run build` 与 `git diff --check` 通过，仅保留 Three.js 核心 Chunk 提示。
- Phase 2A 架构门：Gameplay/Content 反向依赖、64 模块循环依赖和 `main.ts` Bootstrap 三项通过；Architecture Review 回答 Enemy、Ability、Upgrade、Level、Hero GLB、Dash VFX 与 Projectile 的实际修改范围。
- Phase 2A 最终真实三关：生产构建先由 Enemy 接触致死并用真实 Canvas 点击重开，再用 35 次真实 Canvas 点击完成 Stage 1/2/3，最终 `game-complete`；8/12/18 敌人全清，浏览器问题 0，WebM 与截图已生成到本轮临时证据目录。
- Phase 2A 最终输入：100 次真实 Canvas 点击通过；逻辑 P95 1.1ms、可见 P95 16.5ms、状态保持干净、浏览器问题 0。
- Phase 2A 最终浏览器/生命周期：Chrome 1920×1080、2560×1440、1366×768、Firefox、WebKit、兼容模式和 390×844 触屏七项通过；Resize/DPR、可信全屏、冻结恢复、WebGL 丢失/恢复及恢复后 Gameplay 全部通过。
- Phase 2A 最终表现/资产：Procedural Idle、GLTF Idle/Action/Recovery 与 VFX、Night/Day Environment、Content、Animation 五项 Lab 通过；两份 GLB 为 Provider Ready、0 Native Clip；资产许可、无外链和无密钥门通过。
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
- 两份生产 GLB 资产门：主角 7,934 triangles / 1 material / 3×2048 texture / 52 bones / 3.3m；敌人 7,757 triangles / 1 material / 3×2048 texture / 49 bones / 3.157m；均落地、+Z、无外链，内置 AnimationClip 均为 0。
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
- Tripo 输入/检查台：6 张角色输入均已核对；两份真实 Rigged GLB 已进入 Provider 与独立 Lab，资产门如实报告 Native Clip 为 0，不把骨骼或自制驱动冒充原生动画。
- 发布收口：当前工作树 `npm run build` 通过；资产审计确认两份打包 GLB 均为已声明第一方资产，生产运行时无未声明二进制、无外链、无密钥模式，依赖许可证已知。仅保留 Three.js 核心 chunk 604.35KB 提示。

## 暂勿并行修改

- Phase 2A 实现已收口，当前没有持续编辑锁；在本分支合并/评审前，避免对 `src/game/`、`src/presentation/`、性能门和角色 Provider 做相互覆盖的平行重构。
- 不要删除现有程序化角色、三视图输入或本地验证证据；它们仍是视觉回退与迁移对照。
