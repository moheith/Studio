import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'

type LightingMood = 'atelier' | 'dusk' | 'slate'

const MOOD_PRESETS: Record<
  LightingMood,
  {
    label: string
    bg: number
    fog: number
    keyColor: number
    keyIntensity: number
    fillColor: number
    fillIntensity: number
    rimColor: number
    rimIntensity: number
    beaconColor: number
    waterColor: number
    exposure: number
  }
> = {
  atelier: {
    label: 'Atelier',
    bg: 0x0d0f14,
    fog: 0x0d0f14,
    keyColor: 0xfff2dc,
    keyIntensity: 2.9,
    fillColor: 0x9bb7e0,
    fillIntensity: 1.05,
    rimColor: 0xe6c79c,
    rimIntensity: 1.35,
    beaconColor: 0xffd79a,
    waterColor: 0x3b7a80,
    exposure: 1.12,
  },
  dusk: {
    label: 'Golden Dusk',
    bg: 0x100e13,
    fog: 0x100e13,
    keyColor: 0xffb878,
    keyIntensity: 3.1,
    fillColor: 0x7a8ec4,
    fillIntensity: 0.9,
    rimColor: 0xf4c592,
    rimIntensity: 1.6,
    beaconColor: 0xffb76b,
    waterColor: 0x3a647a,
    exposure: 1.08,
  },
  slate: {
    label: 'Nordic Slate',
    bg: 0x0b0e13,
    fog: 0x0b0e13,
    keyColor: 0xdbeafe,
    keyIntensity: 2.75,
    fillColor: 0x64748b,
    fillIntensity: 1.15,
    rimColor: 0x93c5fd,
    rimIntensity: 1.4,
    beaconColor: 0xbae6fd,
    waterColor: 0x2d6878,
    exposure: 1.1,
  },
}

function createMicroGrainTexture(base: number, variance: number, streaks = false): THREE.CanvasTexture {
  const size = 128
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (ctx) {
    const img = ctx.createImageData(size, size)
    for (let y = 0; y < size; y++) {
      const rowNoise = streaks ? (Math.sin(y * 0.7) * 0.5 + (Math.random() - 0.5)) * variance : 0
      for (let x = 0; x < size; x++) {
        const idx = (y * size + x) * 4
        const n = (Math.random() - 0.5) * variance + rowNoise
        const v = Math.max(0, Math.min(255, Math.round(base + n)))
        img.data[idx] = v
        img.data[idx + 1] = v
        img.data[idx + 2] = v
        img.data[idx + 3] = 255
      }
    }
    ctx.putImageData(img, 0, 0)
  }
  const tex = new THREE.CanvasTexture(canvas)
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(2, 2)
  return tex
}

function makeOctagonShape(radius: number): THREE.Shape {
  const shape = new THREE.Shape()
  const sides = 8
  for (let i = 0; i < sides; i++) {
    const a = (i / sides) * Math.PI * 2 + Math.PI / 8
    const x = Math.cos(a) * radius
    const y = Math.sin(a) * radius
    if (i === 0) shape.moveTo(x, y)
    else shape.lineTo(x, y)
  }
  shape.closePath()
  return shape
}

function makeRoundedRectShape(w: number, h: number, r: number): THREE.Shape {
  const s = new THREE.Shape()
  const hw = w / 2
  const hh = h / 2
  s.moveTo(-hw + r, -hh)
  s.lineTo(hw - r, -hh)
  s.quadraticCurveTo(hw, -hh, hw, -hh + r)
  s.lineTo(hw, hh - r)
  s.quadraticCurveTo(hw, hh, hw - r, hh)
  s.lineTo(-hw + r, hh)
  s.quadraticCurveTo(-hw, hh, -hw, hh - r)
  s.lineTo(-hw, -hh + r)
  s.quadraticCurveTo(-hw, -hh, -hw + r, -hh)
  return s
}

export default function Hero3DCanvas() {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const [mood, setMood] = useState<LightingMood>('atelier')
  const [webglFailed, setWebglFailed] = useState(false)
  const moodRef = useRef<LightingMood>(mood)
  moodRef.current = mood

  const sceneHooksRef = useRef<{
    applyMood?: (m: LightingMood) => void
    nudgeSpin?: () => void
  }>({})

  useEffect(() => {
    sceneHooksRef.current.applyMood?.(mood)
  }, [mood])

  useEffect(() => {
    const container = hostRef.current
    if (!container) return

    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: false,
        powerPreference: 'high-performance',
      })
    } catch {
      setWebglFailed(true)
      return
    }

    const initW = Math.max(280, container.clientWidth || 640)
    const initH = Math.max(320, container.clientHeight || 480)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.setSize(initW, initH, false)
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = MOOD_PRESETS[moodRef.current].exposure
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFShadowMap
    renderer.domElement.style.width = '100%'
    renderer.domElement.style.height = '100%'
    renderer.domElement.style.display = 'block'
    container.innerHTML = ''
    container.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    const preset0 = MOOD_PRESETS[moodRef.current]
    scene.background = new THREE.Color(preset0.bg)
    scene.fog = new THREE.FogExp2(preset0.fog, 0.036)

    // Calibrated Studio HDRI reflections via PMREMGenerator + RoomEnvironment (zero external network fetches)
    const pmrem = new THREE.PMREMGenerator(renderer)
    const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    scene.environment = envTex
    scene.environmentIntensity = 0.72

    const camera = new THREE.PerspectiveCamera(34, initW / initH, 0.1, 60)
    camera.position.set(7.2, 5.4, 7.6)
    camera.lookAt(0, 0.78, 0)

    // Three-point calibrated studio lighting
    const hemi = new THREE.HemisphereLight(0xdce6f5, 0x1e2029, 0.6)
    scene.add(hemi)

    const keyLight = new THREE.DirectionalLight(preset0.keyColor, preset0.keyIntensity)
    keyLight.position.set(6.5, 9.5, 5.2)
    keyLight.castShadow = true
    keyLight.shadow.mapSize.set(1024, 1024)
    keyLight.shadow.camera.near = 2
    keyLight.shadow.camera.far = 26
    const sc = 4.6
    keyLight.shadow.camera.left = -sc
    keyLight.shadow.camera.right = sc
    keyLight.shadow.camera.top = sc
    keyLight.shadow.camera.bottom = -sc
    keyLight.shadow.bias = -0.0005
    keyLight.shadow.normalBias = 0.025
    scene.add(keyLight)

    const fillLight = new THREE.DirectionalLight(preset0.fillColor, preset0.fillIntensity)
    fillLight.position.set(-7, 4.5, -3.5)
    scene.add(fillLight)

    const rimLight = new THREE.DirectionalLight(preset0.rimColor, preset0.rimIntensity)
    rimLight.position.set(-2.5, 5.5, -7.5)
    scene.add(rimLight)

    // Procedural tactile micro-roughness textures
    const brushedMetalTex = createMicroGrainTexture(95, 36, true)
    const stoneGrainTex = createMicroGrainTexture(205, 34, false)

    // Calibrated PBR Materials (Industrial Anodized Slate, Brushed Brass, Warm Limestone, Sage Ceramic, Water)
    const matChassis = new THREE.MeshStandardMaterial({
      color: 0x1d212b,
      metalness: 0.72,
      roughness: 0.34,
      roughnessMap: brushedMetalTex,
    })
    const matDarkTrim = new THREE.MeshStandardMaterial({
      color: 0x13161d,
      metalness: 0.55,
      roughness: 0.44,
    })
    const matBrass = new THREE.MeshStandardMaterial({
      color: 0xcfa96e,
      metalness: 0.88,
      roughness: 0.24,
      roughnessMap: brushedMetalTex,
    })
    const matStone = new THREE.MeshStandardMaterial({
      color: 0xd9d2c5,
      metalness: 0.04,
      roughness: 0.82,
      roughnessMap: stoneGrainTex,
    })
    const matTerracotta = new THREE.MeshStandardMaterial({
      color: 0xb87654,
      metalness: 0.06,
      roughness: 0.74,
      roughnessMap: stoneGrainTex,
    })
    const matSage = new THREE.MeshStandardMaterial({
      color: 0x3a7a65,
      metalness: 0.08,
      roughness: 0.62,
      roughnessMap: stoneGrainTex,
    })
    const matDeepSage = new THREE.MeshStandardMaterial({
      color: 0x265446,
      metalness: 0.1,
      roughness: 0.68,
    })
    const matIndigoCeramic = new THREE.MeshStandardMaterial({
      color: 0x4c5a8a,
      metalness: 0.18,
      roughness: 0.36,
    })
    const matWater = new THREE.MeshPhysicalMaterial({
      color: preset0.waterColor,
      metalness: 0.08,
      roughness: 0.12,
      transmission: 0.45,
      thickness: 0.6,
      ior: 1.33,
      transparent: true,
      opacity: 0.9,
      clearcoat: 0.8,
      clearcoatRoughness: 0.1,
    })
    const matCore = new THREE.MeshStandardMaterial({
      color: 0xfff0d4,
      emissive: new THREE.Color(preset0.beaconColor),
      emissiveIntensity: 1.35,
      roughness: 0.18,
      metalness: 0.1,
    })

    // Subtle matte studio shadow-catcher disc beneath the floating plinth
    const floorShadowGeo = new THREE.CircleGeometry(6.5, 48)
    const floorShadowMat = new THREE.ShadowMaterial({ opacity: 0.34 })
    const floorShadow = new THREE.Mesh(floorShadowGeo, floorShadowMat)
    floorShadow.rotation.x = -Math.PI / 2
    floorShadow.position.y = -1.25
    floorShadow.receiveShadow = true
    scene.add(floorShadow)

    // Master diorama group
    const root = new THREE.Group()
    scene.add(root)

    // 1. Primary Anodized Octagonal Console Plinth (chamfered ExtrudeGeometry)
    const plinthShape = makeOctagonShape(2.65)
    const plinthGeo = new THREE.ExtrudeGeometry(plinthShape, {
      depth: 0.42,
      bevelEnabled: true,
      bevelThickness: 0.09,
      bevelSize: 0.09,
      bevelSegments: 3,
    })
    plinthGeo.rotateX(Math.PI / 2)
    const plinth = new THREE.Mesh(plinthGeo, matChassis)
    plinth.position.y = 0.05
    plinth.castShadow = true
    plinth.receiveShadow = true
    root.add(plinth)

    // Under-chassis stepped dark aluminum foot
    const footShape = makeOctagonShape(2.1)
    const footGeo = new THREE.ExtrudeGeometry(footShape, {
      depth: 0.18,
      bevelEnabled: true,
      bevelThickness: 0.04,
      bevelSize: 0.04,
      bevelSegments: 2,
    })
    footGeo.rotateX(Math.PI / 2)
    const foot = new THREE.Mesh(footGeo, matDarkTrim)
    foot.position.y = -0.37
    foot.castShadow = true
    root.add(foot)

    // Precision brushed brass inlay trim ring around chassis top
    const brassRingGeo = new THREE.TorusGeometry(2.58, 0.032, 12, 8)
    brassRingGeo.rotateX(Math.PI / 2)
    brassRingGeo.rotateY(Math.PI / 8)
    const brassRing = new THREE.Mesh(brassRingGeo, matBrass)
    brassRing.position.y = 0.13
    root.add(brassRing)

    // Corner machined brass fasteners (8 precision pins)
    const boltGeo = new THREE.CylinderGeometry(0.055, 0.055, 0.05, 12)
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 8
      const bolt = new THREE.Mesh(boltGeo, matBrass)
      bolt.position.set(Math.cos(a) * 2.28, 0.15, Math.sin(a) * 2.28)
      root.add(bolt)
    }

    // 2. Sculpted Miniature Architectural World (Layered Limestone Terraces + Lagoon + Observatory)
    const baseDeckGeo = new THREE.ExtrudeGeometry(makeOctagonShape(2.18), {
      depth: 0.16,
      bevelEnabled: true,
      bevelThickness: 0.03,
      bevelSize: 0.03,
      bevelSegments: 2,
    })
    baseDeckGeo.rotateX(Math.PI / 2)
    const baseDeck = new THREE.Mesh(baseDeckGeo, matStone)
    baseDeck.position.y = 0.28
    baseDeck.castShadow = true
    baseDeck.receiveShadow = true
    root.add(baseDeck)

    // Recessed reflective water lagoon on the front-right quadrant
    const waterGeo = new THREE.PlaneGeometry(1.62, 1.38, 18, 18)
    waterGeo.rotateX(-Math.PI / 2)
    const waterBaseY = new Float32Array(waterGeo.attributes.position.count)
    for (let i = 0; i < waterBaseY.length; i++) {
      waterBaseY[i] = waterGeo.attributes.position.getY(i)
    }
    const waterMesh = new THREE.Mesh(waterGeo, matWater)
    waterMesh.position.set(0.68, 0.315, 0.58)
    waterMesh.receiveShadow = true
    root.add(waterMesh)

    // Water border stone coping
    const copingGeo = new THREE.BoxGeometry(1.62, 0.06, 0.09)
    const copingA = new THREE.Mesh(copingGeo, matStone)
    copingA.position.set(0.68, 0.32, -0.14)
    copingA.castShadow = true
    copingA.receiveShadow = true
    root.add(copingA)

    // Upper Citadel Terrace (left-rear plateau)
    const plateauGeo = new THREE.ExtrudeGeometry(makeRoundedRectShape(2.25, 1.95, 0.24), {
      depth: 0.56,
      bevelEnabled: true,
      bevelThickness: 0.04,
      bevelSize: 0.04,
      bevelSegments: 2,
    })
    plateauGeo.rotateX(Math.PI / 2)
    const plateau = new THREE.Mesh(plateauGeo, matStone)
    plateau.position.set(-0.46, 0.86, -0.38)
    plateau.castShadow = true
    plateau.receiveShadow = true
    root.add(plateau)

    // Stepped Monument-Valley staircase climbing up from deck to upper terrace
    const stepGeo = new THREE.BoxGeometry(0.58, 0.09, 0.18)
    for (let s = 0; s < 6; s++) {
      const step = new THREE.Mesh(stepGeo, s % 2 === 0 ? matStone : matTerracotta)
      step.position.set(-0.45, 0.34 + s * 0.095, 1.18 - s * 0.145)
      step.castShadow = true
      step.receiveShadow = true
      root.add(step)
    }

    // Terracotta architectural archway pavilion
    const pillarGeo = new THREE.BoxGeometry(0.18, 0.92, 0.18)
    const pLeft = new THREE.Mesh(pillarGeo, matTerracotta)
    pLeft.position.set(-1.12, 1.34, 0.12)
    pLeft.castShadow = true
    pLeft.receiveShadow = true
    root.add(pLeft)

    const pRight = new THREE.Mesh(pillarGeo, matTerracotta)
    pRight.position.set(-1.12, 1.34, -0.78)
    pRight.castShadow = true
    pRight.receiveShadow = true
    root.add(pRight)

    const lintelGeo = new THREE.BoxGeometry(0.24, 0.16, 1.16)
    const lintel = new THREE.Mesh(lintelGeo, matStone)
    lintel.position.set(-1.12, 1.84, -0.33)
    lintel.castShadow = true
    lintel.receiveShadow = true
    root.add(lintel)

    // Sculpted Indigo Ceramic Studio Monolith Tower
    const towerBaseGeo = new THREE.CylinderGeometry(0.46, 0.56, 0.42, 8)
    const towerBase = new THREE.Mesh(towerBaseGeo, matIndigoCeramic)
    towerBase.position.set(-0.18, 1.1, -0.52)
    towerBase.castShadow = true
    towerBase.receiveShadow = true
    root.add(towerBase)

    const towerShaftGeo = new THREE.CylinderGeometry(0.32, 0.42, 0.95, 8)
    const towerShaft = new THREE.Mesh(towerShaftGeo, matStone)
    towerShaft.position.set(-0.18, 1.72, -0.52)
    towerShaft.castShadow = true
    towerShaft.receiveShadow = true
    root.add(towerShaft)

    const towerCrownGeo = new THREE.CylinderGeometry(0.42, 0.34, 0.12, 8)
    const towerCrown = new THREE.Mesh(towerCrownGeo, matBrass)
    towerCrown.position.set(-0.18, 2.23, -0.52)
    towerCrown.castShadow = true
    root.add(towerCrown)

    // 3. Kinetic Brass Orrery & Luminous Core suspended above the observatory tower
    const orreryGroup = new THREE.Group()
    orreryGroup.position.set(-0.18, 2.78, -0.52)
    root.add(orreryGroup)

    const outerGimbalGeo = new THREE.TorusGeometry(0.58, 0.022, 14, 64)
    const outerGimbal = new THREE.Mesh(outerGimbalGeo, matBrass)
    outerGimbal.castShadow = true
    orreryGroup.add(outerGimbal)

    const innerGimbalGeo = new THREE.TorusGeometry(0.41, 0.018, 14, 56)
    const innerGimbal = new THREE.Mesh(innerGimbalGeo, matBrass)
    innerGimbal.rotation.x = Math.PI / 2.4
    orreryGroup.add(innerGimbal)

    const coreGeo = new THREE.OctahedronGeometry(0.21, 0)
    const coreMesh = new THREE.Mesh(coreGeo, matCore)
    orreryGroup.add(coreMesh)

    const beaconLight = new THREE.PointLight(preset0.beaconColor, 2.2, 6.5, 1.7)
    beaconLight.position.set(0, 0, 0)
    orreryGroup.add(beaconLight)

    // 4. Architectural Stylized Sage Cypress Trees (grounded on terrace & lower deck)
    const addTree = (x: number, y: number, z: number, scale: number, dark = false) => {
      const g = new THREE.Group()
      g.position.set(x, y, z)
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.035 * scale, 0.05 * scale, 0.24 * scale, 7), matTerracotta)
      trunk.position.y = 0.12 * scale
      trunk.castShadow = true
      g.add(trunk)
      const foliage = new THREE.Mesh(new THREE.ConeGeometry(0.2 * scale, 0.66 * scale, 7), dark ? matDeepSage : matSage)
      foliage.position.y = 0.5 * scale
      foliage.castShadow = true
      foliage.receiveShadow = true
      g.add(foliage)
      root.add(g)
    }
    addTree(-1.32, 0.88, 0.42, 1.05)
    addTree(-1.5, 0.88, -0.05, 0.78, true)
    addTree(0.32, 0.88, -1.06, 0.92, true)
    addTree(0.62, 0.88, -0.82, 0.72)
    addTree(1.42, 0.28, -0.25, 0.86)
    addTree(-1.38, 0.28, 1.08, 0.82, true)

    // 5. Tactile Floating Interactive Game Tokens (orbiting quietly around the perimeter)
    const floaters: Array<{ mesh: THREE.Object3D; basePos: THREE.Vector3; phase: number; speed: number; amp: number }> = []

    // Miniature sculpted brass/indigo D-pad craft token
    const dpadGroup = new THREE.Group()
    const dBar1 = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.1, 0.11), matBrass)
    const dBar2 = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.1, 0.36), matBrass)
    dBar1.castShadow = true
    dBar2.castShadow = true
    dpadGroup.add(dBar1, dBar2)
    dpadGroup.position.set(1.68, 1.45, 1.15)
    dpadGroup.rotation.set(0.35, 0.4, -0.2)
    root.add(dpadGroup)
    floaters.push({ mesh: dpadGroup, basePos: dpadGroup.position.clone(), phase: 0.4, speed: 1.1, amp: 0.11 })

    // Sculpted ceramic polyhedral die
    const polyMesh = new THREE.Mesh(new THREE.IcosahedronGeometry(0.2, 0), matTerracotta)
    polyMesh.position.set(-1.82, 1.85, 1.02)
    polyMesh.castShadow = true
    root.add(polyMesh)
    floaters.push({ mesh: polyMesh, basePos: polyMesh.position.clone(), phase: 2.1, speed: 0.9, amp: 0.13 })

    // Floating travertine stepped bridge tile
    const tileMesh = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.1, 0.34), matStone)
    tileMesh.position.set(1.48, 1.88, -1.22)
    tileMesh.castShadow = true
    root.add(tileMesh)
    floaters.push({ mesh: tileMesh, basePos: tileMesh.position.clone(), phase: 4.0, speed: 1.0, amp: 0.1 })

    // Precision architectural compass arc hovering gracefully over the deck (kept cleanly inside camera margin)
    const arcGeo = new THREE.TorusGeometry(2.44, 0.013, 8, 96, Math.PI * 1.3)
    arcGeo.rotateX(Math.PI / 2.2)
    const arcMesh = new THREE.Mesh(arcGeo, matBrass)
    arcMesh.position.y = 0.72
    root.add(arcMesh)

    // Subtle pointer drag + gentle idle orbital motion
    let targetRotY = -0.35
    let targetRotX = 0.06
    let currentRotY = targetRotY
    let currentRotX = targetRotX
    let isDragging = false
    let prevX = 0
    let prevY = 0
    let spinImpulse = 0

    const onPointerDown = (e: PointerEvent) => {
      isDragging = true
      prevX = e.clientX
      prevY = e.clientY
      renderer.domElement.style.cursor = 'grabbing'
    }
    const onPointerMove = (e: PointerEvent) => {
      if (isDragging) {
        const dx = e.clientX - prevX
        const dy = e.clientY - prevY
        prevX = e.clientX
        prevY = e.clientY
        targetRotY += dx * 0.008
        targetRotX = Math.max(-0.24, Math.min(0.32, targetRotX + dy * 0.005))
      } else {
        const rect = container.getBoundingClientRect()
        const nx = (e.clientX - rect.left) / Math.max(1, rect.width) - 0.5
        const ny = (e.clientY - rect.top) / Math.max(1, rect.height) - 0.5
        targetRotX = 0.06 + ny * 0.16
        spinImpulse = nx * 0.0018
      }
    }
    const onPointerUp = () => {
      isDragging = false
      renderer.domElement.style.cursor = 'grab'
    }

    renderer.domElement.style.cursor = 'grab'
    renderer.domElement.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)

    // Expose live mood switcher without recreating WebGL context
    sceneHooksRef.current.applyMood = (m: LightingMood) => {
      const p = MOOD_PRESETS[m]
      scene.background = new THREE.Color(p.bg)
      scene.fog = new THREE.FogExp2(p.fog, 0.042)
      keyLight.color.setHex(p.keyColor)
      keyLight.intensity = p.keyIntensity
      fillLight.color.setHex(p.fillColor)
      fillLight.intensity = p.fillIntensity
      rimLight.color.setHex(p.rimColor)
      rimLight.intensity = p.rimIntensity
      beaconLight.color.setHex(p.beaconColor)
      matCore.emissive.setHex(p.beaconColor)
      matWater.color.setHex(p.waterColor)
      renderer.toneMappingExposure = p.exposure
    }
    sceneHooksRef.current.nudgeSpin = () => {
      targetRotY += Math.PI / 2
    }

    // ResizeObserver for crisp layout transitions
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = Math.max(240, Math.round(entry.contentRect.width))
        const h = Math.max(280, Math.round(entry.contentRect.height))
        camera.aspect = w / h
        camera.updateProjectionMatrix()
        renderer.setSize(w, h, false)
      }
    })
    ro.observe(container)

    // Visibility-aware animation loop (zero per-frame allocations)
    let visible = true
    const io = new IntersectionObserver(
      (entries) => {
        visible = entries[0]?.isIntersecting ?? true
      },
      { threshold: 0.05 },
    )
    io.observe(container)

    let rafId = 0
    const startMs = performance.now()
    let prevMs = startMs
    const posAttr = waterGeo.attributes.position as THREE.BufferAttribute

    const animate = () => {
      rafId = requestAnimationFrame(animate)
      if (!visible || document.hidden) {
        prevMs = performance.now()
        return
      }
      const nowMs = performance.now()
      const dt = Math.min((nowMs - prevMs) / 1000, 0.05)
      prevMs = nowMs
      const t = (nowMs - startMs) / 1000

      if (!isDragging) {
        targetRotY += dt * 0.14 + spinImpulse
        spinImpulse *= 0.96
      }
      currentRotY += (targetRotY - currentRotY) * 0.08
      currentRotX += (targetRotX - currentRotX) * 0.08

      root.rotation.y = currentRotY
      root.rotation.x = currentRotX
      root.position.y = Math.sin(t * 0.85) * 0.07

      // Orrery rotation
      outerGimbal.rotation.y = t * 0.55
      outerGimbal.rotation.z = Math.sin(t * 0.4) * 0.28
      innerGimbal.rotation.x = Math.PI / 2.4 + t * 0.85
      innerGimbal.rotation.y = -t * 0.65
      coreMesh.rotation.y = t * 0.9
      coreMesh.rotation.x = t * 0.45
      arcMesh.rotation.z = t * 0.08

      // Subtle floating tokens
      for (let i = 0; i < floaters.length; i++) {
        const f = floaters[i]
        f.mesh.position.y = f.basePos.y + Math.sin(t * f.speed + f.phase) * f.amp
        f.mesh.rotation.y += dt * (0.35 + i * 0.1)
      }

      // Gentle lagoon wave ripples
      for (let i = 0; i < posAttr.count; i++) {
        const vx = posAttr.getX(i)
        const vz = posAttr.getZ(i)
        const wave = Math.sin(vx * 4.5 + t * 1.9) * 0.012 + Math.cos(vz * 4.8 + t * 1.5) * 0.012
        posAttr.setY(i, waterBaseY[i] + wave)
      }
      posAttr.needsUpdate = true

      renderer.render(scene, camera)
    }
    animate()

    return () => {
      cancelAnimationFrame(rafId)
      ro.disconnect()
      io.disconnect()
      renderer.domElement.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      scene.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh) {
          const m = obj as THREE.Mesh
          m.geometry?.dispose()
          if (Array.isArray(m.material)) m.material.forEach((mm) => mm.dispose())
          else m.material?.dispose()
        }
      })
      brushedMetalTex.dispose()
      stoneGrainTex.dispose()
      envTex.dispose()
      pmrem.dispose()
      renderer.dispose()
    }
  }, [])

  return (
    <div className="hero-3d-stage" aria-label="Interactive 3D Yulya Studio Diorama">
      {webglFailed ? (
        <div className="hero-3d-fallback">
          <div className="hero-3d-fallback-title">Yulya Studio 3D Engine</div>
          <p>WebGL hardware acceleration is unavailable in this browser session.</p>
        </div>
      ) : (
        <div ref={hostRef} className="hero-3d-mount" />
      )}

      <div className="hero-3d-controls">
        <div className="hero-3d-mood-pills" role="group" aria-label="3D Lighting Mood">
          {(Object.keys(MOOD_PRESETS) as LightingMood[]).map((key) => (
            <button
              key={key}
              type="button"
              className={`hero-3d-mood-btn ${mood === key ? 'active' : ''}`}
              onClick={() => setMood(key)}
            >
              {MOOD_PRESETS[key].label}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="hero-3d-orbit-hint"
          onClick={() => sceneHooksRef.current.nudgeSpin?.()}
          title="Drag anywhere on the 3D scene to orbit, or click to rotate 90°"
        >
          Drag to orbit · 90°
        </button>
      </div>
    </div>
  )
}
