# Project SlASH — Phase 2A PRD
## Architecture, Visual Pipeline & Expansion Foundation
### 可扩展架构 / 视觉生产管线 / 动画系统升级

**文档版本：** v1.0  
**阶段：** Phase 2A  
**项目：** Project SlASH  
**目标：** 在不改变当前 Phase 1 核心体验的前提下，将现有 Vertical Slice 工程升级为可持续扩展的正式游戏开发底座。

---

## 0. 给执行 Agent 的最高级指令

你正在接手的不是一个需要重写的 Prototype。

当前 `main` 已经拥有完整可玩的 Phase 1：

- Three.js / TypeScript / Vite
- 120Hz 固定 Gameplay Simulation
- 3 个 Stage
- 无限距离直线 Dash
- Swept Path 多杀
- Dash 无敌
- Recovery / Input Buffer
- 1HP
- Death / Restart
- Character Animation
- Gore / Corpse
- Rain / Steam / Environment
- Audio
- Post FX
- Desktop / Touch
- 自动化 Gameplay / Browser / Performance 验收

现有核心体验已经验证通过。当前阶段禁止以“架构更优雅”为理由重写已经工作的核心体验。

现有代码明确把 Gameplay Simulation 与 Three.js Renderer 分离，这一点必须保留。Phase 1 使用 120Hz fixed step，而且 Dash、多杀、Recovery、死亡等都已有自动化验收，这是后续扩展最重要的基础之一。

Phase 2A 的任务是：

> **Refactor for expansion without changing the feel of the existing game.**

完成以后，Phase 1 看起来、玩起来原则上应该还是同一个游戏。

但工程内部应该已经可以自然容纳：

- 新攻击方式
- 新敌人
- 新障碍物
- Projectile
- Boss
- 新关卡
- Roguelike Upgrade
- 角色资产升级
- 正式动画
- 更多 VFX
- 更多 Environment

---

## 1. Phase 2A 的目标

这一阶段只完成五件大事。

### 1.1 建立正式 Gameplay Domain Architecture
把当前针对“玩家 + 一种追踪敌人 + Dash”的状态模型升级成能够容纳更多玩法对象的架构。

### 1.2 建立 Data-driven Content System
以后增加一个敌人、一个 Stage 或一个技能，不应该主要通过修改核心 Game Loop 来完成。

### 1.3 建立 Gameplay → Presentation 的正式事件边界
Gameplay 不知道 VFX、Audio、Three.js、Animation 的具体实现。

### 1.4 升级 Character / Animation / Environment 的生产资产管线
允许真正 GLB、Rig、AnimationClip 和正式材质逐步替换现在的程序化实现。

### 1.5 建立回归和性能保护机制
以后每加新机制，都不能偷偷破坏现在已经非常稳定的 Dash。

---

## 2. 本阶段明确不做什么

Phase 2A 不负责决定：

- 最终第三种攻击是什么
- 最终 Ultimate 是什么
- Roguelike 有哪些具体技能
- 技能树结构
- Boss 的具体机制
- 远程敌人的最终攻击模式
- 装甲敌人的最终规则
- 障碍物最终有多少种
- 一局 Roguelike 的长度
- Meta Progression
- 商店
- 装备
- 数值平衡

但是架构必须能够容纳以上内容。

重要原则：

> **Do not implement speculative gameplay just to prove extensibility.**

可以创建接口、Definition、事件和一个非常简单的 Test Dummy，但不要替用户决定未来机制。

---

## 3. 当前架构最需要解决的问题

Phase 1 的架构很适合 Vertical Slice，但已经开始出现扩展瓶颈。

目前 `GameRules` 的正式 Gameplay 配置基本只有 Recovery；`EnemyState` 主要是 Position / Radius / Speed / Alive；`StageDefinition` 主要描述敌人数、速度、Arena 和 Spawn。

当前敌人逻辑基本为：

```text
Player Position
↓
Direction To Player
↓
Move Straight Toward Player
```

这个设计现在很好。

但未来出现：

```text
Shooter
Obstacle
Projectile
Shield
Boss
Hazard
Ability
Upgrade
```

以后，如果继续向当前核心 Game Loop 填：

```ts
if (enemy.type === ...)
if (projectile ...)
if (shield ...)
if (upgrade ...)
```

很快会形成严重耦合。

Phase 2A 必须提前解决。

---

## 4. 不采用完整 ECS 重构

Agent 不得因为“可扩展性”就主动把项目全面改造成复杂 ECS。

现阶段内容规模还没有大到需要：

- Entity Component System Framework
- Dependency Injection Framework
- Reactive Framework
- 大型 State Machine Library

继续保持：

> **简单 TypeScript Domain Model + 明确 System Separation**

原则：

> 新增一个玩法对象需要改 2～4 个明确的位置，可以接受。  
> 新增一个玩法对象需要修改整个 Game Loop，不接受。

---

## 5. 推荐的新源码结构

建议逐步迁移为：

```text
src/

core/
  clock/
  math/
  ids/
  events/
  random/
  replay/

game/
  state/
  simulation/
  combat/
  movement/
  collision/
  targeting/
  stage/
  encounter/

content/
  enemies/
  abilities/
  projectiles/
  obstacles/
  hazards/
  encounters/
  stages/
  upgrades/

entities/
  player/
  enemy/
  projectile/
  obstacle/
  hazard/

presentation/
  characters/
  animation/
  environment/
  materials/
  lighting/
  camera/
  vfx/
  gore/
  audio/
  ui/

assets/
  loader/
  manifests/
  validation/

debug/
  tuning/
  inspectors/
  benchmark/

validation/
```

不要一次性为了文件结构搬动所有代码。采用渐进迁移。

---

## 6. GameState 2.0

当前 `GameState` 已经有确定性和可序列化思路，这一点必须保留。

建议升级为：

```ts
interface GameState {
  version: 2

  run: RunState
  stage: StageRuntimeState
  player: PlayerState

  enemies: EnemyState[]
  projectiles: ProjectileState[]
  obstacles: ObstacleState[]
  hazards: HazardState[]

  combat: CombatRuntimeState

  elapsedMs: number
  tick: number
  accumulatorMs: number

  lastEvents: GameEvent[]
}
```

`projectiles / obstacles / hazards` 在 Phase 2A 可以为空数组。它们存在是为了建立正式 Domain，不要求这一阶段真的实现完整远程战斗。

---

## 7. Stable ID System

所有 Runtime Entity 必须拥有稳定 ID。

```ts
type EntityId = string
```

示例：

```text
player
enemy:0001
projectile:0001
obstacle:wall:03
```

以后所有事件只传：

**ID + Gameplay Data**

不要把 Three.js Mesh 或 Render Object 放进 Gameplay State。

---

## 8. Entity Definition 与 Runtime State 分离

以后“这个敌人是什么”和“这个敌人现在怎么样”必须分开。

### Definition

```ts
interface EnemyDefinition {
  id: EnemyDefinitionId
  archetype: string
  radius: number
  baseMoveSpeed: number
  movementProfile: string
  attackProfile: string
  tags: readonly string[]
  presentation: {
    characterId: string
    animationSetId: string
    vfxProfileId: string
    audioProfileId: string
  }
}
```

### Runtime

```ts
interface EnemyState {
  id: EntityId
  definitionId: EnemyDefinitionId
  position: Vec2
  facing: Vec2
  alive: boolean
  state: EnemyRuntimeMode
  spawnedAtMs: number
  killedAtMs: number | null
}
```

以后 10 个同类型敌人只共享一个 Definition。

---

## 9. 不要把视觉参数放进 Gameplay Definition

错误：

```ts
EnemyDefinition {
  color: 0xff0000
  glowIntensity: 4
}
```

正确：

```ts
presentation: {
  characterId: "grunt-heavy-v1"
}
```

然后由 Presentation Registry 决定模型、材质、VFX 和动画。

Gameplay 和 Art 必须真正可以独立演进。

---

## 10. Player Ability Architecture

这里只建立架构，不决定具体新攻击。

```ts
type AbilitySlot =
  | "primary"
  | "secondary"
  | "special"
  | "ultimate"
```

现有 Dash Slash 放在 `primary`。

未来用户决定的新攻击可以放 `secondary`，满能量技能可以放 `ultimate`。

Phase 2A 不实现新的正式技能。

---

## 11. Ability Definition

```ts
interface AbilityDefinition {
  id: AbilityId
  slot: AbilitySlot
  activation: AbilityActivationType
  cooldown?: number
  energyCost?: number
  tags: readonly AbilityTag[]
  executionProfile: string
}
```

Execution 不直接写在 Definition 中。

例如：

```text
dash-slash
```

由 Ability System 注册执行逻辑。

---

## 12. Ability Runtime State

```ts
interface AbilityRuntimeState {
  abilityId: AbilityId
  cooldownRemainingMs: number
  charges?: number
}
```

Player：

```ts
abilities: Record<AbilitySlot, AbilityRuntimeState | null>
```

避免以后在 PlayerState 中不断增加 `isCountering`、`isUltimate`、`hasSkillX`、`skillXCooldown` 等特殊字段。

---

## 13. Combat Hook / Modifier System

这是未来 Roguelike 最重要的架构基础。

Phase 2A 只建立机制。

建议提供有限、明确的 Hook：

```text
BeforeAbility
AfterAbility
BeforeDash
AfterDash
OnHit
OnKill
OnMultiKill
OnPlayerLanding
OnRecoveryStart
OnRecoveryEnd
OnProjectileSpawn
OnProjectileHit
OnPlayerDeath
OnStageStart
OnStageClear
```

未来 Upgrade 可以订阅这些事件或对 Context 进行有限修改。

---

## 14. 不允许任意 Monkey Patch

不要让 Upgrade 得到完整 `GameState` 后随便修改。

应该定义：

```ts
interface DashModifierContext {
  distance: number
  durationMs: number
  recoveryMs: number
  hitRadius: number
}
```

Modifier 只能修改受允许字段。

这样以后几十个 Upgrade 组合时更可控。

---

## 15. UpgradeDefinition

本阶段只建立模型：

```ts
interface UpgradeDefinition {
  id: UpgradeId
  rarity: UpgradeRarity
  tags: readonly string[]
  modifiers: readonly ModifierDefinition[]
  presentation: UpgradePresentation
}
```

暂时不设计最终技能池。

只制作 2～3 个内部 Test Upgrade，用于验证 Modifier 架构，例如：

```text
Recovery × 0.8
Dash Hit Radius × 1.1
```

这些不能被当成正式设计，完成验证后只保留在 Debug Content。

---

## 16. Event Architecture

目前已经通过 `lastEvents` 把 Gameplay 事件传递给 Visual 层。

Phase 2A 应将它正式化。

```ts
interface BaseGameEvent {
  id: EventId
  tick: number
  atMs: number
}
```

事件体系建议包括：

```text
AbilityStarted
AbilityCompleted
DashStarted
DashCompleted
EntityHit
EnemyKilled
ProjectileSpawned
ProjectileDestroyed
ObstacleHit
PlayerDied
StageStarted
StageCleared
```

不是要求全部马上触发，只是让 Event Taxonomy 稳定。

---

## 17. Gameplay Event 不包含视觉指令

错误：

```ts
{
  type: "enemy-killed",
  bloodAmount: 48,
  cameraShake: 0.8
}
```

正确：

```ts
{
  type: "enemy-killed",
  enemyId,
  position,
  attackId,
  direction
}
```

然后 VFX System 自己决定 Blood Profile、Camera、Audio。

以后重做 Art Direction 时，不需要改 Gameplay。

---

## 18. Presentation Registry

增加统一 Registry：

```text
CharacterPresentationRegistry
AbilityPresentationRegistry
EnemyPresentationRegistry
VfxRegistry
AudioRegistry
EnvironmentRegistry
```

例如：

```text
enemy-grunt-v1
↓
character: enemy-grunt-v1.glb
animation: enemy-grunt-animation-v1
deathProfile: humanoid-heavy-cut
audioProfile: enemy-cyber-grunt
```

以后替换角色模型不改 Gameplay。

---

## 19. Character Runtime 重构

建立两种 Character Provider：

```text
ProceduralCharacterProvider
GLTFCharacterProvider
```

统一实现：

```ts
interface CharacterRuntime {
  root: THREE.Object3D
  setPosition(...)
  setFacing(...)
  setAnimationState(...)
  setEnergyLevel(...)
  setVisible(...)
  dispose()
}
```

Phase 1 角色成为 Fallback Provider。

---

## 20. 正式 GLB Character Pipeline

Phase 2A 必须让项目真正具备导入正式 Character 的能力。

统一标准：`.glb`

模型必须支持：

- SkinnedMesh
- Skeleton
- Material
- AnimationClip

Asset Validator 自动检查：

- Triangle Count
- Material Count
- Texture Count
- Texture Resolution
- Skeleton Bone Count
- Animation Clip Names
- Bounding Box
- Character Height
- Forward Direction
- Ground Alignment

现有 Tripo Model Lab 可以继续保留并升级，不要重新造一套独立工具。

---

## 21. Animation 2.0

当前动画系统不要删除。

重新定义为：

```text
Base Animation
+
Procedural Additive Motion
```

Base：AnimationClip。

Additive：当前程序动画的一部分能力，例如：

```text
Aim Turn
Body Lean
Speed Lean
Weapon Direction Correction
Landing Correction
Enemy Motion Variation
```

---

## 22. Character Animation State Machine

至少建立正式状态：

```text
Idle
Anticipation
Action
Arrival
Recovery
Hit
Death
```

不要继续把所有动画状态直接写成：

```ts
if (dashProgress !== null)
if (recoveryProgress !== null)
```

应该由 `CharacterAnimationController` 处理。

---

## 23. Animation Transition

每个 State 定义：

```text
clip
fadeIn
fadeOut
timeScale
loop
priority
```

允许 Gameplay Timing 和 Animation Timing 相互映射，但不是完全绑定。

例如 Gameplay Dash 为 60ms，视觉动画可以为 160ms。

---

## 24. Root Motion 原则

Gameplay Position 永远由 Simulation 决定。

Animation 不拥有真实 Gameplay Root Motion。

可以使用 Visual Root Offset。

Animation 可以让身体在模型内部有冲力，但真正的位置仍来自 GameState。

这样动画不会破坏 Determinism。

---

## 25. Corpse / Gore Presentation 抽象

将现有尸体系统抽象为：

```text
DeathPresentationProfile
```

未来可以有：

```text
humanoid-soft
humanoid-armored
robot
boss
```

当前只实现现有 Profile，不要马上设计新死亡类型。

---

## 26. VFX System 重构

建议拆为：

```text
presentation/vfx/

VfxRuntime.ts

dash/
slash/
impact/
blood/
environment-reaction/
projectile/
boss/
```

关键不是文件变短，而是每个 VFX 都由：

**Profile + Runtime**

驱动。

---

## 27. VFXDefinition

例如：

```ts
interface VfxDefinition {
  id: string
  duration: number
  poolSize?: number
  qualityTier: "critical" | "important" | "ambient"
}
```

具体 Shader / Mesh 仍留在 Presentation。

---

## 28. VFX Priority

定义三类：

```text
Critical
Important
Ambient
```

### Critical
- Slash Core
- Player
- Enemy Attack Telegraph
- Dangerous Projectile

永远不能因为性能降级被关掉。

### Important
- Blood
- Afterimage
- Impact Spark

可以减少数量。

### Ambient
- Rain
- Steam
- Background Particle

性能差时优先削减。

---

## 29. Object Pool

Phase 2A 正式建立通用 Pool。

至少支持：

- Projectile
- Blood Particle
- Impact VFX
- Decal
- Temporary Mesh
- Corpse Fragment

未来内容量增加后，没有 Pool 会逐步成为 GC 和 Frame Spike 来源。

---

## 30. Material System

目前大量材质都直接由代码创建。

Phase 2A 建立：

```text
Material Library
```

不要每个系统自己：

```ts
new MeshStandardMaterial(...)
```

统一：

```text
HeroMaterialProfile
EnemyMaterialProfile
ArenaMaterialProfile
EnergyMaterialProfile
BloodMaterialProfile
```

---

## 31. Material Token

建立项目统一视觉 Token：

```text
surface.darkPrimary
surface.darkSecondary

energy.playerCore
energy.enemyWarning

blood.primary

environment.coldLight
environment.warmAccent
```

不要让新的 Agent 各自在源码里随便写不同的青色、红色、紫色。

---

## 32. Lighting Profile

把当前 Lighting 抽成：

```ts
LightingProfile
```

例如：

```text
transit-cathedral-night-rain
```

Profile 描述：

- Key
- Fill
- Rim
- Fog
- Exposure
- Bloom Baseline
- Environment Color

未来新地图可以复制 Profile，再局部修改。

---

## 33. PostFX Profile

抽象为：

```text
PostFxProfile
```

至少区分：

```text
Base Profile
Dash Impact
Kill Impact
Death Impact
```

避免未来每个能力直接修改全局 `postFx.impact`。

---

## 34. Environment Architecture

环境模块建议按世界模块拆：

```text
environment/

arena/
transit/
city/
weather/
ground/
signage/
lighting/
```

不要按“技术类型”简单拆成 `boxes.ts`、`lights.ts`。

---

## 35. LevelDefinition 2.0

定义：

```ts
interface LevelDefinition {
  id: LevelId
  environmentId: EnvironmentId
  arena: ArenaDefinition
  staticObjects: StaticObjectDefinition[]
  gameplaySurfaces: GameplaySurfaceDefinition[]
  encounters: EncounterDefinition[]
  lightingProfile: LightingProfileId
  presentation: LevelPresentation
}
```

---

## 36. Gameplay Geometry 与 Visual Geometry 分离

未来墙不能依赖 Scene Mesh 直接当 Gameplay Collision。

应该存在 Gameplay Geometry。

```ts
ObstacleDefinition {
  shape
  transform
  tags
}
```

Visual Mesh 可以比碰撞复杂很多，Gameplay 只使用简化 Shape。

---

## 37. Collision Shape

Phase 2A 至少实现抽象：

```text
Circle
Segment
AABB
OBB
Polygon
```

不要求全部马上投入 Gameplay，但未来墙、Barrier、Hazard、Boss 部件可以复用。

---

## 38. Navigation 暂时不要上 NavMesh

现阶段地图很小。

不要因为未来有墙就立刻加入完整 NavMesh / A* 系统。

先建立：

```text
EnemyMovementStrategy
```

当前：

```text
DirectChase
```

以后可以加入：

```text
NavigateAroundObstacle
KeepDistance
Orbit
Stationary
Scripted
```

但 Phase 2A 只迁移 DirectChase。

---

## 39. Enemy Behaviour Strategy

```ts
interface EnemyBehavior {
  update(context): void
}
```

不要在核心 `moveEnemies()` 中累积所有敌人规则。

现有追踪逻辑迁移成：

```text
DirectChaseBehavior
```

实际行为不得发生变化。

---

## 40. EncounterDefinition

未来关卡不应该只靠：

```text
enemyCount = 18
```

建立：

```ts
interface EncounterDefinition {
  id: string
  waves: EncounterWave[]
  completionRule: CompletionRule
}
```

Wave 可以支持：

```text
Immediate
Timed
AfterPreviousKilled
Triggered
```

Phase 2A 可把现有每关迁移为 Immediate Spawn，游戏行为不变。

---

## 41. SpawnDefinition

```ts
interface SpawnDefinition {
  enemyDefinitionId: string
  position: Vec2
  delayMs?: number
  facing?: Vec2
  spawnPresentation?: string
}
```

未来可以自然形成门、电梯、空投、传送等方式，但这一版不增加。

---

## 42. RunState

为了以后 Roguelike 做准备，增加轻量：

```ts
interface RunState {
  seed: number
  selectedUpgrades: UpgradeId[]
  acquiredResources: Record<string, number>
}
```

当前 `selectedUpgrades` 为空，不实现 Meta Progression。

---

## 43. Random Service

以后 Roguelike 必须可复现。

不能到处：

```ts
Math.random()
```

建立：

```text
SeededRandom
```

所有 Gameplay Random 必须基于 Run Seed。

Presentation Random 可以独立。

---

## 44. Gameplay RNG 与 Visual RNG 分离

硬规则：

### Gameplay RNG
负责：

- Enemy Spawn
- Upgrade Selection
- Encounter Variation

### Presentation RNG
负责：

- Spark
- Blood
- Rain Variation
- Idle Micro Variation

否则调整一个 VFX，可能改变 Roguelike 随机结果。

---

## 45. Replay / Deterministic Input Log

建立：

```ts
ReplayInput {
  tick
  action
  target?
}
```

只记录玩家输入。

同一个 `Seed + Input Log` 应该得到同一个 Gameplay Result。

以后非常适合复现 Boss Bug、Skill Combo Bug、Rare Crash。

---

## 46. `render_game_to_text` 保留

现有 Validation 文本游戏状态输出继续保留并升级。

未来输出：

- Player
- Enemies
- Projectiles
- Obstacles
- Current Abilities
- Active Upgrades
- Encounter
- Stage
- Seed

它仍然是 Agent 自动验收最重要的接口之一。

---

## 47. Debug Inspector

下一阶段升级成三个 Debug Panel：

```text
VISUAL
GAMEPLAY
CONTENT
```

### GAMEPLAY
- Current State
- Ability
- Recovery
- Invulnerability
- Entity Count

### CONTENT
- Spawn Enemy Definition
- Trigger Encounter
- Load Level
- Apply Test Upgrade

### VISUAL
- Lighting
- Bloom
- Exposure
- VFX Density
- Animation State

---

## 48. Content Sandbox

增加：

```text
?sandbox=1
```

或者独立开发页面。

允许 Agent 直接选择一个 Enemy、Ability、Level，不用每次从 Stage 1 开始玩。

---

## 49. Animation Lab

继续扩展现有 Character Lab 为正式 Animation / Character Lab。

支持：

- 选择 Character
- 选择 Animation
- 播放速度
- Loop
- 冻结帧
- Front
- Side
- Back
- 3/4
- Gameplay Camera

---

## 50. VFX Lab

增加独立 VFX Lab。

至少允许触发：

- Dash
- Slash
- Hit
- Kill
- Blood
- Camera Impact

以后 Projectile / Boss VFX 都从这里调。

---

## 51. Environment Lab

不是完整 Editor。

只需要允许：

- 固定 Camera
- Day / Night Profile
- Rain Density
- Lighting
- Fog
- Post FX

用于 Visual Critic 对比。

---

## 52. 性能架构保护

Phase 2A 不能因为重构显著退化。

### 1080p Worst Case
不得比当前基线平均 GPU / Frame Time 恶化超过约 10%。

### Draw Calls
同等场景不得无原因明显上涨。

### Memory
不允许持续增长。

---

## 53. Performance Budget Registry

建立开发预算：

```text
Characters
VFX
Environment
Projectiles
Corpses
Decals
```

实时 Debug 可查看：

- Active Count
- Pool Usage
- Draw Calls
- Triangles
- Textures

---

## 54. Quality Tier 正式化

High：保留当前最高质量。

Compatibility：仍然必须视觉完整。

以后所有新系统都必须声明：

```text
High Behavior
Compatibility Behavior
```

例如未来 Projectile，Compatibility 可以减少 Trail、Particle、Light，但 Danger Telegraph 必须存在。

---

## 55. WebGPU 暂时只做 Spike

Phase 2A 不迁移 Renderer。

现有 WebGL/Three.js 继续作为 Production Path。

可以独立建立：

```text
experiments/webgpu
```

验证：

- TSL
- WebGPURenderer
- GPU Particle
- Advanced PostFX

只有出现明确收益，再另开 Migration PRD。

不要混进本轮主分支重构。

---

## 56. `main.ts` 需要瘦身

当前 `main.ts` 承担 Renderer、Scene、Characters、Events、VFX、HUD、Input、Simulation Integration、Debug。

Phase 2A 应将它变成 Bootstrap。

目标：

```ts
createRenderer()
createGameRuntime()
createPresentationRuntime()
createInputRuntime()
createDebugRuntime()

startGameLoop()
```

不要为了追求某个行数强制拆。

但 `main.ts` 不应该继续成为未来所有玩法和展示系统的集成中心。

---

## 57. `game.ts` 也要开始拆

拆分原则：

```text
GameState
GameLoop
PlayerAction
EnemyMovement
CombatResolution
StageRuntime
```

Public API 尽量保持兼容。

例如：

```ts
createGame()
advanceGame()
stepGame()
queueDash()
```

可以内部代理，减少一次性风险。

---

## 58. Migration 必须 Incremental

禁止：

```text
delete old architecture
↓
rewrite everything
↓
hope it works
```

正确：

```text
Add new interfaces
↓
Wrap existing implementation
↓
Move one system
↓
Regression
↓
Move another
↓
Regression
```

---

## 59. 推荐迁移顺序

### Step 1
建立 `content / entities / presentation` 基础目录，不改变行为。

### Step 2
`StageDefinition → LevelDefinition + EncounterDefinition Adapter`

现有三关行为必须完全相同。

### Step 3
EnemyState 引入 `DefinitionId + Behavior Strategy`

继续只使用 DirectChase。

### Step 4
Player Ability Slot。

把现有 Dash 包装成 `primary`，Gameplay 结果不变。

### Step 5
Event 2.0。

把现有 VFX / Audio 事件切换过去。

### Step 6
Presentation Registry。

### Step 7
Character Provider。

程序角色作为 Provider A，GLB Loader 作为 Provider B。

### Step 8
Animation Controller。

### Step 9
VFX / Audio Registry。

### Step 10
Seeded RNG / RunState / Replay。

---

## 60. 不允许出现的重构结果

以下任意一项发生，Phase 2A 不通过：

- Dash 手感变化
- 输入响应变慢
- 一条线漏杀敌人
- Recovery 行为变化
- 敌人现阶段追击路线发生明显变化
- 死亡重开变慢
- 当前三关无法完成
- VFX Timing 被破坏
- 视觉表现因为重构明显下降
- Performance 明显下降
- 代码量反而增加大量无意义 Framework

---

## 61. Architecture Acceptance

### Test Enemy
加入一个新的 Test Enemy Definition，不修改 Core Game Loop。

只新增：

- Definition
- Behavior / Presentation Registration

即可生成。

### Test Ability
加入一个 Test Ability，不修改 PlayerState interface 的核心结构。

只注册：

- AbilityDefinition
- Execution

### Test Upgrade
加入一个 Test Upgrade，不修改 Dash implementation。

通过 Modifier / Hook 改变测试参数。

这些通过以后，架构扩展性才算成立。

---

## 62. Character Pipeline Acceptance

必须可以：

1. 加载一个任意合规测试 GLB
2. 创建 Character
3. 播放 AnimationClip
4. 切换：

```text
Idle → Action → Recovery
```

然后恢复使用现有程序角色。

两套 Provider 均可工作。

---

## 63. Level Architecture Acceptance

将现有 Stage 1 完全通过：

```text
LevelDefinition
+
EncounterDefinition
+
SpawnDefinition
```

运行。

然后再迁移 Stage 2、3。

迁移前后：

- Enemy Count
- Spawn Position
- Speed
- Gameplay Timing

完全一致。

---

## 64. Replay Acceptance

固定 Seed。

记录一段完整 Stage 1 Input Log。

重新加载并回放。

最终：

- Kills
- Player State
- Enemy State
- Stage Clear Tick

一致。

---

## 65. Visual Regression

固定输出：

- Idle
- Dash
- 3 Kill
- 5 Kill
- Death
- Full Arena

和当前 `main` 对比。

原则：

> **Refactor cannot make the game uglier.**

---

## 66. Animation 质量这一阶段的目标

Phase 2A 不要求一次性完成最终 Character Animation。

但是必须做到：

> 项目已经摆脱“只能依赖代码旋转关节”的技术限制。

最终 Production Path 必须支持：

```text
Skinned Character + AnimationClip
```

同时保留：

```text
Procedural Additive Motion
```

---

## 67. 视觉资产策略

当前程序生成场景不要马上删除。

它们是非常有效的：

- Fallback
- Benchmark
- Style Reference

正式资产逐步接管。

建议优先：

1. Hero
2. Enemy
3. Ground Material
4. Hero Environment Object

不要一轮把全部换掉。

---

## 68. 文档

新增：

```text
docs/architecture/

GAMEPLAY_DOMAIN.md
CONTENT_SYSTEM.md
ABILITY_SYSTEM.md
PRESENTATION_BOUNDARY.md
CHARACTER_PIPELINE.md
ANIMATION_PIPELINE.md
LEVEL_PIPELINE.md
PERFORMANCE_BUDGET.md
```

不是写空文档。

要记录：

- 真实代码路径
- 实际接口
- 扩展示例

---

## 69. Agent Progress

现有：

```text
AGENT_PROGRESS.md
```

继续使用。

每完成一个 Migration Step，记录：

```text
Changed
Why
Compatibility
Tests
Known Issues
```

不允许最后一次性补进度。

---

## 70. Git 策略

建议新分支：

```text
agent/phase2a-foundation
```

重大迁移独立 Commit：

```text
refactor: introduce content definitions
refactor: add enemy behavior registry
refactor: wrap dash as primary ability
refactor: formalize gameplay events
feat: add gltf character provider
feat: add deterministic replay
```

方便任何单步回滚。

---

## 71. Agent 执行纪律

允许使用 Sub-agents。

推荐拆分：

- Architecture Agent
- Gameplay Migration Agent
- Character Pipeline Agent
- Animation Agent
- Presentation/VFX Agent
- Performance Agent
- Regression Agent

但最终必须由 Lead Agent 统一 Integration。

不要让不同 Agent 各自发明不同 Registry / Event / Definition 模式。

---

## 72. 独立 Architecture Critic

除 Visual Critic 外，本轮增加 Architecture Critic。

它不写代码，只检查：

- 是否过度设计
- 是否真正减少未来修改成本
- 是否引入双重架构
- 是否出现 God Object
- 是否出现循环依赖
- 是否 Presentation 泄漏进入 Gameplay
- 是否 Test Ability / Enemy 真能以低成本接入

---

## 73. Architecture Critic 必须回答的问题

每轮至少回答：

> 新增一种 Enemy，需要改哪些文件？

> 新增一种 Ability，需要改哪些文件？

> 新增一个 Upgrade，需要改哪些文件？

> 新增一个 Level，需要改哪些文件？

> 替换 Hero GLB，需要改 Gameplay 吗？

> 替换 Dash VFX，需要改 Gameplay 吗？

> 添加 Projectile 以后，是否需要改现有 Dash？

如果答案大量出现：

```text
需要改核心 game.ts
```

则架构仍未完成。

---

## 74. Phase 2A Definition of Done

只有同时满足以下条件才允许宣布完成：

- 现有三关完整可玩
- 现有 Dash Gameplay 行为完全保留
- 现有自动验收继续通过
- 新的 Data-driven Content 基础完成
- EnemyDefinition / Behavior 完成
- Ability Slot / AbilityDefinition 完成
- Modifier / Upgrade Hook 基础完成
- Projectile / Obstacle / Hazard Domain 占位完成
- Level / Encounter / Spawn 体系完成
- Seeded RNG 完成
- Replay 基础完成
- Gameplay Event 2.0 完成
- Presentation Registry 完成
- GLB Character Provider 完成
- Animation Controller 完成
- 现有程序角色继续可以运行
- VFX / Audio 和 Gameplay 解耦
- 性能无显著退化
- Visual Regression 无显著退化
- Architecture Critic 通过

---

## 75. 本阶段最重要的原则

不要为了“未来可能有 100 个系统”提前设计 100 个系统。

只建立现在已经可以确定的：

> **稳定边界**

我们现在可以确定：

- 未来一定会有不止一种敌人
- 一定会有不止一种攻击
- 一定会有障碍物
- 一定会有更多关卡
- 大概率有 Projectile
- 大概率有 Roguelike Upgrade
- 一定会升级角色与动画质量

所以这些边界现在值得建立。

至于：

- 具体技能是什么
- 技能之间怎样组合
- Boss 到底怎么打
- 远程敌人究竟怎么射

这些都不要在 Phase 2A 偷偷替用户决定。

---

# 最终阶段定义

Phase 2A 不是“增加玩法”的版本。

它是一个：

> **Expansion Foundation / Production Architecture Pass**

完成后，Project SlASH 应从“一个被打磨得很好的 Vertical Slice”升级为：

> **一个可以持续加入正式游戏内容，而不用不断破坏核心系统的可扩展游戏工程。**

核心原则始终不变：

> **Do not rewrite what already works. Build stable boundaries around it, preserve the current feel, and make every future feature cheaper and safer to add.**