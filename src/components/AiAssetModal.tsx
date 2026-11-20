import { useState } from 'react'
import { Image as ImageIcon, Mic, Sparkles, X } from 'lucide-react'
import { generateAiAudio, generateAiImage } from '../api'

type AiAssetModalProps = {
  open: boolean
  projectId: string
  hasKey: boolean
  onClose: () => void
  onAssetCreated: (path: string, thumbnailUrl?: string | null) => Promise<void> | void
  notify: (msg: string) => void
}

const TTS_VOICES = ['Kore', 'Puck', 'Charon', 'Fenrir', 'Aoede', 'Zephyr']

export default function AiAssetModal({ open, projectId, hasKey, onClose, onAssetCreated, notify }: AiAssetModalProps) {
  const [tab, setTab] = useState<'image' | 'audio'>('image')
  const [imgPrompt, setImgPrompt] = useState('')
  const [imgFile, setImgFile] = useState('assets/sprite.png')
  const [setThumb, setSetThumb] = useState(false)
  const [audioText, setAudioText] = useState('')
  const [audioVoice, setAudioVoice] = useState('Kore')
  const [audioStyle, setAudioStyle] = useState('energetic arcade announcer')
  const [audioFile, setAudioFile] = useState('assets/audio/voice.wav')
  const [busy, setBusy] = useState(false)

  if (!open) return null

  const runImage = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!imgPrompt.trim()) return
    setBusy(true)
    try {
      const res = await generateAiImage(projectId, {
        prompt: imgPrompt.trim(),
        filename: imgFile.trim() || 'assets/sprite.png',
        set_as_thumbnail: setThumb,
      })
      notify(`Generated ${res.path} via Nano Banana 2.1!`)
      await onAssetCreated(res.path, res.thumbnail_url)
      onClose()
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Image generation failed')
    } finally {
      setBusy(false)
    }
  }

  const runAudio = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!audioText.trim()) return
    setBusy(true)
    try {
      const res = await generateAiAudio(projectId, {
        text: audioText.trim(),
        voice: audioVoice,
        style: audioStyle.trim() || 'clear and expressive',
        filename: audioFile.trim() || 'assets/audio/voice.wav',
      })
      notify(`Generated ${res.path} via Gemini 3.8 TTS!`)
      await onAssetCreated(res.path)
      onClose()
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Voice generation failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-backdrop" style={{ zIndex: 9998 }} onClick={onClose} role="dialog" aria-modal="true" aria-label="AI Asset Studio">
      <div
        className="modal-card"
        style={{ width: 'min(540px, 94vw)', background: '#10121a', border: '1px solid rgba(148,163,184,0.22)', borderRadius: 16, padding: 22 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Sparkles size={18} color="#a78bfa" />
            <h3 style={{ margin: 0, fontSize: 16 }}>AI Asset Studio (BYOK Gemini)</h3>
          </div>
          <button type="button" onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer' }}><X size={18} /></button>
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <button type="button" className={`button button-small ${tab === 'image' ? 'button-primary' : 'button-outline'}`} onClick={() => setTab('image')}>
            <ImageIcon size={14} /> <span>Sprite / Cover (Nano Banana 2.1)</span>
          </button>
          <button type="button" className={`button button-small ${tab === 'audio' ? 'button-primary' : 'button-outline'}`} onClick={() => setTab('audio')}>
            <Mic size={14} /> <span>Voice Line (Gemini 3.8 TTS)</span>
          </button>
        </div>

        {!hasKey && (
          <div style={{ padding: 12, borderRadius: 10, background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.3)', color: '#fde68a', fontSize: 13, marginBottom: 14 }}>
            Connect your Google AI Studio Gemini API key first to generate images or voice lines.
          </div>
        )}

        {tab === 'image' ? (
          <form onSubmit={runImage} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <label style={{ fontSize: 12.5, color: '#cbd5e1', display: 'flex', flexDirection: 'column', gap: 6 }}>
              Visual Prompt
              <textarea
                rows={3}
                value={imgPrompt}
                onChange={(e) => setImgPrompt(e.target.value)}
                placeholder="e.g. Top-down neon cyberpunk starfighter sprite, glowing cyan thrusters, dark space background, crisp arcade game art"
                style={{ background: '#090b12', border: '1px solid rgba(148,163,184,0.22)', borderRadius: 10, padding: 10, color: '#f8fafc', resize: 'vertical' }}
                required
              />
            </label>
            <label style={{ fontSize: 12.5, color: '#cbd5e1', display: 'flex', flexDirection: 'column', gap: 6 }}>
              Save Path inside Project
              <input
                value={imgFile}
                onChange={(e) => setImgFile(e.target.value)}
                style={{ background: '#090b12', border: '1px solid rgba(148,163,184,0.22)', borderRadius: 10, padding: '8px 12px', color: '#f8fafc' }}
                required
              />
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#cbd5e1', cursor: 'pointer' }}>
              <input type="checkbox" checked={setThumb} onChange={(e) => setSetThumb(e.target.checked)} />
              Also set as Arcade cover thumbnail (if under 350 KB)
            </label>
            <button type="submit" className="button button-primary" disabled={busy || !hasKey}>
              {busy ? 'Generating with Nano Banana 2.1…' : 'Generate & Save Image'}
            </button>
          </form>
        ) : (
          <form onSubmit={runAudio} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <label style={{ fontSize: 12.5, color: '#cbd5e1', display: 'flex', flexDirection: 'column', gap: 6 }}>
              Spoken Line / Narration
              <textarea
                rows={3}
                value={audioText}
                onChange={(e) => setAudioText(e.target.value)}
                placeholder="e.g. Ready... Three, two, one, GO! Watch out for incoming meteors!"
                style={{ background: '#090b12', border: '1px solid rgba(148,163,184,0.22)', borderRadius: 10, padding: 10, color: '#f8fafc', resize: 'vertical' }}
                required
              />
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <label style={{ fontSize: 12.5, color: '#cbd5e1', display: 'flex', flexDirection: 'column', gap: 6 }}>
                Voice
                <select
                  value={audioVoice}
                  onChange={(e) => setAudioVoice(e.target.value)}
                  style={{ background: '#090b12', border: '1px solid rgba(148,163,184,0.22)', borderRadius: 10, padding: '8px 10px', color: '#f8fafc' }}
                >
                  {TTS_VOICES.map((v) => <option key={v} value={v}>{v}</option>)}
                </select>
              </label>
              <label style={{ fontSize: 12.5, color: '#cbd5e1', display: 'flex', flexDirection: 'column', gap: 6 }}>
                Delivery Style
                <input
                  value={audioStyle}
                  onChange={(e) => setAudioStyle(e.target.value)}
                  style={{ background: '#090b12', border: '1px solid rgba(148,163,184,0.22)', borderRadius: 10, padding: '8px 10px', color: '#f8fafc' }}
                />
              </label>
            </div>
            <label style={{ fontSize: 12.5, color: '#cbd5e1', display: 'flex', flexDirection: 'column', gap: 6 }}>
              Save Path (.wav)
              <input
                value={audioFile}
                onChange={(e) => setAudioFile(e.target.value)}
                style={{ background: '#090b12', border: '1px solid rgba(148,163,184,0.22)', borderRadius: 10, padding: '8px 12px', color: '#f8fafc' }}
                required
              />
            </label>
            <button type="submit" className="button button-primary" disabled={busy || !hasKey}>
              {busy ? 'Synthesizing with Gemini 3.8 TTS…' : 'Generate & Save WAV'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
