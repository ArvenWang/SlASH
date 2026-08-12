# Character Pipeline

## 统一 Contract

所有角色来源实现 `CharacterProvider`，创建后返回相同的 `CharacterRuntime`。Gameplay 和 Presentation 不直接依赖某个模型文件或程序化 Rig。

`CharacterRuntime` 统一提供：

- `root`：Presentation 控制的角色根节点；
- `animation`：共享 Animation Controller；
- `weaponMounts`：按名称访问武器挂点；
- `landmarks`：可选的身体标记；
- `afterimageSource`：残影采样源；
- `deathPresentation`：可选的分离/尸体能力；
- `asset`：来源、Provider、Clip、骨骼、朝向和落地元数据；
- 位置、朝向、可见性、能量强度和 `dispose()`。

真实类型位于 `src/presentation/characters/types.ts`，Provider Registry 位于 `src/presentation/characters/provider-registry.ts` 和 `providers.ts`。

## 当前 Provider

| Provider | 来源 | 当前用途 |
| --- | --- | --- |
| `gltf-hero-v5r` | Tripo Rig v2.5 GLB + 项目语义适配 | 生产默认 Hero |
| `gltf-enemy-v5r` | Tripo Rig v2.5 GLB + 项目语义适配 | 生产默认 Enemy |
| `procedural-hero-v5` | 程序化 | Hero 回退与对照 |
| `procedural-enemy-v5` | 程序化 | Enemy 回退与对照 |

GLTF Provider 通过动态 `import()` 延迟进入主包，未选择 GLB 时不加载 GLTF Loader 和模型。程序角色不是等待删除的临时假模型，而是性能基准、Fallback 和视觉对照。

## GLB 导入要求

加载流程位于 `src/presentation/characters/gltf-provider.ts`：

1. `GLTFLoader` 加载 GLB；
2. `inspectGltfAsset()` 检查 Mesh、SkinnedMesh、三角面、材质、贴图、骨骼、Clip、Bounds 与 Ground Offset；
3. `assertGltfAssetRequirements()` 拒绝无 Mesh、无 Skin、无骨骼或无有效高度的角色；
4. 模板使用 `SkeletonUtils.clone()` 创建每个实例；
5. 每个实例克隆材质并拥有独立 `AnimationMixer`；
6. 模型归一到目标高度、地面 Y=0、正面 `+Z`；
7. 建立 `primary-weapon` Mount、能量控制、残影源和可选 Additive Driver；
8. 实例与 Provider 分别释放各自拥有的资源。

禁止直接 `scene.clone()` 复制 SkinnedMesh；它会导致实例共享 Skeleton。禁止多个角色共享可变材质或 Mixer。

## 当前 GLB 事实

生产资产位于：

- `public/models/characters/hero-v5r-rig-v25.glb`；
- `public/models/characters/enemy-v5r-rig-v25.glb`。

当前资产检查结果：

| 角色 | 原始 GLB Triangles | Runtime LOD0 总量 | 主体 LOD0 → LOD1 | Textures | Bones | 项目正式 Clips |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Hero | 13,348 | 13,496（含武器/手部附件） | 10,260 → 4,308（-58.0%） | 3 × 2048 | 78 | 12 |
| Enemy | 11,683 | 13,239（含武器/手部附件） | 9,751 → 3,897（-60.0%） | 3 × 2048 | 55 | 11 |

Tripo 预设动作只用于压力检查，因脚部、重心和敌人抬臂异常被拒绝，不进入生产。正式动作由 `src/presentation/animation/v5r-clips.ts` 生成真实 `THREE.AnimationClip`，并通过 `src/presentation/characters/skeleton-profile.ts` 的统一语义骨架绑定。所有 Tripo 原始骨骼名只允许出现在 Skeleton Profile；已删除旧 `src/characters/tripo-runtime.ts` 随机骨骼名驱动。

`src/presentation/characters/v5r-runtime.ts` 负责动态落地、角色空间武器挂点、手掌/刀柄轴约束和可替换握持附件；`src/presentation/weapons/weapon-runtime.ts` 负责独立武器比例、刀尖、刃口、护手和拖尾锚点。Hero 刀总长固定为身高的 62%，不再使用旧 93% 规则。

`src/presentation/characters/distance-lod.ts` 使用同一套 Skin Attribute，仅替换远距离 Index Buffer；自动阈值为角色高度约 4.2 倍，也可在 Lab 强制 `near/far`。LOD1 保留骨架、动画、材质和挂点，不复制第二套 Skeleton；64px 近/远轮廓证据位于 `validation/visual-redesign/model/`。

## 替换 Hero 或 Enemy

若新资产沿用现有 Provider Contract：

1. 放入版本化资产路径并完成来源/许可证记录；
2. 新建或更新 GLTF Provider 配置，声明目标高度、朝向、Animation Set 与 Mount；
3. 在 `characterPresentationRegistry` 改映射；
4. 在 Animation Lab 检查正、侧、背、三分之四和 Gameplay Camera；
5. 跑资产检查、Provider 实例隔离和战场验证。

不修改 Gameplay Position、Enemy Definition、Dash 命中或 Level Spawn。

## 资源所有权

- Provider 拥有已加载模板资产，并在 Provider `dispose()` 时释放模板 Geometry/Material/Texture；
- Character Instance 拥有克隆材质、Mixer、程序驱动和挂载节点；
- Instance `dispose()` 必须停止 Mixer、解绑 Root 并释放实例资源；
- 共用模板 Geometry 的实例不得自行销毁模板 Geometry；
- 关卡切换先销毁旧实例，再创建新实例。

## 验证入口

- 二进制结构：`npm run verify:character-assets`；
- Provider 浏览器场景：`npm run verify:characters`；
- 真实 GLB 导出/重载与实例隔离：`tests/character-animation-provider.test.ts`；
- 视觉与动作检查：`validation/tools/character-lab.html`。
- 四视图叠加与 64px/LOD：`validation/tools/capture-v5r-visual-acceptance.mjs`、`validation/tools/compare-v5r-model-silhouettes.py`；
- 非生产替换 Fixture：`validation/tools/visual-module-fixture.html`、`validation/tools/verify-visual-module-fixture.mjs`。
