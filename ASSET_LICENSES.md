# Project Slash — Asset and Dependency Licenses

更新时间：2026-08-12

## Runtime art and audio

Phase 2A 当前运行版本没有导入第三方商业游戏提取内容；新增两份由本项目原创概念图生成的第一方角色候选。

- `public/models/characters/hero-v5-rigged.glb`：依据本项目原创 Hero V5 三视图通过 Tripo API 生成并自动绑定；模型和三张内嵌贴图仅用于本项目。SHA-256：`7f6bbfa6a33cfd7e9a361f79a652fb2214f88afc0b2c565d673c48476420f4de`。
- `public/models/characters/enemy-v5-rigged.glb`：依据本项目原创 Enemy V5 三视图通过 Tripo API 生成并自动绑定；模型和三张内嵌贴图仅用于本项目。SHA-256：`4a90edbed731599ce1918132136d568db7d44a78b97621bce31efc77b790905a`。
- `public/models/characters/hero-v5r-rig-v25.glb`：依据本项目原创 Hero V5R 四视图，通过用户授权的 Tripo API 生成并使用 Rig v2.5 绑定；静态任务 `7f067cd3-0125-4787-ada2-0761e4a5bf6e`，Rig 任务 `4be361db-7c64-4c9c-a864-f80de37c4514`。SHA-256：`cb0a5646b919bfc8107ffd393a270c5896e6edf98807afb455075a073fdbf605`。
- `public/models/characters/enemy-v5r-rig-v25.glb`：依据本项目原创 Enemy V5R 四视图，通过用户授权的 Tripo API 生成并使用 Rig v2.5 绑定；静态任务 `869b0a04-3a94-44c8-922e-2ccc399c674c`，Rig 任务 `167728d3-05e6-4410-8dd9-a268a970bdfa`。SHA-256：`d0bb3d52e14770938310ca4aff1f8505d2608f435f9d468c615c86ae7a639465`。
- 四份 GLB 均来自本项目自有概念输入与用户授权生成流程，不含游戏提取资产。旧 V5 GLB 没有内置 `AnimationClip`；V5R 生产动作由本项目代码生成正式 `THREE.AnimationClip`，拒绝的 Tripo 预设动作不打包进入运行时。生成资产的对外使用仍应遵守生成账户对应的 Tripo 服务条款。
- 主角、敌人、武器、Arena、城市、列车、雨、蒸汽、血液、切割、尸体、材质与程序化纹理由本项目代码原创生成。
- 环境声、Dash、命中与死亡声音由本项目 Web Audio 代码实时合成。
- `art/concepts/` 与 `art/characters/concepts/` 是为本项目生成的内部概念基准，不会作为预渲染画面冒充实时游戏，也不直接打包为运行时画面资产。
- 如果后续加入外部模型、贴图、动画、音频或字体，必须在本文件逐项记录作者、原始链接、许可证、修改方式和是否需要署名；许可证未确认前不得进入生产构建。

## Runtime dependencies

| Package | Locked version | License | Use |
|---|---:|---|---|
| `three` | 0.185.1 | MIT | WebGL rendering, math and post-processing |
| `lil-gui` | 0.21.0 | MIT | Hidden local tuning panel |
| `meshoptimizer` | 1.1.1 | MIT | Runtime-safe character LOD index simplification |

## Development dependencies

| Package | Locked version | License | Use |
|---|---:|---|---|
| `@types/three` | 0.185.4 | MIT | TypeScript definitions |
| `playwright` | 1.62.1 | Apache-2.0 | Real-browser validation and evidence capture |
| `typescript` | 7.0.2 | Apache-2.0 | Type checking |
| `vite` | 8.2.1 | MIT | Development and production build |

具体依赖树及完整许可证文本以 `package-lock.json` 和各包内的 `LICENSE` 文件为准。
