# Visual Asset Contract

文档版本：v1.0
更新时间：2026-08-12
状态：V5R 角色、武器、动画与场景模块化实现合同。

## 目标

模型来源、骨架命名、动画文件和武器资产可以变化，但 Gameplay、Ability、Enemy Behavior、Collision 与 Replay 不随视觉资产改变。

```text
Gameplay facts
  → Character Presentation ID
  → Character Asset Definition
      → Model Provider
      → Skeleton Profile
      → Animation Set
      → Weapon Loadout
      → Material Variant
      → Death Profile
```

## Character Asset Definition

每个正式角色资产声明：

- 稳定 Asset ID 与版本；
- Role（Hero / Enemy）；
- GLB URL、目标高度、原始 Forward Axis、模型 Ground Reference；
- Skeleton Profile ID；
- Animation Set ID；
- Weapon Loadout ID；
- Material Variant ID；
- Death Profile ID；
- LOD、贴图、来源和许可证元数据。

生产 Registry 只引用 Character Asset ID，不直接引用 GLB 文件名或生成器骨骼名。

## Skeleton Profile

Skeleton Profile 是“任意来源骨架”到项目统一语义的唯一适配层：

- Root、Hips、Spine、Chest、Neck、Head；
- Left/Right Shoulder、UpperArm、Forearm、Hand；
- Left/Right UpperLeg、LowerLeg、Foot；
- 可选 Toe、Finger、Palm、Cut Landmark。

原始骨骼名只能出现在 Profile 数据中。角色 Provider、Animation Controller、Weapon Runtime 和 Death Presenter 只能读取统一语义节点。缺少必需骨骼时资产加载直接失败并报告具体语义，不允许把 Shin 冒充 Foot。

## Weapon Definition

武器是独立资产，不烘焙进角色身体：

- Model/Geometry 与目标长度；
- `primary-grip`、`secondary-grip`、`guard-center`；
- `blade-base`、`blade-tip`、`trail-edge`；
- 主手、单双手姿态和允许的 Grip Profile；
- 材质、能量强度、VFX 采样与释放生命周期。

Hero V5R 默认 Weapon Ratio 为 `0.62`，允许视觉比较范围为 `0.58–0.66`。长度从 Definition 计算，不由图片像素或模型导入尺寸猜测。

## Grip Profile

Grip Profile 保存角色掌心与武器握点之间的校准：

- Primary Hand；
- Wrist-to-Primary-Grip Offset（武器局部空间）；
- Blade Length Direction 与 Cutting Edge Direction；
- Secondary Hand 与可用区间；
- Secondary IK 权重、最大位移和最大旋转；
- Wrist Axis 与 Blade Forward Axis；
- 每个 Animation State 的握持覆盖项。

主手挂点每帧稳定在角色空间，避免手腕动画意外翻转刀刃；手掌的腕到指根轴必须朝护手/刀身，禁止反握。Grip Profile 还必须逐状态声明互相正交的 `lengthDirection` 与 `cuttingEdgeDirection`：前者控制刀根到刀尖，后者控制刀脊到真实开刃侧；两者都在角色空间定义，不能由相机方向推算。对生成模型的失真指骨，可通过角色专属、可替换的 Grip Presentation Attachment 修正，但附件不得改变武器锚点或 Gameplay。

## Animation Set

Animation Set 将稳定状态语义映射到具体 Clip：

- Idle、Turn、Anticipation、Action、Arrival、Recovery、Hit、Death；
- 可扩展 Focus Activate、Selection、Chain 01/02/03、Threat、Attack、Cut Hold；
- 每项显式声明 Clip、Loop、Time Scale、Fade In/Out、Priority 与 Contact Track。

Clip 缺失必须在资产检查中失败；不得自动改用整模型旋转、随机骨骼驱动或静态姿势冒充。

## Ground 与 Bounds

- 导入时保存中立姿势 Ground Reference；
- 每个动画帧使用真实 SkinnedMesh/Skeleton 更新后的动态 Bounds 做诊断；
- Gameplay Root 保持地面事实，Foot Correction 只在允许范围内修正视觉误差；
- `groundAligned: true` 必须来自当前姿势脚底/动态 Bounds，而不是仅检查 Bind Pose。

## Distance LOD

- LOD 只属于 Presentation Asset，不改变 Gameplay Root、碰撞、攻击范围或行为；
- 当前 V5R 使用同一 SkinnedMesh 的完整 Skin Attribute，并按距离切换简化 Index Buffer，不复制 Skeleton 或 AnimationMixer；
- Hero 主体由 10,260 降至 4,308 triangles，Enemy 由 9,751 降至 3,897 triangles；64px 近/远轮廓必须保持敌我与武器可读；
- LOD 报告必须同时记录切换距离、三角面降幅和 Meshoptimizer 最大简化误差。

## Environment Profile

环境继续拆分为：

- Arena：平台、边缘、排水、维修、碰撞视觉代理；
- Transit：拱架、轨道、列车和中景维护结构；
- City：远景体块、窗光与交通；
- Weather：雨、雾、蒸汽和环境反应；
- Lighting：平台、角色、背景与危险色层级。

Gameplay Collision 使用独立 Arena Surface。更换任一视觉模块不得改变 Level Definition 或可行走边界。

当前 V5R 场景视觉配置位于 `src/scene/environment-visual-profile.ts`。配置独立声明平台、Transit、City、背景距离和环境补光；运行时快照暴露 `visualProfileId`。平台碰撞仍由独立 `arena-hit-surface` 提供，视觉甲板、维修舱、格栅和边缘立面均不能改变碰撞边界。

## 替换资产流程

1. 放入版本化模型/武器文件并记录来源；
2. 新增 Character Asset / Skeleton / Animation / Weapon / Grip 定义；
3. 运行结构、骨架语义、压力姿势与握点验证；
4. 在 Animation Lab 检查关键状态；
5. 修改 Registry 中的 Character Asset ID；
6. 只做一次受影响的真实战场检查。

替换流程不得修改 `src/game/`、Ability、Enemy Behavior 或 Level Spawn。自动架构门需要持续检查这一约束。

非生产 Fixture `fixture-hero-v5r-replacement` 会真实改写克隆模型几何，再通过同一 Provider / Skeleton / Animation / Weapon 合同完成 Idle、Action、Hit、Death 与挂载验证。Fixture 源码不导入 Gameplay、Ability、Enemy Behavior 或 Level；报告位于 `validation/visual-redesign/integration/model-replacement-fixture-report.json`。
