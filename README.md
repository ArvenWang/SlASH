# Project SlASH

Project SlASH 是一款运行于浏览器的斜俯视 3D 几何动作游戏。玩家不使用传统摇杆移动；每次指向与冲刺同时完成移动、攻击、闪避和重新站位。

## 当前版本：Redesign V2.1

- 启动页会保持静止，玩家主动开始后才进入战斗。
- 标准局为 3 章 × 3 战：共 9 战、3 个 Boss、8 次战后三选一。
- 主角使用三棱体，尖角持续朝向鼠标；敌人、Boss、障碍和射弹统一为模块化几何体。
- 真实 Gameplay Arena 为 64m × 40m；768m × 512m 视觉高台铺满画面，不用常亮方框标记活动区域。
- 普通敌人保持一击必杀；Boss 使用 8 / 12 / 16 点生命、可攻击窗口和同源血条。
- 五个被动技能家族：宽刃、折射、交叉处决、残响斩、杀意；每局最多装备 4 个家族，每个最高 3 级。
- 切割反馈使用电光切面和几何碎片，不包含刀具、血液、肉块或断肢。
- Gameplay、角色/敌人/Boss 表现、环境和 VFX 相互解耦，后续可替换视觉 Provider 而不改战斗规则。

## 操作

- 移动鼠标：调整主角朝向和冲刺引导。
- 鼠标左键按下 / 松开：蓄力并释放冲刺；快速点击执行基础冲刺。
- `Space`：能量充满后进入三段终极冲刺规划。
- `Esc`：取消规划或暂停。
- 触屏设备使用画面输入与“终极 / 取消”按钮。

## 本地运行

需要 Node.js 20.19+ 或 22.12+。

```bash
npm install
npm run dev -- --port 4177
```

生产构建与预览：

```bash
npm run build
npm run preview -- --port 4177
```

## 项目结构

- `src/redesign/`：V2.1 唯一正式实现，包含确定性战斗、Run、技能、存档、回放、UI 和表现 Provider。
- `tests/redesign-*`：V2.1 规则、Gameplay、场景表现、存档回放与完整局验证。
- `docs/REDESIGN_V2_PRD.md`：产品规则事实源。
- `docs/REDESIGN_V2_ACCEPTANCE.md`：可执行验收标准。
- `docs/architecture/REDESIGN_V2_BOUNDARIES.md`：模块边界和替换合同。
- `AGENT_PROGRESS.md`：当前项目统一进展。

旧人形 GLB、Tripo 管线、武器/尸体、旧技能树、旧 Boss、旧场景、旧 UI 和旧验证入口已经退出工作树；如需历史对照只能从 Git 历史查看，不能重新接回正式运行路径。

## 验证

```bash
npm run check
npm test
npm run verify:full-run
npm run build
npm run verify:residue
npm run verify:browser
```

浏览器验证默认检查 `http://127.0.0.1:4177/`，证据写入系统临时目录，不污染项目工作树。
