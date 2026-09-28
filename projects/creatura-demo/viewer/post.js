// Desktop post chain (B4): RenderPass → GTAOPass → OutputPass on a HalfFloat MSAA×4 target. Off = a plain renderer.render. Tone mapping + sRGB happen in OutputPass (r170 only tone-maps when drawing to the screen).
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

export const GTAO_PARAMS = { radius: 5, distanceExponent: 1.5, thickness: 3, scale: 1.2, samples: 12, screenSpaceRadius: false };
export const DENOISE_PARAMS = { lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 3, samples: 12 };

export function createPost(renderer, scene, camera, { clipBox, enabled }) {
  let composer = null, gtao = null, on = false;
  function build() {
    const size = renderer.getSize(new THREE.Vector2()), pr = renderer.getPixelRatio();
    composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(size.x * pr, size.y * pr, { type: THREE.HalfFloatType, samples: 4 }));
    composer.addPass(new RenderPass(scene, camera));
    gtao = new GTAOPass(scene, camera, size.x * pr, size.y * pr);
    gtao.updateGtaoMaterial(GTAO_PARAMS); gtao.updatePdMaterial(DENOISE_PARAMS); gtao.blendIntensity = 0.75; gtao.setSceneClipBox(clipBox);
    const base = gtao.overrideVisibility.bind(gtao);   // the addon hides only points/lines from its g-buffer; we also drop ghosts, the selection ring and the sky (userData.noAO)
    gtao.overrideVisibility = () => { base(); scene.traverse(o => { if (o.userData.noAO) o.visible = false; }); };
    composer.addPass(gtao); composer.addPass(new OutputPass());
  }
  const api = {
    get enabled() { return on; },
    set enabled(v) { on = !!v; if (on && !composer) build(); },
    get gtao() { return gtao; },
    render() { renderer.shadowMap.needsUpdate = true; if (on) composer.render(); else renderer.render(scene, camera); },   // one shadow pass per frame even though the AO g-buffer renders the scene a second time
    setSize(w, h) { if (composer) composer.setSize(w, h); },
  };
  api.enabled = enabled; return api;
}
