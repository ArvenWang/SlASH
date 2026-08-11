# Project SlASH — Full Game Glossary

> 版本：v1.0。正式内容、代码、UI、测试和验收统一使用下列术语。

| 中文 | 英文 / Code | 定义 |
| --- | --- | --- |
| 单局 | Run | 从 New Run 到 Victory / Defeat 的完整 4 Act 生命周期。 |
| 区域 | Act | Run 的大阶段；包含分支节点、内容主题和一个 Boss。 |
| 节点 | Route Node | Run Map 上一次可访问选择；不等同于 Encounter。 |
| 战斗遭遇 | Encounter | 一个节点内的战斗 Runtime，包含一个或多个 Wave。 |
| 波次 | Wave | 一组按 Activation Rule 激活的 Spawn。 |
| 普通突进 | Basic Dash | 点击目标点立即突进，是主要移动和攻击。 |
| 蓄力突进 | Charged Dash / Breach Drive | 长按后释放的贯穿动作，负责卸甲和裸露区击杀。 |
| 大招 | Ultimate / Vector Focus | 满能后多点选路并连续执行多段 Dash。 |
| 突进过程 | Dash Transit | 从 Dash 开始到到达终点的无敌移动阶段。 |
| 收招 | Recovery | Dash 结束后无法立即再次执行、且可以死亡的窗口。 |
| 输入缓冲 | Input Buffer | Transit / Recovery 中只保留最后一个合法 Ability Command。 |
| 斩击走廊 | Slash Corridor | 实际路径周围的有效碰撞宽度，不等同于视觉刀光宽度。 |
| 装甲覆盖区 | Armor Coverage | 一块看得见、碰得到、具有独立状态的护甲碰撞区域。 |
| 裸露区 | Exposed Region | 当前没有 Armor Coverage 的身体区域，可被有效 Slash 击杀。 |
| 卸甲 | Armor Break / Strip | Charged 命中 Armor Coverage 后使该部件脱落；本次接触不同时击杀。 |
| 背袭处决 | Rear Execution | Charged 命中无甲背部并直接击杀。 |
| 子弹 | Projectile | 有飞行生命周期、可被普通 Slash 抵消、不会阻挡位移的实体。 |
| 障碍物 | Obstacle | 会阻断 Dash 的 Gameplay Geometry；不是 Projectile。 |
| 危险区 | Hazard | 在 Telegraph 后进入 Active、对非无敌玩家致命的区域。 |
| 折射 | Refraction | Dash 第一次撞可折射 Obstacle 时按碰撞法线反射并继续。 |
| 旧线 | Stored Line | Cross Execution 保存的唯一上一条实际路径。 |
| 交叉处决 | Cross Execution | 新路径与 Stored Line 交叉时在首个交点触发并清空两线。 |
| 残响 | Echo Slash | 延迟回放实际路径的斩击；玩家不移动，不新建 Stored Line。 |
| 技能点 | Skill Point / SP | 单局资源，保证 10、上限 12；所有可购买节点 cost=1。 |
| 本轮预览 | Allocation Preview | 当前安全节点中尚未 Commit 的技能修改，可以免费撤销。 |
| 已提交技能 | Owned Skill | 离开安全节点后锁定的本局技能；只可在 Forge 重接。 |
| 重接 | Forge Reroute | Forge 中移动最多 2 个已提交点，不增加总点数。 |
| 威胁标签 | Threat Tag | 路线预览中的 Armor / Projectile / Obstacle / Hazard / Elite 等事实标签。 |
| 压力成本 | Pressure Cost | Encounter 组合验证用的相对压力预算，不直接显示给玩家。 |
| 预警 | Telegraph | 攻击进入致命 Active 前可观察、固定时长的准备阶段。 |
| 激活 | Active | 攻击、Hazard 或 Spawn 当前已经对规则产生作用的阶段。 |
| 断点 | Boss Break | 完成 Boss 一个明确阶段目标，不代表传统 HP 伤害。 |
| 完整性 | Integrity | 玩家生命语义；Standard 默认 1，非 Dash Transit 被致命命中即 Defeat。 |
| 辅助协议 | Assist Protocol | 可选可访问性规则；与 Standard 记录分开，不改变核心攻击结果。 |
| 威胁协议 | Threat Protocol | 首次通关后解锁的公开难度 Modifier。 |

## 禁用术语

- 不把 Obstacle 称为 Bullet / Projectile。
- 不把 Armor Phase 称为 Armor Break；它只允许 Basic 穿过，不伤害、不卸甲。
- 不把 Cross 冲击、Impact Burst 和 Breach Shock 全部称为“爆炸”；三者必须有独立事实名称和表现。
- 不把 Definition 存在称为“机制完成”；只有完整 Runtime Lifecycle 才能计入完成数量。
- 不把自动化 WebKit 称为“真人 Safari 验收”。
