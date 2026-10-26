import { useEffect, useState } from 'react'
import { ArrowLeft, Sparkles } from 'lucide-react'
import type { Game } from '../types'

interface StudioBootLoaderProps {
  game: Game | null
  onCancel: () => void
}

const BOOT_STAGES = [
  'Mounting virtual workspace & project files…',
  'Initializing HTML5 Canvas & WebGL sandbox…',
  'Connecting Gemini AI Copilot agent…',
  'Finalizing VS Code studio environment…'
]

export default function StudioBootLoader({ game, onCancel }: StudioBootLoaderProps) {
  const [stageIndex, setStageIndex] = useState(0)

  useEffect(() => {
    const interval = window.setInterval(() => {
      setStageIndex(prev => (prev < BOOT_STAGES.length - 1 ? prev + 1 : prev))
    }, 450)
    return () => window.clearInterval(interval)
  }, [])

  const title = game?.title || 'Game Project'
  const creator = game?.creator || 'Creator'
  const art = game?.art || '✦'

  return (
    <main className="studio-boot-shell" role="status" aria-live="polite">
      <div className="studio-boot-card">
        {/* Glowing Art / Game Emblem */}
        <div className="studio-boot-emblem" style={{ '--emblem-color': game?.color || '#a855f7' } as React.CSSProperties}>
          <div className="studio-boot-emblem-glow" />
          <span className="studio-boot-art">{art}</span>
          <div className="studio-boot-emblem-sub">
            <Sparkles size={13} />
          </div>
        </div>

        {/* Project Meta */}
        <div className="studio-boot-meta">
          <div className="studio-boot-badge">
            <span className="studio-boot-dot" />
            INITIALIZING WORKSPACE
          </div>
          <h1 className="studio-boot-title">{title}</h1>
          <p className="studio-boot-author">by @{creator} • Web Engine</p>
        </div>

        {/* Cyber Progress Indicator */}
        <div className="studio-boot-progress-wrap">
          <div className="studio-boot-track">
            <div className="studio-boot-bar" />
          </div>
          <div className="studio-boot-status">
            <span className="studio-boot-pulse-dot" />
            <span>{BOOT_STAGES[stageIndex]}</span>
          </div>
        </div>

        {/* Cancel / Return */}
        <button
          type="button"
          className="studio-boot-cancel"
          onClick={onCancel}
          title="Return to your profile"
        >
          <ArrowLeft size={13} />
          <span>Cancel & Back to Profile</span>
        </button>
      </div>
    </main>
  )
}
