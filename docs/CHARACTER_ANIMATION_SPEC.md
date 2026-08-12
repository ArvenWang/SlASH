# Project Slash — V5R Character Animation Specification

文档版本：v1.0
更新时间：2026-08-12
状态：正式动画制作与验收输入；关键姿势已锁定，AnimationClip 尚未制作。

## 1. 参考资产

- 主角四视图：`art/characters/production/hero-v5r-four-view.png`；
- 主角核心动作：`art/characters/production/hero-v5r-core-action-sheet.png`；
- 主角 Vector Focus：`art/characters/production/hero-v5r-focus-action-sheet.png`；
- 敌人四视图：`art/characters/production/enemy-v5r-four-view.png`；
- 敌人动作/切割：`art/characters/production/enemy-v5r-action-cut-sheet.png`；
- 武器比例与锚点：`art/characters/production/hero-v5r-weapon-proportion.svg`。

动作图只锁定身体语言和关键接触，不等于 AnimationClip 已完成。最终通过以 Rig、Clip、Animation Lab 与真实战场为准。

## 2. 共同制作约定

- 所有 Clip 面向角色本地 `+Z`，保持 In-place；Gameplay Position 是唯一 Root Motion 事实源。
- Hero 高度归一为 `3.3`，Enemy 高度归一为 `3.157`；动画不得通过整体缩放改变体型。
- 每个 Clip 必须保存 Root、Hips、左右 Foot、左右 Hand 的接触信息；需要双手握持时保存 Secondary Grip 接触区间。
- 主手武器始终由 `primary-grip` 层级挂载；副手仅在标记区间使用受限 IK 对齐 `secondary-grip`。
- 脚底修正只允许处理地面误差，不得用 IK 重写动作重心或隐藏错误蒙皮。
- 角色转向、速度、Threat 和 Hit Direction 可作为 Additive 输入；主要身体运动必须来自正式 Base Clip。

## 3. 主角动画集

| Clip ID | 高层状态 | 目标时长 | Loop | 关键接触与动作要求 |
|---|---|---:|---|---|
| `hero-ready-v5r` | Idle | 1.8–2.6s | 是 | 双脚稳定；低骨盆；右手握刀；呼吸不得抬高重心 |
| `hero-turn-v5r` | Idle/Turn | 140–220ms | 否 | 脚下换重心；不能原地机械旋转全身 |
| `hero-dash-anticipation-v5r` | Anticipation | 35–65ms | 否 | 输入首帧立即压身；不增加 Gameplay 延迟；刀柄靠近髋部 |
| `hero-dash-travel-v5r` | Action | 70–120ms 标准化 | 否 | 身体形成单一前向线；后腿拖曳；刀尖领先；Root 保持原点 |
| `hero-arrival-v5r` | Arrival | 55–100ms | 否 | 前脚接触、后脚制动；髋肩反向吸收；无沉地 |
| `hero-recovery-v5r` | Recovery | 80–180ms | 否 | 重新建立 Ready 握持；不站直等待 CD；末帧可无缝回 Idle |
| `hero-focus-activate-v5r` | Anticipation | 180–300ms | 否 | 双脚稳定、身体内收；能量集中但不遮挡握点 |
| `hero-focus-selection-v5r` | Idle | 0.9–1.4s | 是 | 低姿态小幅循环；自由手指向目标；刀保持紧凑 |
| `hero-chain-slash-01-v5r` | Action | 120–190ms | 否 | 低位对角切；单脚明确承重；可直接接 02 |
| `hero-chain-slash-02-v5r` | Action | 110–180ms | 否 | 髋肩反向连续切；不得重置为 Ready；可直接接 03 |
| `hero-chain-slash-03-v5r` | Arrival | 140–220ms | 否 | 前向终结与制动；刀尖领先；末帧进入 Recovery |
| `hero-death-v5r` | Death | 450–750ms | 否 | 先失衡后侧向落地；首段仍握刀；最终可交给死亡 Presenter |

Dash 与 Chain Slash 的 Clip 时长可按真实 Gameplay 段长 Time Scale，但不得改写逻辑位置、命中或 Replay。

## 4. 敌人动画集

| Clip ID | 高层状态 | 目标时长 | Loop | 关键接触与动作要求 |
|---|---|---:|---|---|
| `enemy-idle-v5r` | Idle | 1.8–2.8s | 是 | 宽重、低频呼吸；双脚稳定；短刀自然握持 |
| `enemy-turn-v5r` | Idle/Turn | 180–280ms | 否 | 胸腔先导，脚下换重心；不整模型旋转 |
| `enemy-run-v5r` | Action/Locomotion | 620–820ms | 是 | 胸腔前压但不爬行；步幅与速度误差小于 10% |
| `enemy-threat-v5r` | Anticipation | 280–480ms | 可循环尾段 | 短刀贴近身体；压迫感来自体重，不来自大幅挥舞 |
| `enemy-contact-attack-v5r` | Action | 320–520ms | 否 | 短重切击；支撑脚明确；刀柄保持掌内 |
| `enemy-attack-recovery-v5r` | Recovery | 180–320ms | 否 | 重心回收，不瞬间回 Idle |
| `enemy-hit-left-v5r` | Hit | 120–220ms | 否 | 斩击方向驱动胸髋扭转；脚仍保留惯性 |
| `enemy-hit-right-v5r` | Hit | 120–220ms | 否 | 与左向受击形成镜像语义但保持红肩不换边 |
| `enemy-delayed-cut-hold-v5r` | Hit | 80–150ms | 否 | 身体保持连接；切缝显现；不得提前爆开 |
| `enemy-separation-transition-v5r` | Death | 90–160ms | 否 | 沿切面发生小幅方向错位，随后交给 Death Profile |
| `enemy-fall-v5r` | Death | 450–800ms | 否 | 仅用于未切割死亡或大块落地辅助，不替代尸体系统 |

## 5. 状态切换

```text
Hero:
Ready → Anticipation → Dash Travel → Arrival → Recovery → Ready
Ready → Focus Activate → Focus Selection → Chain 01 → Chain 02 → Chain 03 → Recovery
Any Alive State → Death

Enemy:
Idle ↔ Turn ↔ Run → Threat → Contact Attack → Recovery
Any Alive State → Hit → Delayed Cut Hold → Separation Transition → Death Presenter
```

- Hit 与 Death 优先级高于普通 Locomotion；
- Death 是终态，只有显式 Reset 才能退出；
- 每次切换记录 Fade In/Out，禁止依靠隐式默认淡入；
- Chain 01/02/03 使用连续髋肩相位，不能在段间回到 T/A-Pose 或 Ready。

## 6. 动画验收

- Animation Lab：前、侧、背、3/4 与 Gameplay Camera 各检查一次；
- Debug Overlay：骨架、动态 Bounds、左右脚接触、左右掌心、主/副握点、刀根、刀尖；
- 站立脚距离地面不超过身高 `0.5%`，不得肉眼可见滑步；
- 双手区间副手掌心与 Secondary Grip 距离不超过身高 `1%`；
- 状态切换 Root 瞬移不超过身高 `1%`，无肉眼可见关节角跳变；
- 刀光关闭后仍能看清刀柄在手中；
- Lab 通过后进入一次 Stage 1/3 短实机检查，未改动画时不重复。
