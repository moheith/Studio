import { useState } from 'react'
import { Sparkles, Gamepad2 } from 'lucide-react'

export default function HeroVisual() {
  const [tilt, setTilt] = useState({ x: 0, y: 0 })

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = (e.clientX - rect.left) / rect.width - 0.5
    const y = (e.clientY - rect.top) / rect.height - 0.5
    setTilt({ x: y * -10, y: x * 10 })
  }

  const handleMouseLeave = () => {
    setTilt({ x: 0, y: 0 })
  }

  return (
    <div
      className="hero-art sleek-hero-stage"
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{
        transform: `perspective(1000px) rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)`,
        transition: 'transform 0.18s cubic-bezier(0.16, 1, 0.3, 1)'
      }}
      aria-label="A dreamy illustration of a little game world"
    >
      <div className="hero-grid" />
      <div className="hero-ambient-glow" />

      {/* Floating Pill: Top */}
      <div className="floating-label label-top">
        <Sparkles size={13} />
        <span>made with a little help</span>
      </div>

      {/* Orbital Rings */}
      <div className="hero-orbit orbit-one" />
      <div className="hero-orbit orbit-two" />

      {/* The Central Celestial Game Sphere */}
      <div className="hero-planet">
        <div className="planet-ring" />
        <div className="planet-face">✦</div>
        <div className="planet-spark">✧</div>
      </div>

      <div className="hero-moon">☾</div>

      {/* Pixel Clouds / Stars */}
      <div className="pixel-cloud cloud-one">
        <span>▪ ▪</span>
        <br />
        <span>▪ ▪ ▪</span>
      </div>
      <div className="pixel-cloud cloud-two">
        <span>▪ ▪ ▪</span>
        <br />
        <span>　▪</span>
      </div>

      {/* Floating Pill: Bottom */}
      <div className="floating-label label-bottom">
        <Gamepad2 size={13} />
        <span>playable in one click</span>
      </div>

      <div className="art-caption">
        a universe
        <br />
        of tiny ideas <span>↗</span>
      </div>
    </div>
  )
}
