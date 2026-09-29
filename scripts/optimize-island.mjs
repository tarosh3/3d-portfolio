/**
 * Rebuild the production model without changing geometry, materials, or names.
 * Keep the original public/island.glb as the editable source asset.
 *
 * Install the offline tooling outside the application:
 * npm install --prefix /tmp/codex-island-optimizer --no-audit --no-fund \
 *   @gltf-transform/core@4.3.0 @gltf-transform/extensions@4.3.0 \
 *   @gltf-transform/functions@4.3.0 sharp@0.34.3
 * node scripts/optimize-island.mjs
 *
 * ISLAND_OPTIMIZER_DEPS can point to another tooling installation directory.
 * WebP textures are supported natively by the existing Three.js GLTFLoader.
 */
import { createRequire } from 'node:module'
import { stat } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const tooling = process.env.ISLAND_OPTIMIZER_DEPS || '/tmp/codex-island-optimizer'
const requireTool = createRequire(path.join(tooling, 'package.json'))
const { NodeIO } = await import(requireTool.resolve('@gltf-transform/core'))
const { ALL_EXTENSIONS } = await import(requireTool.resolve('@gltf-transform/extensions'))
const { textureCompress } = await import(requireTool.resolve('@gltf-transform/functions'))
const sharp = requireTool('sharp')

const source = fileURLToPath(new URL('../public/island.glb', import.meta.url))
const destination = fileURLToPath(new URL('../public/island-optimized.glb', import.meta.url))
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
const document = await io.read(source)
const root = document.getRoot()
const before = {
  nodes: root.listNodes().length,
  meshes: root.listMeshes().length,
  materials: root.listMaterials().length,
  textures: root.listTextures().length,
}

// Texture conversion alone saves almost all of the download size. Avoiding
// geometry simplification, joining, and deduplication retains authored pivots
// and landmark names used by the scene's animation and placement code.
await document.transform(textureCompress({
  encoder: sharp,
  targetFormat: 'webp',
  resize: [2048, 2048],
  quality: 84,
  effort: 6,
}))
await io.write(destination, document)

const after = await io.read(destination)
const afterRoot = after.getRoot()
const counts = {
  nodes: afterRoot.listNodes().length,
  meshes: afterRoot.listMeshes().length,
  materials: afterRoot.listMaterials().length,
  textures: afterRoot.listTextures().length,
}
if (JSON.stringify(before) !== JSON.stringify(counts)) {
  throw new Error('Optimization changed scene structure: ' + JSON.stringify({ before, counts }))
}
const originalBytes = (await stat(source)).size
const optimizedBytes = (await stat(destination)).size
console.log(JSON.stringify({
  source,
  destination,
  originalBytes,
  optimizedBytes,
  savedPercent: Number(((1 - optimizedBytes / originalBytes) * 100).toFixed(1)),
  preserved: counts,
}, null, 2))
