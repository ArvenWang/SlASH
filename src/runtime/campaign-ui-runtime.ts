import { threatPreviewForRouteNode } from "../content/encounters/definitions";
import { eventDefinitions } from "../content/events/definitions";
import { FULL_GAME_ACT_DEFINITIONS } from "../content/runs/definitions";
import {
  FULL_GAME_SKILL_DEFINITIONS,
  SKILL_MODULE_ROOTS,
} from "../content/upgrades/skill-tree";
import type { SkillDefinition, SkillModule } from "../content/upgrades/types";
import type {
  GameCommand,
  GameCommandDispatchResult,
  GameState,
} from "../game/domain/types";
import { availableRouteNodes, routeNodeById } from "../game/run/run-system";
import { skillAllocationSnapshot } from "../game/upgrades/skill-system";
import type { RunSaveStatus } from "./run-save-runtime";
import { BOSS_DEFINITIONS } from "../content/bosses/definitions";
import type { RunProtocolMode } from "../content/protocols/definitions";
import { ENEMY_DOSSIER_DEFINITIONS } from "../content/profile/dossier";
import { effectiveIntelDepth } from "../game/difficulty/protocol-system";
import type { ProfileSettings } from "../game/profile/types";
import type { ProfileRuntime } from "./profile-runtime";
import { rewardPoolV2EntryById } from "../content/upgrades/reward-pool-v2";

export interface CampaignUiRuntimeOptions {
  readonly root: HTMLDivElement;
  readonly gameState: GameState;
  readonly dispatch: (command: GameCommand) => GameCommandDispatchResult;
  readonly getContinueStatus: () => RunSaveStatus;
  readonly continueRun: () => { readonly ok: true } | { readonly ok: false; readonly message: string };
  readonly profile: ProfileRuntime;
  readonly validationMode?: boolean;
  readonly onSettingsChanged: (settings: Readonly<ProfileSettings>, changedKey: keyof ProfileSettings) => void;
  readonly onPauseChanged: (paused: boolean) => void;
  readonly onStateTransition: (result: GameCommandDispatchResult["result"] | "run-continued") => void;
}

export interface CampaignUiRuntime {
  update(): void;
  togglePause(): void;
  dispose(): void;
}

const MODULE_ORDER: readonly SkillModule[] = ["basic", "charged", "ultimate", "shared"];

const BRANCH_NAMES: Readonly<Record<string, string>> = {
  "basic-corridor": "走廊控制",
  "basic-geometry": "路径几何",
  "basic-collision": "障碍利用",
  "basic-path-memory": "路径记忆",
  "basic-endpoint": "落点控制",
  "basic-projectile": "弹幕反制",
  "basic-tempo": "突进节奏",
  "charged-control": "蓄力控制",
  "charged-breach": "连续破阵",
  "charged-execution": "背线处决",
  "ultimate-planning": "规划容量",
  "ultimate-synergy": "路径联动",
  "ultimate-projectile": "弹幕终式",
  "ultimate-energy": "能量循环",
  "shared-tempo": "跨模组节奏",
};

const NODE_STATUS_TEXT = {
  available: "可分配",
  draft: "本次草案",
  committed: "已锁定",
  locked: "未解锁",
} as const;

export function createCampaignUiRuntime(options: CampaignUiRuntimeOptions): CampaignUiRuntime {
  const { root, gameState, dispatch, onStateTransition } = options;
  let renderedSignature = "";
  let continueError = "";
  let titleView: "main" | "practice" | "dossier" | "settings" = "main";
  let paused = false;

  const onClick = (event: MouseEvent) => {
    const target = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-action]") : null;
    if (!target) return;
    const action = target.dataset.action;
    let result: GameCommandDispatchResult | null = null;
    if (action === "continue-run") {
      const outcome = options.continueRun();
      continueError = outcome.ok ? "" : outcome.message;
      renderedSignature = "";
      if (outcome.ok) onStateTransition("run-continued");
      update();
      return;
    } else if (action === "start-run") {
      continueError = "";
      result = dispatch({ type: "start-full-game-run" });
    } else if (action === "title-view" && target.dataset.view) {
      const requested = target.dataset.view;
      if (requested === "main" || requested === "practice" || requested === "dossier" || requested === "settings") {
        titleView = requested;
        renderedSignature = "";
        update();
      }
      return;
    } else if (action === "configure-protocol" && target.dataset.mode) {
      const mode = target.dataset.mode as RunProtocolMode;
      const threatLevel = Number(target.dataset.threatLevel ?? 0);
      result = dispatch({ type: "configure-run-protocol", mode, threatLevel });
    } else if (action === "start-boss-practice" && target.dataset.bossId) {
      continueError = "";
      result = dispatch({ type: "start-boss-practice", bossDefinitionId: target.dataset.bossId });
    } else if (action === "restart-encounter") {
      result = dispatch({ type: "restart-stage" });
    } else if (action === "abandon-run") {
      result = dispatch({ type: "abandon-run" });
      paused = false;
      options.onPauseChanged(false);
    } else if (action === "resume-game") {
      paused = false;
      options.onPauseChanged(false);
      renderedSignature = "";
      update();
      return;
    } else if (action === "return-to-title") {
      result = dispatch({ type: "return-to-title" });
    } else if (action === "setting" && target.dataset.setting && target.dataset.value) {
      const key = target.dataset.setting as keyof ProfileSettings;
      const current = options.profile.profile().settings;
      const value: ProfileSettings[keyof ProfileSettings] = key === "qualityMode"
        ? (target.dataset.value === "compatibility" ? "compatibility" : "high")
        : target.dataset.value === "true";
      const outcome = options.profile.updateSettings({ [key]: value });
      continueError = outcome.ok ? "" : outcome.message;
      if (outcome.ok) options.onSettingsChanged({ ...current, [key]: value }, key);
      renderedSignature = "";
      update();
      return;
    } else if (action === "rebuild-profile") {
      if (!window.confirm("确认重建本地档案？损坏原文会先保存为独立备份，不会被覆盖。")) return;
      const outcome = options.profile.rebuildCorruptProfile();
      continueError = outcome.ok
        ? (outcome.backupKey ? `旧档案已备份：${outcome.backupKey}` : "档案已重建。")
        : outcome.message;
      renderedSignature = "";
      update();
      return;
    } else if (action === "select-route" && target.dataset.nodeId) {
      result = dispatch({ type: "preview-route-node", nodeId: target.dataset.nodeId });
    } else if (action === "skill" && target.dataset.skillId) {
      const nodeState = target.dataset.nodeState;
      const draftAction = target.dataset.draftAction;
      if (nodeState === "available" || (nodeState === "draft" && draftAction === "remove")) {
        result = dispatch({ type: "preview-skill-purchase", skillId: target.dataset.skillId });
      } else if (nodeState === "draft" || nodeState === "committed") {
        result = dispatch({ type: "preview-skill-refund", skillId: target.dataset.skillId });
      }
    } else if (action === "discard-draft") {
      result = dispatch({ type: "discard-skill-draft" });
    } else if (action === "confirm-planning") {
      result = dispatch({ type: "confirm-planning" });
    } else if (action === "acknowledge-reward") {
      result = dispatch({ type: "acknowledge-reward" });
    } else if (action === "event-choice" && target.dataset.choiceId) {
      result = dispatch({ type: "resolve-event-choice", choiceId: target.dataset.choiceId });
    } else if (action === "use-forge-token") {
      result = dispatch({ type: "use-forge-token" });
    } else if (action === "confirm-forge") {
      result = dispatch({ type: "confirm-forge" });
    } else if (action === "select-reward-skill" && target.dataset.offerId && target.dataset.skillId) {
      result = dispatch({
        type: "select-reward-skill",
        offerId: target.dataset.offerId,
        skillId: target.dataset.skillId,
      });
    }
      if (result) {
      renderedSignature = "";
      if (result.result === "returned-to-title" || result.result === "run-abandoned") titleView = "main";
      onStateTransition(result.result);
      update();
    }
  };

  root.addEventListener("click", onClick);

  function update(): void {
    const campaign = gameState.run.fullGame;
    const continueStatus = options.getContinueStatus();
    const signature = campaign === null ? "legacy" : JSON.stringify({
      phase: campaign.phase,
      act: campaign.routeProgress.actIndex,
      layer: campaign.routeProgress.layerIndex,
      provisional: campaign.provisionalRouteNodeId,
      available: campaign.routeProgress.availableNodeIds,
      reward: campaign.pendingReward,
      rewardDraft: campaign.activeRewardDraft,
      skills: skillAllocationSnapshot(campaign.skills),
      event: campaign.activeEventDefinitionId,
      eventHistory: campaign.eventHistory.length,
      resources: gameState.run.acquiredResources,
      forgeTokensSpent: campaign.forgeTokensSpentThisVisit,
      protocol: campaign.protocol,
      continueStatus,
      continueError,
      titleView,
      profile: options.profile.profile(),
      profileStatus: options.profile.status(),
      paused,
    });
    if (signature === renderedSignature) return;
    renderedSignature = signature;
    root.className = campaign ? `campaign-ui phase-${campaign.phase}` : "campaign-ui hidden";
    document.body.classList.toggle("campaign-ui-active", Boolean(campaign && (campaign.phase !== "combat" || paused)));

    if (!campaign || (campaign.phase === "combat" && !paused)) {
      root.replaceChildren();
      return;
    }
    if (paused && campaign.phase === "combat") {
      root.innerHTML = renderPause(gameState);
    } else if (campaign.phase === "title") {
      root.innerHTML = renderTitle(gameState, options, titleView, continueStatus, continueError);
    } else if (campaign.phase === "planning") {
      root.innerHTML = renderPlanning(gameState);
    } else if (campaign.phase === "event") {
      root.innerHTML = renderEvent(gameState);
    } else if (campaign.phase === "forge") {
      root.innerHTML = renderForge(gameState);
    } else if (campaign.phase === "reward") {
      root.innerHTML = renderReward(gameState);
    } else if (campaign.phase === "upgrade-choice") {
      root.innerHTML = renderUpgradeChoice(gameState);
    } else if (campaign.phase === "defeat") {
      root.innerHTML = renderDefeat(gameState);
    } else {
      root.innerHTML = renderVictory(gameState);
    }
  }

  update();
  return {
    update,
    togglePause() {
      const campaign = gameState.run.fullGame;
      if (!campaign || campaign.phase !== "combat" || gameState.stage.phase !== "playing") return;
      paused = !paused;
      options.onPauseChanged(paused);
      renderedSignature = "";
      update();
    },
    dispose() {
      root.removeEventListener("click", onClick);
      root.replaceChildren();
      document.body.classList.remove("campaign-ui-active");
    },
  };
}

function renderTitle(
  state: GameState,
  options: CampaignUiRuntimeOptions,
  view: "main" | "practice" | "dossier" | "settings",
  continueStatus: RunSaveStatus,
  continueError: string,
): string {
  if (view === "practice") return renderPractice(options);
  if (view === "dossier") return renderDossier(options);
  if (view === "settings") return renderSettings(options, continueError);
  const campaign = state.run.fullGame;
  if (!campaign) return "";
  const profileStatus = options.profile.status();
  const statusMessage = continueError || (continueStatus.kind === "error" ? continueStatus.message : "");
  const continueButton = continueStatus.kind === "ready" ? `
    <button class="secondary-action" type="button" data-action="continue-run">继续游戏</button>` : "";
  return `
    <section class="campaign-panel title-panel" aria-labelledby="campaign-title">
      <p class="panel-kicker">PROJECT SLASH</p>
      <h1 id="campaign-title">红线</h1>
      <div class="title-actions">
        ${continueButton}
        <button class="primary-action" type="button" data-action="start-run">开始游戏</button>
      </div>
      ${statusMessage ? `<p class="save-error" role="alert">${escapeHtml(statusMessage)}</p>` : ""}
      ${profileStatus.kind === "error" ? `<p class="save-error" role="alert">${escapeHtml(profileStatus.message)}</p>` : ""}
      <button class="text-action" type="button" data-action="title-view" data-view="settings">设置</button>
    </section>`;
}

function renderPractice(options: CampaignUiRuntimeOptions): string {
  const unlocked = new Set(options.profile.profile().unlocks.bossPracticeIds);
  return `
    <section class="campaign-panel library-panel" aria-labelledby="practice-title">
      ${renderSubpageHeader("首领练习", "在正式游戏中见过首领后解锁。练习结果不计入通关记录。")}
      <div class="library-grid">${BOSS_DEFINITIONS.map((boss) => {
        const available = options.validationMode || unlocked.has(boss.id);
        return `<article class="library-card ${available ? "" : "locked"}">
          <span>第 ${boss.actIndex + 1} 区 · ${available ? "已发现" : "未发现"}</span>
          <h2>${available ? escapeHtml(boss.title) : "未识别首领"}</h2>
          <p>${available ? escapeHtml(boss.summary) : "在正式游戏中抵达该首领后解锁。"}</p>
          <button class="secondary-action" type="button" data-action="start-boss-practice" data-boss-id="${escapeHtml(boss.id)}" ${available ? "" : "disabled"}>${available ? "开始练习" : "尚未解锁"}</button>
        </article>`;
      }).join("")}</div>
    </section>`;
}

function renderDossier(options: CampaignUiRuntimeOptions): string {
  const profile = options.profile.profile();
  const seenEnemies = new Set(profile.discoveries.enemyDefinitionIds);
  const seenBosses = new Set(profile.discoveries.bossDefinitionIds);
  const stats = profile.statistics;
  return `
    <section class="campaign-panel library-panel" aria-labelledby="dossier-title">
      ${renderSubpageHeader("作战档案", "只记录发现、练习和难度解锁，不提供永久战斗加成。")}
      <div class="profile-summary">
        <span><b>${stats.runsStarted}</b>已开始</span>
        <span><b>${stats.clears.standard}</b>标准通关</span>
        <span><b>${stats.playerDeaths}</b>死亡</span>
        <span><b>${seenEnemies.size}/${ENEMY_DOSSIER_DEFINITIONS.length}</b>敌人</span>
        <span><b>${seenBosses.size}/${BOSS_DEFINITIONS.length}</b>首领</span>
      </div>
      <h2 class="library-section-title">敌人档案</h2>
      <div class="dossier-grid">${ENEMY_DOSSIER_DEFINITIONS.map((entry) => {
        const available = seenEnemies.has(entry.enemyDefinitionId);
        return `<article class="dossier-card ${available ? "" : "locked"}">
          <span>${available ? (entry.classification === "ELITE" ? "精英" : "普通") : "未知"}</span>
          <h3>${available ? escapeHtml(entry.title) : "未识别单位"}</h3>
          <dl>${available ? `<div><dt>行为</dt><dd>${escapeHtml(entry.behavior)}</dd></div><div><dt>对策</dt><dd>${escapeHtml(entry.counterplay)}</dd></div>` : `<div><dt>记录</dt><dd>在正式游戏中遭遇后解锁。</dd></div>`}</dl>
        </article>`;
      }).join("")}</div>
      <h2 class="library-section-title">首领记录</h2>
      <div class="dossier-grid">${BOSS_DEFINITIONS.map((boss) => {
        const available = seenBosses.has(boss.id);
        return `<article class="dossier-card ${available ? "" : "locked"}">
          <span>${available ? `击败 ${stats.bossVictoriesById[boss.id] ?? 0} · 阵亡 ${stats.bossDeathsById[boss.id] ?? 0}` : "未知"}</span>
          <h3>${available ? escapeHtml(boss.title) : "未识别首领"}</h3>
          <p>${available ? escapeHtml(boss.summary) : "抵达该首领后解锁。"}</p>
        </article>`;
      }).join("")}</div>
    </section>`;
}

function renderSettings(options: CampaignUiRuntimeOptions, message: string): string {
  const settings = options.profile.profile().settings;
  const status = options.profile.status();
  return `
    <section class="campaign-panel library-panel settings-panel" aria-labelledby="settings-title">
      ${renderSubpageHeader("设置", "设置保存在本机，不上传数据。")}
      ${message ? `<p class="save-error" role="status">${escapeHtml(message)}</p>` : ""}
      ${status.kind === "error" ? `<div class="profile-recovery"><p class="save-error" role="alert">${escapeHtml(status.message)}</p><button class="secondary-action" type="button" data-action="rebuild-profile">备份原文并重建档案</button></div>` : `
        ${renderSettingRow("音频", "关闭后立即静音；设置会在下次启动继续生效。", "audioEnabled", settings.audioEnabled)}
        ${renderSettingRow("减少动态效果", "降低环境粒子并关闭镜头冲击；关键攻击提示仍保留。", "reducedMotion", settings.reducedMotion)}
        ${renderSettingRow("高对比度", "强化面板、按钮、HUD 与状态边界，不只依赖颜色。", "highContrast", settings.highContrast)}
        <div class="setting-row"><div><b>画质模式</b><p>High 使用较高像素比与阴影；Compatibility 降低渲染成本。切换后自动重载。</p></div><div class="setting-actions">
          <button class="secondary-action ${settings.qualityMode === "high" ? "selected" : ""}" type="button" data-action="setting" data-setting="qualityMode" data-value="high">高画质</button>
          <button class="secondary-action ${settings.qualityMode === "compatibility" ? "selected" : ""}" type="button" data-action="setting" data-setting="qualityMode" data-value="compatibility">兼容模式</button>
        </div></div>`}
    </section>`;
}

function renderSubpageHeader(title: string, copy: string): string {
  return `<header class="library-header"><div><p class="panel-kicker">PROJECT SLASH</p><h1>${escapeHtml(title)}</h1><p>${escapeHtml(copy)}</p></div><button class="secondary-action" type="button" data-action="title-view" data-view="main">返回</button></header>`;
}

function renderSettingRow(
  title: string,
  copy: string,
  key: "audioEnabled" | "reducedMotion" | "highContrast",
  enabled: boolean,
): string {
  return `<div class="setting-row"><div><b>${escapeHtml(title)}</b><p>${escapeHtml(copy)}</p></div><button class="secondary-action ${enabled ? "selected" : ""}" type="button" data-action="setting" data-setting="${key}" data-value="${String(!enabled)}">${enabled ? "开启" : "关闭"}</button></div>`;
}

function renderPlanning(state: GameState): string {
  const campaign = state.run.fullGame;
  if (!campaign) return "";
  const allocation = skillAllocationSnapshot(campaign.skills);
  const routeNodes = availableRouteNodes(campaign.routeProgress);
  const selectedNode = campaign.provisionalRouteNodeId
    ? routeNodeById(campaign.routeProgress.route, campaign.provisionalRouteNodeId)
    : null;
  const act = FULL_GAME_ACT_DEFINITIONS[campaign.routeProgress.actIndex];
  const moduleColumns = MODULE_ORDER.map((module) => renderSkillModule(module, allocation.nodes)).join("");
  const intel = effectiveIntelDepth(state);
  return `
    <section class="campaign-panel planning-panel" aria-labelledby="planning-title">
      <header class="planning-header">
        <div>
          <p class="panel-kicker">第 ${campaign.routeProgress.actIndex + 1} 区 · 第 ${campaign.routeProgress.layerIndex + 1} 层</p>
          <h1 id="planning-title">${escapeHtml(actName(act?.index ?? 0))}</h1>
          <p>先暂定下一节点，再用已知威胁决定是否花点；确认前路线与技能都不会锁定。</p>
        </div>
        <div class="point-counter" aria-label="技能点">
          <strong>${allocation.unspentPoints}</strong>
          <span>可用技能点</span>
          <small>${allocation.spentPoints} 已投入 · ${allocation.totalEarnedPoints} 已获得</small>
        </div>
      </header>

      ${renderRunResources(state)}

      ${renderRunMap(state)}

      <div class="planning-grid">
        <aside class="route-panel" aria-labelledby="route-title">
          <div class="section-heading">
            <span>01</span><div><h2 id="route-title">下一节点</h2><p>显示确定内容，不隐藏致命机制。</p></div>
          </div>
          <div class="route-options">${routeNodes.map((node) => renderRouteCard(node, campaign.provisionalRouteNodeId === node.id, state.run.seed)).join("")}</div>
          ${renderIntelLookahead(state, intel)}
        </aside>

        <main class="skill-board" aria-labelledby="skill-board-title">
          <div class="section-heading">
            <span>02</span><div><h2 id="skill-board-title">完整技能树</h2><p>所有节点 1 SP；卡片内直接写明效果、触发、限制与前置。</p></div>
          </div>
          <div class="skill-module-grid">${moduleColumns}</div>
        </main>
      </div>

      <footer class="planning-confirmation">
        <div>
          <strong>${selectedNode ? escapeHtml(threatPreviewForRouteNode(selectedNode, state.run.seed).title) : "尚未暂定路线"}</strong>
          <span>${allocation.draftAddedSkillIds.length} 个新增草案 · ${allocation.unspentPoints} 点将在确认后保留</span>
        </div>
        <button class="secondary-action" type="button" data-action="discard-draft" ${allocation.draftAddedSkillIds.length === 0 && allocation.draftRemovedSkillIds.length === 0 ? "disabled" : ""}>撤销本次草案</button>
        <button class="primary-action" type="button" data-action="confirm-planning" ${selectedNode ? "" : "disabled"}>确认并进入</button>
      </footer>
    </section>`;
}

function renderRunMap(state: GameState): string {
  const campaign = state.run.fullGame;
  if (!campaign) return "";
  const progress = campaign.routeProgress;
  return `<section class="run-map" aria-label="完整路线图">
    ${progress.route.acts.map((act) => {
      const actState = act.actIndex < progress.actIndex
        ? "completed"
        : act.actIndex === progress.actIndex ? "current" : "future";
      return `<div class="run-map-act state-${actState}">
        <b>第 ${act.actIndex + 1} 区</b>
        <div>${act.layers.map((layer, layerIndex) => `<span class="run-map-layer">${layer.map((node) => {
          const stateName = progress.completedNodeIds.includes(node.id)
            ? "completed"
            : progress.currentNodeId === node.id
              ? "active"
              : campaign.provisionalRouteNodeId === node.id
                ? "selected"
                : progress.availableNodeIds.includes(node.id)
                  ? "available"
                  : "unknown";
          return `<i class="map-node kind-${node.kind} state-${stateName}" title="${escapeHtml(routeKindName(node.kind))}">${routeNodeSymbol(node.kind)}</i>`;
        }).join("")}${layerIndex < act.layers.length - 1 ? "<em>›</em>" : ""}</span>`).join("")}</div>
      </div>`;
    }).join("")}
    <small>● 战斗　◆ 精英　△ 挑战　○ 事件　□ 重接　★ 首领</small>
  </section>`;
}

function routeNodeSymbol(kind: string): string {
  if (kind === "elite") return "◆";
  if (kind === "challenge") return "△";
  if (kind === "event") return "○";
  if (kind === "forge") return "□";
  if (kind === "boss") return "★";
  return "●";
}

function routeKindName(kind: string): string {
  if (kind === "elite") return "精英";
  if (kind === "challenge") return "挑战";
  if (kind === "event") return "事件";
  if (kind === "forge") return "构筑重接";
  if (kind === "boss") return "首领";
  return "战斗";
}

function actName(index: number): string {
  return ["抵达场", "压缩熔炉", "镜像档案库", "红线圣堂"][index] ?? `第 ${index + 1} 区`;
}

function tagName(tag: string): string {
  const labels: Readonly<Record<string, string>> = {
    STANDARD: "普通",
    ELITE: "精英",
    CHALLENGE: "挑战",
    BOSS: "首领",
    "FINAL BOSS": "最终首领",
    STRIKER: "突击兵",
    GUNNER: "枪手",
    LANCER: "长枪兵",
    CONSTRUCTOR: "构筑者",
    MINE: "地雷",
    SNIPER: "狙击手",
    VANGUARD: "先锋",
    BASTION: "堡垒",
    BLINK: "闪现",
    CONDUCTOR: "指挥者",
    ARMOR: "装甲",
    PROJECTILE: "弹幕",
    OBSTACLE: "障碍",
    HAZARD: "危险区",
    RAIL: "轨道",
    ANCHOR: "锚柱",
    LANES: "通道",
    MIXED: "混合",
    "PRE-BOSS": "首领前哨",
    "2 WAVES": "两波",
    "3 WAVES": "三波",
  };
  return labels[tag.toUpperCase()] ?? tag;
}

function skillCopy(copy: string): string {
  return copy
    .replaceAll("Basic Dash", "普通突进")
    .replaceAll("Charged Dash", "破阵突进")
    .replaceAll("Basic", "普通突进")
    .replaceAll("Charged", "破阵突进")
    .replaceAll("Ultimate", "终极突进")
    .replaceAll("Vector Focus", "矢量专注")
    .replaceAll("Dash", "突进")
    .replaceAll("Recovery", "收势")
    .replaceAll("Transit", "突进途中")
    .replaceAll("Energy", "能量")
    .replaceAll("Stored Line", "旧路径")
    .replaceAll("Cross Execution", "交叉处决")
    .replaceAll("Cross", "交叉冲击")
    .replaceAll("Echo", "残响斩")
    .replaceAll("Armor Coverage", "护甲覆盖区")
    .replaceAll("Armor Part", "护甲片")
    .replaceAll("Armor", "护甲")
    .replaceAll("Projectile", "弹体")
    .replaceAll("Obstacle", "障碍物")
    .replaceAll("Boss", "首领")
    .replaceAll("Charging", "蓄力")
    .replaceAll("Planning", "规划");
}

function renderRouteCard(
  node: ReturnType<typeof availableRouteNodes>[number],
  selected: boolean,
  runSeed: number,
): string {
  const preview = threatPreviewForRouteNode(node, runSeed);
  return `
    <button class="route-card ${selected ? "selected" : ""}" type="button" data-action="select-route" data-node-id="${escapeHtml(node.id)}" ${preview.available ? "" : "disabled"}>
      <span class="route-kind">${escapeHtml(routeKindName(node.kind))}</span>
      <strong>${escapeHtml(preview.title)}</strong>
      <p>${escapeHtml(preview.summary)}</p>
      <div class="tag-row">${preview.tags.map((tag) => `<span>${escapeHtml(tagName(tag))}</span>`).join("")}</div>
      ${preview.challengeCondition ? `<p class="challenge-contract"><b>条件</b> ${escapeHtml(preview.challengeCondition)}<br><b>奖励</b> ${escapeHtml(preview.challengeReward ?? "无额外奖励")}</p>` : ""}
      <small>${preview.hostileCount} 名敌人 · ${preview.waveCount} 波 · 压力 ${preview.pressure.toFixed(1)}</small>
      <small>装甲 ${preview.armoredHostileCount} · 弹幕 ${preview.projectileSourceCount} · 障碍 ${preview.obstacleSourceCount} · 危险区 ${preview.hazardSourceCount}</small>
      <small>节点奖励：${escapeHtml(rewardName(node.reward))}</small>
    </button>`;
}

function renderRunResources(state: GameState): string {
  const energy = state.run.acquiredResources["next-combat-energy"] ?? 0;
  const tokens = state.run.acquiredResources["reroute-token"] ?? 0;
  const intel = state.run.acquiredResources.intel ?? 0;
  const effectiveIntel = effectiveIntelDepth(state);
  return `
    <div class="run-resource-strip" aria-label="本局资源">
      <span><b>${energy}</b>下场初始能量</span>
      <span><b>${tokens}</b>重接凭证</span>
      <span><b>${effectiveIntel}</b>情报深度${effectiveIntel < intel ? ` · 持有 ${intel}` : ""}</span>
    </div>`;
}

function renderIntelLookahead(state: GameState, depthLimit: number): string {
  const campaign = state.run.fullGame;
  if (!campaign || depthLimit <= 0) {
    return `
      <section class="intel-panel is-empty" aria-label="路线情报">
        <strong>情报 0</strong>
        <p>事件可提供路线情报；获得后会在这里显示当前选项之后的确定节点。</p>
      </section>`;
  }
  let frontier = availableRouteNodes(campaign.routeProgress);
  const layers: string[] = [];
  for (let depth = 1; depth <= depthLimit; depth += 1) {
    const nextIds = [...new Set(frontier.flatMap((node) => node.nextNodeIds))];
    if (nextIds.length === 0) break;
    frontier = nextIds.map((id) => routeNodeById(campaign.routeProgress.route, id));
    layers.push(`
      <div class="intel-layer">
        <b>后续第 ${depth} 层</b>
        ${frontier.map((node) => {
          const preview = threatPreviewForRouteNode(node, state.run.seed);
          return `<span><i>${escapeHtml(routeKindName(node.kind))}</i>${escapeHtml(preview.title)}<small>${escapeHtml(rewardName(node.reward))}</small></span>`;
        }).join("")}
      </div>`);
  }
  return `
    <section class="intel-panel" aria-label="路线情报">
      <strong>情报 ${depthLimit}</strong>
      <p>以下为已解析的后续确定节点；当前选择仍只锁定下一层。</p>
      ${layers.join("") || "<p>本分支之后没有更多可解析节点。</p>"}
    </section>`;
}

function renderSkillModule(
  module: SkillModule,
  nodeViews: ReturnType<typeof skillAllocationSnapshot>["nodes"],
): string {
  const root = SKILL_MODULE_ROOTS.find((candidate) => candidate.module === module);
  const skills = FULL_GAME_SKILL_DEFINITIONS.filter((definition) => definition.module === module);
  const branches = [...new Set(skills.map((definition) => definition.branchId))];
  return `
    <section class="skill-module module-${module}">
      <div class="module-root">
        <span>基础能力 · 0 点</span>
        <h3>${escapeHtml(root?.nameZh ?? module)}</h3>
        <p>${escapeHtml(skillCopy(root?.description ?? ""))}</p>
      </div>
      <div class="module-branches">
        ${branches.map((branchId) => `
          <section class="skill-branch">
            <h4>${escapeHtml(BRANCH_NAMES[branchId] ?? branchId)}</h4>
            ${skills.filter((definition) => definition.branchId === branchId).map((definition) => (
              renderSkillNode(definition, nodeViews.find((view) => view.id === definition.id))
            )).join("")}
          </section>`).join("")}
      </div>
    </section>`;
}

function renderSkillNode(
  definition: SkillDefinition,
  view: ReturnType<typeof skillAllocationSnapshot>["nodes"][number] | undefined,
): string {
  const state = view?.state ?? "locked";
  const draftAction = view?.draftAction ?? "";
  const status = state === "draft" && draftAction === "remove" ? "待移除" : NODE_STATUS_TEXT[state];
  return `
    <button class="skill-node state-${state} tier-${definition.tier}" type="button"
      data-action="skill" data-skill-id="${escapeHtml(definition.id)}" data-node-state="${state}" data-draft-action="${draftAction}"
      aria-label="${escapeHtml(`${definition.presentation.code} ${definition.presentation.nameZh} ${status}`)}">
      <span class="skill-connector" aria-hidden="true"></span>
      <span class="skill-meta"><b>${escapeHtml(definition.presentation.code)}</b><i>${escapeHtml(status)}</i></span>
      <strong>${escapeHtml(definition.presentation.nameZh)}</strong>
      <dl>
        <div><dt>效果</dt><dd>${escapeHtml(skillCopy(definition.presentation.effect))}</dd></div>
        <div><dt>触发</dt><dd>${escapeHtml(skillCopy(definition.presentation.trigger))}</dd></div>
        <div><dt>限制</dt><dd>${escapeHtml(skillCopy(definition.presentation.limit))}</dd></div>
        <div><dt>前置</dt><dd>${escapeHtml(skillCopy(definition.presentation.prerequisite))}</dd></div>
      </dl>
    </button>`;
}

function renderEvent(state: GameState): string {
  const campaign = state.run.fullGame;
  const definition = eventDefinitions.list().find((candidate) => (
    candidate.id === campaign?.activeEventDefinitionId
  ));
  if (!campaign || !definition) {
    return `
      <section class="campaign-panel event-panel" aria-labelledby="event-title">
        <p class="panel-kicker">事件数据错误</p>
        <h1 id="event-title">事件内容不可用</h1>
        <p>本节点没有匹配到有效事件定义。为保护本局状态，系统不会自动选择或发放资源。</p>
      </section>`;
  }
  return `
    <section class="campaign-panel event-panel" aria-labelledby="event-title">
      <p class="panel-kicker">路线事件 · 二选一</p>
      <h1 id="event-title">${escapeHtml(definition.title)}</h1>
      <p class="event-situation">${escapeHtml(definition.situation)}</p>
      ${renderRunResources(state)}
      <div class="event-choice-grid">
        ${definition.choices.map((choice, index) => `
          <button class="event-choice" type="button" data-action="event-choice" data-choice-id="${escapeHtml(choice.id)}">
            <span>选项 ${index + 1}</span>
            <strong>${escapeHtml(choice.title)}</strong>
            <p>${escapeHtml(choice.summary)}</p>
            <small>${choice.effects.map((effect) => {
              const before = state.run.acquiredResources[effect.resourceId] ?? 0;
              const after = Math.min(effect.maximum, Math.max(0, before + effect.amount));
              return `${escapeHtml(resourceName(effect.resourceId))}: ${before} → ${after}`;
            }).join(" · ")}</small>
          </button>`).join("")}
      </div>
      <p class="decision-warning">选择会立即生效并完成本节点，不能在本局中撤销。</p>
    </section>`;
}

function renderForge(state: GameState): string {
  const campaign = state.run.fullGame;
  if (!campaign) return "";
  const allocation = skillAllocationSnapshot(campaign.skills);
  const tokens = state.run.acquiredResources["reroute-token"] ?? 0;
  const moduleColumns = MODULE_ORDER.map((module) => renderSkillModule(module, allocation.nodes)).join("");
  return `
    <section class="campaign-panel planning-panel forge-panel" aria-labelledby="forge-title">
      <header class="planning-header">
        <div>
          <p class="panel-kicker">构筑重接</p>
          <h1 id="forge-title">构筑重接</h1>
          <p>可移除最多 ${allocation.forgeMoveLimit} 个已锁定技能点并重新分配；移除前置会连同依赖节点一起计入移动数。</p>
        </div>
        <div class="point-counter" aria-label="重接移动次数">
          <strong>${allocation.forgeMovesUsed}/${allocation.forgeMoveLimit}</strong>
          <span>已移动</span>
          <small>${allocation.unspentPoints} 未投入 SP · ${tokens} 枚凭证</small>
        </div>
      </header>

      ${renderRunResources(state)}

      <main class="skill-board forge-skill-board" aria-labelledby="forge-tree-title">
        <div class="section-heading">
          <span>01</span><div><h2 id="forge-tree-title">重接技能树</h2><p>先点击已锁定节点退款，再点击合法节点重新分配；总技能点不会增加。</p></div>
        </div>
        <div class="skill-module-grid">${moduleColumns}</div>
      </main>

      <footer class="planning-confirmation">
        <div>
          <strong>${allocation.draftRemovedSkillIds.length} 个待移除 · ${allocation.draftAddedSkillIds.length} 个待接入</strong>
          <span>确认前都只是草案；凭证一经使用会立即消耗。</span>
        </div>
        <button class="secondary-action" type="button" data-action="discard-draft" ${allocation.draftAddedSkillIds.length === 0 && allocation.draftRemovedSkillIds.length === 0 ? "disabled" : ""}>撤销重接草案</button>
        <button class="secondary-action" type="button" data-action="use-forge-token" ${tokens > 0 ? "" : "disabled"}>使用凭证 · 增加 1 次移动</button>
        <button class="primary-action" type="button" data-action="confirm-forge">确认并离开</button>
      </footer>
    </section>`;
}

function resourceName(resourceId: string): string {
  if (resourceId === "next-combat-energy") return "下场初始能量";
  if (resourceId === "reroute-token") return "重接凭证";
  if (resourceId === "intel") return "情报";
  return resourceId.toUpperCase();
}

function renderReward(state: GameState): string {
  const reward = state.run.fullGame?.pendingReward;
  const challenge = reward?.challenge;
  return `
    <section class="campaign-panel reward-panel" aria-labelledby="reward-title">
      <p class="panel-kicker">节点完成</p>
      <h1 id="reward-title">节点结算</h1>
      <div class="reward-value"><strong>+${reward?.skillPointsGranted ?? 0}</strong><span>技能点</span></div>
      <p>${reward?.skillPointsGranted ? "新点数会在下一张规划界面进入草案，可花费也可保留。" : "本节点没有技能点奖励；现有未消费点仍会保留。"}</p>
      ${challenge ? `<div class="challenge-result ${challenge.status}"><strong>${challenge.status === "succeeded" ? "挑战完成" : "挑战失败"}</strong><p>${challenge.status === "succeeded" ? `额外资源：${escapeHtml(resourceName(challenge.rewardResourceId))} +${challenge.rewardAmount}` : `未获得额外资源：${escapeHtml(challenge.failureReason ?? "条件未满足")}`}</p></div>` : ""}
      <button class="primary-action" type="button" data-action="acknowledge-reward">继续规划</button>
    </section>`;
}

function renderUpgradeChoice(state: GameState): string {
  const draft = state.run.fullGame?.activeRewardDraft;
  if (!draft) return "";
  return `
    <section class="campaign-panel upgrade-choice-panel" aria-labelledby="upgrade-choice-title">
      <h1 id="upgrade-choice-title">选择一项能力</h1>
      <div class="upgrade-choice-grid">
        ${draft.candidateSkillIds.map((skillId) => {
          const entry = rewardPoolV2EntryById(skillId);
          return `<button class="upgrade-choice-card" type="button"
            data-action="select-reward-skill"
            data-offer-id="${escapeHtml(draft.offerId)}"
            data-skill-id="${escapeHtml(skillId)}">
            <strong>${escapeHtml(entry.name)}</strong>
            <span>${escapeHtml(entry.effect)}</span>
          </button>`;
        }).join("")}
      </div>
    </section>`;
}

function renderVictory(state: GameState): string {
  const campaign = state.run.fullGame;
  const practice = campaign?.practiceBossDefinitionId
    ? BOSS_DEFINITIONS.find((boss) => boss.id === campaign.practiceBossDefinitionId)
    : null;
  return `
    <section class="campaign-panel reward-panel" aria-labelledby="victory-title">
      <h1 id="victory-title">${practice ? "练习完成" : "通关"}</h1>
      <div class="defeat-actions">
        <button class="primary-action" type="button" data-action="return-to-title">再来一次</button>
        <button class="secondary-action" type="button" data-action="return-to-title">返回主页</button>
      </div>
    </section>`;
}

function renderDefeat(state: GameState): string {
  const campaign = state.run.fullGame;
  if (!campaign) return "";
  const practice = campaign.practiceBossDefinitionId !== null;
  const canReboot = practice || (
    campaign.protocol.mode === "assist" && campaign.protocol.assistRebootsRemaining > 0
  );
  const title = practice ? "练习结束" : "本局结束";
  return `
    <section class="campaign-panel reward-panel defeat-panel" aria-labelledby="defeat-title">
      <h1 id="defeat-title">${title}</h1>
      <div class="defeat-actions">
        ${canReboot ? `<button class="primary-action" type="button" data-action="restart-encounter">再来一次</button>` : `<button class="primary-action" type="button" data-action="return-to-title">再来一次</button>`}
        <button class="secondary-action" type="button" data-action="return-to-title">返回主页</button>
      </div>
    </section>`;
}

function renderPause(state: GameState): string {
  const campaign = state.run.fullGame;
  if (!campaign) return "";
  const skills = campaign.skills.committedSkillIds
    .map((id) => FULL_GAME_SKILL_DEFINITIONS.find((skill) => skill.id === id)?.presentation.nameZh)
    .filter((name): name is string => Boolean(name));
  return `
    <section class="campaign-panel pause-panel" aria-labelledby="pause-title">
      <p class="panel-kicker">已暂停</p>
      <h1 id="pause-title">第 ${campaign.routeProgress.actIndex + 1} 区 · 第 ${campaign.routeProgress.layerIndex + 1} 层</h1>
      <div class="pause-grid">
        <section><h2>操作</h2><p>点击：普通突进</p><p>长按：蓄力突进</p><p>空格：终极突进</p><p>Esc：继续</p></section>
        <section><h2>当前构筑</h2>${skills.length ? `<ul>${skills.map((name) => `<li>${escapeHtml(name)}</li>`).join("")}</ul>` : "<p>尚未分配技能。</p>"}</section>
      </div>
      <div class="pause-actions">
        <button class="primary-action" type="button" data-action="resume-game">继续</button>
        <button class="secondary-action" type="button" data-action="abandon-run">放弃本局</button>
      </div>
    </section>`;
}

function rewardName(reward: string): string {
  if (reward === "skill-point") return "技能点";
  if (reward === "elite-bonus") return "精英奖励";
  if (reward === "act-clear") return "区域完成";
  if (reward === "run-victory") return "最终通关";
  return "无";
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
