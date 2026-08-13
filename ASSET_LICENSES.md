# Project SlASH — Asset and Dependency Licenses

更新时间：2026-08-13

## 运行时视觉资产

Redesign V2.1 不加载外部模型、贴图、动画、字体、音频或商业游戏提取内容。

- 主角、五类敌人、三个 Boss、障碍和射弹由本项目代码使用 Three.js 基础几何体实时生成。
- 高台、地面细节、路径引导、电光切面和几何碎片由本项目代码实时生成。
- 当前生产构建不包含 GLB、Tripo 生成物、人形骨骼、刀具、血液、尸体或预渲染概念图。
- 后续若引入外部资产，必须先在本文件逐项记录作者、来源、许可证、修改方式、署名要求和生产用途；许可证未确认的资产不得进入生产构建。

## 运行时依赖

| Package | Locked version | License | Use |
|---|---:|---|---|
| `three` | 0.185.1 | MIT | WebGL 渲染、几何、材质、灯光与后处理 |

## 开发依赖

| Package | Locked version | License | Use |
|---|---:|---|---|
| `@types/three` | 0.185.4 | MIT | Three.js TypeScript 类型 |
| `playwright` | 1.62.1 | Apache-2.0 | 真实浏览器验收与截图 |
| `typescript` | 7.0.2 | Apache-2.0 | 类型检查 |
| `vite` | 8.2.1 | MIT | 开发服务器与生产构建 |
| `vitest` | 4.1.10 | MIT | 规则和完整局自动化测试 |

具体依赖树及完整许可证文本以 `package-lock.json` 和各依赖包内的许可证文件为准。
