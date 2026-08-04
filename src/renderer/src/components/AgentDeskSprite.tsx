import { useEffect, useRef } from 'react'
import { Application, AnimatedSprite } from 'pixi.js'
import { loadDevFrames, loadDevOpsFrames, loadFloorManagerFrames } from '../pixi/devSpritesheet'

type Props = {
  /** Play the idle/typing loop while the agent is actively working; hold on frame 0 otherwise. */
  animate: boolean
  /** Which desk spritesheet to render. Defaults to the generic dev desk. */
  variant?: 'dev' | 'devops' | 'floorManager'
  width?: number
}

const FRAME_LOADERS = {
  dev: loadDevFrames,
  devops: loadDevOpsFrames,
  floorManager: loadFloorManagerFrames
} as const

export default function AgentDeskSprite({
  animate,
  variant = 'dev',
  width = 90
}: Props): React.JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null)
  const spriteRef = useRef<AnimatedSprite | null>(null)

  useEffect(() => {
    let cancelled = false
    // app.destroy() throws if called before app.init() has finished (plugins like the
    // resize handler haven't installed their teardown hooks yet) — most likely to happen
    // under React StrictMode's mount→unmount→mount, or if the frame load rejects first.
    let initialized = false
    const app = new Application()

    async function setup(): Promise<void> {
      const frames = await FRAME_LOADERS[variant]()
      if (cancelled) return
      const height = Math.round(width * (frames[0].height / frames[0].width))

      await app.init({
        width,
        height,
        backgroundAlpha: 0,
        antialias: true,
        resolution: Math.min(window.devicePixelRatio || 1, 2),
        autoDensity: true
      })
      initialized = true
      if (cancelled) {
        app.destroy(true, { children: true })
        return
      }

      const sprite = new AnimatedSprite(frames)
      sprite.width = width
      sprite.height = height
      sprite.animationSpeed = 0.08
      sprite.loop = true
      if (animate) sprite.play()

      spriteRef.current = sprite
      app.stage.addChild(sprite)
      hostRef.current?.appendChild(app.canvas)
    }

    setup().catch((err) => console.error('AgentDeskSprite failed to load', err))

    return () => {
      cancelled = true
      spriteRef.current = null
      if (initialized) app.destroy(true, { children: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width, variant])

  useEffect(() => {
    const sprite = spriteRef.current
    if (!sprite) return
    if (animate) sprite.play()
    else sprite.gotoAndStop(0)
  }, [animate])

  return <div className="desk-card-sprite-host" ref={hostRef} />
}
