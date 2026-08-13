# Project SlASH — Agent Progress

更新时间：2026-08-13

## 当前版本

- 当前唯一目标：Redesign V2.1。
- 当前分支：`codex/v2-redesign`。
- 正式入口：`src/main.ts` → `src/redesign/application.ts`。
- 本地开发地址：`http://127.0.0.1:4177/`。
- 唯一产品、验收和架构事实源：
  - `docs/REDESIGN_V2_PRD.md`；
  - `docs/REDESIGN_V2_ACCEPTANCE.md`；
  - `docs/architecture/REDESIGN_V2_BOUNDARIES.md`。

## 已完成

- [x] 启动页默认停留；开始后直接进入战斗。
- [x] 标准局固定为 3 章 × 3 战，共 9 战、3 个 Boss、8 次三选一。
- [x] 正式技能池只有宽刃、折射、交叉处决、残响斩、杀意；每局最多 4 个家族，每个最高 3 级。
- [x] Gameplay Arena 为 64m × 40m；遭遇出生范围覆盖至少 70%。
- [x] 视觉高台为 768m × 512m；正常构图不露外部世界，不用常亮方框标记活动区域。
- [x] 主角为三棱体，尖角持续朝向鼠标；Idle / Move / Aim / Dash / Hit / Death 均有姿态变化。
- [x] 普通敌人一击必杀；五类敌人具备冲锋、射击、旋转、分裂和真实跳跃砸地。
- [x] 三个 Boss 为棱镜猎犬、魔方堡垒、奇点王冠；分别拥有 8 / 12 / 16 点生命和同源血条。
- [x] 魔方堡垒空伴随、伴随全死亡与核心阶段切换均可继续扣血；核心生命归零立即胜利。
- [x] 引导为真实击杀宽度的带状区域；折射预览显示入射段、碰撞/法线和完整反射段。
- [x] 切割使用电光切面和几何碎片；正式路径无血液、肉块、断肢、刀或武器插槽。
- [x] Player / Enemy / Boss / Boss Part / Projectile 均有显式高度、垂直速度、重力、支撑和落地事实。
- [x] 模块化 Provider 已拆分为角色/敌人/Boss/障碍/射弹、环境和 VFX；Gameplay 不依赖 Three.js。
- [x] Save/Continue 和 Replay 独立版本化；Checksum、状态边界和 Offer 可重建性受验证，旧/损坏原文保留。
- [x] 旧 V5R/GLB、武器/尸体、27 技能树、四个旧 Boss、旧 UI、旧验证与无用依赖已从工作树删除；可从 Git 历史恢复。

## 当前验证

- V2.1 全量测试：5 文件 / 22 项通过。
- 完整局：真实输入命令完成 9 战、8 次奖励、3 个多段生命 Boss；总 Boss 伤害 36，Replay Hash Match。
- TypeScript 与 Production Build：通过；仅 Three.js 核心 chunk 保留体积提示。
- 生产残留扫描：通过；旧路径、旧源码、旧模型和禁用视觉引用均为 0。
- 真实浏览器整体验收：1440×900 与 390×844 两种画幅通过，2 个 Viewport / 0 Issue / 0 页面溢出 / 0 Console Error。
- 浏览器覆盖：启动页静止、真实 64m × 40m 坐标、768m × 512m 高台、三棱体主角、场地广域出生、带状预览和模块化视觉 Provider。
- 当前验证证据输出到 `/tmp/project-slash-v2.1-browser`，不污染项目工作树。

## 未解决问题

- 当前几何视觉已经替换旧人形系统，但仍需要用户进行最终主观审美验收；自动化不能代替审美签核。
- 音效暂未进入 V2.1 精简范围；当前无假音效按钮或失效音频入口。
- Three.js 核心构建 chunk 大于 500KB，属于已知依赖体积提示，不影响当前加载正确性。

## 下一步

1. 用户在 `http://127.0.0.1:4177/` 进行最终主观视觉与手感验收。
2. 后续视觉迭代继续只替换 Primitive / Environment / VFX Provider，不回填旧人形、旧刀具或旧场景系统。

## 编辑锁

- 无；本阶段代码已完成并进入交付。
