import { useEffect, useRef, useState } from 'react'
import { Sparkles, Gamepad2, Zap } from 'lucide-react'

interface Point3D {
  x: number
  y: number
  z: number
}

interface Polygon3D {
  pts: Point3D[]
  fill: string | ((ctx: CanvasRenderingContext2D, pts2d: { x: number; y: number }[], dot: number) => void)
  stroke?: string
  lineWidth?: number
  isScreen?: boolean
  isMarquee?: boolean
}

export default function Hero3DCanvas() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [tilt, setTilt] = useState({ x: 0, y: 0 })
  const [isHovered, setIsHovered] = useState(false)
  const [credits, setCredits] = useState(1)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let animId: number
    let width = 0
    let height = 0
    let dpr = 1

    const handleResize = () => {
      if (!canvas || !containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      width = rect.width
      height = rect.height
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.floor(width * dpr)
      canvas.height = Math.floor(height * dpr)
    }

    handleResize()
    window.addEventListener('resize', handleResize)

    // Camera angles
    let yaw = -0.35 // Slightly angled to show front & side
    let pitch = 0.22
    let targetYaw = -0.35
    let targetPitch = 0.22
    let joyTiltX = 0
    let joyTiltZ = 0
    let buttonPress = [0, 0, 0, 0, 0, 0]

    // CRT Screen offscreen canvas for dynamic live game rendering
    const crtCanvas = document.createElement('canvas')
    crtCanvas.width = 160
    crtCanvas.height = 120
    const crtCtx = crtCanvas.getContext('2d')

    // Stardust & Sparkle particles
    const particles: Array<{ x: number; y: number; z: number; vy: number; size: number; alpha: number; color: string }> = []
    for (let i = 0; i < 40; i++) {
      particles.push({
        x: (Math.random() - 0.5) * 380,
        y: (Math.random() - 0.5) * 280,
        z: (Math.random() - 0.5) * 380,
        vy: -0.3 - Math.random() * 0.4,
        size: 1.2 + Math.random() * 2,
        alpha: 0.2 + Math.random() * 0.7,
        color: Math.random() > 0.5 ? '#cbb3ff' : '#9ce0c8'
      })
    }

    // Coin bursts
    const coinParticles: Array<{ x: number; y: number; z: number; vx: number; vy: number; vz: number; life: number }> = []

    // Light direction (normalized)
    const light = { x: 0.4, y: -0.8, z: -0.45 }
    const lLen = Math.hypot(light.x, light.y, light.z)
    light.x /= lLen
    light.y /= lLen
    light.z /= lLen

    const fov = 440

    // 3D projection function
    const project = (p: Point3D, cx: number, cy: number) => {
      const cosY = Math.cos(yaw)
      const sinY = Math.sin(yaw)
      const x1 = p.x * cosY - p.z * sinY
      const z1 = p.x * sinY + p.z * cosY

      const cosP = Math.cos(pitch)
      const sinP = Math.sin(pitch)
      const y2 = p.y * cosP - z1 * sinP
      const z2 = p.y * sinP + z1 * cosP

      const dist = fov + z2
      const scale = dist > 1 ? fov / dist : 0
      return {
        x: cx + x1 * scale,
        y: cy + y2 * scale,
        z: z2,
        scale
      }
    }

    let time = 0

    // Render loop
    const render = () => {
      time += 0.016
      ctx.save()
      ctx.scale(dpr, dpr)
      ctx.clearRect(0, 0, width, height)

      const cx = width * 0.5
      const cy = height * 0.52

      // Smooth camera interpolation
      yaw += (targetYaw - yaw) * 0.06
      pitch += (targetPitch - pitch) * 0.06

      // Gentle continuous idle hover
      targetYaw += 0.0018
      const hoverBob = Math.sin(time * 2) * 8

      // Update interactive joystick & buttons
      joyTiltX += (0 - joyTiltX) * 0.1
      joyTiltZ += (0 - joyTiltZ) * 0.1
      for (let b = 0; b < buttonPress.length; b++) {
        buttonPress[b] *= 0.85
      }

      // 1. Draw subtle ambient glow in background
      const ambientGlow = ctx.createRadialGradient(cx, cy, 20, cx, cy, width * 0.42)
      ambientGlow.addColorStop(0, 'rgba(168, 130, 245, 0.16)')
      ambientGlow.addColorStop(0.5, 'rgba(92, 60, 180, 0.06)')
      ambientGlow.addColorStop(1, 'rgba(17, 18, 20, 0)')
      ctx.fillStyle = ambientGlow
      ctx.fillRect(0, 0, width, height)

      // 2. Render Animated CRT Game Screen onto offscreen canvas
      if (crtCtx) {
        crtCtx.fillStyle = '#0a0b12'
        crtCtx.fillRect(0, 0, 160, 120)

        // Pixel stars
        crtCtx.fillStyle = 'rgba(203, 179, 255, 0.5)'
        for (let s = 0; s < 12; s++) {
          const sx = (s * 37 + time * 30) % 160
          const sy = (s * 23) % 120
          crtCtx.fillRect(sx, sy, 2, 2)
        }

        // Mini player ship
        const shipY = 60 + Math.sin(time * 4) * 22
        crtCtx.fillStyle = '#9ce0c8'
        crtCtx.beginPath()
        crtCtx.moveTo(25, shipY)
        crtCtx.lineTo(15, shipY - 7)
        crtCtx.lineTo(18, shipY)
        crtCtx.lineTo(15, shipY + 7)
        crtCtx.closePath()
        crtCtx.fill()

        // Thruster flame
        crtCtx.fillStyle = '#ffbba4'
        crtCtx.fillRect(11, shipY - 2, 4 + Math.random() * 4, 4)

        // Lasers
        const laserX = (time * 160) % 160 + 25
        crtCtx.fillStyle = '#f43f5e'
        crtCtx.fillRect(laserX, shipY - 1, 8, 2)

        // Mini alien target
        const alienX = 135
        const alienY = 60 + Math.cos(time * 3) * 25
        crtCtx.fillStyle = '#cbb3ff'
        crtCtx.fillRect(alienX, alienY - 6, 12, 12)
        crtCtx.fillStyle = '#ffffff'
        crtCtx.fillRect(alienX + 2, alienY - 3, 2, 2)
        crtCtx.fillRect(alienX + 8, alienY - 3, 2, 2)

        // CRT Scanline lines
        crtCtx.fillStyle = 'rgba(0, 0, 0, 0.28)'
        for (let y = 0; y < 120; y += 3) {
          crtCtx.fillRect(0, y, 160, 1)
        }

        // CRT HUD text
        crtCtx.fillStyle = '#10b981'
        crtCtx.font = 'bold 8px monospace'
        crtCtx.fillText('SCORE 02048', 6, 12)
        crtCtx.fillStyle = '#cbb3ff'
        crtCtx.fillText('60 FPS', 124, 12)
      }

      // 3. Ground Shadow below cabinet
      const groundShadow = project({ x: 0, y: 125, z: 0 }, cx, cy)
      if (groundShadow.scale > 0) {
        ctx.save()
        ctx.beginPath()
        ctx.ellipse(groundShadow.x, groundShadow.y, 110 * groundShadow.scale, 40 * groundShadow.scale, 0, 0, Math.PI * 2)
        ctx.fillStyle = 'rgba(0, 0, 0, 0.55)'
        ctx.filter = 'blur(14px)'
        ctx.fill()
        ctx.restore()
      }

      // 4. Build 3D Arcade Cabinet Polygons
      const Y0 = hoverBob
      const W = 52
      const H_BASE = 110 + Y0
      const H_DECK = 25 + Y0
      const H_CRT_BOT = 15 + Y0
      const H_CRT_TOP = -55 + Y0
      const H_TOP = -88 + Y0

      const polygons: Polygon3D[] = []

      // --- Lower Cabinet Base (Front Coin Face) ---
      polygons.push({
        pts: [
          { x: -W, y: H_DECK + 20, z: 35 },
          { x: W, y: H_DECK + 20, z: 35 },
          { x: W, y: H_BASE, z: 25 },
          { x: -W, y: H_BASE, z: 25 }
        ],
        fill: (c, pts2d, dot) => {
          const grad = c.createLinearGradient(pts2d[0].x, pts2d[0].y, pts2d[2].x, pts2d[2].y)
          grad.addColorStop(0, `rgba(${Math.floor(28 * dot + 10)}, ${Math.floor(30 * dot + 12)}, ${Math.floor(40 * dot + 15)}, 0.98)`)
          grad.addColorStop(1, '#0e0f14')
          c.fillStyle = grad
          c.fill()

          // Draw Coin Insert Slots
          const midX = (pts2d[0].x + pts2d[1].x) * 0.5
          const midY = (pts2d[0].y + pts2d[2].y) * 0.5
          c.save()
          c.fillStyle = '#1c1d25'
          c.strokeStyle = 'rgba(255, 255, 255, 0.15)'
          c.lineWidth = 1
          c.strokeRect(midX - 18, midY - 14, 36, 28)
          c.fillRect(midX - 18, midY - 14, 36, 28)

          // Glowing orange coin slots
          c.fillStyle = '#f59e0b'
          c.shadowColor = '#f59e0b'
          c.shadowBlur = 6
          c.fillRect(midX - 11, midY - 6, 8, 12)
          c.fillRect(midX + 3, midY - 6, 8, 12)
          c.restore()
        },
        stroke: 'rgba(203, 179, 255, 0.25)',
        lineWidth: 1.2
      })

      // --- Slanted Control Deck ---
      polygons.push({
        pts: [
          { x: -W - 4, y: H_DECK - 6, z: 20 },
          { x: W + 4, y: H_DECK - 6, z: 20 },
          { x: W + 2, y: H_DECK + 20, z: 48 },
          { x: -W - 2, y: H_DECK + 20, z: 48 }
        ],
        fill: (c, pts2d, dot) => {
          const grad = c.createLinearGradient(pts2d[0].x, pts2d[0].y, pts2d[2].x, pts2d[2].y)
          grad.addColorStop(0, `rgba(${Math.floor(36 * dot + 14)}, ${Math.floor(38 * dot + 16)}, ${Math.floor(52 * dot + 20)}, 0.98)`)
          grad.addColorStop(1, '#151722')
          c.fillStyle = grad
          c.fill()

          // Joystick base & stick
          const joyPos = {
            x: (pts2d[0].x * 0.7 + pts2d[1].x * 0.3 + pts2d[3].x * 0.7 + pts2d[2].x * 0.3) * 0.5,
            y: (pts2d[0].y * 0.7 + pts2d[1].y * 0.3 + pts2d[3].y * 0.7 + pts2d[2].y * 0.3) * 0.5
          }

          c.save()
          // Base ring
          c.beginPath()
          c.ellipse(joyPos.x, joyPos.y, 10, 5, 0, 0, Math.PI * 2)
          c.fillStyle = '#0f1015'
          c.fill()
          c.strokeStyle = '#333544'
          c.stroke()

          // Shaft
          const topJoy = { x: joyPos.x + joyTiltX, y: joyPos.y - 18 + joyTiltZ }
          c.beginPath()
          c.moveTo(joyPos.x, joyPos.y)
          c.lineTo(topJoy.x, topJoy.y)
          c.strokeStyle = '#e2e8f0'
          c.lineWidth = 3
          c.stroke()

          // Ball knob
          c.beginPath()
          c.arc(topJoy.x, topJoy.y, 7, 0, Math.PI * 2)
          c.fillStyle = '#ef4444'
          c.shadowColor = '#ef4444'
          c.shadowBlur = 10
          c.fill()
          c.strokeStyle = '#ffffff'
          c.lineWidth = 1
          c.stroke()

          // 6 Arcade Buttons (lilac, mint, peach)
          const btnColors = ['#cbb3ff', '#9ce0c8', '#ffbba4', '#9ebff8', '#f43f5e', '#fbbf24']
          const rightOriginX = (pts2d[0].x * 0.25 + pts2d[1].x * 0.75)
          const rightOriginY = (pts2d[0].y * 0.25 + pts2d[1].y * 0.75)

          for (let row = 0; row < 2; row++) {
            for (let col = 0; col < 3; col++) {
              const bIdx = row * 3 + col
              const bx = rightOriginX - 12 + col * 11
              const by = rightOriginY + 2 + row * 9 + (buttonPress[bIdx] ? 2 : 0)

              c.beginPath()
              c.ellipse(bx, by, 4.5, 3, 0, 0, Math.PI * 2)
              c.fillStyle = btnColors[bIdx]
              c.shadowColor = btnColors[bIdx]
              c.shadowBlur = 6
              c.fill()
              c.strokeStyle = '#ffffff'
              c.lineWidth = 0.8
              c.stroke()
            }
          }
          c.restore()
        },
        stroke: 'rgba(203, 179, 255, 0.35)',
        lineWidth: 1.5
      })

      // --- Slanted CRT Bezel & Screen ---
      polygons.push({
        pts: [
          { x: -W + 2, y: H_CRT_TOP, z: -8 },
          { x: W - 2, y: H_CRT_TOP, z: -8 },
          { x: W - 2, y: H_CRT_BOT, z: 18 },
          { x: -W + 2, y: H_CRT_BOT, z: 18 }
        ],
        fill: (c, pts2d) => {
          // Draw CRT Bezel Frame
          c.fillStyle = '#14151e'
          c.fill()

          // Draw Active CRT Screen with real-time video game texture
          c.save()
          c.beginPath()
          // Inset screen region
          const inset = 6
          const p0 = { x: pts2d[0].x + inset, y: pts2d[0].y + inset }
          const p1 = { x: pts2d[1].x - inset, y: pts2d[1].y + inset }
          const p2 = { x: pts2d[2].x - inset, y: pts2d[2].y - inset }
          const p3 = { x: pts2d[3].x + inset, y: pts2d[3].y - inset }

          c.moveTo(p0.x, p0.y)
          c.lineTo(p1.x, p1.y)
          c.lineTo(p2.x, p2.y)
          c.lineTo(p3.x, p3.y)
          c.closePath()
          c.clip()

          // Render CRT Canvas image
          const sw = Math.hypot(p1.x - p0.x, p1.y - p0.y)
          const sh = Math.hypot(p3.x - p0.x, p3.y - p0.y)
          c.drawImage(crtCanvas, p0.x, p0.y, sw, sh)

          // Glass glare sheen
          const glare = c.createLinearGradient(p0.x, p0.y, p2.x, p2.y)
          glare.addColorStop(0, 'rgba(255, 255, 255, 0.25)')
          glare.addColorStop(0.35, 'rgba(255, 255, 255, 0.05)')
          glare.addColorStop(0.7, 'transparent')
          c.fillStyle = glare
          c.fill()
          c.restore()
        },
        stroke: '#282b3a',
        lineWidth: 1.5,
        isScreen: true
      })

      // --- Upper Illuminated Marquee ---
      polygons.push({
        pts: [
          { x: -W, y: H_TOP, z: 22 },
          { x: W, y: H_TOP, z: 22 },
          { x: W, y: H_CRT_TOP - 2, z: 10 },
          { x: -W, y: H_CRT_TOP - 2, z: 10 }
        ],
        fill: (c, pts2d) => {
          const marqueeGrad = c.createLinearGradient(pts2d[0].x, pts2d[0].y, pts2d[2].x, pts2d[2].y)
          marqueeGrad.addColorStop(0, 'rgba(203, 179, 255, 0.95)')
          marqueeGrad.addColorStop(0.5, 'rgba(156, 224, 200, 0.95)')
          marqueeGrad.addColorStop(1, 'rgba(158, 191, 248, 0.95)')
          c.fillStyle = marqueeGrad
          c.fill()

          // Marquee Text
          const mx = (pts2d[0].x + pts2d[1].x) * 0.5
          const my = (pts2d[0].y + pts2d[2].y) * 0.5 + 3
          c.save()
          c.fillStyle = '#111216'
          c.font = '900 11px monospace'
          c.textAlign = 'center'
          c.textBaseline = 'middle'
          c.shadowColor = 'rgba(255, 255, 255, 0.8)'
          c.shadowBlur = 6
          c.fillText('❖ YULYA ARCADE', mx, my)
          c.restore()
        },
        stroke: '#ffffff',
        lineWidth: 1.5,
        isMarquee: true
      })

      // --- Left Cabinet Side Panel (Detailed 3D Silhouette) ---
      polygons.push({
        pts: [
          { x: -W, y: H_TOP, z: 22 },
          { x: -W, y: H_TOP - 6, z: -30 },
          { x: -W, y: H_BASE, z: -40 },
          { x: -W, y: H_BASE, z: 25 },
          { x: -W, y: H_DECK + 20, z: 48 },
          { x: -W, y: H_DECK - 6, z: 20 },
          { x: -W, y: H_CRT_TOP, z: -8 }
        ],
        fill: (c, pts2d, dot) => {
          const sideGrad = c.createLinearGradient(pts2d[0].x, pts2d[0].y, pts2d[2].x, pts2d[2].y)
          sideGrad.addColorStop(0, `rgba(${Math.floor(32 * dot + 12)}, ${Math.floor(34 * dot + 14)}, ${Math.floor(48 * dot + 18)}, 0.98)`)
          sideGrad.addColorStop(1, '#0e0f14')
          c.fillStyle = sideGrad
          c.fill()

          // Side Neon Accent Decal
          c.save()
          c.strokeStyle = 'rgba(203, 179, 255, 0.45)'
          c.lineWidth = 2
          c.beginPath()
          c.moveTo((pts2d[0].x + pts2d[1].x) * 0.5, (pts2d[0].y + pts2d[1].y) * 0.5 + 10)
          c.lineTo((pts2d[2].x + pts2d[3].x) * 0.5 + 10, (pts2d[2].y + pts2d[3].y) * 0.5 - 20)
          c.stroke()
          c.restore()
        },
        stroke: 'rgba(203, 179, 255, 0.3)',
        lineWidth: 1.2
      })

      // --- Right Cabinet Side Panel (Detailed 3D Silhouette) ---
      polygons.push({
        pts: [
          { x: W, y: H_TOP - 6, z: -30 },
          { x: W, y: H_TOP, z: 22 },
          { x: W, y: H_CRT_TOP, z: -8 },
          { x: W, y: H_DECK - 6, z: 20 },
          { x: W, y: H_DECK + 20, z: 48 },
          { x: W, y: H_BASE, z: 25 },
          { x: W, y: H_BASE, z: -40 }
        ],
        fill: (c, pts2d, dot) => {
          const sideGrad = c.createLinearGradient(pts2d[0].x, pts2d[0].y, pts2d[5].x, pts2d[5].y)
          sideGrad.addColorStop(0, `rgba(${Math.floor(38 * dot + 14)}, ${Math.floor(40 * dot + 16)}, ${Math.floor(56 * dot + 22)}, 0.98)`)
          sideGrad.addColorStop(1, '#111218')
          c.fillStyle = sideGrad
          c.fill()

          // Side Neon Accent Decal
          c.save()
          c.strokeStyle = 'rgba(156, 224, 200, 0.45)'
          c.lineWidth = 2
          c.beginPath()
          c.moveTo((pts2d[0].x + pts2d[1].x) * 0.5, (pts2d[0].y + pts2d[1].y) * 0.5 + 10)
          c.lineTo((pts2d[5].x + pts2d[6].x) * 0.5 - 10, (pts2d[5].y + pts2d[6].y) * 0.5 - 20)
          c.stroke()
          c.restore()
        },
        stroke: 'rgba(156, 224, 200, 0.3)',
        lineWidth: 1.2
      })

      // --- Top Hood Roof ---
      polygons.push({
        pts: [
          { x: -W, y: H_TOP - 6, z: -30 },
          { x: W, y: H_TOP - 6, z: -30 },
          { x: W, y: H_TOP, z: 22 },
          { x: -W, y: H_TOP, z: 22 }
        ],
        fill: (c, _pts2d, dot) => {
          c.fillStyle = `rgba(${Math.floor(40 * dot + 20)}, ${Math.floor(42 * dot + 22)}, ${Math.floor(58 * dot + 26)}, 0.98)`
          c.fill()
        },
        stroke: 'rgba(255, 255, 255, 0.2)',
        lineWidth: 1
      })

      // Project, depth sort, and draw all cabinet polygons
      const renderedPolys = polygons.map(poly => {
        const projected = poly.pts.map(p => project(p, cx, cy))
        // Calculate average Z for painter's depth sort
        const avgZ = projected.reduce((acc, p) => acc + p.z, 0) / projected.length

        // Normal calculation for back-face culling & lighting
        const p0 = poly.pts[0]
        const p1 = poly.pts[1]
        const p2 = poly.pts[2]
        const e1 = { x: p1.x - p0.x, y: p1.y - p0.y, z: p1.z - p0.z }
        const e2 = { x: p2.x - p0.x, y: p2.y - p0.y, z: p2.z - p0.z }
        const nx = e1.y * e2.z - e1.z * e2.y
        const ny = e1.z * e2.x - e1.x * e2.z
        const nz = e1.x * e2.y - e1.y * e2.x
        const nLen = Math.hypot(nx, ny, nz) || 1

        // 2D cross product for winding culling
        const cross = (projected[1].x - projected[0].x) * (projected[2].y - projected[0].y) -
                      (projected[1].y - projected[0].y) * (projected[2].x - projected[0].x)

        const dot = Math.max(0.2, (nx * light.x + ny * light.y + nz * light.z) / nLen)

        return {
          poly,
          projected,
          avgZ,
          cross,
          dot
        }
      })
      .filter(item => item.cross > 0) // Front facing only
      .sort((a, b) => b.avgZ - a.avgZ) // Back to front

      renderedPolys.forEach(({ poly, projected, dot }) => {
        ctx.save()
        ctx.beginPath()
        projected.forEach((p, idx) => {
          if (idx === 0) ctx.moveTo(p.x, p.y)
          else ctx.lineTo(p.x, p.y)
        })
        ctx.closePath()

        if (typeof poly.fill === 'function') {
          poly.fill(ctx, projected, dot)
        } else {
          ctx.fillStyle = poly.fill
          ctx.fill()
        }

        if (poly.stroke) {
          ctx.strokeStyle = poly.stroke
          ctx.lineWidth = poly.lineWidth || 1
          ctx.stroke()
        }
        ctx.restore()
      })

      // 5. Orbiting 3D Golden Arcade Tokens (Coins)
      const coinCount = 3
      for (let c = 0; c < coinCount; c++) {
        const cAngle = time * 1.4 + (c * (Math.PI * 2 / coinCount))
        const cRadius = 110 + (c % 2) * 15
        const cx3 = Math.cos(cAngle) * cRadius
        const cz3 = Math.sin(cAngle) * cRadius
        const cy3 = Math.sin(cAngle * 1.5) * 25 - 10 + Y0

        const coinProj = project({ x: cx3, y: cy3, z: cz3 }, cx, cy)
        if (coinProj.scale > 0) {
          ctx.save()
          // Coin disc with metallic gradient
          const coinRad = 13 * coinProj.scale
          ctx.beginPath()
          const tiltAspect = Math.abs(Math.sin(cAngle * 2)) * 0.6 + 0.4
          ctx.ellipse(coinProj.x, coinProj.y, coinRad, coinRad * tiltAspect, cAngle, 0, Math.PI * 2)

          const cGrad = ctx.createLinearGradient(coinProj.x - coinRad, coinProj.y - coinRad, coinProj.x + coinRad, coinProj.y + coinRad)
          cGrad.addColorStop(0, '#fff4b8')
          cGrad.addColorStop(0.5, '#fbbf24')
          cGrad.addColorStop(1, '#b45309')
          ctx.fillStyle = cGrad
          ctx.shadowColor = '#fbbf24'
          ctx.shadowBlur = 10 * coinProj.scale
          ctx.fill()

          ctx.strokeStyle = '#ffffff'
          ctx.lineWidth = 1.2 * coinProj.scale
          ctx.stroke()

          // Coin Star symbol
          ctx.fillStyle = '#78350f'
          ctx.font = `bold ${Math.floor(10 * coinProj.scale)}px monospace`
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillText('★', coinProj.x, coinProj.y)
          ctx.restore()
        }
      }

      // 6. Coin Burst Particles
      for (let i = coinParticles.length - 1; i >= 0; i--) {
        const cp = coinParticles[i]
        cp.x += cp.vx
        cp.y += cp.vy
        cp.z += cp.vz
        cp.vy += 0.35 // Gravity
        cp.life -= 0.025

        if (cp.life <= 0) {
          coinParticles.splice(i, 1)
          continue
        }

        const cpProj = project(cp, cx, cy)
        if (cpProj.scale > 0) {
          ctx.save()
          ctx.beginPath()
          ctx.arc(cpProj.x, cpProj.y, 4 * cpProj.scale * cp.life, 0, Math.PI * 2)
          ctx.fillStyle = '#fbbf24'
          ctx.shadowColor = '#fbbf24'
          ctx.shadowBlur = 8
          ctx.fill()
          ctx.restore()
        }
      }

      // 7. Ambient Stardust
      particles.forEach(p => {
        p.y += p.vy
        if (p.y < -160) p.y = 150

        const pProj = project(p, cx, cy)
        if (pProj.scale > 0) {
          ctx.save()
          ctx.beginPath()
          ctx.arc(pProj.x, pProj.y, p.size * pProj.scale, 0, Math.PI * 2)
          ctx.fillStyle = p.color
          ctx.globalAlpha = p.alpha * pProj.scale
          ctx.shadowColor = p.color
          ctx.shadowBlur = 6
          ctx.fill()
          ctx.restore()
        }
      })

      ctx.restore()
      animId = requestAnimationFrame(render)
    }

    render()

    // Interactive pointer handling
    const handlePointerMove = (e: MouseEvent) => {
      if (!containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      const normX = (e.clientX - rect.left) / rect.width - 0.5
      const normY = (e.clientY - rect.top) / rect.height - 0.5

      targetYaw = -0.35 + normX * 0.9
      targetPitch = 0.22 + normY * 0.4

      joyTiltX = normX * 8
      joyTiltZ = normY * 5

      setTilt({
        x: normY * 10,
        y: -normX * 10
      })
    }

    const handleClick = (e: MouseEvent) => {
      if (!containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      const clickX = e.clientX - rect.left - rect.width * 0.5
      const clickY = e.clientY - rect.top - rect.height * 0.5

      // Trigger button press animation
      for (let b = 0; b < buttonPress.length; b++) {
        buttonPress[b] = 1
      }
      joyTiltX = (Math.random() - 0.5) * 12
      joyTiltZ = (Math.random() - 0.5) * 8

      // Spawn coins
      setCredits(c => c + 1)
      for (let i = 0; i < 16; i++) {
        const ang = (i / 16) * Math.PI * 2
        coinParticles.push({
          x: clickX * 0.4,
          y: clickY * 0.4,
          z: 30,
          vx: Math.cos(ang) * (3 + Math.random() * 4),
          vy: -4 - Math.random() * 5,
          vz: (Math.random() - 0.5) * 4,
          life: 1
        })
      }
    }

    const container = containerRef.current
    if (container) {
      container.addEventListener('mousemove', handlePointerMove)
      container.addEventListener('click', handleClick)
      container.addEventListener('mouseenter', () => setIsHovered(true))
      container.addEventListener('mouseleave', () => {
        setIsHovered(false)
        setTilt({ x: 0, y: 0 })
      })
    }

    return () => {
      cancelAnimationFrame(animId)
      window.removeEventListener('resize', handleResize)
      if (container) {
        container.removeEventListener('mousemove', handlePointerMove)
        container.removeEventListener('click', handleClick)
      }
    }
  }, [])

  return (
    <div
      ref={containerRef}
      className={`hero-3d-wrapper ${isHovered ? 'hovered' : ''}`}
      style={{
        transform: `perspective(1000px) rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)`
      }}
    >
      <canvas ref={canvasRef} className="hero-3d-canvas" />

      {/* Floating HUD Badges with 3D Parallax */}
      <div className="floating-hud hud-top-right">
        <div className="hud-pill">
          <span className="hud-live-dot" />
          <Zap size={13} className="hud-icon text-lilac" />
          <span>Real-time 3D Engine • 60 FPS</span>
        </div>
      </div>

      <div className="floating-hud hud-bottom-left">
        <div className="hud-pill">
          <Gamepad2 size={13} className="hud-icon text-mint" />
          <span>CREDITS: {credits} • Insert Coin</span>
        </div>
      </div>

      <div className="floating-hud hud-bottom-right">
        <div className="hud-pill">
          <Sparkles size={13} className="hud-icon text-peach" />
          <span>Click to play • Move cursor to orbit</span>
        </div>
      </div>
    </div>
  )
}
