import { useEffect, useRef, useState } from 'react'
import { Sparkles, Gamepad2, Zap } from 'lucide-react'

// 4x4 Matrix Utilities for WebGL
function createMat4(): Float32Array {
  const out = new Float32Array(16)
  out[0] = 1; out[5] = 1; out[10] = 1; out[15] = 1
  return out
}

function mat4Perspective(out: Float32Array, fovy: number, aspect: number, near: number, far: number) {
  const f = 1.0 / Math.tan(fovy / 2)
  const nf = 1 / (near - far)
  out.fill(0)
  out[0] = f / aspect
  out[5] = f
  out[10] = (far + near) * nf
  out[11] = -1
  out[14] = (2 * far * near) * nf
}

function mat4Identity(out: Float32Array) {
  out.fill(0)
  out[0] = 1; out[5] = 1; out[10] = 1; out[15] = 1
}

function mat4RotateX(out: Float32Array, a: Float32Array, rad: number) {
  const s = Math.sin(rad)
  const c = Math.cos(rad)
  const a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7]
  const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11]

  if (a !== out) {
    out[0] = a[0]; out[1] = a[1]; out[2] = a[2]; out[3] = a[3]
    out[12] = a[12]; out[13] = a[13]; out[14] = a[14]; out[15] = a[15]
  }

  out[4] = a10 * c + a20 * s
  out[5] = a11 * c + a21 * s
  out[6] = a12 * c + a22 * s
  out[7] = a13 * c + a23 * s
  out[8] = a20 * c - a10 * s
  out[9] = a21 * c - a11 * s
  out[10] = a22 * c - a12 * s
  out[11] = a23 * c - a13 * s
}

function mat4RotateY(out: Float32Array, a: Float32Array, rad: number) {
  const s = Math.sin(rad)
  const c = Math.cos(rad)
  const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3]
  const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11]

  if (a !== out) {
    out[4] = a[4]; out[5] = a[5]; out[6] = a[6]; out[7] = a[7]
    out[12] = a[12]; out[13] = a[13]; out[14] = a[14]; out[15] = a[15]
  }

  out[0] = a00 * c - a20 * s
  out[1] = a01 * c - a21 * s
  out[2] = a02 * c - a22 * s
  out[3] = a03 * c - a23 * s
  out[8] = a00 * s + a20 * c
  out[9] = a01 * s + a21 * c
  out[10] = a02 * s + a22 * c
  out[11] = a03 * s + a22 * c
}

// Generate Icosahedron Geometry with Faceted Normals for Sparkling Crystal Glint
function buildCrystalGeometry(radius: number) {
  const t = (1.0 + Math.sqrt(5.0)) / 2.0

  const rawVerts = [
    [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0],
    [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
    [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]
  ]

  const faces = [
    [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
    [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
    [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]
  ]

  const positions: number[] = []
  const normals: number[] = []

  faces.forEach(face => {
    const v0 = rawVerts[face[0]]
    const v1 = rawVerts[face[1]]
    const v2 = rawVerts[face[2]]

    // Normalize to radius
    const p0 = v0.map(coord => coord * radius)
    const p1 = v1.map(coord => coord * radius)
    const p2 = v2.map(coord => coord * radius)

    // Calculate face normal
    const e1 = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]]
    const e2 = [p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2]]
    const nx = e1[1] * e2[2] - e1[2] * e2[1]
    const ny = e1[2] * e2[0] - e1[0] * e2[2]
    const nz = e1[0] * e2[1] - e1[1] * e2[0]
    const len = Math.hypot(nx, ny, nz) || 1
    const norm = [nx / len, ny / len, nz / len]

    // Push 3 vertices with same normal for crisp gemstone facets
    positions.push(...p0, ...p1, ...p2)
    normals.push(...norm, ...norm, ...norm)
  })

  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    vertexCount: positions.length / 3
  }
}

// Generate Ring Geometry
function buildRingGeometry(radius: number, thickness: number, segments: number) {
  const positions: number[] = []
  const normals: number[] = []

  for (let i = 0; i < segments; i++) {
    const a1 = (i / segments) * Math.PI * 2
    const a2 = ((i + 1) / segments) * Math.PI * 2

    const rInner = radius - thickness
    const rOuter = radius + thickness

    const p0 = [Math.cos(a1) * rInner, 0, Math.sin(a1) * rInner]
    const p1 = [Math.cos(a1) * rOuter, 0, Math.sin(a1) * rOuter]
    const p2 = [Math.cos(a2) * rOuter, 0, Math.sin(a2) * rOuter]
    const p3 = [Math.cos(a2) * rInner, 0, Math.sin(a2) * rInner]

    positions.push(...p0, ...p1, ...p2)
    positions.push(...p0, ...p2, ...p3)

    normals.push(0, 1, 0, 0, 1, 0, 0, 1, 0)
    normals.push(0, 1, 0, 0, 1, 0, 0, 1, 0)
  }

  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    vertexCount: positions.length / 3
  }
}

export default function Hero3DCanvas() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [tilt, setTilt] = useState({ x: 0, y: 0 })
  const [isHovered, setIsHovered] = useState(false)
  const [spinSpeed, setSpinSpeed] = useState(1)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    // Attempt Native WebGL Context with Hardware Depth Testing & Anti-Aliasing
    const gl = canvas.getContext('webgl', { antialias: true, alpha: true })
    if (!gl) return

    let animId: number

    // Shaders
    const vsSource = `
      attribute vec3 aPosition;
      attribute vec3 aNormal;
      uniform mat4 uModel;
      uniform mat4 uView;
      uniform mat4 uProj;
      varying vec3 vNormal;
      varying vec3 vWorldPos;

      void main() {
        vNormal = mat3(uModel) * aNormal;
        vec4 world = uModel * vec4(aPosition, 1.0);
        vWorldPos = world.xyz;
        gl_Position = uProj * uView * world;
      }
    `

    const fsSource = `
      precision mediump float;
      varying vec3 vNormal;
      varying vec3 vWorldPos;
      uniform vec3 uLightDir;
      uniform float uTime;
      uniform vec3 uBaseColor;
      uniform float uSpecularPower;

      void main() {
        vec3 normal = normalize(vNormal);
        vec3 light = normalize(uLightDir);

        float diff = max(dot(normal, light), 0.0);

        vec3 viewDir = normalize(vec3(0.0, 0.0, 5.0) - vWorldPos);
        vec3 halfDir = normalize(light + viewDir);
        float spec = pow(max(dot(normal, halfDir), 0.0), uSpecularPower);

        // Dynamic iridescent gradient shifting between violet and emerald
        vec3 grad = mix(uBaseColor, vec3(0.61, 0.88, 0.78), sin(uTime * 1.2 + normal.y * 3.0) * 0.35 + 0.35);

        vec3 ambient = grad * 0.38;
        vec3 diffuse = grad * diff * 0.72;
        vec3 specular = vec3(1.0, 1.0, 1.0) * spec * 0.95;

        // Subtle rim light effect
        float rim = 1.0 - max(dot(viewDir, normal), 0.0);
        rim = pow(rim, 3.0) * 0.45;
        vec3 rimLight = vec3(0.85, 0.75, 1.0) * rim;

        gl_FragColor = vec4(ambient + diffuse + specular + rimLight, 0.96);
      }
    `

    const compileShader = (type: number, src: string) => {
      const shader = gl.createShader(type)!
      gl.shaderSource(shader, src)
      gl.compileShader(shader)
      return shader
    }

    const program = gl.createProgram()!
    gl.attachShader(program, compileShader(gl.VERTEX_SHADER, vsSource))
    gl.attachShader(program, compileShader(gl.FRAGMENT_SHADER, fsSource))
    gl.linkProgram(program)
    gl.useProgram(program)

    // Attributes & Uniforms
    const aPosition = gl.getAttribLocation(program, 'aPosition')
    const aNormal = gl.getAttribLocation(program, 'aNormal')
    const uModel = gl.getUniformLocation(program, 'uModel')
    const uView = gl.getUniformLocation(program, 'uView')
    const uProj = gl.getUniformLocation(program, 'uProj')
    const uLightDir = gl.getUniformLocation(program, 'uLightDir')
    const uTime = gl.getUniformLocation(program, 'uTime')
    const uBaseColor = gl.getUniformLocation(program, 'uBaseColor')
    const uSpecularPower = gl.getUniformLocation(program, 'uSpecularPower')

    // Geometries
    const crystal = buildCrystalGeometry(0.88)
    const ring1 = buildRingGeometry(1.42, 0.024, 64)
    const ring2 = buildRingGeometry(1.68, 0.018, 64)

    // Buffers for Crystal
    const crystalPosBuf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, crystalPosBuf)
    gl.bufferData(gl.ARRAY_BUFFER, crystal.positions, gl.STATIC_DRAW)

    const crystalNormBuf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, crystalNormBuf)
    gl.bufferData(gl.ARRAY_BUFFER, crystal.normals, gl.STATIC_DRAW)

    // Buffers for Ring 1
    const ring1PosBuf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, ring1PosBuf)
    gl.bufferData(gl.ARRAY_BUFFER, ring1.positions, gl.STATIC_DRAW)

    const ring1NormBuf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, ring1NormBuf)
    gl.bufferData(gl.ARRAY_BUFFER, ring1.normals, gl.STATIC_DRAW)

    // Buffers for Ring 2
    const ring2PosBuf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, ring2PosBuf)
    gl.bufferData(gl.ARRAY_BUFFER, ring2.positions, gl.STATIC_DRAW)

    const ring2NormBuf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, ring2NormBuf)
    gl.bufferData(gl.ARRAY_BUFFER, ring2.normals, gl.STATIC_DRAW)

    // Enable hardware depth test
    gl.enable(gl.DEPTH_TEST)
    gl.depthFunc(gl.LEQUAL)
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)

    // Resize handling
    const handleResize = () => {
      if (!canvas || !containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.floor(rect.width * dpr)
      canvas.height = Math.floor(rect.height * dpr)
      gl.viewport(0, 0, canvas.width, canvas.height)
    }

    handleResize()
    window.addEventListener('resize', handleResize)

    // Physics & Camera
    let rotX = 0.2
    let rotY = 0.4
    let targetRotX = 0.2
    let targetRotY = 0.4
    let extraSpin = 0
    let time = 0

    const projMat = createMat4()
    const viewMat = createMat4()
    const modelMat = createMat4()
    const tempMat = createMat4()

    mat4Identity(viewMat)
    viewMat[14] = -4.2 // Camera placed at z = 4.2

    gl.uniform3f(uLightDir, 0.45, 0.75, 0.6)

    const render = () => {
      time += 0.016
      extraSpin *= 0.94

      // Damped target rotation
      rotX += (targetRotX - rotX) * 0.08
      rotY += (targetRotY - rotY) * 0.08
      targetRotY += (0.006 + extraSpin) * spinSpeed

      gl.clearColor(0, 0, 0, 0)
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)

      // Perspective projection
      const aspect = canvas.width / (canvas.height || 1)
      mat4Perspective(projMat, Math.PI / 4, aspect, 0.1, 100.0)
      gl.uniformMatrix4fv(uProj, false, projMat)
      gl.uniformMatrix4fv(uView, false, viewMat)
      gl.uniform1f(uTime, time)

      // 1. Draw Crystal Gem Core
      mat4Identity(modelMat)
      mat4RotateX(tempMat, modelMat, rotX)
      mat4RotateY(modelMat, tempMat, rotY)
      // Gentle floating bob
      modelMat[13] = Math.sin(time * 2.2) * 0.08

      gl.uniformMatrix4fv(uModel, false, modelMat)
      gl.uniform3f(uBaseColor, 0.82, 0.72, 1.0) // Lilac
      gl.uniform1f(uSpecularPower, 36.0)

      gl.bindBuffer(gl.ARRAY_BUFFER, crystalPosBuf)
      gl.vertexAttribPointer(aPosition, 3, gl.FLOAT, false, 0, 0)
      gl.enableVertexAttribArray(aPosition)

      gl.bindBuffer(gl.ARRAY_BUFFER, crystalNormBuf)
      gl.vertexAttribPointer(aNormal, 3, gl.FLOAT, false, 0, 0)
      gl.enableVertexAttribArray(aNormal)

      gl.drawArrays(gl.TRIANGLES, 0, crystal.vertexCount)

      // 2. Draw Orbiting Ring 1 (Tilted on X/Z)
      mat4Identity(modelMat)
      mat4RotateX(tempMat, modelMat, rotX + 0.5)
      mat4RotateY(modelMat, tempMat, rotY * 0.8 + time * 0.4)
      modelMat[13] = Math.sin(time * 2.2) * 0.08

      gl.uniformMatrix4fv(uModel, false, modelMat)
      gl.uniform3f(uBaseColor, 0.61, 0.88, 0.78) // Mint
      gl.uniform1f(uSpecularPower, 48.0)

      gl.bindBuffer(gl.ARRAY_BUFFER, ring1PosBuf)
      gl.vertexAttribPointer(aPosition, 3, gl.FLOAT, false, 0, 0)
      gl.bindBuffer(gl.ARRAY_BUFFER, ring1NormBuf)
      gl.vertexAttribPointer(aNormal, 3, gl.FLOAT, false, 0, 0)

      gl.drawArrays(gl.TRIANGLES, 0, ring1.vertexCount)

      // 3. Draw Orbiting Ring 2 (Opposite tilt)
      mat4Identity(modelMat)
      mat4RotateX(tempMat, modelMat, rotX - 0.45)
      mat4RotateY(modelMat, tempMat, -rotY * 0.6 - time * 0.3)
      modelMat[13] = Math.sin(time * 2.2) * 0.08

      gl.uniformMatrix4fv(uModel, false, modelMat)
      gl.uniform3f(uBaseColor, 1.0, 0.75, 0.65) // Peach
      gl.uniform1f(uSpecularPower, 48.0)

      gl.bindBuffer(gl.ARRAY_BUFFER, ring2PosBuf)
      gl.vertexAttribPointer(aPosition, 3, gl.FLOAT, false, 0, 0)
      gl.bindBuffer(gl.ARRAY_BUFFER, ring2NormBuf)
      gl.vertexAttribPointer(aNormal, 3, gl.FLOAT, false, 0, 0)

      gl.drawArrays(gl.TRIANGLES, 0, ring2.vertexCount)

      animId = requestAnimationFrame(render)
    }

    render()

    // Interactive Mouse Tracking
    const handlePointerMove = (e: MouseEvent) => {
      if (!containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      const normX = (e.clientX - rect.left) / rect.width - 0.5
      const normY = (e.clientY - rect.top) / rect.height - 0.5

      targetRotX = 0.2 + normY * 0.9
      targetRotY += normX * 0.04

      setTilt({
        x: normY * 12,
        y: -normX * 12
      })
    }

    const handleClick = () => {
      extraSpin = 0.05
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
  }, [spinSpeed])

  return (
    <div
      ref={containerRef}
      className={`hero-3d-wrapper ${isHovered ? 'hovered' : ''}`}
      style={{
        transform: `perspective(1000px) rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)`
      }}
    >
      {/* Background Radial Glow */}
      <div className="hero-3d-glow" />

      {/* Hardware WebGL Canvas */}
      <canvas ref={canvasRef} className="hero-3d-canvas" />

      {/* Floating HUD Badges with 3D Parallax */}
      <div className="floating-hud hud-top-right">
        <div className="hud-pill">
          <span className="hud-live-dot" />
          <Zap size={13} className="hud-icon text-lilac" />
          <span>Hardware WebGL • 60 FPS</span>
        </div>
      </div>

      <div className="floating-hud hud-bottom-left">
        <div className="hud-pill">
          <Gamepad2 size={13} className="hud-icon text-mint" />
          <span>WebGL Depth Buffer Active</span>
        </div>
      </div>

      <div className="floating-hud hud-bottom-right">
        <div className="hud-pill">
          <Sparkles size={13} className="hud-icon text-peach" />
          <span>Move cursor to orbit • Click to spin</span>
        </div>
      </div>

      {/* Clean Interactive Speed Switcher */}
      <div className="hero-3d-controls">
        <button
          className={`speed-pill ${spinSpeed === 0.5 ? 'active' : ''}`}
          onClick={() => setSpinSpeed(0.5)}
        >
          Slow
        </button>
        <button
          className={`speed-pill ${spinSpeed === 1 ? 'active' : ''}`}
          onClick={() => setSpinSpeed(1)}
        >
          Normal
        </button>
        <button
          className={`speed-pill ${spinSpeed === 2 ? 'active' : ''}`}
          onClick={() => setSpinSpeed(2)}
        >
          Fast
        </button>
      </div>
    </div>
  )
}
