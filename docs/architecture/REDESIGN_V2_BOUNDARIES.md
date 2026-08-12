# Redesign V2 Architecture Boundaries

> 状态：当前重构边界  
> 更新日期：2026-08-13  
> 目标：复用已经稳定的战斗内核，把技能获取、玩家流程、场景和角色物理分别做成可替换模块。

## 1. 目标数据流

```text
Seed + Run State
  → Run Director（后台自动选关）
  → Encounter / Boss Gameplay
  → Reward Draft（确定性三候选）
  → Player Choice（一次性命令）
  → Owned Skills / 现有 Gameplay Hooks
  → 下一次 Run Director 决策

Gameplay State / Events
  → Presentation Registry
      → Character Provider（V2 几何体，未来可换模型）
      → Environment Provider（V2 干净高台，未来可换场景）
      → HUD / Reward Presenter
  → Three.js Renderer
```

## 2. 模块职责

| 模块 | 负责 | 不负责 |
| --- | --- | --- |
| Skill Catalog | 稳定 ID、规则、Hook、候选标签、玩家短文案 | DOM、随机抽取、页面布局 |
| Reward Draft | 根据确定输入生成 3 个合法候选，处理一次性选择 | 画卡片、决定战斗伤害 |
| Run Director | 后台选择下一节点，维持节奏、确定性和 Boss 可达 | 向玩家展示地图或让玩家选路 |
| Campaign Orchestrator | Title / Combat / Upgrade Choice / Victory / Defeat 生命周期 | 具体技能算法、Three.js、场景 Mesh |
| Campaign UI | 极简页面与输入转译 | 技能合法性、随机结果、选关逻辑 |
| Environment Provider | 创建、更新、释放视觉高台和场景材质 | Arena 碰撞、Spawn、过关规则 |
| Character Provider | 创建可替换外观，消费标准运动输入 | 改写 Gameplay 位置、命中或死亡 |
| Vertical Physics | 高度、垂直速度、重力、支撑与坠落 | Mesh、骨骼、材质和镜头抖动 |
| Camera Fit | 根据 Arena 与画幅计算相机 | 修改 Arena 尺寸或 Gameplay 边界 |

## 3. 推荐代码边界

```text
src/content/upgrades/
  skill-catalog.ts              # 完整内部规则
  skill-player-copy.ts          # 单语言短文案
  reward-pool.ts                # 权重、稀有度、保底配置

src/game/rewards/
  types.ts
  reward-draft-system.ts        # 纯函数、确定性、无 DOM

src/game/run/
  run-director.ts               # 包装现有 Route Graph，自动选择

src/game/campaign/
  campaign-system.ts            # 只编排阶段和命令

src/runtime/
  campaign-ui-runtime.ts        # Title / Upgrade Choice / Victory / Defeat

src/presentation/characters/
  character-provider.ts         # 稳定 Provider 合同
  primitive-provider.ts         # 三角主角、方形敌人
  motion-presenter.ts           # 倾斜、压缩、预警等纯表现

src/presentation/environments/
  environment-provider.ts       # 稳定 Provider 合同
  clean-arena-provider.ts       # V2 高台实现

src/game/physics/
  vertical-physics-system.ts    # 后续真实重力
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
- Environment Provider 不得创建或修改 Gameplay Collision、Encounter Spawn 或 Route State。
- 不在旧 `presentation-runtime.ts`、`campaign-ui-runtime.ts` 和 `environment.ts` 中继续增加大段条件分支；迁移后旧路径应停止装配。
- 不删除旧 GLB 和场景文件来冒充迁移完成；完成标准是正式 Registry 和生产 Bundle 不再引用它们。
- 不保留“双轨正式 UI”。旧 Planning/Tree/Map 只能作为历史代码等待移除，不能由隐藏入口继续成为生产功能。

## 6. 状态与版本迁移

- Campaign V2 目标阶段：`title | combat | upgrade-choice | defeat | victory`。
- Event / Forge / Planning / Reward 不再是玩家可进入的正式阶段。
- `UpgradeChoiceState` 至少包含：`rewardIndex`、`candidateSkillIds[3]`、`selectedSkillId`、`sourceEncounterId`、`poolVersion`。
- Route Graph 继续保存在内部 Run State；玩家 Save 不需要保存“暂定路线”，但必须保存 Director 已做出的决定和下一奖励序号。
- Replay 增加明确命令：自动节点决策事实、三候选生成事实、技能选择命令。
- V1 存档不做静默近似迁移。若无法无损转换，应明确提示版本不兼容，并保留原始数据。

## 7. 迁移顺序

1. 新增 Reward Draft 与 Run Director，先保持旧 UI 不调用新路径。
2. 用定向测试证明候选确定、合法、一次性且技能真实生效。
3. 将 Campaign 阶段切换到 V2，并让新极简 UI 成为唯一玩家入口。
4. 更新 Save / Replay；删除旧 UI 和保护旧流程的测试。
5. 新增 Environment Provider 合同，接入 Clean Arena，停止装配 Transit/City/Weather。
6. 新增 Vertical Physics，再接入 Primitive Character Provider。
7. 当所有生产引用和资产清单确认无旧路径后，才清理 V5R / 旧场景死代码与资源。

## 8. 模块化替换验收

- 替换技能卡样式不修改 Reward Draft、Skill Hook 或 Replay。
- 替换三角形/方形外观不修改 Player、Enemy、Ability 或 Encounter 规则。
- 替换高台材质或完整 Environment Provider 不修改 Arena、Spawn 或 Collision。
- 未来重新使用 GLB 时，只新增 Character Provider 和 Registry 映射；不得再次把骨架、武器插槽或 Clip 名写进 Gameplay。
