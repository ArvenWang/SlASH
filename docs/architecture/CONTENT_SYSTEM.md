# Content System

## 定义与运行状态分离

Content Definition 描述“这是什么”，Gameplay State 描述“这一局现在发生了什么”。Definition 是只读、稳定 ID、可版本管理的数据；State 是每局创建并持续变化的数据。模型、材质、声音、粒子和灯光不属于 Content Definition。

`src/content/registry.ts` 提供 `DefinitionRegistry<T>`：

- `register()` 拒绝重复 ID；
- `get()` 对未知 ID 立即报错；
- `has()` 支持可选扩展注册；
- `list()` 用于完整性审计和工具界面。

现有 Registry 分布如下：

| 内容 | Definition | Registry |
| --- | --- | --- |
| Enemy | `src/content/enemies/definitions.ts` | `enemyDefinitions` |
| Ability | `src/content/abilities/definitions.ts` | `abilityDefinitions` |
| Upgrade | `src/content/upgrades/definitions.ts` | `upgradeDefinitions` |
| Level | `src/content/levels/definitions.ts` | `levelDefinitions` |
| Projectile | `src/content/entities/definitions.ts` | `projectileDefinitions` |
| Obstacle | 同上 | `obstacleDefinitions` |
| Hazard | 同上 | `hazardDefinitions` |
| Full-game Encounter | `src/content/encounters/full-game-library.ts` | `fullGameEncounterDefinitions` |
| Event | `src/content/events/definitions.ts` | `eventDefinitions` |
| Run / Act | `src/content/runs/definitions.ts` | `runDefinitions` |

## ID 规则

ID 一旦进入存档、Replay、事件或发布内容就视为持久标识，不因显示名称或资产文件名变化而改名。推荐格式是小写 kebab-case，并在语义发生破坏性变化时增加版本，例如 `enemy-grunt-v1`、`dash-slash`、`stage-01-arrival`。

Gameplay Definition ID 与 Presentation ID 可以不同。`enemy-grunt-v1` 可以映射到程序角色，也可以映射到新的 GLB，而不改变关卡、存档或 Replay 中的敌人身份。

## 新增 Enemy

生产 Enemy 的最小闭环是：

1. 在 `src/content/enemies/definitions.ts` 新增 `EnemyDefinition`；
2. 若行为已存在，复用 `movementProfile`；否则在独立行为模块实现 `EnemyBehavior` 并注册到 `enemyBehaviors`；
3. 在 `enemyPresentationRegistry` 注册 Character、Animation、VFX、Audio 和 Death Profile；
4. 在 Level 的 `SpawnDefinition.enemyDefinitionId` 中使用它；
5. 增加行为、生成、事件和 Registry 完整性测试。

`src/debug/content/test-enemy.ts` 是真实范例：Stationary Test Enemy 只新增 Definition、Behavior 和 Presentation Registration，没有修改核心 Game Loop。

攻击 AI 不能长期塞进 `movementProfile`。当第一个非接触攻击敌人落地时，应把 `attackProfile` 对应到独立 Enemy Attack Strategy Registry，并由 Enemy Simulation 编排移动与攻击两个策略；这个扩展不需要改变现有 Direct Chase 算法。

## 新增 Ability 与 Upgrade

Ability 的 Definition、执行和表现是三个独立注册点，详见 [Ability System](ABILITY_SYSTEM.md)。Upgrade 通过受控 Hook 修改明确白名单字段；`src/debug/content/test-upgrades.ts` 已证明无需修改 Dash 实现即可改变 Recovery 与 Hit Radius。

如果新 Upgrade 需要目前不存在的机制，不要用任意对象路径或运行时字符串反射。应先定义一个有类型、可测试的 Hook Contract，再让对应系统调用它。

## 新增实体内容

Projectile、Obstacle、Hazard Definition 已包含碰撞、速度/寿命或 Tick Interval、标签和 Presentation ID。首个正式内容落地时还必须同时提供：

- 对应 Simulation System；
- 生成和销毁规则；
- Event 类型；
- Pool/Performance Budget；
- Presentation Registration；
- Replay 与固定步长测试。

只有 Definition 而没有运行生命周期，不能宣称该机制完成。

## 调试内容与生产内容

架构测试内容位于 `src/debug/content/`，只在测试、开发模式或 Content Sandbox 显式注册。它们不应被默认生产关卡引用，也不应作为“新增正式技能/敌人”的数量展示。

`validation/tools/content-lab.html` 可以真实加载 Level、替换 Enemy Definition、注册 Test Ability 并应用 Debug Upgrades。它验证的是扩展路径，不是用假按钮模拟结果。

## 完整性门

`assertPresentationRegistryIntegrity()` 会遍历当前 Enemy、Ability、Level 和 Environment，确认每个跨层 ID 都能解析。新增 Definition 后如果忘记 Presentation Registration，启动和测试会直接失败，而不是在游戏中静默缺模型或缺特效。

Full-game Encounter 另有三层门：`validateEncounterPressure()` 检查 Act / Category 预算，`validateEncounterSpawnSafety()` 检查预警、数量、碰撞和安全落点，Route Preview 则从最终 Definition 自动计算敌人、Armor、Projectile、Obstacle、Hazard 与 Pressure 数字。预览文案不保存第二份手工数量，避免策划数据与实际生成漂移。
