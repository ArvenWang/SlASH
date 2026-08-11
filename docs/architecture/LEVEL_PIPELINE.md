# Level Pipeline

## 权威数据结构

关卡内容位于 `src/content/levels/definitions.ts`，由三层组成：

```text
LevelDefinition
└── EncounterDefinition[]
    └── EncounterWave[]
        └── SpawnDefinition[]
```

`LevelDefinition` 负责 Level ID、名称、索引、Arena、Player Spawn、Encounter、静态对象 ID、Gameplay Surface ID、Environment 和 Lighting。`EncounterDefinition` 负责 Wave、完成规则和当前兼容用敌人速度。`SpawnDefinition` 负责稳定 Spawn ID、Enemy Definition、位置、延迟、朝向和可选 Spawn Presentation。

## 当前三关基线

| Level | Enemy Count | Move Speed | Activation |
| --- | ---: | ---: | --- |
| `stage-01-arrival` | 8 | 2.75 | Immediate |
| `stage-02-compression` | 12 | 3.15 | Immediate |
| `stage-03-redline` | 18 | 3.55 | Immediate |

三关已经全部从 Level → Encounter → Spawn 创建，敌人数、出生坐标、速度、Timing 与 Phase 1 指纹一致。

## 新增 Level

1. 创建稳定 `LevelDefinition.id` 与唯一 `index`；
2. 声明 Arena 和 Player Spawn；
3. 创建至少一个 Encounter 和 Wave；
4. 每个 Spawn 使用已注册 Enemy Definition；
5. 选择 Environment Profile，并保证 `lightingProfileId` 与其一致；
6. 如有静态对象和 Gameplay Surface，先提供对应 Definition/Factory，再引用 ID；
7. 增加内容完整性、完整通过和 Replay/Seed 测试；
8. 在 Content Sandbox 和真实战场检查。

新增 Level 不修改核心 Dash、Character Provider 或 Presentation Runtime。

## Wave 与关卡行为

`WaveActivation` 已定义：

- `immediate`；
- `timed`；
- `after-previous-killed`；
- `triggered`。

当前生产内容只实现并使用 Immediate Spawn。其余值是稳定数据协议，不代表 Scheduler 已完成。第一次使用非 Immediate Wave 时，应新增独立 Encounter Runtime State 和 Scheduler，明确：

- Activation Tick 与 Delay；
- Trigger ID/条件；
- 已激活与已完成 Wave；
- Spawn 顺序与稳定 Entity ID；
- 中途死亡、重开、过关和 Replay 行为。

关卡机关、门、列车、区域触发等行为应通过有类型的 Level/Encounter System 和 Event 接入，不应写成 Scene Mesh 的点击回调。视觉列车移动不等于 Gameplay Obstacle，只有进入 Obstacle Definition 和 Simulation 后才会影响碰撞。

## Environment 映射

Level 只引用 `environmentId` 和 `lightingProfileId`。`EnvironmentProfile` 决定 Runtime、背景、雾、雨和模块组合。当前 Transit Cathedral 分为：

- Arena；
- Transit；
- City；
- Weather；
- Lighting。

Day Inspection Profile 只用于设计检查，不是第二个 Gameplay Level。后续重做关卡视觉时可以新建 Environment Profile 或 Module，关卡规则不随视觉资产变化。

## 兼容性门

- Level Registry 中索引与 ID 唯一；
- 所有 Enemy、Environment、Lighting 和 PostFX 引用可解析；
- Spawn 顺序稳定，Entity ID 可重复生成；
- 重开只增加 Attempt，不改变内容定义；
- 三关完整可玩；
- `render_game_to_text` 暴露 Level、Encounter 和实体状态。

对应测试为 `tests/gameplay-baseline.test.ts`、`tests/content-domain.test.ts`、`tests/presentation-registry.test.ts`，浏览器完整流程由 `npm run verify:full-run` 验证。
