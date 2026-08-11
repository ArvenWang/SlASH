import * as THREE from "three";
import { createAudioRuntime } from "../audio";
import { createDiagnostics } from "../diagnostics";
import { createPostFx } from "../postfx";
import { GAMEPLAY_CAMERA_CONFIG } from "../presentation/camera-config";
import { createProfiledAudioRuntime, type ProfiledAudioRuntime } from "../presentation/audio/profiled-audio-runtime";
import { createProfiledPostFxRuntime, type ProfiledPostFxRuntime } from "../presentation/postfx/profiled-postfx-runtime";
import { createProfiledVfxRuntime, type ProfiledVfxRuntime } from "../presentation/vfx/profiled-vfx-runtime";
import {
  assertPresentationRegistryIntegrity,
  environmentRegistry,
  lightingRegistry,
  postFxRegistry,
} from "../presentation/registry";
import { createEnvironment, type EnvironmentRuntime } from "../scene/environment";
import { createVfxRuntime } from "../vfx";

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
  readonly postFx: ProfiledPostFxRuntime;
  readonly vfx: ProfiledVfxRuntime;
  readonly audio: ProfiledAudioRuntime;
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
  if (environmentProfile.runtimeId !== "transit-cathedral-runtime-current") {
    throw new Error(`Unsupported environment runtime: ${environmentProfile.runtimeId}`);
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
  renderer.toneMappingExposure = lightingProfile.exposure;
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

  const hemisphere = new THREE.HemisphereLight(
    lightingProfile.hemisphere.sky,
    lightingProfile.hemisphere.ground,
    lightingProfile.hemisphere.intensity,
  );
  scene.add(hemisphere);
  const keyLight = new THREE.DirectionalLight(lightingProfile.key.color, lightingProfile.key.intensity);
  keyLight.position.set(...lightingProfile.key.position);
  keyLight.target.position.set(0, 0, 0);
  keyLight.castShadow = true;
  const shadowMapSize = lightingProfile.shadowMapSize[options.qualityMode];
  keyLight.shadow.mapSize.set(shadowMapSize, shadowMapSize);
  keyLight.shadow.camera.left = -26;
  keyLight.shadow.camera.right = 26;
  keyLight.shadow.camera.top = 21;
  keyLight.shadow.camera.bottom = -21;
  keyLight.shadow.camera.near = 3;
  keyLight.shadow.camera.far = 90;
  keyLight.shadow.bias = -0.00035;
  keyLight.shadow.normalBias = 0.045;
  scene.add(keyLight, keyLight.target);

  const coldRim = new THREE.SpotLight(lightingProfile.coldRim.color, lightingProfile.coldRim.intensity, 90, Math.PI * 0.23, 0.86, 1.7);
  coldRim.position.set(...lightingProfile.coldRim.position);
  coldRim.target.position.set(-2, 0, 1);
  scene.add(coldRim, coldRim.target);
  const cityFill = new THREE.DirectionalLight(lightingProfile.cityFill.color, lightingProfile.cityFill.intensity);
  cityFill.position.set(...lightingProfile.cityFill.position);
  cityFill.target.position.set(0, 2, -52);
  scene.add(cityFill, cityFill.target);
  const arenaFill = new THREE.PointLight(lightingProfile.arenaFill.color, lightingProfile.arenaFill.intensity, 58, 1.8);
  arenaFill.position.set(...lightingProfile.arenaFill.position);
  scene.add(arenaFill);
  const hostileRim = new THREE.PointLight(lightingProfile.hostileRim.color, lightingProfile.hostileRim.intensity, 28, 2.2);
  hostileRim.position.set(...lightingProfile.hostileRim.position);
  scene.add(hostileRim);
  const heroAnchor = new THREE.PointLight(lightingProfile.heroAnchor.color, lightingProfile.heroAnchor.intensity, 5.5, 2.2);
  heroAnchor.position.set(0, 1.85, 0);
  scene.add(heroAnchor);
  const heroKeyTarget = new THREE.Object3D();
  const heroKey = new THREE.SpotLight(lightingProfile.heroKey.color, lightingProfile.heroKey.intensity, 10, Math.PI * 0.105, 0.82, 2);
  heroKey.castShadow = false;
  heroKey.position.set(2.8, 5.2, 3.8);
  heroKeyTarget.position.set(0, 1.45, 0);
  heroKey.target = heroKeyTarget;
  scene.add(heroKey, heroKeyTarget);

  const environment = createEnvironment(scene, {
    background: environmentProfile.background,
    fogColor: environmentProfile.fogColor,
    fogDensity: environmentProfile.fogDensity,
    rainDensity: environmentProfile.rainDensity,
    modules: environmentProfile.modules,
  });
  const basePostFx = createPostFx(
    renderer,
    scene,
    camera,
    {
      bloomStrength: postFxProfile.bloomStrength[options.qualityMode],
      bloomRadius: postFxProfile.bloomRadius[options.qualityMode],
      bloomThreshold: postFxProfile.bloomThreshold,
    },
  );
  const postFx = createProfiledPostFxRuntime(basePostFx);
  const vfx = createProfiledVfxRuntime(createVfxRuntime(scene));
  const audio = createProfiledAudioRuntime(createAudioRuntime());

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
      vfx.dispose();
      environment.dispose();
      postFx.composer.dispose();
      void audio.dispose();
      renderer.dispose();
    },
  };
}
