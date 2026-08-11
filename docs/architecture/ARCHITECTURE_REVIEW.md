# Phase 2A Architecture Review

## 结论

Phase 2A 架构在本阶段定义的扩展基础范围内通过。Gameplay/Content 与 Presentation 的单向边界成立；Enemy、Ability、Upgrade、Level、Character 和视觉 Profile 均有真实扩展路径；Replay、Seed、GLB、Animation、Pool 和性能观察面已经落地。

这个结论不等于视觉通过，也不等于未来所有玩法已经实现。当前视觉仍未签核；Encounter Scheduler、Projectile 生命周期、远程 Enemy Attack Strategy 等必须在首次真实需求到来时按现有边界继续实现，不能把 Definition 空入口冒充完整机制。

## Critic 检查

| 问题 | 结论 | 证据或限制 |
| --- | --- | --- |
| 是否过度设计 | 通过 | 只实现现有 Dash/Direct Chase 和确定会用到的稳定边界；未制造假 Projectile、假关卡行为 |
| 是否减少未来修改成本 | 通过 | Test Enemy、Test Ability、Debug Upgrades、三关和视觉 Profile 均通过注册扩展 |
| 是否有双重架构 | 可控 | `StageDefinition` 只作为旧工具兼容视图；权威内容只有 Level/Encounter/Spawn，新功能禁止扩展旧结构 |
| 是否有 God Object | Phase 2A 范围通过，有受控债务 | `game.ts` 仍是兼容 Facade/编排文件，程序化 Environment/VFX Runtime 仍大；内容与 Profile 已移出，后续按首个真实新系统拆分，不提前造空框架 |
| 是否有循环依赖 | 通过 | 64 个本地 TypeScript 模块扫描为 0 Cycle；`tests/architecture-boundaries.test.ts` 持续守门 |
| Presentation 是否泄漏进 Gameplay | 通过 | `src/game/` 与 `src/content/` 无 Three.js/Presentation/Runtime/Scene/Characters 导入；自动测试守门 |
| Test Ability / Enemy 是否低成本接入 | 通过 | `src/debug/content/` 只注册 Definition、Execution/Behavior、Presentation；Core Game Loop 未修改 |

## 必答扩展问题

### 新增一种 Enemy，需要改哪些文件？

- Enemy Definition；
- 新行为不存在时新增 Behavior 并注册；
- Enemy Presentation Registration；
- 引用它的 Spawn Definition；
- 对应行为/事件/完整性测试。

不改 Dash、PlayerState 核心结构或 Renderer 主循环。未来非接触攻击需要新增独立 Attack Strategy 编排，这是新系统实现，不是把分支塞进 Direct Chase。

### 新增一种 Ability，需要改哪些文件？

- Ability Definition；
- 独立 Ability Execution；
- Slot 装配；
- Ability Presentation Registration；
- Command、事件和 Replay 测试。

不改现有 Dash Execution，也不为每个技能向 PlayerState 增加专用字段。

### 新增一个 Upgrade，需要改哪些文件？

若使用现有 `before-dash` 白名单，只新增 Upgrade Definition 并注册。若是新机制，先在归属系统增加一个有类型、受控输入输出的 Hook，再新增 Definition 和测试；不允许任意函数直接修改整个 GameState。

### 新增一个 Level，需要改哪些文件？

- Level/Encounter/Wave/Spawn Definition；
- 需要新视觉时新增 Environment/Lighting Profile 或 Module；
- 内容完整性与完整通过测试。

非 Immediate Wave 首次落地时还需实现 Encounter Scheduler。核心 Dash、角色 Provider 和现有关卡 Definition 不需要改。

### 替换 Hero GLB，需要改 Gameplay 吗？

不需要。新增/更新 Character Provider 与 Character Presentation 映射，保留 Runtime Contract、+Z、地面对齐、武器挂点和 Animation Set 即可。Gameplay Position 和碰撞仍是唯一 Root Motion。

### 替换 Dash VFX，需要改 Gameplay 吗？

不需要。替换 VFX/Audio/Camera/PostFX Profile 或其 Runtime；`dash-started` 事件协议不变。

### 添加 Projectile 后，需要改现有 Dash 吗？

不需要。Projectile 使用自己的 Definition、State、Simulation、碰撞、Event、Pool 和 Presentation；可复用公共碰撞工具。固定步长编排需要调用新 Simulation System，但 `executeDashSlash()` 不增加 Projectile 分支。

## 已证明的扩展切片

- Stationary Test Enemy：Definition + Behavior + Presentation；
- Target Blink Test Ability：Definition + Execution，使用 Secondary Slot；
- Recovery/Hit Radius Debug Upgrades：Modifier/Hook，不改 Dash；
- 三关：Level + Encounter + Spawn，原指纹不变；
- Procedural/GLTF Character：同一 Runtime Contract；
- Dash/Kill/Death：Gameplay Event → Profiled VFX/Audio/PostFX；
- Night/Day Inspection：同一 Environment Runtime，不创建假 Gameplay Level。

## 后续守则

- 新机制先找归属 Domain，再定义数据、运行状态、命令/事件和测试；
- 新视觉先做 Profile/Provider/Lab，再进入战场；
- 不把 Presentation 回调放入 Gameplay Definition；
- 不把大量类型都塞进一个万能 Registry 或 Event Bus；
- 不为“可能有一天”实现完整系统，只在第一个真实垂直切片中扩展稳定边界；
- `AGENT_PROGRESS.md` 持续记录已实现、未实现、验证与视觉签核状态。
