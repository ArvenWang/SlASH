# Project Slash — 表现层交接清单

玩法分支只定义可视事实与稳定 ID；视觉分支可替换模型、动画、材质、特效、声音和镜头，但不能改变碰撞、时间窗、击杀、能量或路线结果。

## 敌人

- 10 个普通敌人：Striker、Gunner、Lancer、Constructor、Mine Layer、Sniper、Vanguard、Bastion、Blink Stalker、Conductor。
- 4 个精英：Redline Lancer、Twin Gunner、Architect、Fortress。
- 4 个首领实体：Rail Hound、Siege Choir、Mirror Regent、Last Conductor。
- 稳定映射入口：`enemyDefinitions` → `enemyPresentationRegistry`。
- 每个敌人需要 Idle、Anticipation、Action、Arrival、Recovery、Hit、Death 七种状态；当前统一使用 `enemy-procedural-v5`，可逐 ID 替换。

## 攻击与首领事件

- 普通攻击状态：`enemy-attack-phase-changed`，包含敌人、攻击 Profile、阶段、持续时间、目标和方向。
- 装甲：`armor-broken` / `armor-blocked`，包含甲片 ID 与接触区域。
- 首领：`boss-phase-started`、`boss-action-phase-changed`、`boss-core-window`、`boss-break`、`boss-objective-progress`、`boss-clone-state`、`boss-mirror-slash`、`boss-victory`。
- 致命攻击必须同时有形状与动态变化：锁定线 + 地面轮廓、路径 + 倒计时、核心轮廓 + 脉冲；不能只换颜色。

## 世界实体

| 类型 | Gameplay ID | Presentation ID |
| --- | --- | --- |
| 普通弹 | `projectile-standard-round-v1` | `projectile-standard-round-presentation-v1` |
| 狙击弹 | `projectile-sniper-round-v1` | `projectile-sniper-round-presentation-v1` |
| 首领碎片 | `projectile-boss-shard-v1` | `projectile-boss-shard-presentation-v1` |
| 静态反射体 | `obstacle-static-reflector-v1` | `obstacle-static-reflector-presentation-v1` |
| 部署屏障 | `obstacle-deployable-barrier-v1` | `obstacle-deployable-barrier-presentation-v1` |
| 锚柱 | `obstacle-anchor-pillar-v1` | `obstacle-anchor-pillar-presentation-v1` |
| 移动闸门 | `obstacle-rail-gate-v1` | `obstacle-rail-gate-presentation-v1` |
| 地雷 | `hazard-armed-mine-v1` | `hazard-armed-mine-presentation-v1` |
| 电弧轨道 | `hazard-arc-rail-v1` | `hazard-arc-rail-presentation-v1` |

## 可读性合同

- Projectile：小型移动实体 + 明确轨迹。
- Obstacle：实体体积 + 固定或移动轮廓。
- Hazard：地面覆盖形状 + Telegraph / Triggered / Active 动态差异。
- Armor：贴合朝向的独立甲片 + 卸甲后真实消失。
- Boss Weak Point：独立轮廓 + 脉冲；窗口关闭时不可继续显示为可攻击。
- `high` 与 `compatibility` 都必须保留关键战斗提示；只能削减环境和非关键特效。

完整注册与运行入口见 `src/presentation/registry.ts`、`src/runtime/presentation-runtime.ts` 和 `docs/architecture/PRESENTATION_BOUNDARY.md`。
