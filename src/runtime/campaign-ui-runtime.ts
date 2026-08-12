import { rewardPoolV2EntryById } from "../content/upgrades/reward-pool-v2";
import type {
  GameCommand,
  GameCommandDispatchResult,
  GameState,
} from "../game/domain/types";
import type { ProfileSettings } from "../game/profile/types";
import type { ProfileRuntime } from "./profile-runtime";
import type { RunSaveStatus } from "./run-save-runtime";

export interface CampaignUiRuntimeOptions {
  readonly root: HTMLDivElement;
  readonly gameState: GameState;
  readonly dispatch: (command: GameCommand) => GameCommandDispatchResult;
  readonly getContinueStatus: () => RunSaveStatus;
  readonly continueRun: () => { readonly ok: true } | { readonly ok: false; readonly message: string };
  readonly profile: ProfileRuntime;
  readonly validationMode?: boolean;
  readonly onSettingsChanged: (
    settings: Readonly<ProfileSettings>,
    changedKey: keyof ProfileSettings,
  ) => void;
  readonly onPauseChanged: (paused: boolean) => void;
  readonly onStateTransition: (
    result: GameCommandDispatchResult["result"] | "run-continued",
  ) => void;
}

export interface CampaignUiRuntime {
  update(): void;
  togglePause(): void;
  dispose(): void;
}

type TitleView = "main" | "settings";

export function createCampaignUiRuntime(options: CampaignUiRuntimeOptions): CampaignUiRuntime {
  const { root, gameState, dispatch, onStateTransition } = options;
  let renderedSignature = "";
  let continueError = "";
  let titleView: TitleView = "main";
  let paused = false;

  const onClick = (event: MouseEvent) => {
    const target = event.target instanceof Element
      ? event.target.closest<HTMLElement>("[data-action]")
      : null;
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
    }

    if (action === "start-run") {
      continueError = "";
      result = dispatch({ type: "start-full-game-run" });
    } else if (action === "title-view" && target.dataset.view) {
      if (target.dataset.view === "main" || target.dataset.view === "settings") {
        titleView = target.dataset.view;
        renderedSignature = "";
        update();
      }
      return;
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
      if (!window.confirm("确认重建本地设置？损坏原文会先备份。")) return;
      const outcome = options.profile.rebuildCorruptProfile();
      continueError = outcome.ok
        ? (outcome.backupKey ? "旧设置已备份并重建。" : "设置已重建。")
        : outcome.message;
      renderedSignature = "";
      update();
      return;
    } else if (action === "resume-game") {
      paused = false;
      options.onPauseChanged(false);
      renderedSignature = "";
      update();
      return;
    } else if (action === "abandon-run") {
      result = dispatch({ type: "abandon-run" });
      paused = false;
      options.onPauseChanged(false);
    } else if (action === "restart-encounter") {
      result = dispatch({ type: "restart-stage" });
    } else if (action === "return-to-title") {
      result = dispatch({ type: "return-to-title" });
    } else if (
      action === "select-reward-skill" &&
      target.dataset.offerId &&
      target.dataset.skillId
    ) {
      result = dispatch({
        type: "select-reward-skill",
        offerId: target.dataset.offerId,
        skillId: target.dataset.skillId,
      });
    }

    if (!result) return;
    renderedSignature = "";
    if (result.result === "returned-to-title" || result.result === "run-abandoned") {
      titleView = "main";
    }
    onStateTransition(result.result);
    update();
  };

  root.addEventListener("click", onClick);

  function update(): void {
    const campaign = gameState.run.fullGame;
    const continueStatus = options.getContinueStatus();
    const profile = options.profile.profile();
    const profileStatus = options.profile.status();
    const signature = campaign === null ? "legacy" : JSON.stringify({
      phase: campaign.phase,
      rewardDraft: campaign.activeRewardDraft,
      assistRebootsRemaining: campaign.protocol.assistRebootsRemaining,
      continueStatus,
      continueError,
      titleView,
      settings: profile.settings,
      profileStatus,
      paused,
    });
    if (signature === renderedSignature) return;
    renderedSignature = signature;

    const supportedPhase = campaign && (
      campaign.phase === "title" ||
      campaign.phase === "upgrade-choice" ||
      campaign.phase === "victory" ||
      campaign.phase === "defeat"
    );
    const showPause = Boolean(
      campaign && paused && campaign.phase === "combat" && gameState.stage.phase === "playing",
    );
    const showOverlay = Boolean(supportedPhase || showPause);

    root.className = showOverlay && campaign
      ? `campaign-ui phase-${campaign.phase}`
      : "campaign-ui hidden";
    document.body.classList.toggle("campaign-ui-active", showOverlay);

    if (!campaign || !showOverlay) {
      root.replaceChildren();
      return;
    }

    if (showPause) {
      root.innerHTML = renderPause();
    } else if (campaign.phase === "title") {
      root.innerHTML = titleView === "settings"
        ? renderSettings(options, continueError)
        : renderTitle(options, continueStatus, continueError);
    } else if (campaign.phase === "upgrade-choice") {
      root.innerHTML = renderUpgradeChoice(gameState);
    } else if (campaign.phase === "victory") {
      root.innerHTML = renderVictory();
    } else if (campaign.phase === "defeat") {
      root.innerHTML = renderDefeat(gameState);
    } else {
      root.replaceChildren();
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
  options: CampaignUiRuntimeOptions,
  continueStatus: RunSaveStatus,
  continueError: string,
): string {
  const profileStatus = options.profile.status();
  const statusMessage = continueError || (
    continueStatus.kind === "error" ? continueStatus.message : ""
  );
  const continueButton = continueStatus.kind === "ready"
    ? '<button class="secondary-action" type="button" data-action="continue-run">继续游戏</button>'
    : "";
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

function renderSettings(options: CampaignUiRuntimeOptions, message: string): string {
  const settings = options.profile.profile().settings;
  const status = options.profile.status();
  return `
    <section class="campaign-panel library-panel settings-panel" aria-labelledby="settings-title">
      <header class="library-header">
        <div><p class="panel-kicker">PROJECT SLASH</p><h1 id="settings-title">设置</h1></div>
        <button class="secondary-action" type="button" data-action="title-view" data-view="main">返回</button>
      </header>
      ${message ? `<p class="save-error" role="status">${escapeHtml(message)}</p>` : ""}
      ${status.kind === "error" ? `
        <div class="profile-recovery">
          <p class="save-error" role="alert">${escapeHtml(status.message)}</p>
          <button class="secondary-action" type="button" data-action="rebuild-profile">备份并重建本地设置</button>
        </div>` : `
        ${renderSettingRow("音频", "audioEnabled", settings.audioEnabled)}
        ${renderSettingRow("减少动态效果", "reducedMotion", settings.reducedMotion)}
        ${renderSettingRow("高对比度", "highContrast", settings.highContrast)}
        <div class="setting-row">
          <b>画质</b>
          <div class="setting-actions">
            <button class="secondary-action ${settings.qualityMode === "high" ? "selected" : ""}" type="button" data-action="setting" data-setting="qualityMode" data-value="high">高画质</button>
            <button class="secondary-action ${settings.qualityMode === "compatibility" ? "selected" : ""}" type="button" data-action="setting" data-setting="qualityMode" data-value="compatibility">兼容模式</button>
          </div>
        </div>`}
    </section>`;
}

function renderSettingRow(
  title: string,
  key: "audioEnabled" | "reducedMotion" | "highContrast",
  enabled: boolean,
): string {
  return `
    <div class="setting-row">
      <b>${escapeHtml(title)}</b>
      <button class="secondary-action ${enabled ? "selected" : ""}" type="button" data-action="setting" data-setting="${key}" data-value="${String(!enabled)}">${enabled ? "开启" : "关闭"}</button>
    </div>`;
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

function renderVictory(): string {
  return `
    <section class="campaign-panel reward-panel" aria-labelledby="victory-title">
      <h1 id="victory-title">通关</h1>
      <div class="defeat-actions">
        <button class="primary-action" type="button" data-action="return-to-title">返回主页</button>
      </div>
    </section>`;
}

function renderDefeat(state: GameState): string {
  const campaign = state.run.fullGame;
  if (!campaign) return "";
  const canReboot = campaign.protocol.mode === "assist" &&
    campaign.protocol.assistRebootsRemaining > 0;
  return `
    <section class="campaign-panel reward-panel defeat-panel" aria-labelledby="defeat-title">
      <h1 id="defeat-title">本局结束</h1>
      <div class="defeat-actions">
        ${canReboot ? '<button class="primary-action" type="button" data-action="restart-encounter">重试本关</button>' : ""}
        <button class="secondary-action" type="button" data-action="return-to-title">返回主页</button>
      </div>
    </section>`;
}

function renderPause(): string {
  return `
    <section class="campaign-panel pause-panel" aria-labelledby="pause-title">
      <h1 id="pause-title">已暂停</h1>
      <div class="pause-actions">
        <button class="primary-action" type="button" data-action="resume-game">继续</button>
        <button class="secondary-action" type="button" data-action="abandon-run">返回主页</button>
      </div>
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
