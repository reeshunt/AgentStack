// Electron's CSP forbids 'unsafe-eval', which PIXI's WebGLRenderer normally relies on to
// detect a few GL capabilities. This patches those checks to skip eval entirely — must be
// imported before any Application is created.
import 'pixi.js/unsafe-eval'
import { Rectangle, Texture } from 'pixi.js'
import devSpritesheetUrl from '../../../../resources/assets/spritesheets/dev/dev.png'

// dev.png is one row of 5 equal-width character-at-desk frames used as the idle/typing
// animation for every agent desk except the Floor Manager's.
const FRAME_COUNT = 5

let framesPromise: Promise<Texture[]> | null = null

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

export function loadDevFrames(): Promise<Texture[]> {
  if (!framesPromise) {
    framesPromise = loadImage(devSpritesheetUrl).then((img) => {
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
