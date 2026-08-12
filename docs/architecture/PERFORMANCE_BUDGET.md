# Performance Budget

## 目标与测量口径

性能预算用于在内容规模扩大前暴露失控的实例数、Draw Calls、内存分配和帧时间。它不是“达到预算就自动好看”，也不允许通过关闭关键反馈伪造通过。

`src/presentation/performance/budgets.ts` 的帧指标明确命名为 `visible-rAF-frame-time`。Three.js `WebGLRenderer.info` 不提供真实 GPU 耗时，因此 Debug UI 和报告不得把普通 `requestAnimationFrame` 间隔标成 GPU ms。需要真实 GPU 分析时，另用浏览器 GPU Trace、EXT_disjoint_timer_query 或平台分析工具。

## 当前分类预算

| Category | Maximum Active | 说明 |
| --- | ---: | --- |
| Characters | 21 | 1 Hero + 20 Enemies |
| VFX | 96 | 同时活跃的短时效果 |
| Environment | 1 | 当前 Level Environment Runtime |
| Projectiles | 128 | 未来 Projectile 上限入口 |
| Corpses | 20 | 当前压力场景全部敌人 |
| Decals | 28 | 持久血迹/贴花 |

这些是当前垂直切片的工程预算，不是永恒常数。正式加入弹幕、召唤物或更大关卡时，应先给出屏幕规模、设备档位和最坏场景，再有证据地调整；不能在超限后简单把数字改大。

`createPerformanceBudgetSnapshot()` 将 Gameplay 实体数、VFX Runtime、Pool 和 Renderer Diagnostics 汇总到 `render_game_to_text`，Agent 可以同时观察：

- FPS、P95、P99、Worst Visible Frame；
- Draw Calls、Triangles、Geometries、Textures；
- 各分类 Active/Budget/Status；
- 每个 Object Pool 的 Active、Available、Maximum 和 Misses。

## Object Pool

`src/core/pool/object-pool.ts` 提供有上限、可预热、可观测的通用池。正式分类为：

- Projectile；
- Blood Particle；
- Impact VFX；
- Decal；
- Temporary Mesh；
- Corpse Fragment。

Kill Impact Flash 已真实接入 Pool：预热 8、上限 24，生命周期结束后 Reset 并 Release。Pool 到上限时 `acquire()` 返回 `null` 并增加 Misses，不允许无限分配造成卡顿。

新高频对象接入要求：

1. 明确对象所有权和 Reset Contract；
2. 给出 Prewarm 与 Maximum 的依据；
3. 释放时回池，关卡/应用销毁时真正 Dispose；
4. 在压力场景检查 Misses 与视觉优先级；
5. Critical 反馈不能因 Ambient 效果占满池而消失。

## VFX 优先级与 Quality

VFX Profile 声明 `critical / important / ambient`。兼容模式可以降低环境粒子、阴影分辨率和 Bloom，但 Dash、命中、死亡和敌我可读性必须保留。未来实现全局预算仲裁时，淘汰顺序应从 Ambient 开始，并记录被抑制数量。

## 最坏场景验收

当前生产性能脚本使用可见系统 Chrome、20 Enemies、一次真实八杀 Dash，并启用雨、蒸汽、血液、尸体、Camera 和 PostFX。每个分辨率只采一次连续 60 秒原始 rAF 数据：

| Viewport | Average FPS | P95 | P99 | Worst |
| --- | ---: | ---: | ---: | ---: |
| 1920×1080 | ≥59 | 同机空白 rAF P95 + 0.5ms，且 <25ms | ≤33.4ms | ≤100ms |
| 2560×1440 | ≥55 | ≤25ms | ≤40ms | ≤120ms |

1080p 必须绑定同机、同分辨率、同启动参数的可见空白 rAF 基线。游戏 P95 相对空白页最多增加 0.5ms，同时 P95 必须仍低于 25ms，P99 和 Worst 使用 Full Game 标准的绝对门；没有基线时使用 25ms 绝对门。原始数据不平滑、不删异常帧。报告还要求压力人口正确、至少八杀、样本时长足够且浏览器无错误。

推荐命令顺序：

```bash
npm run verify:raf-baseline -- validation/performance/blank-current 30000 1920 1080
npm run verify:performance -- http://127.0.0.1:4175/ validation/performance/game-current 1920 1080 60000 validation/performance/blank-current/report.json
```

若游戏原始报告已经采集完成，可用 `npm run verify:performance-report -- <game-report> <blank-report> <output-report>` 重新按同一规则评估，不需要为了更新判定方法重复 60 秒场景。

## 变更时何时重测

只在变更可能影响对应门时重测：

- 修改 Renderer、材质数量、灯光/阴影、环境密度、VFX、尸体、Pool、角色资产或同屏规模：跑相应性能场景；
- 只改文案、Definition 显示名或文档：不重跑性能；
- 小节开发做定向检查，发布/阶段收口只做一次整体性能门。

构建中的 `>500KB` Chunk Warning 是加载与缓存风险，不等同于帧率失败。GLTF Provider 已延迟加载；后续应继续以实际首屏传输、解析和交互时间决定拆包，而不是只追求消除警告。
