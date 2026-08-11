# Safe Save 与 Continue

## 边界

Run Save 只负责中断恢复，不是战斗快照，也不是 Replay。当前实现位于：

- `src/game/save/run-save.ts`：纯 Gameplay 序列化、验证与恢复；
- `src/runtime/run-save-runtime.ts`：localStorage 读写适配；
- `src/runtime/campaign-ui-runtime.ts`：Title Continue 与错误呈现；
- `tests/run-save.test.ts`：1,000 次 Roundtrip、版本和损坏测试；
- `validation/tools/capture-save-continue.mjs`：真实浏览器重载流程。

## 安全阶段

允许保存：Title、Planning、Event、Forge、Reward、Victory。

拒绝保存：Combat、Defeat、Dash、Charging、Ultimate Planning / Execution 或任何仍挂接 Encounter Runtime 的状态。

写入前会复制状态并清除瞬时战斗实体、残留事件、Recovery、Buffered Input 与 Accumulator。Route、Skill Draft / Commit、Run Resource、Event History、Ultimate Energy、Tick 和命令序列保留。

Planning 中每次合法路线预选或技能草案变化都会覆盖安全存档。确认进入 Combat 后不再写入，因此战斗中异常退出会回到确认前 Planning，而不会恢复半场 Projectile / Hazard 或产生不可重放状态。

## 格式与拒绝策略

当前格式：

- Schema Version：`1`；
- Content Version：`full-game-v1`；
- Storage Key：`project-slash:run-save:v1`；
- Checksum：稳定序列化后的 FNV-1a 32-bit，用于发现截断或意外修改，不用于安全防护。

恢复按顺序检查 JSON、Envelope、Schema、Content、Checksum、Route Graph、Campaign Phase、Skill Prerequisite、Resource 与 Event History。任何失败都会返回用户可理解的错误，并保留 localStorage 原始字符串；禁止捕获异常后静默清空。

## 当前边界

Threat Protocol、Assist、Boss Boundary、Profile、Practice、Settings 与统计尚未实现。它们进入正式 State 时必须同步升级 Save 测试；因此当前实现不能单独视为 FG-SV01–SV03 全部门完成。
