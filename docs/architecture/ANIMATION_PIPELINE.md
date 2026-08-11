# Animation Pipeline

## 状态语义

所有角色使用同一组高层状态：

```text
Idle → Anticipation → Action → Arrival → Recovery
                       ↓
                      Hit → Death
```

类型定义位于 `src/presentation/animation/controller.ts`：

- `idle`：可持续循环的准备状态；
- `anticipation`：动作前短蓄势；
- `action`：攻击或高速动作主体；
- `arrival`：动作结束的落点吸收；
- `recovery`：恢复到可再次输入；
- `hit`：高优先级受击；
- `death`：终态，只有显式 `reset()` 才能离开。

`AnimationSetDefinition` 为每个状态声明 Clip 名、Fade In/Out、Time Scale、Loop 和 Priority。状态语义稳定，具体 Clip 和驱动可替换。

## Base Clip 与 Additive Driver

Controller 同时支持两条路径：

1. Base Clip：通过每实例 `THREE.AnimationMixer` 播放 GLB AnimationClip，并按状态淡入淡出；
2. Procedural Additive Driver：接收同一个 `CharacterAnimationFrame`，叠加呼吸、转向、速度、威胁、命中或现有自制骨骼动作。

两者可以单独使用，也可以组合。正式资产有 Clip 时，Clip 负责主要身体运动，Additive Driver 只负责小幅响应；没有 Clip 时，Additive Driver 可以完整驱动现有角色，但资产状态必须如实标记。

当前程序角色和两份 GLB 都使用 Additive Driver。测试用真实二进制 GLB Fixture 包含 `Idle / Anticipation / Action / Arrival / Recovery / Hit / Death` Clips，用来证明 Mixer 路径确实可工作。

## 输入与 Root Motion

Animation Input 只接收表现所需的只读事实：

- 时间和 Delta；
- Gameplay 状态对应的高层 Animation State；
- Dash/Recovery Source Progress；
- Turn；
- Distance Moved 与 Speed Normalized；
- Threat；
- Hit Age。

Root Motion 始终由 Gameplay Position 决定。Clip 中的根骨位移不能推动碰撞体，也不能改变 Replay。若未来需要 Root Motion 风格动画，应在导入阶段提取视觉曲线，Gameplay 仍根据规则计算位移，Presentation 只做视觉对齐。

## 状态切换规则

Controller 在状态变化时：

1. 记录 `previousState`；
2. 按当前 Fade Out 与下一状态 Fade In 的较大值计算过渡时长；
3. 停出旧 Action、重置并淡入新 Action；
4. 同步更新 Additive Driver；
5. 暴露 Snapshot 供 Lab 和自动验收观察。

`death` 是终态；`hit` 的最短保护窗口内，低优先级状态不能立即覆盖它。若未来需要可取消动作、连段窗口或霸体，应把规则放进 Gameplay Ability/Combat State，再映射为 Animation State，而不是让动画自行决定攻击是否成立。

## 新 Animation Set

1. 在 `animationSetRegistry` 新增 `AnimationSetDefinition`；
2. 将语义状态映射到资产 Clip 名；
3. 如需附加动作，实现小而明确的 `ProceduralAnimationDriver`；
4. 在 Character Presentation 或 Provider 中选择该 Set；
5. 验证 Idle → Action → Recovery、Hit、Death、Loop、Speed 和 Freeze Frame；
6. 进入战场检查动作与 Gameplay Timing 是否仍对齐。

Clip 名按归一化规则匹配，大小写、空格、下划线和连字符不影响查找。缺失 Clip 不会自动伪造；Snapshot 的 `activeClip` 和资产元数据会暴露真实状态。

## Animation Lab

`validation/tools/character-lab.html` 可以选择：

- Procedural 或 GLTF Provider；
- Hero 或 Enemy；
- Animation State；
- 播放速度、Loop、冻结时刻；
- 正、侧、背、三分之四与 Gameplay Camera。

Lab 与游戏使用同一 Provider、Animation Registry 和 Controller，不维护第二套动作实现。
