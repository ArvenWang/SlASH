import * as THREE from "three";
import type { CorpsePresentationRuntime } from "./types";

interface BakedPiece {
  readonly group: THREE.Group;
  readonly velocity: THREE.Vector3;
  readonly angularVelocity: THREE.Vector3;
  grounded: boolean;
}

interface GeometryBuffers {
  readonly positions: number[];
  readonly uvs: number[];
}

const FLOOR_CLEARANCE = 0.028;

function materialClone(material: THREE.Material | THREE.Material[]) {
  return (Array.isArray(material) ? material[0] : material).clone();
}

function appendVertex(
  mesh: THREE.SkinnedMesh,
  vertexIndex: number,
  uvAttribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute | undefined,
  target: GeometryBuffers,
) {
  const position = new THREE.Vector3();
  mesh.getVertexPosition(vertexIndex, position);
  mesh.localToWorld(position);
  target.positions.push(position.x, position.y, position.z);
  if (uvAttribute) target.uvs.push(uvAttribute.getX(vertexIndex), uvAttribute.getY(vertexIndex));
}

function bakedSkinnedPieces(mesh: THREE.SkinnedMesh, cutY: number) {
  const geometry = mesh.geometry;
  const positionAttribute = geometry.getAttribute("position");
  const uvAttribute = geometry.getAttribute("uv");
  if (!positionAttribute) return null;
  const index = geometry.index;
  const upper: GeometryBuffers = { positions: [], uvs: [] };
  const lower: GeometryBuffers = { positions: [], uvs: [] };
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const triangleCount = Math.floor((index?.count ?? positionAttribute.count) / 3);
  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    const indices = [0, 1, 2].map((offset) => (
      index ? index.getX(triangle * 3 + offset) : triangle * 3 + offset
    ));
    mesh.getVertexPosition(indices[0] ?? 0, a).applyMatrix4(mesh.matrixWorld);
    mesh.getVertexPosition(indices[1] ?? 0, b).applyMatrix4(mesh.matrixWorld);
    mesh.getVertexPosition(indices[2] ?? 0, c).applyMatrix4(mesh.matrixWorld);
    const target = (a.y + b.y + c.y) / 3 >= cutY ? upper : lower;
    indices.forEach((vertexIndex) => appendVertex(mesh, vertexIndex ?? 0, uvAttribute, target));
  }
  return { upper, lower };
}

function geometryFromBuffers(buffers: GeometryBuffers) {
  if (buffers.positions.length === 0) return null;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(buffers.positions, 3));
  if (buffers.uvs.length > 0) geometry.setAttribute("uv", new THREE.Float32BufferAttribute(buffers.uvs, 2));
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function centerPiece(group: THREE.Group) {
  group.updateWorldMatrix(true, true);
  const bounds = new THREE.Box3().setFromObject(group);
  const center = bounds.getCenter(new THREE.Vector3());
  group.children.forEach((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    child.geometry.translate(-center.x, -center.y, -center.z);
  });
  group.position.copy(center);
  return center;
}

function makeCutCap(name: string, radius: number) {
  const material = new THREE.MeshStandardMaterial({
    name: `${name}-material`,
    color: 0x430007,
    emissive: 0xff1909,
    emissiveIntensity: 1.7,
    roughness: 0.28,
    metalness: 0.05,
    side: THREE.DoubleSide,
  });
  const cap = new THREE.Mesh(new THREE.CircleGeometry(radius, 18), material);
  cap.name = name;
  cap.rotation.x = Math.PI * 0.5;
  cap.scale.z = 0.58;
  return cap;
}

function deterministicSigned(seed: number, offset: number) {
  const raw = Math.sin(seed * 78.233 + offset * 19.77) * 43758.5453;
  return (raw - Math.floor(raw)) * 2 - 1;
}

export function createSkinnedCorpseRuntime(
  scene: THREE.Scene,
  characterRoot: THREE.Object3D,
  direction: THREE.Vector3,
  seed: number,
  targetHeight: number,
): CorpsePresentationRuntime | null {
  characterRoot.updateWorldMatrix(true, true);
  const rootPosition = new THREE.Vector3();
  characterRoot.getWorldPosition(rootPosition);
  const cutY = rootPosition.y + targetHeight * 0.515;
  const corpseRoot = new THREE.Group();
  corpseRoot.name = "v5r-skinned-split-corpse";
  scene.add(corpseRoot);
  const upperGroup = new THREE.Group();
  const lowerGroup = new THREE.Group();
  upperGroup.name = "v5r-corpse-upper";
  lowerGroup.name = "v5r-corpse-lower";
  corpseRoot.add(upperGroup, lowerGroup);
  let skinnedMeshCount = 0;

  characterRoot.traverse((object) => {
    if (object instanceof THREE.SkinnedMesh) {
      object.skeleton.update();
      const pieces = bakedSkinnedPieces(object, cutY);
      if (!pieces) return;
      const upperGeometry = geometryFromBuffers(pieces.upper);
      const lowerGeometry = geometryFromBuffers(pieces.lower);
      if (upperGeometry) upperGroup.add(new THREE.Mesh(upperGeometry, materialClone(object.material)));
      if (lowerGeometry) lowerGroup.add(new THREE.Mesh(lowerGeometry, materialClone(object.material)));
      skinnedMeshCount += 1;
      return;
    }
    if (!(object instanceof THREE.Mesh)) return;
    if (object.name.includes("cut-seam")) return;
    const geometry = object.geometry.clone().applyMatrix4(object.matrixWorld);
    const mesh = new THREE.Mesh(geometry, materialClone(object.material));
    mesh.name = `${object.name}-corpse-static`;
    upperGroup.add(mesh);
  });
  if (skinnedMeshCount === 0) {
    corpseRoot.removeFromParent();
    return null;
  }

  const upperCenter = centerPiece(upperGroup);
  const lowerCenter = centerPiece(lowerGroup);
  const capRadius = targetHeight * 0.13;
  const upperCap = makeCutCap("v5r-upper-cut-cap", capRadius);
  upperCap.position.set(rootPosition.x - upperCenter.x, cutY - upperCenter.y - 0.006, rootPosition.z - upperCenter.z);
  const lowerCap = makeCutCap("v5r-lower-cut-cap", capRadius * 0.94);
  lowerCap.position.set(rootPosition.x - lowerCenter.x, cutY - lowerCenter.y + 0.006, rootPosition.z - lowerCenter.z);
  upperGroup.add(upperCap);
  lowerGroup.add(lowerCap);
  upperGroup.traverse((object) => {
    if (object instanceof THREE.Mesh) object.castShadow = true;
  });
  lowerGroup.traverse((object) => {
    if (object instanceof THREE.Mesh) object.castShadow = true;
  });

  const slash = direction.clone().setY(0).normalize();
  if (slash.lengthSq() < 0.001) slash.set(1, 0, 0);
  const side = new THREE.Vector3(-slash.z, 0, slash.x);
  const pieces: BakedPiece[] = [
    {
      group: upperGroup,
      velocity: side.clone().multiplyScalar(1.05 + deterministicSigned(seed, 1) * 0.15).setY(1.1),
      angularVelocity: new THREE.Vector3(0.7, deterministicSigned(seed, 2) * 1.1, -slash.x * 1.15),
      grounded: false,
    },
    {
      group: lowerGroup,
      velocity: side.clone().multiplyScalar(-0.28).addScaledVector(slash, 0.16).setY(0.25),
      angularVelocity: new THREE.Vector3(0.12, deterministicSigned(seed, 3) * 0.28, slash.x * 0.18),
      grounded: false,
    },
  ];
  characterRoot.visible = false;
  return {
    root: corpseRoot,
    update(dt) {
      const step = Math.min(0.04, Math.max(0, dt));
      for (const piece of pieces) {
        if (piece.grounded) continue;
        piece.velocity.y -= 7.8 * step;
        piece.group.position.addScaledVector(piece.velocity, step);
        const angularSpeed = piece.angularVelocity.length();
        if (angularSpeed > 0.0001) {
          piece.group.quaternion.premultiply(
            new THREE.Quaternion().setFromAxisAngle(piece.angularVelocity.clone().normalize(), angularSpeed * step),
          );
        }
        corpseRoot.updateWorldMatrix(true, true);
        const bounds = new THREE.Box3().setFromObject(piece.group);
        if (bounds.min.y <= FLOOR_CLEARANCE) {
          piece.group.position.y += FLOOR_CLEARANCE - bounds.min.y;
          piece.velocity.set(0, 0, 0);
          piece.angularVelocity.set(0, 0, 0);
          piece.grounded = true;
        }
      }
    },
    dispose() {
      const geometries = new Set<THREE.BufferGeometry>();
      const materials = new Set<THREE.Material>();
      corpseRoot.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        geometries.add(object.geometry);
        const entries = Array.isArray(object.material) ? object.material : [object.material];
        entries.forEach((material) => materials.add(material));
      });
      geometries.forEach((geometry) => geometry.dispose());
      materials.forEach((material) => material.dispose());
      corpseRoot.removeFromParent();
    },
  };
}
