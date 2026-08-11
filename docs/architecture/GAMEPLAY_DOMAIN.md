# Gameplay Domain

## 目标

Gameplay Domain 是游戏规则的唯一事实源。它必须在没有 DOM、Web Audio 和 Three.js 的环境中运行，并以相同 Seed 和命令序列得到相同结果。渲染帧率只影响画面采样，不影响击杀、位移、Recovery、敌人追击或过关结果。

真实入口如下：

- `src/game/game.ts`：兼容 Facade、固定步长模拟和生命周期；
- `src/game/domain/types.ts`：`GameState` V2、命令、事件和快照类型；
- `src/game/abilities/`：Ability 调度与 Dash Slash 执行；
- `src/game/simulation/`：Enemy Behavior；
- `src/game/collision/`：Circle、Segment、AABB、OBB、Convex Polygon；
- `src/game/events/`：Event 2.0 Buffer；
- `src/game/replay/`：命令日志、回放与状态 Hash。

## 时间模型

`stepGame()` 每次精确推进一个 `1000 / 120ms` Simulation Tick。`advanceGame()` 是实时包装器：累积浏览器帧时间、按 120Hz 补步，并把单帧补偿上限限制为 250ms，防止后台恢复后出现多秒追赶。

规则代码不得读取 `performance.now()`、`Date.now()` 或随机的渲染帧间隔。持续时间存储为毫秒，由固定 Tick 消耗。需要随机性的系统必须从 `RunState.random` 对应的 Seeded RNG 派生，并将 RNG 状态保存在可序列化状态中。

## 状态所有权

`GameState` V2 分成五个稳定区域：

- `run`：Seed、跨关卡 Tick、选中升级和资源；
- `stage`：Level、Encounter、阶段状态、尝试次数与竞技场边界；
- `player`：位置、朝向、生命、Ability Slots、Dash、Recovery 和输入缓冲；
- `enemies / projectiles / obstacles / hazards`：可序列化实体状态；
- `combat`：击杀和敌人数等战斗结果。

角色世界坐标和 Root Motion 归 Gameplay 所有。动画可以摆动骨骼、混合 Clip、做视觉位移残影，但不得把视觉骨骼位置写回 Gameplay。这样替换 GLB、动画或特效不会改变碰撞与 Replay。

所有 Runtime State 必须可以 `JSON.stringify()`。Three.js 对象、函数、Promise、DOM 节点和 AudioNode 不得进入 `GameState`。

## Command 与 Event

外部输入先转换为 `GameCommand`：

```ts
type GameCommand =
  | { type: "activate-ability"; slot: AbilitySlot; target: Vec2 }
  | { type: "restart-stage" }
  | { type: "advance-stage" };
```

`dispatchGameCommand()` 分配稳定的 Command Sequence。Replay 记录的是命令，不记录鼠标像素、DOM 事件或渲染结果。

Gameplay 通过 `GameEvent` 输出已经发生的事实。每个事件包含稳定 `id`、`tick`、`sequence` 和 `atMs`；与表现有关的必要事实，如击杀位置、攻击方向、Ability ID 和命中对象，也在事件产生时一并复制。Presentation 不允许在稍后的可变状态中反推这些事实。

新增 Gameplay 结果时，流程是：

1. 在 `GameEventPayload` 增加可序列化事件；
2. 在规则完成判定的同一 Tick 调用 `emitGameEvent()`；
3. 为 Replay 和事件顺序补测试；
4. Presentation 再选择是否消费该事件。

不需要画面反馈的内部过程不应滥发事件。

## 实体 Domain 扩展

Projectile、Obstacle 和 Hazard 不是 `unknown[]` 占位，而是已有 Definition ID、Runtime State、GameSnapshot 和碰撞形状的正式入口。当前没有生产内容，这是刻意的范围控制。

加入第一个 Projectile 时，应新增独立的 Projectile Simulation 模块并由固定步长编排调用，负责生成、移动、碰撞、寿命和事件；现有 Dash Slash 只共享碰撞工具，不需要改写。Obstacle 与 Hazard 同理。不要把新的攻击分支继续堆入 `executeDashSlash()`。

## 兼容层

`StageDefinition` 仍保留为 Phase 1 工具的只读兼容视图，权威内容已经是 `LevelDefinition + EncounterDefinition + SpawnDefinition`。新功能不得继续向 `StageDefinition` 加字段。待旧验证工具全部迁移后，可单独删除兼容视图。

## 不变量与验证

- 三关敌人数、出生点、速度和节奏由基线指纹锁定；
- Dash 的距离钳制、35–110ms 时长、80–180ms Recovery、路径多杀和无敌窗口不得因视觉改动变化；
- Gameplay/Content 不得导入 Presentation、Runtime、Characters、Scene 或 Three.js；
- 本地 TypeScript Import Graph 不得出现循环；
- `getGameSnapshot()` 是浏览器 Agent 的稳定、紧凑观察面，不替代完整 `GameState`。

对应测试：`tests/gameplay-baseline.test.ts`、`tests/content-domain.test.ts`、`tests/collision.test.ts`、`tests/abilities-events-replay.test.ts` 和 `tests/architecture-boundaries.test.ts`。
