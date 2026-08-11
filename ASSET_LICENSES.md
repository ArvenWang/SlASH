# Project Slash — Asset and Dependency Licenses

更新时间：2026-08-10

## Runtime art and audio

Phase 2A 当前运行版本没有导入第三方商业游戏提取内容；新增两份由本项目原创概念图生成的第一方角色候选。

- `public/models/characters/hero-v5-rigged.glb`：依据本项目原创 Hero V5 三视图通过 Tripo API 生成并自动绑定；模型和三张内嵌贴图仅用于本项目。SHA-256：`7f6bbfa6a33cfd7e9a361f79a652fb2214f88afc0b2c565d673c48476420f4de`。
- `public/models/characters/enemy-v5-rigged.glb`：依据本项目原创 Enemy V5 三视图通过 Tripo API 生成并自动绑定；模型和三张内嵌贴图仅用于本项目。SHA-256：`4a90edbed731599ce1918132136d568db7d44a78b97621bce31efc77b790905a`。
- 两份 GLB 当前均有 Skin / Skeleton，但没有内置 `AnimationClip`；运行时使用本项目代码驱动骨骼，不将缺失动画伪装为已存在动画。
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
