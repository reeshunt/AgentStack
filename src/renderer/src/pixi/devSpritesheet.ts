// Electron's CSP forbids 'unsafe-eval', which PIXI's WebGLRenderer normally relies on to
// detect a few GL capabilities. This patches those checks to skip eval entirely — must be
// imported before any Application is created.
import 'pixi.js/unsafe-eval'
import { Rectangle, Texture } from 'pixi.js'
import devSpritesheetUrl from '../../../../resources/assets/spritesheets/dev/dev.png'
import devopsSpritesheetUrl from '../../../../resources/assets/spritesheets/devops/devops.png'
import floorManagerSpritesheetUrl from '../../../../resources/assets/spritesheets/floorManager/FloorManager.png'

// Each spritesheet is one row of 5 equal-width character-at-desk frames used as the
// idle/typing animation for an agent desk. dev.png is the default for every desk except the
// DevOps/Infra agent (devops.png) and the Floor Manager (FloorManager.png).
const FRAME_COUNT = 5

// Loaded via a plain <img> + Texture.from rather than PIXI.Assets: Assets' loader probes
// avif/webp support with data-URI images and spins up a worker for createImageBitmap, both
// of which this app's strict CSP (default-src/script-src 'self') blocks outright.
function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`Failed to load ${url}`))
    img.src = url
  })
}

function createFrameLoader(url: string): () => Promise<Texture[]> {
  let framesPromise: Promise<Texture[]> | null = null
  return () => {
    if (!framesPromise) {
      framesPromise = loadImage(url).then((img) => {
        const baseTexture = Texture.from(img)
        const frameWidth = img.naturalWidth / FRAME_COUNT
        const frameHeight = img.naturalHeight
        return Array.from(
          { length: FRAME_COUNT },
          (_, i) =>
            new Texture({
              source: baseTexture.source,
              frame: new Rectangle(i * frameWidth, 0, frameWidth, frameHeight)
            })
        )
      })
    }
    return framesPromise
  }
}

export const loadDevFrames = createFrameLoader(devSpritesheetUrl)
export const loadDevOpsFrames = createFrameLoader(devopsSpritesheetUrl)
export const loadFloorManagerFrames = createFrameLoader(floorManagerSpritesheetUrl)
