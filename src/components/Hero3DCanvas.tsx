import { useEffect, useRef, useState } from 'react'
import { Sparkles, Code2, Zap } from 'lucide-react'

interface Point3D {
  x: number
  y: number
  z: number
}

interface Face3D {
  indices: number[]
  color: string
  specular: string
}

export default function Hero3DCanvas() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [tilt, setTilt] = useState({ x: 0, y: 0 })
  const [isHovered, setIsHovered] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let animId: number
    let width = 0
    let height = 0
    let dpr = 1

    // Resize handler with high DPI support
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

    // Physics / Camera angles
    let yaw = 0.5
    let pitch = 0.4
    let targetYaw = 0.5
    let targetPitch = 0.38

    // Particle field
    const PARTICLE_COUNT = 45
    const particles: Array<{ x: number; y: number; z: number; vy: number; size: number; alpha: number; hue: number }> = []
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      particles.push({
        x: (Math.random() - 0.5) * 360,
        y: (Math.random() - 0.5) * 260,
        z: (Math.random() - 0.5) * 360,
        vy: -0.3 - Math.random() * 0.5,
        size: 1.2 + Math.random() * 2.2,
        alpha: 0.2 + Math.random() * 0.7,
        hue: Math.random() > 0.5 ? 260 : 160
      })
    }

    // Shockwave ripples from clicks
    const ripples: Array<{ radius: number; maxRadius: number; alpha: number }> = []

    // 3D Gem Geometry (Dual-pyramid Octahedron)
    const gemVertices: Point3D[] = [
      { x: 0, y: -75, z: 0 },    // Top apex
      { x: 48, y: 0, z: 48 },    // Mid 0
      { x: -48, y: 0, z: 48 },   // Mid 1
      { x: -48, y: 0, z: -48 },  // Mid 2
      { x: 48, y: 0, z: -48 },   // Mid 3
      { x: 0, y: 75, z: 0 }      // Bottom apex
    ]

    const gemFaces: Face3D[] = [
      // Top pyramid
      { indices: [0, 1, 2], color: 'rgba(203, 179, 255, 0.75)', specular: '#ffffff' },
      { indices: [0, 2, 3], color: 'rgba(156, 224, 200, 0.7)', specular: '#ffffff' },
      { indices: [0, 3, 4], color: 'rgba(158, 191, 248, 0.75)', specular: '#ffffff' },
      { indices: [0, 4, 1], color: 'rgba(235, 185, 255, 0.8)', specular: '#ffffff' },
      // Bottom pyramid
      { indices: [5, 2, 1], color: 'rgba(142, 110, 215, 0.75)', specular: '#cbb3ff' },
      { indices: [5, 3, 2], color: 'rgba(92, 180, 150, 0.7)', specular: '#9ce0c8' },
      { indices: [5, 4, 3], color: 'rgba(100, 145, 220, 0.75)', specular: '#9ebff8' },
      { indices: [5, 1, 4], color: 'rgba(180, 120, 225, 0.8)', specular: '#f3b8ff' }
    ]

    // Base Platform Geometry (Hexagonal or chamfered floating island)
    const platformRadius = 145
    const platformHeight = 24
    const platformSegments = 8
    const baseVerticesTop: Point3D[] = []
    const baseVerticesBottom: Point3D[] = []

    for (let i = 0; i < platformSegments; i++) {
      const angle = (i / platformSegments) * Math.PI * 2
      const px = Math.cos(angle) * platformRadius
      const pz = Math.sin(angle) * platformRadius
      baseVerticesTop.push({ x: px, y: 85, z: pz })
      baseVerticesBottom.push({ x: px * 0.9, y: 85 + platformHeight, z: pz * 0.9 })
    }

    // Light source vector (normalized)
    const lightDir = { x: 0.45, y: -0.75, z: -0.48 }
    const lightMag = Math.hypot(lightDir.x, lightDir.y, lightDir.z)
    lightDir.x /= lightMag
    lightDir.y /= lightMag
    lightDir.z /= lightMag

    // Projection & Matrix transforms
    const fov = 420

    const project = (p: Point3D, cx: number, cy: number, scaleFactor: number) => {
      // Rotate around Y (yaw)
      const cosY = Math.cos(yaw)
      const sinY = Math.sin(yaw)
      const x1 = p.x * cosY - p.z * sinY
      const z1 = p.x * sinY + p.z * cosY

      // Rotate around X (pitch)
      const cosP = Math.cos(pitch)
      const sinP = Math.sin(pitch)
      const y2 = p.y * cosP - z1 * sinP
      const z2 = p.y * sinP + z1 * cosP

      // Perspective divide
      const dist = fov + z2
      const scale = dist > 1 ? (fov / dist) * scaleFactor : 0
      return {
        x: cx + x1 * scale,
        y: cy + y2 * scale,
        z: z2,
        scale
      }
    }

    let time = 0

    // Main animation loop
    const render = () => {
      time += 0.016
      ctx.save()
      ctx.scale(dpr, dpr)
      ctx.clearRect(0, 0, width, height)

      const cx = width * 0.5
      const cy = height * 0.52

      // Smooth damping toward target angles
      yaw += (targetYaw - yaw) * 0.05
      pitch += (targetPitch - pitch) * 0.05

      // Continuous gentle idle spin when user isn't hovering actively
      targetYaw += 0.003

      // 1. Draw Background Ambient Radial Glow
      const bgGrad = ctx.createRadialGradient(cx, cy, 30, cx, cy, width * 0.45)
      bgGrad.addColorStop(0, 'rgba(168, 130, 245, 0.14)')
      bgGrad.addColorStop(0.5, 'rgba(120, 85, 215, 0.05)')
      bgGrad.addColorStop(1, 'rgba(17, 18, 20, 0)')
      ctx.fillStyle = bgGrad
      ctx.fillRect(0, 0, width, height)

      // 2. Draw 3D Ground Shadow underneath island
      const shadowProj = project({ x: 0, y: 130, z: 0 }, cx, cy, 1)
      if (shadowProj.scale > 0) {
        ctx.save()
        ctx.beginPath()
        ctx.ellipse(shadowProj.x, shadowProj.y, 140 * shadowProj.scale, 50 * shadowProj.scale, 0, 0, Math.PI * 2)
        ctx.fillStyle = 'rgba(0, 0, 0, 0.45)'
        ctx.filter = 'blur(16px)'
        ctx.fill()
        ctx.restore()
      }

      // 3. Render 3D Platform (Floating island)
      const topProj = baseVerticesTop.map(v => project(v, cx, cy, 1))
      const botProj = baseVerticesBottom.map(v => project(v, cx, cy, 1))

      // Draw Platform Sides
      for (let i = 0; i < platformSegments; i++) {
        const next = (i + 1) % platformSegments
        const p1 = topProj[i]
        const p2 = topProj[next]
        const p3 = botProj[next]
        const p4 = botProj[i]

        // Back-face culling for sides
        const normalZ = (p2.x - p1.x) * (p4.y - p1.y) - (p2.y - p1.y) * (p4.x - p1.x)
        if (normalZ > 0) {
          ctx.beginPath()
          ctx.moveTo(p1.x, p1.y)
          ctx.lineTo(p2.x, p2.y)
          ctx.lineTo(p3.x, p3.y)
          ctx.lineTo(p4.x, p4.y)
          ctx.closePath()

          const sideGrad = ctx.createLinearGradient(p1.x, p1.y, p3.x, p3.y)
          const shade = 0.15 + (i / platformSegments) * 0.15
          sideGrad.addColorStop(0, `rgba(38, 41, 52, ${shade + 0.3})`)
          sideGrad.addColorStop(1, `rgba(18, 20, 26, ${shade + 0.5})`)
          ctx.fillStyle = sideGrad
          ctx.fill()

          ctx.strokeStyle = 'rgba(203, 179, 255, 0.15)'
          ctx.lineWidth = 1
          ctx.stroke()
        }
      }

      // Draw Platform Top Surface
      ctx.beginPath()
      topProj.forEach((p, idx) => {
        if (idx === 0) ctx.moveTo(p.x, p.y)
        else ctx.lineTo(p.x, p.y)
      })
      ctx.closePath()

      const topGrad = ctx.createLinearGradient(topProj[0].x, topProj[0].y, topProj[4]?.x || cx, topProj[4]?.y || cy)
      topGrad.addColorStop(0, 'rgba(32, 35, 46, 0.95)')
      topGrad.addColorStop(0.5, 'rgba(24, 26, 35, 0.95)')
      topGrad.addColorStop(1, 'rgba(18, 19, 26, 0.98)')
      ctx.fillStyle = topGrad
      ctx.fill()

      ctx.strokeStyle = 'rgba(203, 179, 255, 0.35)'
      ctx.lineWidth = 1.5
      ctx.stroke()

      // Isometric Neon Grid lines on Platform Top
      ctx.save()
      ctx.strokeStyle = 'rgba(203, 179, 255, 0.12)'
      ctx.lineWidth = 1
      for (let gx = -100; gx <= 100; gx += 40) {
        const pStart = project({ x: gx, y: 85, z: -90 }, cx, cy, 1)
        const pEnd = project({ x: gx, y: 85, z: 90 }, cx, cy, 1)
        ctx.beginPath()
        ctx.moveTo(pStart.x, pStart.y)
        ctx.lineTo(pEnd.x, pEnd.y)
        ctx.stroke()
      }
      for (let gz = -90; gz <= 90; gz += 45) {
        const pStart = project({ x: -100, y: 85, z: gz }, cx, cy, 1)
        const pEnd = project({ x: 100, y: 85, z: gz }, cx, cy, 1)
        ctx.beginPath()
        ctx.moveTo(pStart.x, pStart.y)
        ctx.lineTo(pEnd.x, pEnd.y)
        ctx.stroke()
      }
      ctx.restore()

      // 4. Render Ripples
      for (let rIdx = ripples.length - 1; rIdx >= 0; rIdx--) {
        const rip = ripples[rIdx]
        rip.radius += 3.5
        rip.alpha -= 0.02
        if (rip.alpha <= 0 || rip.radius > rip.maxRadius) {
          ripples.splice(rIdx, 1)
          continue
        }

        ctx.save()
        ctx.beginPath()
        const ripCenter = project({ x: 0, y: 85, z: 0 }, cx, cy, 1)
        ctx.ellipse(ripCenter.x, ripCenter.y, rip.radius * ripCenter.scale, rip.radius * 0.45 * ripCenter.scale, 0, 0, Math.PI * 2)
        ctx.strokeStyle = `rgba(168, 130, 245, ${rip.alpha})`
        ctx.lineWidth = 2
        ctx.stroke()
        ctx.restore()
      }

      // 5. Render 3D Stardust Particles
      particles.forEach(p => {
        p.y += p.vy
        if (p.y < -160) p.y = 140

        const proj = project(p, cx, cy, 1)
        if (proj.scale > 0) {
          ctx.save()
          ctx.beginPath()
          ctx.arc(proj.x, proj.y, p.size * proj.scale, 0, Math.PI * 2)
          ctx.fillStyle = `hsla(${p.hue}, 80%, 75%, ${p.alpha * proj.scale})`
          ctx.shadowColor = `hsla(${p.hue}, 90%, 70%, 0.8)`
          ctx.shadowBlur = 6 * proj.scale
          ctx.fill()
          ctx.restore()
        }
      })

      // 6. Floating Central 3D Crystal Gem (with floating bobbing)
      const gemBobY = Math.sin(time * 2.2) * 12
      const gemRotTime = time * 0.9

      // Local rotation of the crystal itself
      const cosG = Math.cos(gemRotTime)
      const sinG = Math.sin(gemRotTime)

      const rotatedGemVerts: Point3D[] = gemVertices.map(v => ({
        x: v.x * cosG - v.z * sinG,
        y: v.y + gemBobY,
        z: v.x * sinG + v.z * cosG
      }))

      // Project vertices to screen
      const projectedGemVerts = rotatedGemVerts.map(v => project(v, cx, cy, 1))

      // Depth sort faces (Painter's algorithm)
      const sortedFaces = gemFaces.map(face => {
        const v0 = rotatedGemVerts[face.indices[0]]
        const v1 = rotatedGemVerts[face.indices[1]]
        const v2 = rotatedGemVerts[face.indices[2]]

        const p0 = projectedGemVerts[face.indices[0]]
        const p1 = projectedGemVerts[face.indices[1]]
        const p2 = projectedGemVerts[face.indices[2]]

        // Calculate face normal in 3D for lighting
        const edge1 = { x: v1.x - v0.x, y: v1.y - v0.y, z: v1.z - v0.z }
        const edge2 = { x: v2.x - v0.x, y: v2.y - v0.y, z: v2.z - v0.z }
        const nx = edge1.y * edge2.z - edge1.z * edge2.y
        const ny = edge1.z * edge2.x - edge1.x * edge2.z
        const nz = edge1.x * edge2.y - edge1.y * edge2.x
        const len = Math.hypot(nx, ny, nz) || 1

        // Dot product with light direction
        const dot = Math.max(0.15, (nx * lightDir.x + ny * lightDir.y + nz * lightDir.z) / len)
        const avgZ = (p0.z + p1.z + p2.z) / 3

        return {
          face,
          p0,
          p1,
          p2,
          avgZ,
          dot
        }
      }).sort((a, b) => b.avgZ - a.avgZ)

      // Draw sorted gem faces
      sortedFaces.forEach(({ face, p0, p1, p2, dot }) => {
        // Back-face culling on projected 2D coordinates
        const cross = (p1.x - p0.x) * (p2.y - p0.y) - (p1.y - p0.y) * (p2.x - p0.x)
        if (cross <= 0) return

        ctx.save()
        ctx.beginPath()
        ctx.moveTo(p0.x, p0.y)
        ctx.lineTo(p1.x, p1.y)
        ctx.lineTo(p2.x, p2.y)
        ctx.closePath()

        ctx.fillStyle = face.color
        ctx.fill()

        // Highlight sheen
        ctx.fillStyle = `rgba(255, 255, 255, ${Math.min(0.45, dot * 0.5)})`
        ctx.fill()

        // Glowing crystal edges
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)'
        ctx.lineWidth = 1.2
        ctx.stroke()
        ctx.restore()
      })

      // 7. Orbiting 3D Ring & Satellites around the Gem
      const ringRadius = 100
      const ringTilt = 0.4
      const ringPoints = 32
      ctx.save()
      ctx.strokeStyle = 'rgba(180, 140, 255, 0.28)'
      ctx.lineWidth = 1.5
      ctx.setLineDash([6, 6])
      ctx.beginPath()
      for (let i = 0; i <= ringPoints; i++) {
        const theta = (i / ringPoints) * Math.PI * 2
        const rx = Math.cos(theta) * ringRadius
        const rz = Math.sin(theta) * ringRadius
        const ry = Math.sin(theta) * (ringRadius * ringTilt) + gemBobY
        const rProj = project({ x: rx, y: ry, z: rz }, cx, cy, 1)
        if (i === 0) ctx.moveTo(rProj.x, rProj.y)
        else ctx.lineTo(rProj.x, rProj.y)
      }
      ctx.stroke()
      ctx.restore()

      // Orbiting Voxel Cube Satellite
      const satAngle = time * 1.6
      const satX = Math.cos(satAngle) * ringRadius
      const satZ = Math.sin(satAngle) * ringRadius
      const satY = Math.sin(satAngle) * (ringRadius * ringTilt) + gemBobY
      const satProj = project({ x: satX, y: satY, z: satZ }, cx, cy, 1)

      if (satProj.scale > 0) {
        ctx.save()
        ctx.beginPath()
        ctx.arc(satProj.x, satProj.y, 8 * satProj.scale, 0, Math.PI * 2)
        ctx.fillStyle = '#10b981'
        ctx.shadowColor = '#10b981'
        ctx.shadowBlur = 12 * satProj.scale
        ctx.fill()

        ctx.strokeStyle = '#ffffff'
        ctx.lineWidth = 1.5
        ctx.stroke()
        ctx.restore()
      }

      // Orbiting Second Satellite
      const sat2Angle = satAngle + Math.PI
      const sat2X = Math.cos(sat2Angle) * (ringRadius * 0.75)
      const sat2Z = Math.sin(sat2Angle) * (ringRadius * 0.75)
      const sat2Y = Math.sin(sat2Angle) * (ringRadius * 0.75 * ringTilt) + gemBobY
      const sat2Proj = project({ x: sat2X, y: sat2Y, z: sat2Z }, cx, cy, 1)

      if (sat2Proj.scale > 0) {
        ctx.save()
        ctx.beginPath()
        ctx.arc(sat2Proj.x, sat2Proj.y, 6 * sat2Proj.scale, 0, Math.PI * 2)
        ctx.fillStyle = '#f59e0b'
        ctx.shadowColor = '#f59e0b'
        ctx.shadowBlur = 10 * sat2Proj.scale
        ctx.fill()
        ctx.restore()
      }

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

      targetYaw = 0.5 + normX * 0.85
      targetPitch = 0.38 + normY * 0.5

      setTilt({
        x: normY * 12,
        y: -normX * 12
      })
    }

    const handleClick = () => {
      ripples.push({
        radius: 10,
        maxRadius: 180,
        alpha: 0.8
      })
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
          <span>60 FPS • WebGL & Canvas 2D</span>
        </div>
      </div>

      <div className="floating-hud hud-bottom-left">
        <div className="hud-pill">
          <Code2 size={13} className="hud-icon text-mint" />
          <span>TypeScript • Hot-Reload Engine</span>
        </div>
      </div>

      <div className="floating-hud hud-bottom-right">
        <div className="hud-pill">
          <Sparkles size={13} className="hud-icon text-peach" />
          <span>Natural Language to Mechanics</span>
        </div>
      </div>

      <div className="hud-hint">
        <span>Click to pulse energy • Move cursor to orbit 3D space</span>
      </div>
    </div>
  )
}
