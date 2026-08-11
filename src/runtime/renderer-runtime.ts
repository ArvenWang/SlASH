import * as THREE from "three";
import { createAudioRuntime, type AudioRuntime } from "../audio";
import { createDiagnostics } from "../diagnostics";
import { createPostFx, type PostFxRuntime } from "../postfx";
import { GAMEPLAY_CAMERA_CONFIG } from "../presentation/camera-config";
import {
  assertPresentationRegistryIntegrity,
  environmentRegistry,
  lightingRegistry,
  postFxRegistry,
} from "../presentation/registry";
import { createEnvironment, type EnvironmentRuntime } from "../scene/environment";
import { createVfxRuntime, type VfxRuntime } from "../vfx";

export type QualityMode = "high" | "compatibility";

export interface RendererLightingRuntime {
  readonly hostileRim: THREE.PointLight;
  readonly heroAnchor: THREE.PointLight;
  readonly heroKey: THREE.SpotLight;
  readonly heroKeyTarget: THREE.Object3D;
}

export interface RendererRuntime {
  readonly qualityMode: QualityMode;
  readonly renderer: THREE.WebGLRenderer;
  readonly diagnostics: ReturnType<typeof createDiagnostics>;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly cameraBase: THREE.Vector3;
  readonly cameraTarget: THREE.Vector3;
  readonly lighting: RendererLightingRuntime;
  readonly environment: EnvironmentRuntime;
  readonly postFx: PostFxRuntime;
  readonly vfx: VfxRuntime;
  readonly audio: AudioRuntime;
  resize(): void;
  render(): void;
  dispose(): void;
}

export interface RendererRuntimeOptions {
  readonly canvas: HTMLCanvasElement;
  readonly qualityMode: QualityMode;
  readonly environmentId: string;
  readonly lightingProfileId: string;
}

export function createRendererRuntime(options: RendererRuntimeOptions): RendererRuntime {
  assertPresentationRegistryIntegrity();
  const environmentProfile = environmentRegistry.get(options.environmentId);
  if (environmentProfile.lightingProfileId !== options.lightingProfileId) {
    throw new Error(`Environment ${environmentProfile.id} does not provide ${options.lightingProfileId}.`);
  }
  const lightingProfile = lightingRegistry.get(environmentProfile.lightingProfileId);
  const postFxProfile = postFxRegistry.get(environmentProfile.postFxProfileId);
  if (lightingProfile.runtimeId !== "transit-cathedral-lighting-current") {
    throw new Error(`Unsupported lighting runtime: ${lightingProfile.runtimeId}`);
  }
  if (postFxProfile.runtimeId !== "cinematic-postfx-current") {
    throw new Error(`Unsupported post FX runtime: ${postFxProfile.runtimeId}`);
  }
  const compatibilityMode = options.qualityMode === "compatibility";
  const renderer = new THREE.WebGLRenderer({
    canvas: options.canvas,
    antialias: true,
    alpha: false,
    powerPreference: "high-performance",
    stencil: false,
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.98;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.info.autoReset = false;
  const diagnostics = createDiagnostics(renderer);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x07111c);
  scene.fog = new THREE.FogExp2(0x0a1622, 0.0058);
  const camera = new THREE.PerspectiveCamera(
    GAMEPLAY_CAMERA_CONFIG.fov,
    1,
    GAMEPLAY_CAMERA_CONFIG.near,
    GAMEPLAY_CAMERA_CONFIG.far,
  );
  const cameraBase = new THREE.Vector3(...GAMEPLAY_CAMERA_CONFIG.position);
  const cameraTarget = new THREE.Vector3(...GAMEPLAY_CAMERA_CONFIG.target);
  camera.position.copy(cameraBase);
  camera.lookAt(cameraTarget);

  const hemisphere = new THREE.HemisphereLight(0xb8dbe2, 0x080d12, 0.46);
  scene.add(hemisphere);
  const keyLight = new THREE.DirectionalLight(0xd9f7ff, 2.25);
  keyLight.position.set(-18, 34, 19);
  keyLight.target.position.set(0, 0, 0);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(compatibilityMode ? 1024 : 1536, compatibilityMode ? 1024 : 1536);
  keyLight.shadow.camera.left = -26;
  keyLight.shadow.camera.right = 26;
  keyLight.shadow.camera.top = 21;
  keyLight.shadow.camera.bottom = -21;
  keyLight.shadow.camera.near = 3;
  keyLight.shadow.camera.far = 90;
  keyLight.shadow.bias = -0.00035;
  keyLight.shadow.normalBias = 0.045;
  scene.add(keyLight, keyLight.target);

  const coldRim = new THREE.SpotLight(0x62dfff, 610, 90, Math.PI * 0.23, 0.86, 1.7);
  coldRim.position.set(20, 20, -24);
  coldRim.target.position.set(-2, 0, 1);
  scene.add(coldRim, coldRim.target);
  const cityFill = new THREE.DirectionalLight(0x5a86a0, 1.08);
  cityFill.position.set(5, 38, -86);
  cityFill.target.position.set(0, 2, -52);
  scene.add(cityFill, cityFill.target);
  const arenaFill = new THREE.PointLight(0xa8d8df, 82, 58, 1.8);
  arenaFill.position.set(0, 13, 5);
  scene.add(arenaFill);
  const hostileRim = new THREE.PointLight(0xff3b1c, 58, 28, 2.2);
  hostileRim.position.set(-17, 4.5, -7);
  scene.add(hostileRim);
  const heroAnchor = new THREE.PointLight(0xb9f7ff, 2.2, 5.5, 2.2);
  heroAnchor.position.set(0, 1.85, 0);
  scene.add(heroAnchor);
  const heroKeyTarget = new THREE.Object3D();
  const heroKey = new THREE.SpotLight(0xbfd9e6, 380, 10, Math.PI * 0.105, 0.82, 2);
  heroKey.castShadow = false;
  heroKey.position.set(2.8, 5.2, 3.8);
  heroKeyTarget.position.set(0, 1.45, 0);
  heroKey.target = heroKeyTarget;
  scene.add(heroKey, heroKeyTarget);

  const environment = createEnvironment(scene);
  const postFx = createPostFx(
    renderer,
    scene,
    camera,
    compatibilityMode ? { bloomStrength: 0.28, bloomRadius: 0.25 } : undefined,
  );
  const vfx = createVfxRuntime(scene);
  const audio = createAudioRuntime();

  return {
    qualityMode: options.qualityMode,
    renderer,
    diagnostics,
    scene,
    camera,
    cameraBase,
    cameraTarget,
    lighting: { hostileRim, heroAnchor, heroKey, heroKeyTarget },
    environment,
    postFx,
    vfx,
    audio,
    resize() {
      const width = Math.max(1, options.canvas.clientWidth);
      const height = Math.max(1, options.canvas.clientHeight);
      const mobile = Math.min(width, height) < 700;
      const pixelRatio = Math.min(
        window.devicePixelRatio,
        compatibilityMode ? (mobile ? 0.85 : 1) : (mobile ? 1.15 : 1.65),
      );
      renderer.setPixelRatio(pixelRatio);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      postFx.resize(width, height, pixelRatio);
    },
    render() {
      renderer.info.reset();
      postFx.composer.render();
      diagnostics.markPresented();
    },
    dispose() {
      vfx.clearStage();
      environment.dispose();
      postFx.composer.dispose();
      renderer.dispose();
    },
  };
}
