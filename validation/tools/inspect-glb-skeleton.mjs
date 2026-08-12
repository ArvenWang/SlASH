import { readFile } from "node:fs/promises";
import path from "node:path";
import * as THREE from "three";

const source = process.argv[2];
if (!source) throw new Error("Usage: node validation/tools/inspect-glb-skeleton.mjs MODEL.glb");
const absolutePath = path.resolve(source);
const document = parseGlb(await readFile(absolutePath));
const nodes = document.nodes ?? [];
const parentByNode = new Map();
nodes.forEach((node, parentIndex) => {
  for (const childIndex of node.children ?? []) parentByNode.set(childIndex, parentIndex);
});
const worldMatrices = new Map();

function localMatrix(node) {
  if (node.matrix) return new THREE.Matrix4().fromArray(node.matrix);
  return new THREE.Matrix4().compose(
    new THREE.Vector3().fromArray(node.translation ?? [0, 0, 0]),
    new THREE.Quaternion().fromArray(node.rotation ?? [0, 0, 0, 1]),
    new THREE.Vector3().fromArray(node.scale ?? [1, 1, 1]),
  );
}

function worldMatrix(index) {
  const cached = worldMatrices.get(index);
  if (cached) return cached;
  const local = localMatrix(nodes[index] ?? {});
  const parentIndex = parentByNode.get(index);
  const world = parentIndex === undefined ? local : worldMatrix(parentIndex).clone().multiply(local);
  worldMatrices.set(index, world);
  return world;
}

const skinReports = (document.skins ?? []).map((skin, skinIndex) => ({
  skinIndex,
  skeletonRoot: skin.skeleton ?? null,
  joints: (skin.joints ?? []).map((nodeIndex) => {
    const position = new THREE.Vector3();
    const worldQuaternion = new THREE.Quaternion();
    const worldScale = new THREE.Vector3();
    worldMatrix(nodeIndex).decompose(position, worldQuaternion, worldScale);
    const parentIndex = parentByNode.get(nodeIndex);
    const node = nodes[nodeIndex] ?? {};
    return {
      nodeIndex,
      name: node.name ?? `node-${nodeIndex}`,
      parentIndex: parentIndex ?? null,
      parentName: parentIndex === undefined ? null : nodes[parentIndex]?.name ?? `node-${parentIndex}`,
      children: (node.children ?? []).filter((child) => (skin.joints ?? []).includes(child)),
      localTranslation: node.translation ?? [0, 0, 0],
      localRotation: node.rotation ?? [0, 0, 0, 1],
      worldPosition: [position.x, position.y, position.z],
      worldRotation: [worldQuaternion.x, worldQuaternion.y, worldQuaternion.z, worldQuaternion.w],
    };
  }),
}));

console.log(JSON.stringify({ source: path.relative(process.cwd(), absolutePath), skins: skinReports }, null, 2));

function parseGlb(buffer) {
  if (buffer.toString("ascii", 0, 4) !== "glTF") throw new Error(`${source} is not a GLB file`);
  let offset = 12;
  while (offset + 8 <= buffer.length) {
    const chunkLength = buffer.readUInt32LE(offset);
    const chunkType = buffer.readUInt32LE(offset + 4);
    if (chunkType === 0x4e4f534a) {
      return JSON.parse(buffer.toString("utf8", offset + 8, offset + 8 + chunkLength).replace(/\0+$/u, "").trim());
    }
    offset += 8 + chunkLength;
  }
  throw new Error(`${source} has no JSON chunk`);
}
