# Ability System

## 结构

Ability 分成四层：

1. `AbilityDefinition`：ID、Slot、激活方式、Cooldown、Energy、Tags、Execution Profile；
2. `AbilityExecution`：确定性规则实现；
3. `AbilityRuntimeState`：每局 Cooldown、Charges 等运行状态；
4. `AbilityPresentationDefinition`：VFX、Audio 和 Camera/PostFX Profile。

当前 `dash-slash` 占用 `primary` Slot。`PlayerState.abilities` 已固定提供 `primary / secondary / special / ultimate`，因此加入新技能不需要给 PlayerState 增加一组技能专用字段。

## 激活流程

```text
Pointer / Controller
→ GameCommand.activate-ability
→ activateAbility(slot, target)
→ AbilityDefinition
→ AbilityExecution
→ GameState changes + GameEvent
→ Presentation Profiles
```

`activateAbility()` 负责共同门禁：Game Phase、玩家生命、Slot、Cooldown、激活类型和通用目标清洗。Ability Execution 只处理自己的规则。Recovery 期间的输入通过 `BufferedAbilityCommand` 保存 Slot 与目标，不再是 Dash 专用布尔标志。

当前激活类型只有 `target-point` 和 `instant`。后续加入方向、锁定目标、按住蓄力或组合输入时，需要扩展有类型的 `AbilityActivationType` 与 `GameCommand`，但不应改变已存在的 Execution Contract 或把浏览器事件传进 Gameplay。

## Dash Slash

`src/game/abilities/dash-slash.ts` 是当前正式 Execution。它负责：

- 将目标钳制到 Arena；
- 计算方向和持续时间；
- 应用受控 Modifier；
- 用 Segment/Circle 碰撞找出预期命中；
- 创建 Dash State；
- 发出包含完整表现事实的 `dash-started` 事件。

后续 Projectile、普通近战、范围攻击或召唤不得通过继续给这个文件增加模式分支实现。每类能力应有独立 Execution，并共享碰撞、目标选择、伤害结算等可复用 Gameplay Service。

## 新增 Ability

最小步骤：

1. 在 `src/content/abilities/definitions.ts` 注册 `AbilityDefinition`；
2. 在独立 Gameplay 文件实现 `AbilityExecution`，注册到 `abilityExecutions`；
3. 将 Ability ID 装配到一个 Slot；
4. 在 `abilityPresentationRegistry` 注册 VFX、Audio 和 Camera/PostFX；
5. 为成功、被拒、Cooldown、Buffer、事件顺序和 Replay 增加测试。

`src/debug/content/test-ability.ts` 的 `debug-target-blink` 已证明 Definition + Execution 可接入 Secondary Slot，且不改变 PlayerState 核心结构。它只用于架构验收，不是生产技能。

## Modifier 与 Upgrade Hook

`src/game/combat/modifiers.ts` 根据 `RunState.selectedUpgrades` 读取 Upgrade Definition，并只允许修改声明过的字段。当前 `before-dash` Hook 的白名单为：

- `distance`；
- `durationMs`；
- `recoveryMs`；
- `hitRadius`。

操作为 `add / multiply / clamp-min / clamp-max`，最终还会经过 Gameplay 安全范围钳制。这个设计避免任意脚本或字符串路径修改 HP、无敌状态等未授权字段。

新增机制型 Upgrade 时，先明确归属系统和 Hook 时机，例如 `before-projectile-spawn` 或 `after-enemy-killed`；定义输入、允许输出和叠加顺序，再实现 Registry。不要建立一个可以执行任意函数、访问整个 GameState 的万能 Modifier。

## 表现边界

Ability Execution 只发事实事件，不调用 VFX、Audio、Camera 或 PostFX。替换 Dash 的刀光、音效、冲击强度或镜头反馈，只改 `src/presentation/registry.ts` 和 `src/presentation/profiles/definitions.ts`，不改 `dash-slash.ts`。
