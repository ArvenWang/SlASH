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

export interface CampaignUiRuntimeOptions {
  readonly root: HTMLDivElement;
  readonly gameState: GameState;
  readonly dispatch: (command: GameCommand) => GameCommandDispatchResult;
  readonly getContinueStatus: () => RunSaveStatus;
  readonly continueRun: () => { readonly ok: true } | { readonly ok: false; readonly message: string };
  readonly onStateTransition: (result: GameCommandDispatchResult["result"] | "run-continued") => void;
}

export interface CampaignUiRuntime {
  update(): void;
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
    } else if (action === "start-boss-practice" && target.dataset.bossId) {
      continueError = "";
      result = dispatch({ type: "start-boss-practice", bossDefinitionId: target.dataset.bossId });
    } else if (action === "return-to-title") {
      result = dispatch({ type: "return-to-title" });
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
    }
    if (result) {
      renderedSignature = "";
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
      skills: skillAllocationSnapshot(campaign.skills),
      event: campaign.activeEventDefinitionId,
      eventHistory: campaign.eventHistory.length,
      resources: gameState.run.acquiredResources,
      forgeTokensSpent: campaign.forgeTokensSpentThisVisit,
      continueStatus,
      continueError,
    });
    if (signature === renderedSignature) return;
    renderedSignature = signature;
    root.className = campaign ? `campaign-ui phase-${campaign.phase}` : "campaign-ui hidden";
    document.body.classList.toggle("campaign-ui-active", Boolean(campaign && campaign.phase !== "combat" && campaign.phase !== "defeat"));

    if (!campaign || campaign.phase === "combat" || campaign.phase === "defeat") {
      root.replaceChildren();
      return;
    }
    if (campaign.phase === "title") {
      root.innerHTML = renderTitle(continueStatus, continueError);
    } else if (campaign.phase === "planning") {
      root.innerHTML = renderPlanning(gameState);
    } else if (campaign.phase === "event") {
      root.innerHTML = renderEvent(gameState);
    } else if (campaign.phase === "forge") {
      root.innerHTML = renderForge(gameState);
    } else if (campaign.phase === "reward") {
      root.innerHTML = renderReward(gameState);
    } else {
      root.innerHTML = renderVictory(gameState);
    }
  }

  update();
  return {
    update,
    dispose() {
      root.removeEventListener("click", onClick);
      root.replaceChildren();
      document.body.classList.remove("campaign-ui-active");
    },
  };
}

function renderTitle(continueStatus: RunSaveStatus, continueError: string): string {
  const statusMessage = continueError || (continueStatus.kind === "error" ? continueStatus.message : "");
  const continueButton = continueStatus.kind === "empty" ? "" : `
    <button class="secondary-action" type="button" data-action="continue-run">CONTINUE / 继续上次 RUN</button>`;
  const continueSummary = continueStatus.kind === "ready" ? `
    <small class="continue-summary">ACT ${continueStatus.summary.actNumber} · LAYER ${continueStatus.summary.layerNumber} · ${continueStatus.summary.committedSkillCount} SKILLS · SEED ${continueStatus.summary.seed}</small>` : "";
  return `
    <section class="campaign-panel title-panel" aria-labelledby="campaign-title">
      <p class="panel-kicker">PROJECT SLASH / FULL GAME</p>
      <h1 id="campaign-title">REDLINE ASCENT</h1>
      <p class="panel-copy">三种主动模组。四个区域。每局最多 12 点，只能完成 28 个被动中的一部分。</p>
      <div class="base-rules" aria-label="基础战斗规则">
        <span>Basic：点击突进</span>
        <span>Charged：撞甲卸甲，撞裸露区击杀</span>
        <span>Ultimate：满能量后规划多段路径</span>
      </div>
      <div class="title-actions">
        ${continueButton}
        <button class="primary-action" type="button" data-action="start-run">NEW RUN / 开始新局</button>
      </div>
      ${continueSummary}
      ${statusMessage ? `<p class="save-error" role="alert">${escapeHtml(statusMessage)}</p>` : ""}
      <section class="practice-selector" aria-labelledby="practice-title">
        <p class="panel-kicker" id="practice-title">BOSS PRACTICE / 零构筑练习</p>
        <div>${BOSS_DEFINITIONS.map((boss) => `
          <button class="secondary-action" type="button" data-action="start-boss-practice" data-boss-id="${escapeHtml(boss.id)}">
            <b>ACT ${boss.actIndex + 1}</b>${escapeHtml(boss.title)}
          </button>`).join("")}</div>
      </section>
    </section>`;
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
  const intel = Math.max(0, Math.min(3, state.run.acquiredResources.intel ?? 0));
  return `
    <section class="campaign-panel planning-panel" aria-labelledby="planning-title">
      <header class="planning-header">
        <div>
          <p class="panel-kicker">ACT ${campaign.routeProgress.actIndex + 1} / LAYER ${campaign.routeProgress.layerIndex + 1}</p>
          <h1 id="planning-title">${escapeHtml(act?.name ?? "PLANNING BOARD")}</h1>
          <p>先暂定下一节点，再用已知威胁决定是否花点；确认前路线与技能都不会锁定。</p>
        </div>
        <div class="point-counter" aria-label="技能点">
          <strong>${allocation.unspentPoints}</strong>
          <span>UNSPENT SP</span>
          <small>${allocation.spentPoints} 已投入 / ${allocation.totalEarnedPoints} 已获得</small>
        </div>
      </header>

      ${renderRunResources(state)}

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
        <button class="primary-action" type="button" data-action="confirm-planning" ${selectedNode ? "" : "disabled"}>LOCK BUILD & ENTER / 锁定并进入</button>
      </footer>
    </section>`;
}

function renderRouteCard(
  node: ReturnType<typeof availableRouteNodes>[number],
  selected: boolean,
  runSeed: number,
): string {
  const preview = threatPreviewForRouteNode(node, runSeed);
  return `
    <button class="route-card ${selected ? "selected" : ""}" type="button" data-action="select-route" data-node-id="${escapeHtml(node.id)}" ${preview.available ? "" : "disabled"}>
      <span class="route-kind">${escapeHtml(node.kind.toUpperCase())}</span>
      <strong>${escapeHtml(preview.title)}</strong>
      <p>${escapeHtml(preview.summary)}</p>
      <div class="tag-row">${preview.tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}</div>
      ${preview.challengeCondition ? `<p class="challenge-contract"><b>CONDITION</b> ${escapeHtml(preview.challengeCondition)}<br><b>REWARD</b> ${escapeHtml(preview.challengeReward ?? "无额外奖励")}</p>` : ""}
      <small>${preview.hostileCount} HOSTILES · ${preview.waveCount} WAVES · PRESSURE ${preview.pressure.toFixed(1)}</small>
      <small>ARMOR ${preview.armoredHostileCount} · PROJECTILE ${preview.projectileSourceCount} · OBSTACLE ${preview.obstacleSourceCount} · HAZARD ${preview.hazardSourceCount}</small>
      <small>NODE REWARD ${escapeHtml(node.reward.toUpperCase())}</small>
    </button>`;
}

function renderRunResources(state: GameState): string {
  const energy = state.run.acquiredResources["next-combat-energy"] ?? 0;
  const tokens = state.run.acquiredResources["reroute-token"] ?? 0;
  const intel = state.run.acquiredResources.intel ?? 0;
  return `
    <div class="run-resource-strip" aria-label="本局资源">
      <span><b>${energy}</b> NEXT COMBAT ENERGY</span>
      <span><b>${tokens}</b> REROUTE TOKEN</span>
      <span><b>${intel}</b> INTEL DEPTH</span>
    </div>`;
}

function renderIntelLookahead(state: GameState, depthLimit: number): string {
  const campaign = state.run.fullGame;
  if (!campaign || depthLimit <= 0) {
    return `
      <section class="intel-panel is-empty" aria-label="路线情报">
        <strong>INTEL / 0</strong>
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
        <b>+${depth} LAYER</b>
        ${frontier.map((node) => {
          const preview = threatPreviewForRouteNode(node, state.run.seed);
          return `<span><i>${escapeHtml(node.kind.toUpperCase())}</i>${escapeHtml(preview.title)}<small>${escapeHtml(node.reward.toUpperCase())}</small></span>`;
        }).join("")}
      </div>`);
  }
  return `
    <section class="intel-panel" aria-label="路线情报">
      <strong>INTEL / ${depthLimit}</strong>
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
        <span>BASE / 0 SP</span>
        <h3>${escapeHtml(root?.nameEn ?? module.toUpperCase())}</h3>
        <strong>${escapeHtml(root?.nameZh ?? module)}</strong>
        <p>${escapeHtml(root?.description ?? "")}</p>
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
      <strong>${escapeHtml(definition.presentation.nameZh)} <small>${escapeHtml(definition.presentation.nameEn)}</small></strong>
      <dl>
        <div><dt>效果</dt><dd>${escapeHtml(definition.presentation.effect)}</dd></div>
        <div><dt>触发</dt><dd>${escapeHtml(definition.presentation.trigger)}</dd></div>
        <div><dt>限制</dt><dd>${escapeHtml(definition.presentation.limit)}</dd></div>
        <div><dt>前置</dt><dd>${escapeHtml(definition.presentation.prerequisite)}</dd></div>
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
        <p class="panel-kicker">EVENT DATA ERROR</p>
        <h1 id="event-title">事件内容不可用</h1>
        <p>本节点没有匹配到有效事件定义。为保护本局状态，系统不会自动选择或发放资源。</p>
      </section>`;
  }
  return `
    <section class="campaign-panel event-panel" aria-labelledby="event-title">
      <p class="panel-kicker">ROUTE EVENT / 二选一</p>
      <h1 id="event-title">${escapeHtml(definition.title)}</h1>
      <p class="event-situation">${escapeHtml(definition.situation)}</p>
      ${renderRunResources(state)}
      <div class="event-choice-grid">
        ${definition.choices.map((choice, index) => `
          <button class="event-choice" type="button" data-action="event-choice" data-choice-id="${escapeHtml(choice.id)}">
            <span>OPTION ${index + 1}</span>
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
          <p class="panel-kicker">FORGE / BUILD RESPEC</p>
          <h1 id="forge-title">构筑重接</h1>
          <p>可移除最多 ${allocation.forgeMoveLimit} 个已锁定技能点并重新分配；移除前置会连同依赖节点一起计入移动数。</p>
        </div>
        <div class="point-counter" aria-label="Forge 移动次数">
          <strong>${allocation.forgeMovesUsed}/${allocation.forgeMoveLimit}</strong>
          <span>MOVES USED</span>
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
        <button class="secondary-action" type="button" data-action="use-forge-token" ${tokens > 0 ? "" : "disabled"}>使用凭证 / +1 MOVE</button>
        <button class="primary-action" type="button" data-action="confirm-forge">确认并离开 FORGE</button>
      </footer>
    </section>`;
}

function resourceName(resourceId: string): string {
  if (resourceId === "next-combat-energy") return "NEXT COMBAT ENERGY";
  if (resourceId === "reroute-token") return "REROUTE TOKEN";
  if (resourceId === "intel") return "INTEL";
  return resourceId.toUpperCase();
}

function renderReward(state: GameState): string {
  const reward = state.run.fullGame?.pendingReward;
  const challenge = reward?.challenge;
  return `
    <section class="campaign-panel reward-panel" aria-labelledby="reward-title">
      <p class="panel-kicker">NODE COMPLETE</p>
      <h1 id="reward-title">节点结算</h1>
      <div class="reward-value"><strong>+${reward?.skillPointsGranted ?? 0}</strong><span>SKILL POINT</span></div>
      <p>${reward?.skillPointsGranted ? "新点数会在下一张 Planning Board 中进入 Draft，可花费也可保留。" : "本节点没有技能点奖励；现有未消费点仍会保留。"}</p>
      ${challenge ? `<div class="challenge-result ${challenge.status}"><strong>CHALLENGE ${escapeHtml(challenge.status.toUpperCase())}</strong><p>${challenge.status === "succeeded" ? `额外资源：${escapeHtml(resourceName(challenge.rewardResourceId))} +${challenge.rewardAmount}` : `未获得额外资源：${escapeHtml(challenge.failureReason ?? "条件未满足")}`}</p></div>` : ""}
      <button class="primary-action" type="button" data-action="acknowledge-reward">CONTINUE TO PLANNING / 继续规划</button>
    </section>`;
}

function renderVictory(state: GameState): string {
  const campaign = state.run.fullGame;
  const practice = campaign?.practiceBossDefinitionId
    ? BOSS_DEFINITIONS.find((boss) => boss.id === campaign.practiceBossDefinitionId)
    : null;
  return `
    <section class="campaign-panel reward-panel" aria-labelledby="victory-title">
      <p class="panel-kicker">${practice ? "BOSS PRACTICE COMPLETE" : "RUN COMPLETE"}</p>
      <h1 id="victory-title">${practice ? escapeHtml(practice.title) : "REDLINE CLEARED"}</h1>
      <p>${practice ? "零技能基础模组验证完成。" : `${campaign?.routeProgress.completedNodeIds.length ?? 0} 节点 · ${campaign?.skills.committedSkillIds.length ?? 0} 个已锁定技能 · Seed ${state.run.seed}`}</p>
      <button class="primary-action" type="button" data-action="return-to-title">RETURN TO TITLE / 返回标题</button>
    </section>`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
