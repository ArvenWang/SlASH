import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";

export interface PostFxRuntime {
  composer: EffectComposer;
  bloom: UnrealBloomPass;
  impact: number;
  resize(width: number, height: number, pixelRatio: number): void;
  update(time: number, dt: number): void;
}

export interface PostFxOptions {
  bloomStrength?: number;
  bloomRadius?: number;
}

const cinematicShader = {
  uniforms: {
    tDiffuse: { value: null },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uTime: { value: 0 },
    uImpact: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec2 uResolution;
    uniform float uTime;
    uniform float uImpact;
    varying vec2 vUv;

    float hash(vec2 p) {
      p = fract(p * vec2(123.34, 456.21));
      p += dot(p, p + 45.32);
      return fract(p.x * p.y);
    }

    void main() {
      vec2 centered = vUv - 0.5;
      float edge = smoothstep(0.1, 0.72, length(centered * vec2(1.0, 0.84)));
      vec2 chroma = centered * (0.00034 + uImpact * 0.0018) * edge;
      float r = texture2D(tDiffuse, vUv + chroma).r;
      float g = texture2D(tDiffuse, vUv).g;
      float b = texture2D(tDiffuse, vUv - chroma).b;
      vec3 color = vec3(r, g, b);

      float vignette = 1.0 - smoothstep(0.32, 0.82, length(centered * vec2(1.0, 0.88)));
      color *= mix(0.74, 1.0, vignette);
      float grain = hash(vUv * uResolution + fract(uTime) * 431.0) - 0.5;
      color += grain * 0.012;
      color += vec3(0.08, 0.14, 0.16) * uImpact * 0.12;
      color = mix(color, color * vec3(0.93, 0.985, 1.025), 0.42);
      gl_FragColor = vec4(color, 1.0);
    }
  `,
};

export function createPostFx(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  options: PostFxOptions = {},
): PostFxRuntime {
  // The blade core keeps its material-driven peak, while this smaller bloom
  // budget prevents its halo and dash endpoints from erasing nearby anatomy.
  const baseBloomStrength = options.bloomStrength ?? 0.34;
  const baseBloomRadius = options.bloomRadius ?? 0.3;
  const composer = new EffectComposer(renderer);
  const renderPass = new RenderPass(scene, camera);
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), baseBloomStrength, baseBloomRadius, 1.02);
  bloom.threshold = 1.02;
  bloom.strength = baseBloomStrength;
  bloom.radius = baseBloomRadius;
  const cinematic = new ShaderPass(cinematicShader);
  const output = new OutputPass();
  composer.addPass(renderPass);
  composer.addPass(bloom);
  composer.addPass(cinematic);
  composer.addPass(output);

  const runtime: PostFxRuntime = {
    composer,
    bloom,
    impact: 0,
    resize(width, height, pixelRatio) {
      composer.setPixelRatio(pixelRatio);
      composer.setSize(width, height);
      cinematic.uniforms.uResolution.value.set(width * pixelRatio, height * pixelRatio);
    },
    update(time, dt) {
      runtime.impact = THREE.MathUtils.damp(runtime.impact, 0, 11, dt);
      cinematic.uniforms.uTime.value = time;
      cinematic.uniforms.uImpact.value = runtime.impact;
      bloom.strength = baseBloomStrength + runtime.impact * 0.18;
    },
  };
  return runtime;
}
