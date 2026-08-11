# Enemy Movement 与 Attack State Machine

## 数据入口

- `src/content/enemies/definitions.ts`：14 类正式敌人的体型、速度、Movement / Attack Profile、Armor、Energy 与 Tags。
- `src/content/enemies/attack-definitions.ts`：Telegraph、Active、Recovery、Cooldown、距离、Projectile、Volley、Deployment 与重复段参数。
- `src/content/enemies/armor-definitions.ts`：独立 Coverage Part。

Definition 不保存 Mesh、颜色、粒子或声音。Presentation 仍由 `src/presentation/registry.ts` 映射。

## 固定 Tick 生命周期

`src/game/enemies/enemy-attack-system.ts` 在世界时间下推进：

```text
Cooldown → Telegraph → Active → Recovery → Cooldown
                        └─ Redline 第二段 → Telegraph
```

Telegraph 开始时锁定目标和方向；后续玩家换位不会让普通攻击中途追踪。Redline Lancer 的第二段是新攻击段，因此会重新锁定。Stagger 会把 Telegraph / Active 中断到 Recovery。

攻击副作用调用正式 Entity System：Gunner / Sniper 生成 Projectile，Constructor 生成 Obstacle，Mine Layer 生成 Hazard。ID 由 Enemy ID + Attack Sequence 构成，Replay 中稳定。

## Movement

`src/game/simulation/enemy-behavior.ts` 提供 Direct Chase、Keep Range、Strafe Align、Retreat、Orbit、Far Anchor、Segmented Track、Far Evade。Telegraph、Active 和 Recovery 期间由 Attack System 接管移动；其余时间才运行 Movement Profile。

近战接触只在 `Active` 阶段致命。Phase 1 Legacy Grunt 保留 `contact-lethal` 兼容行为，不计入正式 10+4 Roster。

## 公平性

- Profile 的基础 Telegraph 为 Conductor 的 0.8 倍率预留空间，最终值仍受硬下限 Clamp。
- Lancer + Blink 同时处于 Telegraph / Active 的数量最多 3。
- Projectile / Obstacle / Hazard 继续受 32 / 8 / 8 Domain 上限。
- Presentation 使用地面环和锁定线两种形状提示，不只依赖颜色。
- Snapshot 暴露 Attack Profile、Phase、Remaining、Sequence、Target、Combo 与 Buff 倍率。

Encounter 层的 Spawn Safety、Sniper / Constructor 数量与 Pressure Budget 已由 P6 Validator 接管；单体系统与 49 个正式非 Boss 模板现在分别有独立证据。
