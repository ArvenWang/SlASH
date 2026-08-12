# Replay 与确定性

## 目的

Replay 是规则回归、关卡验收、故障复现和未来 Ghost/挑战功能的基础。它记录确定性输入，不录制视频，也不依赖渲染帧率。

实现位于：

- `src/core/random/seeded-random.ts`；
- `src/game/replay/replay.ts`；
- `src/game/serialization/stable.ts`；
- `tests/abilities-events-replay.test.ts`；
- `tests/full-game-replay.test.ts`。

## 日志内容

`ReplayLog` 包含：

- Replay Schema Version；
- Content Version；
- `legacy-stage` 或 `full-game` Mode；
- 初始 Stage；
- Seed；
- Game Rules；
- 按 `runTick + sequence` 排序的 `GameCommand`；
- 最终 Run Tick；
- 预期 Gameplay State Hash。

记录必须从新建 GameState 开始。Recorder 通过自身的 `dispatch()` 发送命令，保证实际执行与日志使用同一 Command Sequence。

## 随机数

当前算法标识是 `mulberry32-v1`。`SeededRandomState` 保存内部 State 与 Draw Count，可精确恢复后续序列。Gameplay 不得使用 `Math.random()`；若视觉只需要不影响规则的随机变化，应使用事件 ID、Entity ID 或表现层本地 Seed，不得消耗 Gameplay RNG。

## 状态 Hash

`gameplayStateHash()` 对排序后的可序列化 Gameplay 数据计算 FNV-1a 32-bit Hash。范围包括 Run、Stage、Player、Enemy、Projectile、Obstacle、Hazard、Combat、Tick、Rules、Sequence 和稳定 Snapshot，不包含 Three.js、音频、诊断或 Presentation 状态。

Hash 用来检测回放结果分歧，不是密码学签名，也不用于防作弊。

## 版本策略

当前版本为 Replay `3`、Content `full-game-v1`。Replay 3 增加 Title 阶段的 Standard / Assist / Threat 配置命令；它必须先于路线生成记录，确保 Threat 路线与 Boss 变式可精确回放。破坏确定性的内容或规则变更必须：

1. 更新 Content Version；
2. 决定旧 Replay 是迁移、保留旧模拟器还是明确拒绝；
3. 更新基线 Fixture 和兼容说明；
4. 不允许悄悄回放到“看似成功但结果不同”。

`playReplay()` 对未知版本直接报错，并验证每个 Command Sequence 和最终 State Hash。

## 当前验收与范围

自动测试会以固定 Seed 完整通过 Stage 1，记录所有 Ability Commands，再从新 GameState 回放，要求 Stage Clear、8 Kills 和最终 Hash 完全一致。

当前除 Legacy Stage 外，Full-game Replay 已覆盖 Run Protocol、Route Choice、Skill Draft / Commit、Event、Forge、Charged Hold / Release 与 Ultimate Planning。代表性 Campaign 路径会从全新 Title State 重放并要求最终 Hash 完全一致。

Boss Practice 现已覆盖“先失败 → Restart → 完整击破 → 从全新 GameState 回放 → 最终 Hash Match”。尚未完成 FG-R01 的 `100 Seed × 4 Build` 完整 Run 矩阵，也尚未提供玩家可见的 Replay 管理 UI、跨版本模拟器、联网同步或反作弊；这些不能因为 Boss Replay 已通过就宣称完成。
