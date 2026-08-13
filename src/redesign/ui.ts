import type { GameCommand, GameState } from "./state";
import { coreUpgradeById } from "./skills";
import type { SaveLoadResult } from "./persistence";

export interface UiRuntime {
  update(state: GameState, continueState: SaveLoadResult): void;
  setPaused(paused: boolean): void;
  dispose(): void;
}

export interface UiOptions {
  readonly root: HTMLElement;
  readonly dispatch: (command: GameCommand) => void;
  readonly onContinue: () => void;
  readonly onPauseChange: (paused: boolean) => void;
}

export function createUiRuntime(options: UiOptions): UiRuntime {
  let signature = "";
  let paused = false;
  let activeState: GameState | null = null;
  let activeContinue: SaveLoadResult | null = null;

  const onClick = (event: MouseEvent): void => {
    const target = event.target instanceof Element
      ? event.target.closest<HTMLElement>("[data-action]")
      : null;
    if (!target || !activeState) return;
    const action = target.dataset.action;
    if (action === "start") {
      options.dispatch({ type: "start-run" });
    } else if (action === "continue") {
      options.onContinue();
    } else if (action === "select-upgrade") {
      const offerId = target.dataset.offerId;
      const upgradeId = target.dataset.upgradeId;
      if (offerId && upgradeId) options.dispatch({ type: "select-upgrade", offerId, upgradeId: upgradeId as never });
    } else if (action === "restart") {
      options.dispatch({ type: "restart-run" });
    } else if (action === "title") {
      options.dispatch({ type: "return-title" });
    } else if (action === "resume") {
      paused = false;
      options.onPauseChange(false);
      render();
    }
  };
  options.root.addEventListener("click", onClick);

  function render(): void {
    const state = activeState;
    const continueState = activeContinue;
    if (!state || !continueState) return;
    const nextSignature = `${state.phase}|${paused}|${state.run.activeOffer?.id ?? ""}|${continueState.ok ? continueState.savedAt : continueState.reason}`;
    if (nextSignature === signature) return;
    signature = nextSignature;
    options.root.classList.toggle("visible", state.phase !== "combat" || paused);
    if (paused && state.phase === "combat") {
      options.root.innerHTML = `
        <section class="screen-card pause-card">
          <h1>暂停</h1>
          <div class="screen-actions">
            <button class="primary-button" data-action="resume">继续</button>
            <button class="secondary-button" data-action="title">返回主页</button>
          </div>
        </section>`;
      return;
    }
    if (state.phase === "title") {
      const continueButton = continueState.ok
        ? '<button class="secondary-button" data-action="continue">继续游戏</button>'
        : "";
      const error = !continueState.ok && continueState.reason !== "missing"
        ? `<p class="save-message">${escapeHtml(continueState.message)}</p>`
        : "";
      options.root.innerHTML = `
        <section class="screen-card title-card">
          <span class="eyebrow">PROJECT SLASH</span>
          <h1>斩线</h1>
          <div class="title-mark" aria-hidden="true"><i></i><i></i><i></i></div>
          <div class="screen-actions">
            <button class="primary-button" data-action="start">开始游戏</button>
            ${continueButton}
          </div>
          ${error}
        </section>`;
      return;
    }
    if (state.phase === "reward" && state.run.activeOffer) {
      const offer = state.run.activeOffer;
      options.root.innerHTML = `
        <section class="reward-screen" aria-labelledby="reward-title">
          <h1 id="reward-title">选择强化</h1>
          <div class="reward-grid">
            ${offer.candidateUpgradeIds.map((upgradeId) => {
              const upgrade = coreUpgradeById(upgradeId);
              return `<button class="reward-card" data-action="select-upgrade" data-offer-id="${escapeHtml(offer.id)}" data-upgrade-id="${escapeHtml(upgrade.id)}">
                <span class="rank">${roman(upgrade.rank)}</span>
                <strong>${escapeHtml(upgrade.name)}</strong>
                <small>${escapeHtml(upgrade.effect)}</small>
              </button>`;
            }).join("")}
          </div>
        </section>`;
      return;
    }
    if (state.phase === "victory" || state.phase === "defeat") {
      options.root.innerHTML = `
        <section class="screen-card end-card">
          <h1>${state.phase === "victory" ? "通关" : "本局结束"}</h1>
          <div class="screen-actions">
            <button class="primary-button" data-action="restart">再来一次</button>
            <button class="secondary-button" data-action="title">返回主页</button>
          </div>
        </section>`;
      return;
    }
    options.root.replaceChildren();
  }

  return {
    update(state, continueState) {
      activeState = state;
      activeContinue = continueState;
      if (state.phase !== "combat") paused = false;
      render();
    },
    setPaused(value) {
      if (activeState?.phase !== "combat") return;
      paused = value;
      options.onPauseChange(value);
      signature = "";
      render();
    },
    dispose() {
      options.root.removeEventListener("click", onClick);
      options.root.replaceChildren();
    },
  };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function roman(rank: number): string {
  return ["", "I", "II", "III"][rank] ?? String(rank);
}
