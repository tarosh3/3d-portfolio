import * as THREE from 'three'

type Compile = THREE.Material['onBeforeCompile']
type Effects = {
  compile: Compile
  key: THREE.Material['customProgramCacheKey']
  baseKey: string
  patches: Map<symbol, { name: string; compile: Compile }>
}
const effects = new WeakMap<THREE.Material, Effects>()

/** Independent owned-material effects may mount/clean up in either order. */
export function attachMaterialEffect(material: THREE.Material, name: string, compile: Compile) {
  let entry = effects.get(material)
  if (!entry) {
    entry = { compile: material.onBeforeCompile, key: material.customProgramCacheKey, baseKey: material.customProgramCacheKey(), patches: new Map() }
    effects.set(material, entry)
    const current = entry
    material.onBeforeCompile = (shader, renderer) => {
      current.compile.call(material, shader, renderer)
      current.patches.forEach(patch => patch.compile.call(material, shader, renderer))
    }
    material.customProgramCacheKey = () => `${current.baseKey}-${Array.from(current.patches.values(), patch => patch.name).join('-')}`
  }
  const token = Symbol(name)
  entry.patches.set(token, { name, compile })
  material.needsUpdate = true
  return () => {
    if (!entry.patches.delete(token)) return
    if (entry.patches.size === 0) {
      material.onBeforeCompile = entry.compile
      material.customProgramCacheKey = entry.key
      effects.delete(material)
    }
    material.needsUpdate = true
  }
}
