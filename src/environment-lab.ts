import { environmentProfileRegistry } from "./presentation/profiles/definitions";
import { createRendererRuntime } from "./runtime/renderer-runtime";

declare global {
  interface Window {
    render_environment_lab_to_text: () => string;
    environment_lab_validation: {
      setRainDensity(value: number): void;
      setFogDensity(value: number): void;
      snapshot(): unknown;
    };
  }
}

const canvas = document.querySelector<HTMLCanvasElement>("#environment-lab");
const profileSelect = document.querySelector<HTMLSelectElement>("#profile");
const rainInput = document.querySelector<HTMLInputElement>("#rain");
const fogInput = document.querySelector<HTMLInputElement>("#fog");
const exposureInput = document.querySelector<HTMLInputElement>("#exposure");
const postFxInput = document.querySelector<HTMLInputElement>("#postfx");
if (!canvas || !profileSelect || !rainInput || !fogInput || !exposureInput || !postFxInput) {
  throw new Error("Environment Lab shell is incomplete.");
}
const postFxControl: HTMLInputElement = postFxInput;
const params = new URLSearchParams(window.location.search);
const profileName = params.get("profile") === "day-inspection" ? "day-inspection" : "night";
const profileId = profileName === "day-inspection"
  ? "transit-cathedral-day-inspection"
  : "transit-cathedral-v1";
const profile = environmentProfileRegistry.get(profileId);
profileSelect.value = profileName;
rainInput.value = String(Number(params.get("rain") ?? profile.rainDensity));
fogInput.value = String(Number(params.get("fog") ?? profile.fogDensity));
const rendererRuntime = createRendererRuntime({
  canvas,
  qualityMode: params.get("quality") === "compatibility" ? "compatibility" : "high",
  environmentId: profile.id,
  lightingProfileId: profile.lightingProfileId,
});
rendererRuntime.environment.setRainDensity(Number(rainInput.value));
rendererRuntime.environment.setFogDensity(Number(fogInput.value));
exposureInput.value = String(rendererRuntime.renderer.toneMappingExposure);
rendererRuntime.camera.position.set(32.2, 31.01, 43.7);
rendererRuntime.camera.lookAt(-0.5, -3, -3.5);

function snapshot() {
  return {
    profileId,
    lightingProfileId: profile.lightingProfileId,
    postFxProfileId: profile.postFxProfileId,
    environment: rendererRuntime.environment.snapshot(),
    exposure: rendererRuntime.renderer.toneMappingExposure,
    postFxEnabled: postFxControl.checked,
    postFx: rendererRuntime.postFx.snapshot(),
    renderer: rendererRuntime.diagnostics.snapshot().renderer,
  };
}

rainInput.addEventListener("input", () => rendererRuntime.environment.setRainDensity(Number(rainInput.value)));
fogInput.addEventListener("input", () => rendererRuntime.environment.setFogDensity(Number(fogInput.value)));
exposureInput.addEventListener("input", () => {
  rendererRuntime.renderer.toneMappingExposure = Number(exposureInput.value);
});
profileSelect.addEventListener("change", () => {
  const next = new URL(window.location.href);
  next.searchParams.set("profile", profileSelect.value);
  window.location.assign(next);
});
window.render_environment_lab_to_text = () => JSON.stringify(snapshot());
window.environment_lab_validation = {
  setRainDensity(value) {
    rainInput.value = String(value);
    rendererRuntime.environment.setRainDensity(value);
  },
  setFogDensity(value) {
    fogInput.value = String(value);
    rendererRuntime.environment.setFogDensity(value);
  },
  snapshot,
};
window.addEventListener("resize", rendererRuntime.resize);
rendererRuntime.resize();
let previous = performance.now();
let time = 0;
function animate(now: number): void {
  const dt = Math.min(0.05, Math.max(0.001, (now - previous) / 1000));
  previous = now;
  time += dt;
  rendererRuntime.environment.update(time, dt);
  rendererRuntime.postFx.update(time, dt);
  if (postFxControl.checked) rendererRuntime.render();
  else rendererRuntime.renderer.render(rendererRuntime.scene, rendererRuntime.camera);
  requestAnimationFrame(animate);
}
requestAnimationFrame(animate);
