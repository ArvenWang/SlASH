# Redesign V2.1 Architecture Boundaries

> 状态：当前重构边界
>
> 更新日期：2026-08-14
> 目标：保留确定性战斗内核，把五技能短局、几何角色、敌人/Boss、垂直物理和特效分别做成可替换模块，并彻底退出旧双轨路径。

## 1. 目标数据流

```text
Seed + Run State
  → Run Director（后台自动选关）
  → Encounter / Boss Gameplay
  → Reward Draft（确定性三候选）
  → Player Choice（一次性命令）
  → 4 Slot Build / Ranked Gameplay Hooks
  → 下一次 Run Director 决策

Gameplay State / Events
  → Presentation Registry
      → Character Provider（主角 / 敌人 / Boss 几何体，未来可换模型）
      → Environment Provider（V2 连续场地，未来可换场景）
      → VFX Provider（电光切割 / 几何碎片）
      → HUD / Reward Presenter
  → Three.js Renderer
```

## 2. 模块职责

| 模块 | 负责 | 不负责 |
| --- | --- | --- |
| Core Skill Catalog | 5 个家族、Rank 1–3、稳定 ID、Hook、玩家短文案 | DOM、随机抽取、页面布局 |
| Reward Draft | 根据确定输入生成 3 个不同家族的合法下一 Rank，处理 4 槽与一次性选择 | 画卡片、决定战斗伤害 |
| Run Director | 后台选择下一节点，维持节奏、确定性和 Boss 可达 | 向玩家展示地图或让玩家选路 |
| Campaign Orchestrator | Title / Combat / Upgrade Choice / Victory / Defeat 生命周期 | 具体技能算法、Three.js、场景 Mesh |
| Campaign UI | 极简页面与输入转译 | 技能合法性、随机结果、选关逻辑 |
| Environment Provider | 创建、更新、释放连续视觉地表和场景材质 | Arena 碰撞、Spawn、过关规则 |
| Character Provider | 创建可替换外观，消费标准运动输入 | 改写 Gameplay 位置、命中或死亡 |
| Enemy Gameplay | 一击必杀、AI、射击、分裂、旋转和砸地 | Mesh、材质、骨骼和 Boss 生命 |
| Boss Gameplay | 多段生命、伤害表、阶段、核心窗口和立即胜利 | Mesh、血条 DOM、子节点数量和动画回调 |
| Vertical Physics | 高度、垂直速度、重力、支撑、跳跃与坠落 | Mesh、骨骼、材质和镜头抖动 |
| VFX Provider | 电光路径、切面、碎片、预警的视觉生命周期 | 命中判定、伤害、清场规则 |
| Camera Fit | 根据 Arena 与画幅计算相机 | 修改 Arena 尺寸或 Gameplay 边界 |

## 3. 推荐代码边界

```text
src/content/upgrades/
  core-skill-catalog-v2.ts      # 5 家族 × 3 Rank 的唯一正式规则
  reward-pool-v2.ts             # 单语言短文案、稳定候选池

src/game/rewards/
  types.ts
  reward-draft-system.ts        # 纯函数、4 槽、逐级、确定性、无 DOM

src/game/run/
  run-director.ts               # 3 章 × 3 战的后台顺序

src/game/campaign/
  campaign-system.ts            # 只编排阶段和命令

src/runtime/
  campaign-ui-runtime.ts        # Title / Upgrade Choice / Victory / Defeat

src/presentation/characters/
  character-provider.ts         # 稳定 Provider 合同
  primitive-provider.ts         # Cursor 飞船楔体主角、五类敌人、三个 Boss
  motion-presenter.ts           # 倾斜、压缩、预警等纯表现

src/presentation/environments/
  environment-provider.ts       # 稳定 Provider 合同
  clean-arena-provider.ts       # V2 连续场地实现

src/game/physics/
  vertical-physics-system.ts    # Player / Enemy / Boss 统一真实重力

src/presentation/vfx/
  geometric-combat-vfx.ts       # 电光切面、路径带与几何碎片
```

目录名称可在实现时按现有结构调整，但职责不能重新揉回 `game.ts`、`campaign-ui-runtime.ts` 或单一大型 `environment.ts`。

## 4. 允许依赖

```text
Content ← Gameplay ← Runtime
Content ← Presentation ← Runtime
Gameplay State/Event → Presentation
```

- Gameplay 可以读取 Content Definition。
- Runtime 可以装配 Gameplay 与 Presentation。
- Presentation 可以读取 GameState 和消费 GameEvent。
- Reward Draft 和 Run Director 必须可以在 Node 环境独立运行。

## 5. 禁止依赖与禁止做法

- `src/game/`、`src/content/` 不得导入 Three.js、DOM、Audio、Runtime、Scene 或具体 Provider。
- UI 不得自行抽随机数、判断技能前置、发放技能或决定下一关。
- Presentation 不得把角色高度重新强制为常数，不得改写命中、无敌、死亡或过关。
- Character Provider 不得依赖具体 Skill ID；只消费标准化状态和表现事件。
- 可视引导路径、实际 Dash 路径和 Replay 路径必须来自同一个 Gameplay Path Result，不得分别计算。
- Boss 的核心可攻击性和胜利只由 Gameplay 状态决定，不得依赖 Mesh、子节点数量或动画完成回调。
- 240m × 144m Gameplay Arena 是 Content/Gameplay 事实；Camera 和 Environment 只读取，不能用缩放或视觉平面反向伪造逻辑尺寸。
- Boss 血条只读取 `currentHp / maximumHp`；UI 不缓存、预测或自行扣除 Boss 生命。
- Environment Provider 不得创建或修改 Gameplay Collision、Encounter Spawn 或 Route State。
- 不在旧 `presentation-runtime.ts`、`campaign-ui-runtime.ts` 和 `environment.ts` 中继续增加大段条件分支；迁移后旧路径应停止装配。
- V2.1 正式路径稳定后，删除无引用的 GLB、V5R、武器、断肢、旧 Boss 和旧技能实现；不能保留隐藏的第二套正式系统。
- 不保留“双轨正式 UI”。旧 Planning/Tree/Map 只能作为历史代码等待移除，不能由隐藏入口继续成为生产功能。

## 6. 状态与版本迁移

- Campaign V2 目标阶段：`title | combat | upgrade-choice | defeat | victory`。
- Event / Forge / Planning / Reward 不再是玩家可进入的正式阶段。
- `UpgradeChoiceState` 至少包含：`rewardIndex`、`candidateUpgradeIds[3]`、`selectedUpgradeId`、`sourceEncounterId`、`poolVersion`。
- Build 状态按 5 个稳定家族保存 Rank；装备家族数不得超过 4，每个 Rank 不得超过 3。
- Route Graph 继续保存在内部 Run State；玩家 Save 不需要保存“暂定路线”，但必须保存 Director 已做出的决定和下一奖励序号。
- Replay 增加明确命令：自动节点决策事实、三候选生成事实、技能选择命令。
- V1 存档不做静默近似迁移。若无法无损转换，应明确提示版本不兼容，并保留原始数据。

## 7. 迁移顺序

1. 新增 Reward Draft 与 Run Director，先保持旧 UI 不调用新路径。
2. 用定向测试证明候选确定、合法、一次性且技能真实生效。
3. 将 Campaign 阶段切换到 V2，并让新极简 UI 成为唯一玩家入口。
4. 更新 Save / Replay；删除旧 UI 和保护旧流程的测试。
5. 新增 Environment Provider 合同，接入 Clean Arena，停止装配 Transit/City/Weather。
6. 新增 Vertical Physics，接入 Primitive Character Provider、五类敌人和三个 Boss。
7. 接入 Geometric VFX；确认生产引用和资产清单后清理 V5R、武器、Gore、旧 Boss 与旧技能代码/资源。

## 8. 模块化替换验收

- 替换技能卡样式不修改 Reward Draft、Skill Hook 或 Replay。
- 替换三角形/方形/多面体外观不修改 Player、Enemy、Boss、Ability 或 Encounter 规则。
- 替换连续地表材质或完整 Environment Provider 不修改 Arena、Spawn 或 Collision。
- 替换电光/碎片样式不修改 Dash Path、命中宽度、伤害或 Replay。
- 未来重新使用 GLB 时，只新增 Character Provider 和 Registry 映射；不得再次把骨架、武器插槽或 Clip 名写进 Gameplay。
