import { useState, useRef, useEffect } from 'react'
import { Sparkles, Terminal, Globe2, Play, Cpu, Check, Layers, Zap } from 'lucide-react'

export default function StudioShowcase() {
  const [activeTab, setActiveTab] = useState<'preview' | 'ai' | 'share'>('preview')
  const [copied, setCopied] = useState(false)
  const miniCanvasRef = useRef<HTMLCanvasElement | null>(null)

  // Interactive mini canvas game inside the preview tab
  useEffect(() => {
    if (activeTab !== 'preview') return
    const canvas = miniCanvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let animId: number
    const particles: Array<{ x: number; y: number; vx: number; vy: number; life: number; color: string }> = []
    let mouse = { x: 180, y: 110 }

    const colors = ['#cbb3ff', '#9ce0c8', '#9ebff8', '#ffbba4']

    const render = () => {
      ctx.fillStyle = 'rgba(18, 20, 26, 0.25)'
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      // Grid background
      ctx.strokeStyle = 'rgba(203, 179, 255, 0.05)'
      ctx.lineWidth = 1
      for (let x = 0; x < canvas.width; x += 24) {
        ctx.beginPath()
        ctx.moveTo(x, 0)
        ctx.lineTo(x, canvas.height)
        ctx.stroke()
      }
      for (let y = 0; y < canvas.height; y += 24) {
        ctx.beginPath()
        ctx.moveTo(0, y)
        ctx.lineTo(canvas.width, y)
        ctx.stroke()
      }

      // Spawn particles near mouse
      if (Math.random() < 0.6) {
        particles.push({
          x: mouse.x + (Math.random() - 0.5) * 8,
          y: mouse.y + (Math.random() - 0.5) * 8,
          vx: (Math.random() - 0.5) * 2,
          vy: (Math.random() - 0.5) * 2,
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

      // Draw player ship / reticle
      ctx.save()
      ctx.translate(mouse.x, mouse.y)
      ctx.beginPath()
      ctx.moveTo(0, -12)
      ctx.lineTo(10, 10)
      ctx.lineTo(0, 6)
      ctx.lineTo(-10, 10)
      ctx.closePath()
      ctx.fillStyle = '#cbb3ff'
      ctx.shadowColor = '#cbb3ff'
      ctx.shadowBlur = 12
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
        x: Math.max(10, Math.min(canvas.width - 10, e.clientX - rect.left)),
        y: Math.max(10, Math.min(canvas.height - 10, e.clientY - rect.top))
      }
    }

    const onClick = () => {
      // Burst
      for (let i = 0; i < 18; i++) {
        const ang = (i / 18) * Math.PI * 2
        const spd = 2 + Math.random() * 3
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
  }, [activeTab])

  const copyDemoLink = () => {
    navigator.clipboard?.writeText('https://yulya.studio/play/@creator/neon-overdrive')
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <section className="showcase-section" id="showcase">
      <div className="section-header-centered">
        <div className="eyebrow"><Sparkles size={13} /> INSIDE THE WORKSPACE</div>
        <h2>A studio crafted for <em>pure momentum.</em></h2>
        <p>No build config. No local dependencies. Just you, your ideas, and zero latency.</p>
      </div>

      <div className="showcase-tabs">
        <button
          className={`showcase-tab ${activeTab === 'preview' ? 'active' : ''}`}
          onClick={() => setActiveTab('preview')}
        >
          <Play size={14} />
          <span>01. Interactive 60fps Runtime</span>
        </button>

        <button
          className={`showcase-tab ${activeTab === 'ai' ? 'active' : ''}`}
          onClick={() => setActiveTab('ai')}
        >
          <Cpu size={14} />
          <span>02. Gemini AI Game Designer</span>
        </button>

        <button
          className={`showcase-tab ${activeTab === 'share' ? 'active' : ''}`}
          onClick={() => setActiveTab('share')}
        >
          <Globe2 size={14} />
          <span>03. Instant Global Link</span>
        </button>
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
            <span>Hot Reload Active</span>
          </div>
        </div>

        {/* Window Body */}
        <div className="studio-window-body">
          {activeTab === 'preview' && (
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
                    ✦ Hover to steer • Click for particle burst
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'ai' && (
            <div className="ai-split">
              <div className="ai-chat-simulation">
                <div className="chat-bubble user-bubble">
                  <span className="bubble-label">You</span>
                  <p>Add a neon particle trail behind the spaceship and trigger retro 8-bit sound effects on collision.</p>
                </div>

                <div className="chat-bubble ai-bubble">
                  <div className="ai-bubble-head">
                    <Sparkles size={13} className="text-lilac" />
                    <span className="bubble-label">Gemini 2.5 Copilot</span>
                    <span className="ai-pill">24ms generated</span>
                  </div>
                  <p>I added the Web Audio synthesizer with an 8-bit noise envelope and attached dynamic particle emitters to the engine thrusters.</p>

                  <div className="code-snippet-diff">
                    <div className="diff-line diff-add">+ const synth = new SoundEnvelope(audioCtx, 'triangle');</div>
                    <div className="diff-line diff-add">+ particles.emitThruster(ship.rearPosition, ship.heading);</div>
                    <div className="diff-line diff-add">+ synth.playTone(320, 0.08);</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'share' && (
            <div className="share-view">
              <div className="share-card">
                <div className="share-icon-wrap">
                  <Globe2 size={36} className="text-mint" />
                </div>
                <h3>Published to the Global Arcade</h3>
                <p>Anyone with this URL can open and play your game instantly in mobile Safari, Chrome, or Edge without downloading anything.</p>

                <div className="share-url-box">
                  <code>https://yulya.studio/play/@alex/neon-overdrive</code>
                  <button className="button button-primary button-small" onClick={copyDemoLink}>
                    {copied ? <><Check size={13} /> Copied</> : 'Copy Link'}
                  </button>
                </div>

                <div className="share-badges">
                  <span className="share-badge">✓ PWA Ready</span>
                  <span className="share-badge">✓ Touch & Gamepad Controls</span>
                  <span className="share-badge">✓ Web Audio Synthesizer</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Feature Bento Grid */}
      <div className="bento-grid">
        <div className="bento-card bento-wide">
          <div className="bento-icon-wrap bg-lilac">
            <Cpu size={22} />
          </div>
          <h3>Gemini-Powered Natural Game Design</h3>
          <p>
            Describe mechanics, physics changes, or complete stage designs in ordinary human words.
            The AI assistant directly inspects and updates the TypeScript codebase with surgical diffs.
          </p>
          <div className="bento-tag">AI Grounded directly in your source tree</div>
        </div>

        <div className="bento-card">
          <div className="bento-icon-wrap bg-mint">
            <Zap size={22} />
          </div>
          <h3>Zero-Install Browser Sandbox</h3>
          <p>
            No Node.js setup, no native build dependencies, and zero configuration files. Start typing and test immediately at 60 FPS.
          </p>
          <div className="bento-tag">Instant live reload</div>
        </div>

        <div className="bento-card">
          <div className="bento-icon-wrap bg-peach">
            <Terminal size={22} />
          </div>
          <h3>Full Source Code Ownership</h3>
          <p>
            You own every byte of JavaScript, asset sprites, and logic. Export your project anytime as a standard HTML5 package.
          </p>
          <div className="bento-tag">Zero vendor lock-in</div>
        </div>
      </div>
    </section>
  )
}
