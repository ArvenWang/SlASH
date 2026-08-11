import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const workspaceRoot = fileURLToPath(new URL("../../", import.meta.url));
const assetPaths = process.argv.slice(2).length > 0
  ? process.argv.slice(2)
  : [
      "public/models/characters/hero-v5-rigged.glb",
      "public/models/characters/enemy-v5-rigged.glb",
    ];

function parseGlb(buffer, source) {
  if (buffer.length < 20 || buffer.toString("ascii", 0, 4) !== "glTF") {
    throw new Error(`${source} is not a GLB file.`);
  }
  const version = buffer.readUInt32LE(4);
  const declaredLength = buffer.readUInt32LE(8);
  if (version !== 2 || declaredLength !== buffer.length) {
    throw new Error(`${source} has invalid GLB version or length.`);
  }
  let offset = 12;
  let document = null;
  let binaryBytes = 0;
  while (offset + 8 <= buffer.length) {
    const chunkLength = buffer.readUInt32LE(offset);
    const chunkType = buffer.readUInt32LE(offset + 4);
    const start = offset + 8;
    const end = start + chunkLength;
    if (end > buffer.length) throw new Error(`${source} has a truncated GLB chunk.`);
    if (chunkType === 0x4e4f534a) {
      document = JSON.parse(buffer.toString("utf8", start, end).replace(/\0+$/u, "").trim());
    } else if (chunkType === 0x004e4942) {
      binaryBytes += chunkLength;
    }
    offset = end;
  }
  if (!document) throw new Error(`${source} has no JSON chunk.`);
  return { document, binaryBytes, version };
}

function primitiveTriangles(primitive, accessors) {
  const count = primitive.indices === undefined
    ? accessors[primitive.attributes?.POSITION]?.count ?? 0
    : accessors[primitive.indices]?.count ?? 0;
  const mode = primitive.mode ?? 4;
  if (mode === 4) return Math.floor(count / 3);
  if (mode === 5 || mode === 6) return Math.max(0, count - 2);
  return 0;
}

function inspect(source, bytes, parsed) {
  const { document, binaryBytes, version } = parsed;
  const meshes = document.meshes ?? [];
  const primitives = meshes.flatMap((mesh) => mesh.primitives ?? []);
  const accessors = document.accessors ?? [];
  const skins = document.skins ?? [];
  const animations = document.animations ?? [];
  const externalUris = [
    ...(document.buffers ?? []).map((entry) => entry.uri),
    ...(document.images ?? []).map((entry) => entry.uri),
  ].filter((uri) => typeof uri === "string" && !uri.startsWith("data:"));
  const skinnedPrimitives = primitives.filter((primitive) => (
    primitive.attributes?.JOINTS_0 !== undefined && primitive.attributes?.WEIGHTS_0 !== undefined
  ));
  const report = {
    source,
    bytes,
    glbVersion: version,
    binaryBytes,
    scenes: document.scenes?.length ?? 0,
    nodes: document.nodes?.length ?? 0,
    meshes: meshes.length,
    primitives: primitives.length,
    triangles: primitives.reduce((total, primitive) => total + primitiveTriangles(primitive, accessors), 0),
    materials: document.materials?.length ?? 0,
    textures: document.textures?.length ?? 0,
    images: (document.images ?? []).map((image) => ({
      mimeType: image.mimeType ?? null,
      embedded: image.bufferView !== undefined || image.uri?.startsWith("data:") === true,
    })),
    skins: skins.length,
    skeletonJoints: skins.reduce((total, skin) => total + (skin.joints?.length ?? 0), 0),
    skinnedPrimitives: skinnedPrimitives.length,
    animationClipNames: animations.map((animation, index) => animation.name || `animation-${index}`),
    externalUris,
  };
  return {
    ...report,
    providerReady: report.skinnedPrimitives > 0
      && report.skeletonJoints > 0
      && report.externalUris.length === 0,
    nativeAnimationReady: report.animationClipNames.length > 0,
  };
}

const assets = [];
for (const inputPath of assetPaths) {
  const absolutePath = path.resolve(workspaceRoot, inputPath);
  const buffer = await readFile(absolutePath);
  assets.push(inspect(path.relative(workspaceRoot, absolutePath), buffer.length, parseGlb(buffer, inputPath)));
}
const result = {
  schemaVersion: 1,
  status: assets.every((asset) => asset.providerReady) ? "provider-ready" : "failed",
  nativeAnimationStatus: assets.every((asset) => asset.nativeAnimationReady)
    ? "native-clips-present"
    : "additive-fallback-required",
  assets,
};
console.log(JSON.stringify(result, null, 2));
if (result.status === "failed") process.exitCode = 1;
