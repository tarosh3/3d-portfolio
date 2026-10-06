import * as THREE from 'three'
import { attachMaterialEffect } from './island-material-effects'
import { acquireRainSurface, releaseRainSurface, RAIN_SURFACE_GLSL } from './rain-surface'
import { WATER_LEVEL } from './water-depth'

/** Excludes foliage, furnishings, printed objects, and the underside of roofs. */
function wetMaterial(name: string) {
  if (/^M_Sand/.test(name)) return { darken: .14, polish: .18, floor: .46 }
  if (/^m_rocks$/i.test(name)) return { darken: .2, polish: .38, floor: .32 }
  if (/^M_(ChangingCabin|PlanksWall|Rims|Frames|Floor|Roof|Walls|Pier|Pier_Trim)$/.test(name)) return { darken: .17, polish: .28, floor: .42 }
  return null
}

/** Only call with LivingIsland's material-owning clone, never the GLTF cache. */
export function attachIslandWetness(model: THREE.Object3D) {
  const materials = new Set<THREE.MeshStandardMaterial>()
  model.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return
    const list = Array.isArray(object.material) ? object.material : [object.material]
    for (const material of list) if (material instanceof THREE.MeshStandardMaterial && wetMaterial(material.name)) materials.add(material)
  })
  const surface = acquireRainSurface(model)
  const wetness = { value: 0 }
  const restore: (() => void)[] = []
  materials.forEach(material => {
    const response = wetMaterial(material.name)!
    restore.push(attachMaterialEffect(material, `island-wet-${response.darken}-v1`, shader => {
      shader.uniforms.uIslandWetness = wetness
      shader.uniforms.uWetSurface = { value: surface.texture }
      shader.uniforms.uWetBounds = { value: surface.bounds }
      shader.vertexShader = 'varying vec3 vWetWorld;\n' + shader.vertexShader
      shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvWetWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;')
      shader.fragmentShader = `varying vec3 vWetWorld;
        uniform float uIslandWetness;
        uniform sampler2D uWetSurface;
        uniform vec4 uWetBounds;
        ${RAIN_SURFACE_GLSL}\n` + shader.fragmentShader
      shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        float exposedHeight = rainExposedHeight(uWetSurface, uWetBounds, vWetWorld.xz);
        // The actual overhead height shields veranda boards and interiors.
        // A small tolerance accounts for the top-down texel footprint on slopes.
        float exposed = 1.0 - smoothstep(.12, .26, exposedHeight - vWetWorld.y);
        vec3 wetWorldNormal = inverseTransformDirection(normal, viewMatrix);
        float upward = mix(.2, 1.0, smoothstep(-.05, .75, wetWorldNormal.y));
        float aboveWater = smoothstep(${(WATER_LEVEL - .02).toFixed(2)}, ${(WATER_LEVEL + .17).toFixed(2)}, vWetWorld.y);
        float surfaceWetness = uIslandWetness * exposed * upward * aboveWater;
        diffuseColor.rgb *= 1.0 - surfaceWetness * ${response.darken.toFixed(2)};
        roughnessFactor = mix(roughnessFactor, min(roughnessFactor, max(${response.floor.toFixed(2)}, roughnessFactor * ${(1 - response.polish).toFixed(2)})), surfaceWetness);
      `)
    }))
  })
  let disposed = false
  return {
    update(amount: number) { wetness.value = THREE.MathUtils.clamp(amount, 0, 1) },
    dispose() {
      if (disposed) return
      disposed = true
      for (const reset of restore) reset()
      releaseRainSurface(model)
    },
  }
}
