# Presentation Boundary

## 原则

Presentation 负责“已经发生的 Gameplay 事实如何被看见和听见”，不负责决定事实是否发生。它可以读取 `GameState` 来摆放角色和 HUD，可以消费 `GameEvent` 触发瞬时反馈，但不得改写击杀、生命、碰撞、Cooldown、过关或 Root Motion。

边界两侧如下：

| Gameplay 输出 | Presentation 处理 |
| --- | --- |
| `player.position / facing` | 角色 Root Transform、镜头锚点 |
| `EnemyState` | Enemy Character Provider、动画输入 |
| `dash-started` | Dash VFX、Audio、Camera/PostFX Profile |
| `enemy-killed` | 接触火花、血液、切割、尸体、音效 |
| `player-died` | Death Animation、音效和 PostFX |
| `stage-cleared` | HUD/Banner 与生命周期请求 |

事件必须自包含位置、方向、来源和 Ability ID。Presentation 不从“事件发生后的敌人数组”重建命中事实。

## Registry 与 Profile

`src/presentation/registry.ts` 负责跨层映射：

- Gameplay Enemy ID → Character / Animation / VFX / Audio / Death；
- Gameplay Ability ID → VFX / Audio / Camera/PostFX；
- Level Environment ID → Environment / Lighting / PostFX；
- Character Presentation ID → Provider / Animation Set / Weapon Mount。

`src/presentation/profiles/definitions.ts` 保存具体视觉和声音配置。当前包含：

- Material Tokens 与 Material Profiles；
- VFX Profile、优先级、时长、Pool Size 和 Quality 行为；
- Audio Profile；
- Night Production 与 Day Inspection Lighting；
- Environment 模块、雨雾、背景；
- PostFX Base 与 Impact Profile。

Profile ID 是可替换配置，`runtimeId` 指向真正执行效果的 Runtime。只改数值、资产或视觉组合时，不应改 Gameplay Event。

## Runtime 装配

`src/runtime/presentation-runtime.ts` 创建角色实例、同步状态、消费事件和管理表现生命周期。`src/runtime/renderer-runtime.ts` 解析 Environment/Lighting/PostFX Profile 并创建 Three.js、VFX、Audio 和 Diagnostics Runtime。`src/application.ts` 只把 Game、Input、Debug、Renderer 和 Presentation 连接起来。

当前 `presentation-runtime.ts` 仍包含现有角色、尸体和 HUD 的集成逻辑，但内容定义和视觉参数已经移出。加入第一个完全不同的敌人死亡家族或 HUD 模式时，应按真实需求抽出独立 Presenter，而不是继续扩大条件分支。

## 视觉迭代方式

当前视觉未通过用户验收。后续迭代按变更性质选择入口：

- 调材质语言：`materials/tokens.ts` 与 Material Profile；
- 调灯光、曝光、雾、雨：Lighting/Environment Profile；
- 重做 Dash、Hit、Kill：VFX/Audio/PostFX Profile 和对应 Runtime；
- 换角色：Character Provider 与 Character Presentation；
- 重做动作：Animation Set、Clip 或 Additive Driver；
- 新环境构图：新增 Environment Module 和 Environment Profile。

开发时先在独立 Lab 迭代，再进入战场上下文：

- Animation Lab：`validation/tools/character-lab.html`；
- VFX Lab：`validation/tools/vfx-lab.html`；
- Environment Lab：`validation/tools/environment-lab.html`；
- Content Sandbox：`validation/tools/content-lab.html`。

Lab 调用真实 Provider、Profile 和 Runtime，不维护另一套假实现。

## Quality 与降级

Profile 明确声明 `high` 和 `compatibility` 行为。关键战斗反馈在兼容模式仍需完整；环境和较重后处理可以 `reduced`。任何降级都不能隐藏命中、敌我区分、死亡或可交互目标。

## 完整性与释放

`assertPresentationRegistryIntegrity()` 在启动和测试时检查所有引用。Character Runtime、Mixer、材质、纹理、VFX Pool、Audio 与 PostFX 必须提供 `dispose()`，关卡重建和工具切换必须释放实例所有权。共享模板资产由 Provider 持有，实例材质和 Mixer 由实例持有。

Gameplay/Content 的反向导入和循环依赖由 `tests/architecture-boundaries.test.ts` 阻止。
