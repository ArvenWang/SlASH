# Project Slash — Asset and Dependency Licenses

更新时间：2026-08-10

## Runtime art and audio

Phase 1 当前运行版本没有导入第三方角色、场景、贴图、动画、音效或从其他商业游戏提取的内容。

- 主角、敌人、武器、Arena、城市、列车、雨、蒸汽、血液、切割、尸体、材质与程序化纹理由本项目代码原创生成。
- 环境声、Dash、命中与死亡声音由本项目 Web Audio 代码实时合成。
- `art/concepts/` 与 `art/characters/concepts/` 是为本项目生成的内部概念基准，不会作为预渲染画面冒充实时游戏，也不直接打包为运行时画面资产。
- 如果后续加入外部模型、贴图、动画、音频或字体，必须在本文件逐项记录作者、原始链接、许可证、修改方式和是否需要署名；许可证未确认前不得进入生产构建。

## Runtime dependencies

| Package | Locked version | License | Use |
|---|---:|---|---|
| `three` | 0.185.1 | MIT | WebGL rendering, math and post-processing |
| `lil-gui` | 0.21.0 | MIT | Hidden local tuning panel |

## Development dependencies

| Package | Locked version | License | Use |
|---|---:|---|---|
| `@types/three` | 0.185.4 | MIT | TypeScript definitions |
| `playwright` | 1.62.1 | Apache-2.0 | Real-browser validation and evidence capture |
| `typescript` | 7.0.2 | Apache-2.0 | Type checking |
| `vite` | 8.2.1 | MIT | Development and production build |

具体依赖树及完整许可证文本以 `package-lock.json` 和各包内的 `LICENSE` 文件为准。
