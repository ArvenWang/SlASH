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

- `src/game/`：确定性玩法状态与关卡逻辑；
- `src/characters/`：角色几何、姿态、动画与尸体系统；
- `src/scene/`：竞技场、列车、城市、雨雾与环境响应；
- `src/vfx.ts`：Dash、命中、血液和镜头反馈；
- `art/`：正式视觉概念与角色多视图输入；
- `docs/`：验收标准和角色美术规范；
- `validation/tools/`：可复用的真实浏览器验证工具。

## 视觉状态

当前版本使用项目内原创的程序化多面几何角色，并已完成低位蓄势、冲跑相位差、薄型全发光刀和战场可读性调整。

更高精度的生成式角色资产仍是后续美术里程碑。Tripo 多视图输入和本地 GLB 检查台已经准备完成，但候选模型尚未生成或接入；仓库不会将这一项描述为已完成。

## 验证

```bash
npm run check
npm run build
npm run verify:gameplay
```

详细门槛见 [验收标准](docs/ACCEPTANCE_STANDARD.md)。大型截图、视频和性能证据保留在本地工作区，不提交到 Git 仓库；可复用脚本与精简审计结果会随源码提交。
