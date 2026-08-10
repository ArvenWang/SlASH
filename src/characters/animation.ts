import * as THREE from "three";

export interface HeroRigLike {
  rootMotion: THREE.Group;
  hips: THREE.Group;
  spine: THREE.Group;
  chest: THREE.Group;
  neck: THREE.Group;
  head: THREE.Group;
  leftShoulder: THREE.Group;
  rightShoulder: THREE.Group;
  leftUpperArm: THREE.Group;
  rightUpperArm: THREE.Group;
  leftForearm: THREE.Group;
  rightForearm: THREE.Group;
  leftHand: THREE.Group;
  rightHand: THREE.Group;
  leftUpperLeg: THREE.Group;
  rightUpperLeg: THREE.Group;
  leftShin: THREE.Group;
  rightShin: THREE.Group;
  leftFoot: THREE.Group;
  rightFoot: THREE.Group;
  swordPivot: THREE.Group;
}

export interface EnemyRigLike {
  rootMotion: THREE.Group;
  hips: THREE.Group;
  spine: THREE.Group;
  chest: THREE.Group;
  neck: THREE.Group;
  head: THREE.Group;
  leftShoulder: THREE.Group;
  rightShoulder: THREE.Group;
  leftUpperArm: THREE.Group;
  rightUpperArm: THREE.Group;
  leftForearm: THREE.Group;
  rightForearm: THREE.Group;
  leftHand: THREE.Group;
  rightHand: THREE.Group;
  leftUpperLeg: THREE.Group;
  rightUpperLeg: THREE.Group;
  leftShin: THREE.Group;
  rightShin: THREE.Group;
  leftFoot: THREE.Group;
  rightFoot: THREE.Group;
  weaponPivot: THREE.Group;
}

interface Transform {
  position: THREE.Vector3;
  rotation: THREE.Euler;
  scale: THREE.Vector3;
}

interface PoseTarget extends Transform {}

function smooth(value: number, start = 0, end = 1) {
  return THREE.MathUtils.smoothstep(THREE.MathUtils.clamp(value, start, end), start, end);
}

function collectRigNodes(rig: object) {
  return [...new Set(Object.values(rig).filter((value): value is THREE.Object3D => value instanceof THREE.Object3D))];
}

class ArticulatedPose {
  private readonly nodes: THREE.Object3D[];
  private readonly rest = new Map<THREE.Object3D, Transform>();
  private readonly targets = new Map<THREE.Object3D, PoseTarget>();

  constructor(rig: object) {
    this.nodes = collectRigNodes(rig);
    for (const node of this.nodes) {
      const transform = {
        position: node.position.clone(),
        rotation: node.rotation.clone(),
        scale: node.scale.clone(),
      };
      this.rest.set(node, transform);
      this.targets.set(node, {
        position: transform.position.clone(),
        rotation: transform.rotation.clone(),
        scale: transform.scale.clone(),
      });
    }
  }

  resetTargets() {
    for (const node of this.nodes) {
      const rest = this.rest.get(node);
      const target = this.targets.get(node);
      if (!rest || !target) continue;
      target.position.copy(rest.position);
      target.rotation.copy(rest.rotation);
      target.scale.copy(rest.scale);
    }
  }

  rotate(node: THREE.Object3D, x = 0, y = 0, z = 0) {
    const target = this.targets.get(node);
    if (!target) return;
    target.rotation.x += x;
    target.rotation.y += y;
    target.rotation.z += z;
  }

  move(node: THREE.Object3D, x = 0, y = 0, z = 0) {
    const target = this.targets.get(node);
    if (!target) return;
    target.position.x += x;
    target.position.y += y;
    target.position.z += z;
  }

  scale(node: THREE.Object3D, x = 0, y = 0, z = 0) {
    const target = this.targets.get(node);
    if (!target) return;
    target.scale.x *= 1 + x;
    target.scale.y *= 1 + y;
    target.scale.z *= 1 + z;
  }

  commit(dt: number, responsiveness: number) {
    for (const node of this.nodes) {
      const target = this.targets.get(node);
      if (!target) continue;
      node.position.x = THREE.MathUtils.damp(node.position.x, target.position.x, responsiveness, dt);
      node.position.y = THREE.MathUtils.damp(node.position.y, target.position.y, responsiveness, dt);
      node.position.z = THREE.MathUtils.damp(node.position.z, target.position.z, responsiveness, dt);
      node.rotation.x = THREE.MathUtils.damp(node.rotation.x, target.rotation.x, responsiveness, dt);
      node.rotation.y = THREE.MathUtils.damp(node.rotation.y, target.rotation.y, responsiveness, dt);
      node.rotation.z = THREE.MathUtils.damp(node.rotation.z, target.rotation.z, responsiveness, dt);
      node.scale.x = THREE.MathUtils.damp(node.scale.x, target.scale.x, responsiveness, dt);
      node.scale.y = THREE.MathUtils.damp(node.scale.y, target.scale.y, responsiveness, dt);
      node.scale.z = THREE.MathUtils.damp(node.scale.z, target.scale.z, responsiveness, dt);
    }
  }

  snapToRest() {
    this.resetTargets();
    for (const node of this.nodes) {
      const target = this.targets.get(node);
      if (!target) continue;
      node.position.copy(target.position);
      node.rotation.copy(target.rotation);
      node.scale.copy(target.scale);
    }
  }
}

export interface HeroAnimationFrame {
  time: number;
  dt: number;
  turn: number;
  dashProgress: number | null;
  recoveryProgress: number | null;
  deathProgress: number | null;
}

export interface HeroAnimator {
  update(frame: HeroAnimationFrame): void;
  reset(): void;
}

export function createHeroAnimator(rig: HeroRigLike, phase = 0): HeroAnimator {
  const pose = new ArticulatedPose(rig);

  function addIdle(time: number, turn: number, weight: number) {
    const breath = Math.sin(time * 2.35 + phase);
    const settle = Math.sin(time * 1.18 + phase * 0.7);
    // Ready is a permanently loaded stance, not a neutral showroom idle. The
    // hips stay low, the torso presses toward the target and the rear leg keeps
    // enough compression to launch without first standing upright.
    pose.move(rig.rootMotion, 0, (-0.29 + breath * 0.01) * weight, (0.075 + settle * 0.006) * weight);
    pose.rotate(rig.rootMotion, (0.25 + breath * 0.01) * weight, -0.055 * weight, (-0.025 + settle * 0.008) * weight);
    pose.move(rig.hips, 0, (-0.145 + breath * 0.01) * weight, 0.025 * weight);
    pose.rotate(rig.hips, -0.1 * weight, -0.16 * weight, (0.04 + settle * 0.01) * weight);
    pose.rotate(rig.spine, (0.16 + breath * 0.012) * weight, (-0.09 + turn * 0.12) * weight, -0.03 * weight);
    pose.rotate(rig.chest, (0.18 + breath * 0.014) * weight, (-0.17 + turn * 0.2) * weight, (-0.045 + settle * 0.01) * weight);
    pose.rotate(rig.neck, -0.12 * weight, (0.1 + turn * 0.13) * weight, 0.015 * weight);
    pose.rotate(rig.head, -0.22 * weight, (0.16 + turn * 0.34) * weight, -turn * 0.035 * weight);

    // Sword hand is loaded beside the hip while the free hand reaches forward
    // as a counterweight. This keeps clear arm/torso negative space at 64 px.
    pose.rotate(rig.leftShoulder, (-0.2 + breath * 0.01) * weight, 0.03 * weight, (-0.12 + settle * 0.018) * weight);
    pose.rotate(rig.rightShoulder, (0.12 - breath * 0.008) * weight, -0.05 * weight, (0.11 - settle * 0.014) * weight);
    pose.rotate(rig.leftUpperArm, -0.42 * weight, 0.08 * weight, -0.15 * weight);
    pose.rotate(rig.rightUpperArm, 0.36 * weight, -0.12 * weight, 0.14 * weight);
    pose.rotate(rig.leftForearm, (0.5 + breath * 0.02) * weight, 0, -0.08 * weight);
    pose.rotate(rig.rightForearm, (-0.4 - breath * 0.018) * weight, 0.03 * weight, 0.08 * weight);

    // Both feet remain planted in Ready. Opposing thigh/shin rotations form a
    // low launch stance without turning the rear leg into a suspended run pose.
    pose.move(rig.leftUpperLeg, -0.025 * weight, 0, 0.015 * weight);
    pose.move(rig.rightUpperLeg, 0.025 * weight, 0, -0.01 * weight);
    pose.rotate(rig.leftUpperLeg, -0.19 * weight, 0.04 * weight, -0.095 * weight);
    pose.rotate(rig.rightUpperLeg, 0.09 * weight, -0.035 * weight, 0.095 * weight);
    pose.rotate(rig.leftShin, 0.45 * weight, 0, 0);
    pose.rotate(rig.rightShin, 0.38 * weight, 0, 0);
    pose.rotate(rig.leftFoot, -0.11 * weight, 0, 0);
    pose.rotate(rig.rightFoot, -0.04 * weight, 0, 0);
    pose.rotate(rig.swordPivot, -0.39 * weight, 0.18 * weight, 0.11 * weight);
  }

  function addDash(progress: number) {
    const p = THREE.MathUtils.clamp(progress, 0, 1);
    const anticipation = 1 - smooth(p, 0.02, 0.18);
    const transitIn = smooth(p, 0.03, 0.2);
    const transitOut = 1 - smooth(p, 0.62, 0.9);
    const transit = transitIn * transitOut;
    const brake = smooth(p, 0.62, 1);

    pose.move(rig.rootMotion, 0, -0.17 * anticipation - 0.21 * transit - 0.14 * brake, 0.12 * transit + 0.035 * brake);
    pose.rotate(rig.rootMotion, 0.24 * anticipation + 0.48 * transit + 0.14 * brake, 0, -0.03 * transit + 0.035 * brake);
    pose.scale(rig.rootMotion, -0.018 * transit, -0.045 * transit, 0.09 * transit);
    pose.move(rig.hips, 0, -0.08 * transit - 0.03 * brake, 0.04 * transit);
    pose.rotate(rig.hips, -0.05 * anticipation + 0.06 * transit + 0.04 * brake, -0.08 * transit + 0.15 * brake, -0.025 * transit + 0.06 * brake);
    pose.rotate(rig.spine, 0.28 * anticipation + 0.12 * transit - 0.08 * brake, -0.06 * transit + 0.18 * brake, 0.03 * brake);
    pose.rotate(rig.chest, 0.2 * anticipation + 0.08 * transit - 0.16 * brake, -0.1 * transit + 0.3 * brake, -0.06 * brake);
    pose.rotate(rig.neck, -0.16 * transit + 0.08 * brake, 0.08 * transit - 0.12 * brake, 0);
    pose.rotate(rig.head, -0.12 * anticipation - 0.26 * transit + 0.16 * brake, 0.1 * transit - 0.2 * brake, 0.02 * transit);

    // Transit: the forward leg becomes one long line while the rear leg folds
    // under the hips. Arrival opens both legs into a readable braking stance.
    pose.rotate(rig.leftUpperLeg, -0.42 * anticipation + 0.18 * transit - 0.62 * brake, 0.045 * transit, -0.07 * transit);
    pose.rotate(rig.rightUpperLeg, 0.3 * anticipation + 0.54 * transit + 0.48 * brake, -0.035 * transit, 0.055 * transit);
    pose.rotate(rig.leftShin, 0.56 * anticipation + 0.12 * transit + 0.58 * brake, 0, 0);
    pose.rotate(rig.rightShin, 0.48 * anticipation + 0.78 * transit + 0.62 * brake, 0, 0);
    pose.rotate(rig.leftFoot, 0.12 * transit + 0.08 * brake, 0, 0);
    pose.rotate(rig.rightFoot, 0.1 * transit - 0.18 * brake, 0, 0);

    // The free arm streams backward; the sword arm reaches forward so both
    // sides of the torso keep negative space in the compressed silhouette.
    pose.rotate(rig.leftShoulder, -0.24 * anticipation + 0.08 * transit + 0.45 * brake, -0.2 * transit, -0.12 * anticipation + 0.14 * transit);
    pose.rotate(rig.leftUpperArm, -0.3 * anticipation + 0.32 * transit + 0.15 * brake, -0.08 * transit, 0.38 * transit - 0.12 * brake);
    pose.rotate(rig.leftForearm, 0.35 * anticipation + 0.12 * transit + 0.2 * brake, 0, 0.06 * transit);
    pose.rotate(rig.rightShoulder, 0.34 * anticipation - 0.32 * transit - 0.75 * brake, 0.1 * transit, 0.08 * anticipation + 0.12 * brake);
    pose.rotate(rig.rightUpperArm, 0.55 * anticipation - 0.92 * transit - 0.85 * brake, -0.13 * transit - 0.1 * brake, 0.14 * transit + 0.18 * brake);
    pose.rotate(rig.rightForearm, -0.18 * anticipation + 0.22 * transit + 0.65 * brake, 0, 0.07 * transit + 0.1 * brake);
    pose.rotate(
      rig.swordPivot,
      -0.12 * anticipation - 1.24273375 * transit - 2.25917403 * brake,
      0.08 * anticipation - 0.73933789 * transit + 1.15545802 * brake,
      -0.1 * anticipation + 1.59334652 * transit + 2.75034057 * brake,
    );
  }

  function addRecovery(progress: number, time: number) {
    const p = THREE.MathUtils.clamp(progress, 0, 1);
    const ready = smooth(p, 0.08, 0.94);
    const hold = 1 - ready;
    const sheath = Math.sin(Math.PI * smooth(p, 0.12, 0.84));

    // Blend the authored arrival pose into the exact same loaded stance used by
    // normal Ready. Reusing addIdle avoids a one-frame stand-up pop.
    addIdle(time, 0, ready);
    pose.move(rig.rootMotion, 0, -0.14 * hold, 0.035 * hold);
    pose.rotate(rig.rootMotion, 0.14 * hold, 0, 0.035 * hold);
    pose.move(rig.hips, 0, -0.03 * hold, 0);
    pose.rotate(rig.hips, 0.04 * hold, 0.15 * hold, 0.06 * hold);
    pose.rotate(rig.spine, -0.08 * hold, 0.18 * hold, 0.03 * hold);
    pose.rotate(rig.chest, -0.16 * hold - 0.08 * sheath, 0.3 * hold - 0.1 * sheath, -0.08 * hold);
    pose.rotate(rig.neck, 0.08 * hold, -0.12 * hold, 0);
    pose.rotate(rig.head, 0.16 * hold, -0.2 * hold, 0);

    pose.rotate(rig.leftUpperLeg, -0.62 * hold, 0, 0);
    pose.rotate(rig.rightUpperLeg, 0.48 * hold, 0, 0);
    pose.rotate(rig.leftShin, 0.58 * hold, 0, 0);
    pose.rotate(rig.rightShin, 0.62 * hold, 0, 0);
    pose.rotate(rig.leftFoot, 0.08 * hold, 0, 0);
    pose.rotate(rig.rightFoot, -0.18 * hold, 0, 0);

    pose.rotate(rig.leftShoulder, 0.45 * hold, 0, 0);
    pose.rotate(rig.leftUpperArm, 0.15 * hold + 0.14 * sheath, 0, -0.12 * hold);
    pose.rotate(rig.leftForearm, 0.2 * hold, 0, 0);
    pose.rotate(rig.rightShoulder, -0.75 * hold, 0, 0.12 * hold);
    pose.rotate(rig.rightUpperArm, -0.85 * hold + 0.28 * sheath, -0.1 * hold, 0.18 * hold);
    pose.rotate(rig.rightForearm, 0.65 * hold - 0.22 * sheath, 0, 0.1 * hold);
    pose.rotate(
      rig.swordPivot,
      -2.25917403 * hold,
      1.15545802 * hold,
      2.75034057 * hold,
    );
  }

  function addDeath(progress: number) {
    const p = smooth(progress);
    const fall = smooth(p, 0.08, 0.78);
    const settle = smooth(p, 0.72, 1);
    pose.move(rig.rootMotion, 0.16 * fall, -0.72 * fall, -0.16 * fall);
    pose.rotate(rig.rootMotion, -0.22 * fall, 0.18 * fall, 1.18 * fall - 0.16 * settle);
    pose.rotate(rig.hips, 0.18 * fall, -0.22 * fall, 0.2 * fall);
    pose.rotate(rig.spine, -0.42 * fall, 0.24 * fall, 0.18 * fall);
    pose.rotate(rig.chest, -0.52 * fall, -0.24 * fall, 0.26 * fall);
    pose.rotate(rig.head, 0.28 * fall, 0.18 * fall, -0.36 * fall);
    pose.rotate(rig.leftUpperLeg, -0.28 * fall, 0, -0.12 * fall);
    pose.rotate(rig.rightUpperLeg, 0.52 * fall, 0, 0.08 * fall);
    pose.rotate(rig.leftShin, 0.72 * fall, 0, 0);
    pose.rotate(rig.rightShin, 0.9 * fall, 0, 0);
    pose.rotate(rig.leftUpperArm, -0.4 * fall, 0, -0.52 * fall);
    pose.rotate(rig.rightUpperArm, 0.28 * fall, 0, 0.62 * fall);
    pose.rotate(rig.rightForearm, 0.48 * fall, 0, 0);
    pose.rotate(rig.swordPivot, 0.4 * fall, 0, 0.3 * fall);
  }

  return {
    update(frame) {
      pose.resetTargets();
      if (frame.deathProgress !== null) {
        addDeath(frame.deathProgress);
        pose.commit(frame.dt, 13);
        return;
      }
      if (frame.dashProgress !== null) {
        addDash(frame.dashProgress);
        pose.commit(frame.dt, 72);
        return;
      }
      if (frame.recoveryProgress !== null) {
        addRecovery(frame.recoveryProgress, frame.time);
        pose.commit(frame.dt, 28);
        return;
      }
      addIdle(frame.time, frame.turn, 1);
      pose.commit(frame.dt, 12);
    },
    reset() {
      pose.snapToRest();
    },
  };
}

export interface EnemyAnimationFrame {
  time: number;
  dt: number;
  distanceMoved: number;
  speedNormalized: number;
  turn: number;
  threat: number;
  deathAge: number | null;
}

export interface EnemyAnimator {
  update(frame: EnemyAnimationFrame): void;
  reset(): void;
}

export function createEnemyAnimator(rig: EnemyRigLike, phaseOffset = 0): EnemyAnimator {
  const pose = new ArticulatedPose(rig);
  let locomotionPhase = phaseOffset;

  function addAlive(frame: EnemyAnimationFrame) {
    const moving = THREE.MathUtils.clamp(frame.speedNormalized, 0, 1);
    const styleA = Math.sin(phaseOffset * 1.91 + 0.37);
    const styleB = Math.cos(phaseOffset * 2.47 - 0.22);
    const styleIndex = ((Math.round(phaseOffset / 0.77) % 4) + 4) % 4;
    const leanBias = [-0.035, 0.05, 0.02, -0.045][styleIndex];
    const shoulderBias = [-0.08, 0.11, -0.145, 0.055][styleIndex];
    const weaponLift = [-0.16, 0.19, -0.04, 0.11][styleIndex];
    const weaponSweep = [-0.25, 0.12, 0.28, -0.07][styleIndex];
    const gaitRate = 2.35 + styleA * 0.32;
    locomotionPhase += frame.distanceMoved * (4.65 + styleB * 0.28) + frame.dt * gaitRate * (0.48 + moving * 0.52);
    // Even before reaching full chase speed, every enemy stays in a loaded
    // advancing gait. This prevents a crowd of upright showroom mannequins.
    const drive = 0.64 + moving * 0.36;
    const stride = Math.sin(locomotionPhase);
    const strideOpposite = Math.sin(locomotionPhase + Math.PI);
    const stepLift = Math.max(0, Math.sin(locomotionPhase));
    const stepLiftOpposite = Math.max(0, Math.sin(locomotionPhase + Math.PI));
    const doubleStep = Math.abs(Math.sin(locomotionPhase * 2));
    const lean = 0.24 + moving * 0.07 + styleA * 0.025 + leanBias * 0.45;
    const strideScale = (0.88 + styleB * 0.11 + Math.abs(shoulderBias) * 0.22) * drive;
    const stanceBias = styleA * 0.1;

    pose.move(
      rig.rootMotion,
      styleB * 0.018,
      -0.12 - doubleStep * 0.045 * drive,
      0.1 + moving * 0.04,
    );
    pose.rotate(rig.rootMotion, lean, styleB * 0.025, -0.04 * stride * drive + styleA * 0.018);
    pose.move(rig.hips, 0, -0.055 - stepLift * 0.02 * drive, 0.02);
    pose.rotate(rig.hips, -0.05 - moving * 0.015, -0.11 * stride * drive + styleB * 0.04, 0.045 * stride * drive);
    pose.rotate(rig.spine, 0.13 + moving * 0.035, frame.turn * 0.12 + styleA * 0.035, -0.04 * stride * drive);
    pose.rotate(
      rig.chest,
      0.15 + moving * 0.045 + leanBias * 0.35,
      frame.turn * 0.2 + styleB * 0.045,
      -0.075 * stride * drive + shoulderBias,
    );
    pose.rotate(rig.neck, -0.07 - moving * 0.025, frame.turn * 0.12, 0);
    pose.rotate(rig.head, -0.09 - moving * 0.035, frame.turn * 0.3, 0.035 * stride * drive + styleA * 0.018);

    pose.rotate(rig.leftUpperLeg, -0.82 * stride * strideScale + stanceBias, 0.025 * styleB, -0.025);
    pose.rotate(rig.rightUpperLeg, -0.82 * strideOpposite * strideScale - stanceBias, -0.025 * styleB, 0.025);
    pose.rotate(rig.leftShin, 0.84 * stepLiftOpposite * drive + 0.08, 0, 0);
    pose.rotate(rig.rightShin, 0.84 * stepLift * drive + 0.08, 0, 0);
    pose.rotate(rig.leftFoot, 0.28 * stride * drive, 0, 0);
    pose.rotate(rig.rightFoot, 0.28 * strideOpposite * drive, 0, 0);

    // Cleaver arm remains loaded outside the body while the free arm pumps.
    // Style terms give each spawn a different shoulder line and weapon height.
    pose.rotate(rig.leftShoulder, -0.08 + styleA * 0.045 - shoulderBias * 0.55, 0, -0.08 - moving * 0.04 - shoulderBias * 0.4);
    pose.rotate(rig.rightShoulder, 0.12 + styleB * 0.05 + shoulderBias * 0.7, 0, 0.1 + moving * 0.05 + shoulderBias * 0.45);
    pose.rotate(rig.leftUpperArm, -0.34 + 0.52 * stride * drive + styleA * 0.09, 0.05, -0.15 - 0.06 * moving);
    pose.rotate(rig.leftForearm, 0.4 - 0.22 * stride * drive + styleB * 0.06, 0, -0.13 * drive);
    pose.rotate(
      rig.rightUpperArm,
      -0.52 + 0.24 * strideOpposite * drive - styleB * 0.1 + weaponLift,
      -0.1 + weaponSweep * 0.34,
      0.2 + styleA * 0.06 + weaponSweep * 0.45,
    );
    pose.rotate(rig.rightForearm, 0.48 - 0.16 * drive + styleA * 0.05 - weaponLift * 0.7, 0, 0.16 + styleB * 0.05);
    pose.move(rig.weaponPivot, weaponSweep * 0.08, weaponLift * 0.16, 0);
    pose.rotate(
      rig.weaponPivot,
      -0.32 + 0.1 * strideOpposite * drive + styleA * 0.08 + weaponLift * 0.6,
      0.1 + styleB * 0.07 + weaponSweep * 0.55,
      0.14 + 0.055 * stride * drive + weaponSweep,
    );

    const threat = THREE.MathUtils.clamp(frame.threat, 0, 1);
    if (threat > 0) {
      const pulse = 0.5 + 0.5 * Math.sin(frame.time * 7.2 + phaseOffset);
      pose.move(rig.rootMotion, 0, -0.045 * threat, 0.06 * threat);
      pose.rotate(rig.hips, -0.08 * threat, 0.12 * threat, 0);
      pose.rotate(rig.spine, 0.16 * threat, -0.18 * threat, 0.06 * threat);
      pose.rotate(rig.chest, 0.24 * threat, -0.32 * threat, 0.08 * threat);
      pose.rotate(rig.head, -0.12 * threat, 0.28 * threat, 0);
      pose.rotate(rig.rightUpperArm, -0.9 * threat - pulse * 0.08, -0.18 * threat, 0.18 * threat);
      pose.rotate(rig.rightForearm, 0.72 * threat, 0, 0.12 * threat);
      pose.rotate(rig.weaponPivot, -0.36 * threat, 0.08 * threat, 0.16 * threat);
      pose.rotate(rig.leftUpperArm, -0.3 * threat, 0, -0.18 * threat);
      pose.rotate(rig.leftForearm, 0.42 * threat, 0, -0.1 * threat);
    }
  }

  function addHit(deathAge: number) {
    const hit = smooth(deathAge, 0.01, 0.075);
    const hold = 1 - smooth(deathAge, 0.1, 0.17);
    const amount = Math.max(hit * hold, smooth(deathAge, 0.01, 0.08) * 0.72);
    pose.move(rig.rootMotion, 0.03 * amount, -0.025 * amount, -0.045 * amount);
    pose.rotate(rig.hips, -0.06 * amount, -0.12 * amount, 0.045 * amount);
    pose.rotate(rig.spine, -0.1 * amount, 0.16 * amount, -0.12 * amount);
    pose.rotate(rig.chest, -0.16 * amount, 0.26 * amount, -0.2 * amount);
    pose.rotate(rig.head, 0.1 * amount, -0.2 * amount, 0.18 * amount);
    pose.rotate(rig.leftUpperArm, -0.22 * amount, 0, -0.16 * amount);
    pose.rotate(rig.rightUpperArm, 0.28 * amount, 0, 0.2 * amount);
    pose.rotate(rig.rightForearm, 0.3 * amount, 0, 0);
    pose.rotate(rig.leftUpperLeg, -0.12 * amount, 0, 0);
    pose.rotate(rig.rightUpperLeg, 0.18 * amount, 0, 0);
  }

  return {
    update(frame) {
      pose.resetTargets();
      if (frame.deathAge !== null) {
        addHit(frame.deathAge);
        pose.commit(frame.dt, 58);
        return;
      }
      addAlive(frame);
      pose.commit(frame.dt, 18);
    },
    reset() {
      locomotionPhase = phaseOffset;
      pose.snapToRest();
    },
  };
}

export function dampAngle(current: number, target: number, responsiveness: number, dt: number) {
  const delta = Math.atan2(Math.sin(target - current), Math.cos(target - current));
  return current + delta * (1 - Math.exp(-responsiveness * dt));
}

export function signedAngleDelta(current: number, target: number) {
  return Math.atan2(Math.sin(target - current), Math.cos(target - current));
}
