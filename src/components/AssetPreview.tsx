import { useState } from 'react'
import { Check, Copy, FileAudio, FileImage, FileVideo, ZoomIn, ZoomOut } from 'lucide-react'
import { getFileRawUrl } from '../api'

const IMAGE_EXTS = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg', '.ico']
const AUDIO_EXTS = ['.mp3', '.wav', '.ogg', '.m4a']
const VIDEO_EXTS = ['.mp4', '.webm']

export function isPreviewableBinaryAsset(path: string): boolean {
  const lower = path.toLowerCase()
  return [...IMAGE_EXTS, ...AUDIO_EXTS, ...VIDEO_EXTS].some((e) => lower.endsWith(e))
}

type AssetPreviewProps = {
  projectId: string
  path: string
  onNotify: (msg: string) => void
}

export default function AssetPreview({ projectId, path, onNotify }: AssetPreviewProps) {
  const [zoom, setZoom] = useState(1)
  const [copied, setCopied] = useState(false)
  const lower = path.toLowerCase()
  const rawUrl = getFileRawUrl(projectId, path)
  const isImage = IMAGE_EXTS.some((e) => lower.endsWith(e))
  const isAudio = AUDIO_EXTS.some((e) => lower.endsWith(e))
  const isVideo = VIDEO_EXTS.some((e) => lower.endsWith(e))

  const copyPath = () => {
    navigator.clipboard?.writeText(path)
    setCopied(true)
    onNotify(`Copied relative path "${path}"`)
    window.setTimeout(() => setCopied(false), 1400)
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', background: '#0b0d14', color: '#e2e8f0' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', borderBottom: '1px solid rgba(148,163,184,0.14)', background: '#11131b' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600 }}>
          {isImage ? <FileImage size={15} color="#38bdf8" /> : isAudio ? <FileAudio size={15} color="#a78bfa" /> : <FileVideo size={15} color="#f472b6" />}
          <span>{path}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {isImage && (
            <>
              <button type="button" className="button button-outline button-small" onClick={() => setZoom((z) => Math.max(0.25, +(z - 0.25).toFixed(2)))} title="Zoom Out"><ZoomOut size={13} /></button>
              <span style={{ fontSize: 12, color: '#94a3b8', minWidth: 42, textAlign: 'center' }}>{Math.round(zoom * 100)}%</span>
              <button type="button" className="button button-outline button-small" onClick={() => setZoom((z) => Math.min(4, +(z + 0.25).toFixed(2)))} title="Zoom In"><ZoomIn size={13} /></button>
            </>
          )}
          <button type="button" className="button button-outline button-small" onClick={copyPath}>
            {copied ? <Check size={13} /> : <Copy size={13} />} <span>Copy path</span>
          </button>
        </div>
      </div>

      <div style={{ flex: 1, display: 'grid', placeItems: 'center', overflow: 'auto', padding: 28, backgroundImage: isImage ? 'radial-gradient(rgba(148,163,184,0.15) 1px, transparent 1px)' : undefined, backgroundSize: '18px 18px' }}>
        {isImage && (
          <img
            src={rawUrl}
            alt={path}
            style={{
              maxWidth: '90%',
              maxHeight: '75vh',
              transform: `scale(${zoom})`,
              transformOrigin: 'center',
              transition: 'transform 120ms ease',
              borderRadius: 10,
              boxShadow: '0 16px 48px rgba(0,0,0,0.45)',
              imageRendering: zoom >= 2 ? 'pixelated' : 'auto',
            }}
          />
        )}
        {isAudio && (
          <div style={{ background: '#111522', border: '1px solid rgba(148,163,184,0.2)', borderRadius: 16, padding: 28, textAlign: 'center', width: 'min(420px, 90%)' }}>
            <FileAudio size={40} color="#a78bfa" style={{ marginBottom: 12 }} />
            <p style={{ marginBottom: 16, fontSize: 14, color: '#cbd5e1' }}>{path}</p>
            <audio controls src={rawUrl} style={{ width: '100%' }} />
          </div>
        )}
        {isVideo && (
          <video controls src={rawUrl} style={{ maxWidth: '90%', maxHeight: '75vh', borderRadius: 12, boxShadow: '0 16px 48px rgba(0,0,0,0.5)' }} />
        )}
      </div>
    </div>
  )
}
