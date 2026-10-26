import { useRef, useEffect } from 'react'
import { Terminal, Layers, Zap, Play } from 'lucide-react'

export default function StudioShowcase() {
  const miniCanvasRef = useRef<HTMLCanvasElement | null>(null)

  // Interactive mini canvas game inside the preview
  useEffect(() => {
    const canvas = miniCanvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let animId: number
    const particles: Array<{ x: number; y: number; vx: number; vy: number; life: number; color: string }> = []
    let mouse = { x: 190, y: 115 }

    const colors = ['#cbb3ff', '#9ce0c8', '#9ebff8', '#ffbba4']

    const render = () => {
      ctx.fillStyle = 'rgba(17, 18, 22, 0.28)'
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      // Grid background
      ctx.strokeStyle = 'rgba(203, 179, 255, 0.06)'
      ctx.lineWidth = 1
      for (let x = 0; x < canvas.width; x += 26) {
        ctx.beginPath()
        ctx.moveTo(x, 0)
        ctx.lineTo(x, canvas.height)
        ctx.stroke()
      }
      for (let y = 0; y < canvas.height; y += 26) {
        ctx.beginPath()
        ctx.moveTo(0, y)
        ctx.lineTo(canvas.width, y)
        ctx.stroke()
      }

      // Spawn thruster particles
      if (Math.random() < 0.7) {
        particles.push({
          x: mouse.x + (Math.random() - 0.5) * 6,
          y: mouse.y + 10 + Math.random() * 4,
          vx: (Math.random() - 0.5) * 1.5,
          vy: 1.5 + Math.random() * 2,
          life: 1,
          color: colors[Math.floor(Math.random() * colors.length)]
        })
      }

      // Update & draw particles
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i]
        p.x += p.vx
        p.y += p.vy
        p.life -= 0.03
        if (p.life <= 0) {
          particles.splice(i, 1)
          continue
        }

        ctx.save()
        ctx.beginPath()
        ctx.arc(p.x, p.y, 2.5 * p.life, 0, Math.PI * 2)
        ctx.fillStyle = p.color
        ctx.globalAlpha = p.life
        ctx.shadowColor = p.color
        ctx.shadowBlur = 8
        ctx.fill()
        ctx.restore()
      }

      // Draw player ship
      ctx.save()
      ctx.translate(mouse.x, mouse.y)
      ctx.beginPath()
      ctx.moveTo(0, -14)
      ctx.lineTo(12, 10)
      ctx.lineTo(0, 5)
      ctx.lineTo(-12, 10)
      ctx.closePath()
      ctx.fillStyle = '#cbb3ff'
      ctx.shadowColor = '#cbb3ff'
      ctx.shadowBlur = 14
      ctx.fill()

      ctx.strokeStyle = '#ffffff'
      ctx.lineWidth = 1.5
      ctx.stroke()
      ctx.restore()

      animId = requestAnimationFrame(render)
    }

    render()

    const onMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect()
      mouse = {
        x: Math.max(12, Math.min(canvas.width - 12, e.clientX - rect.left)),
        y: Math.max(12, Math.min(canvas.height - 12, e.clientY - rect.top))
      }
    }

    const onClick = () => {
      // Particle burst
      for (let i = 0; i < 20; i++) {
        const ang = (i / 20) * Math.PI * 2
        const spd = 2 + Math.random() * 3.5
        particles.push({
          x: mouse.x,
          y: mouse.y,
          vx: Math.cos(ang) * spd,
          vy: Math.sin(ang) * spd,
          life: 1,
          color: colors[Math.floor(Math.random() * colors.length)]
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
    <section className="showcase-section" id="showcase">
      <div className="section-header-centered">
        <div className="eyebrow"><Play size={13} /> INTERACTIVE 60FPS RUNTIME</div>
        <h2>A studio crafted for <em>pure momentum.</em></h2>
        <p>No build config. No local dependencies. Test your game loops with instant in-browser live reload.</p>
      </div>

      <div className="studio-window">
        {/* Window Chrome Header */}
        <div className="studio-window-header">
          <div className="window-dots">
            <span className="dot dot-red" />
            <span className="dot dot-yellow" />
            <span className="dot dot-green" />
          </div>

          <div className="window-breadcrumbs">
            <Layers size={13} className="text-lilac" />
            <span>src/game.ts</span>
            <span className="crumb-sep">/</span>
            <span className="text-muted">Canvas2D Renderer</span>
          </div>

          <div className="window-status-pill">
            <span className="live-dot" />
            <span>60 FPS Live Reload</span>
          </div>
        </div>

        {/* Window Body: Dedicated to Interactive 60fps Runtime */}
        <div className="studio-window-body">
          <div className="preview-split">
            <div className="code-column">
              <div className="code-toolbar">
                <span>TypeScript Game Loop</span>
                <span className="code-badge">zero-lag</span>
              </div>
              <pre className="code-block">
                <code>{`// Core game loop with live state injection
function update(delta: number) {
  player.velocity.x += input.axis.x * ACCEL;
  player.position.add(player.velocity);

  // Synthesize procedural particle audio
  if (input.wasPressed('Action')) {
    audio.playLaserPing({ pitch: 440, decay: 0.15 });
    particles.burst(player.position, '#cbb3ff');
  }

  renderer.clear('#111216');
  renderer.drawSprite(player);
}`}</code>
              </pre>
            </div>

            <div className="viewport-column">
              <div className="viewport-toolbar">
                <span>Interactive Live Canvas Viewport</span>
                <span className="live-pill">Move & Click to Test</span>
              </div>
              <div className="mini-canvas-wrap">
                <canvas
                  ref={miniCanvasRef}
                  width={380}
                  height={230}
                  className="interactive-mini-canvas"
                />
                <div className="canvas-overlay-hint">
                  ✦ Move cursor to steer • Click for particle burst
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Feature Bento Grid */}
      <div className="bento-grid">
        <div className="bento-card bento-wide">
          <div className="bento-icon-wrap bg-lilac">
            <Zap size={22} />
          </div>
          <h3>Zero-Latency In-Browser Engine</h3>
          <p>
            Instant hot reloading for TypeScript and Canvas 2D. Modify game mechanics, audio synthesis, and sprite physics with immediate 60fps visual feedback.
          </p>
          <div className="bento-tag">Instant live reload</div>
        </div>

        <div className="bento-card">
          <div className="bento-icon-wrap bg-mint">
            <Play size={22} />
          </div>
          <h3>Pure Web Standards</h3>
          <p>
            Built directly on HTML5 Canvas, WebGL, and Web Audio API. Zero native compile steps or heavy toolchains.
          </p>
          <div className="bento-tag">Runs anywhere in the browser</div>
        </div>

        <div className="bento-card">
          <div className="bento-icon-wrap bg-peach">
            <Terminal size={22} />
          </div>
          <h3>Full Source Code Ownership</h3>
          <p>
            You own every byte of code and logic. Inspect, edit, and export your creations at any time with no lock-in.
          </p>
          <div className="bento-tag">Zero vendor lock-in</div>
        </div>
      </div>
    </section>
  )
}
