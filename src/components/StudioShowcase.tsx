import { useRef, useEffect } from 'react'
import { Layers, ShieldCheck, Sparkles, Terminal, Eye } from 'lucide-react'

export default function StudioShowcase() {
  const miniCanvasRef = useRef<HTMLCanvasElement | null>(null)

  // Calm, crisp interactive 60fps Canvas2D flight & ripple preview
  useEffect(() => {
    const canvas = miniCanvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let animId = 0
    const trails: Array<{ x: number; y: number; vx: number; vy: number; life: number; color: string }> = []
    const rings: Array<{ x: number; y: number; r: number; life: number }> = []
    let target = { x: 220, y: 120 }
    let ship = { x: 220, y: 120, angle: -Math.PI / 2 }
    const palette = ['#cfa96e', '#94a3b8', '#4f9c82', '#e6e2d6']

    const render = () => {
      ctx.fillStyle = '#0e1016'
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      // Subtle architectural drafting grid
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)'
      ctx.lineWidth = 1
      for (let x = 24; x < canvas.width; x += 28) {
        ctx.beginPath()
        ctx.moveTo(x, 0)
        ctx.lineTo(x, canvas.height)
        ctx.stroke()
      }
      for (let y = 24; y < canvas.height; y += 28) {
        ctx.beginPath()
        ctx.moveTo(0, y)
        ctx.lineTo(canvas.width, y)
        ctx.stroke()
      }

      // Smooth spring follow toward pointer
      const dx = target.x - ship.x
      const dy = target.y - ship.y
      ship.x += dx * 0.14
      ship.y += dy * 0.14
      if (Math.hypot(dx, dy) > 1.2) {
        ship.angle = Math.atan2(dy, dx)
      }

      if (Math.random() < 0.6) {
        trails.push({
          x: ship.x - Math.cos(ship.angle) * 11,
          y: ship.y - Math.sin(ship.angle) * 11,
          vx: -Math.cos(ship.angle) * (0.7 + Math.random()) + (Math.random() - 0.5) * 0.4,
          vy: -Math.sin(ship.angle) * (0.7 + Math.random()) + (Math.random() - 0.5) * 0.4,
          life: 1,
          color: palette[Math.floor(Math.random() * palette.length)],
        })
      }

      for (let i = rings.length - 1; i >= 0; i--) {
        const ring = rings[i]
        ring.r += 2.2
        ring.life -= 0.032
        if (ring.life <= 0) {
          rings.splice(i, 1)
          continue
        }
        ctx.beginPath()
        ctx.arc(ring.x, ring.y, ring.r, 0, Math.PI * 2)
        ctx.strokeStyle = `rgba(207, 169, 110, ${ring.life * 0.55})`
        ctx.lineWidth = 1.4
        ctx.stroke()
      }

      for (let i = trails.length - 1; i >= 0; i--) {
        const pt = trails[i]
        pt.x += pt.vx
        pt.y += pt.vy
        pt.life -= 0.028
        if (pt.life <= 0) {
          trails.splice(i, 1)
          continue
        }
        ctx.beginPath()
        ctx.arc(pt.x, pt.y, 2.2 * pt.life, 0, Math.PI * 2)
        ctx.fillStyle = pt.color
        ctx.globalAlpha = pt.life * 0.85
        ctx.fill()
        ctx.globalAlpha = 1
      }

      // Precision geometric craft pointer
      ctx.save()
      ctx.translate(ship.x, ship.y)
      ctx.rotate(ship.angle + Math.PI / 2)
      ctx.beginPath()
      ctx.moveTo(0, -13)
      ctx.lineTo(10, 9)
      ctx.lineTo(0, 4.5)
      ctx.lineTo(-10, 9)
      ctx.closePath()
      ctx.fillStyle = '#e6e2d6'
      ctx.fill()
      ctx.strokeStyle = '#cfa96e'
      ctx.lineWidth = 1.4
      ctx.stroke()
      ctx.restore()

      animId = requestAnimationFrame(render)
    }

    render()

    const onMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect()
      const sx = canvas.width / Math.max(1, rect.width)
      const sy = canvas.height / Math.max(1, rect.height)
      target = {
        x: Math.max(14, Math.min(canvas.width - 14, (e.clientX - rect.left) * sx)),
        y: Math.max(14, Math.min(canvas.height - 14, (e.clientY - rect.top) * sy)),
      }
    }

    const onClick = () => {
      rings.push({ x: ship.x, y: ship.y, r: 8, life: 1 })
      for (let i = 0; i < 16; i++) {
        const ang = (i / 16) * Math.PI * 2
        const spd = 1.6 + Math.random() * 2.4
        trails.push({
          x: ship.x,
          y: ship.y,
          vx: Math.cos(ang) * spd,
          vy: Math.sin(ang) * spd,
          life: 1,
          color: palette[i % palette.length],
        })
      }
    }

    canvas.addEventListener('mousemove', onMouseMove)
    canvas.addEventListener('click', onClick)
    return () => {
      cancelAnimationFrame(animId)
      canvas.removeEventListener('mousemove', onMouseMove)
      canvas.removeEventListener('click', onClick)
    }
  }, [])

  return (
    <section className="showcase-section editorial-showcase" id="showcase">
      <div className="showcase-head-split">
        <div>
          <h2 className="editorial-section-title">Write code. Watch it run. Ship one link.</h2>
        </div>
        <p className="editorial-section-lead">
          Monaco editing, in-browser TypeScript compilation via esbuild-wasm, live preview isolation on{' '}
          <code>play.yulya.me</code>, and Gemini multimodal tooling built directly into the workspace.
        </p>
      </div>

      <div className="studio-window refined-window">
        <div className="studio-window-header">
          <div className="window-dots">
            <span className="dot dot-muted" />
            <span className="dot dot-muted" />
            <span className="dot dot-muted" />
          </div>

          <div className="window-breadcrumbs">
            <Layers size={13} />
            <span>src/game.ts</span>
            <span className="crumb-sep">/</span>
            <span className="text-muted">Live Sandbox Viewport</span>
          </div>

          <div className="window-status-pill quiet-pill">
            <span>60 FPS · Isolated Origin</span>
          </div>
        </div>

        <div className="studio-window-body">
          <div className="preview-split">
            <div className="code-column">
              <div className="code-toolbar">
                <span>game.ts</span>
                <span className="code-badge">esbuild-wasm</span>
              </div>
              <pre className="code-block">
                <code>{`export function step(dt: number) {
  const dx = pointer.x - craft.x;
  const dy = pointer.y - craft.y;
  craft.x += dx * Math.min(1, dt * 8.5);
  craft.y += dy * Math.min(1, dt * 8.5);
  craft.angle = Math.atan2(dy, dx);

  if (pointer.justClicked) {
    ripples.spawn(craft.x, craft.y, '#cfa96e');
    YulyaSDK.submitScore(state.score);
  }
  renderer.frame(craft, ripples);
}`}</code>
              </pre>
            </div>

            <div className="viewport-column">
              <div className="viewport-toolbar">
                <span>Interactive Preview</span>
                <span className="live-pill">Move &amp; click canvas</span>
              </div>
              <div className="mini-canvas-wrap">
                <canvas
                  ref={miniCanvasRef}
                  width={440}
                  height={240}
                  className="interactive-mini-canvas"
                />
                <div className="canvas-overlay-hint">
                  Move cursor to steer · Click to pulse
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="architecture-grid">
        <article className="arch-cell">
          <div className="arch-icon"><Terminal size={16} /></div>
          <h3>Browser-Native Runtime</h3>
          <p>Author HTML5, Canvas 2D, Three.js WebGL, GLSL shaders, or React + TypeScript compiled in milliseconds with zero local setup.</p>
        </article>
        <article className="arch-cell">
          <div className="arch-icon"><Sparkles size={16} /></div>
          <h3>Multimodal Gemini Chat</h3>
          <p>Bring your Google AI Studio key for every live chat model, inline Nano Banana 2.1 sprites, Gemini 3.8 TTS voice lines, and pasted image mockups.</p>
        </article>
        <article className="arch-cell">
          <div className="arch-icon"><Eye size={16} /></div>
          <h3>Headless Game Playtesting</h3>
          <p>Stream only the game canvas headlessly to Gemini so it can click menus, hold keys, inspect runtime state, and fix visual bugs autonomously.</p>
        </article>
        <article className="arch-cell">
          <div className="arch-icon"><ShieldCheck size={16} /></div>
          <h3>Host-Split Sandbox Security</h3>
          <p>Every game executes on isolated <code>play.yulya.me</code> with strict CSP and zero studio cookies, while BYOK keys stay AES-256-GCM encrypted.</p>
        </article>
      </div>
    </section>
  )
}
