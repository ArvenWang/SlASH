# Project Slash

Project Slash 是一个运行于浏览器的 3D 赛博朋克高速动作游戏垂直切片。

玩家没有传统移动和普通攻击。点击竞技场中的目标位置，角色会沿直线高速突刺，并斩杀路径上的全部敌人。一次输入同时完成移动、闪避、攻击和重新站位。

![Project Slash gameplay](docs/images/project-slash-gameplay.png)

## 当前内容

- 固定高位 3D 镜头与一张 Transit Cathedral 竞技场；
- 三个固定关卡，分别包含 8、12、18 名敌人；
- 无限距离直线突刺、路径多杀、突刺无敌与短 Recovery；
- 玩家与敌人均为一击致命；
- 方向性血液、腰斩分离、尸块落地、雨幕与蒸汽扰动；
- 程序化原创音频、HUD、鼠标和触控输入；
- WebGL / Three.js 渲染，支持桌面 Web，Steam 版本作为后续方向。

## 操作

- 鼠标左键或触摸：向目标位置突刺；
- `F`：切换全屏；
- `M`：静音 / 恢复声音；
- 死亡后再次点击：立即重开当前关卡。

## 本地运行

需要 Node.js 20.19+ 或 22.12+。

```bash
npm install
npm run dev
```

生产构建：

```bash
npm run build
npm run preview
```

## 项目结构

- `src/content/`：敌人、技能、升级、关卡与实体 Definition；
- `src/game/`：确定性 Gameplay Domain、行为、碰撞、事件与 Replay；
- `src/runtime/`：输入、游戏、渲染、调试与表现层装配；
- `src/presentation/`：角色 Provider、动画 Controller、视觉 Profile 与 Registry；
- `src/characters/`、`src/scene/`、`src/vfx.ts`：当前程序化角色和视觉 Runtime；
- `art/`：正式视觉概念与角色多视图输入；
- `docs/architecture/`：Phase 2A 架构、扩展流程与性能预算；
- `validation/tools/`：可复用的真实浏览器验证工具。

## 视觉状态

当前生产默认仍使用项目内原创的程序化多面几何角色。程序角色与 GLB 角色现已统一到 Character Provider 和 Animation Controller，视觉替换不再要求修改 Gameplay。

两份 Rigged GLB 已作为按需加载 Provider 接入，但原文件均没有 AnimationClip，因此当前使用自制骨骼驱动；程序角色继续作为正式回退与基准。当前整体视觉仍未获得用户签核，Phase 2A 完成的是后续重做材质、灯光、环境、VFX、角色与动作所需的生产架构，不代表画面已经合格。

架构入口见 [Phase 2A 架构总览](docs/architecture/README.md)。独立检查台包括 Animation Lab、VFX Lab、Environment Lab 与 Content Sandbox，入口文件位于 `validation/tools/`。

## 验证

```bash
npm run check
npm test
npm run build
npm run verify:gameplay
```

详细门槛见 [验收标准](docs/ACCEPTANCE_STANDARD.md)。大型截图、视频和性能证据保留在本地工作区，不提交到 Git 仓库；可复用脚本与精简审计结果会随源码提交。
