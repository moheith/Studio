import type { ActiveSession, GameComment, GameScore, PublicGameMeta, TemplateItem } from './types'

const API_ORIGIN = (import.meta.env.VITE_API_ORIGIN as string | undefined)?.replace(/\/$/, '') ?? ''
let csrfToken = ''

export function setCsrfToken(value: string) {
  csrfToken = value
}

export async function api<T = any>(path: string, options: RequestInit = {}): Promise<T> {
  const method = (options.method ?? 'GET').toUpperCase()
  const headers = new Headers(options.headers)
  if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method) && csrfToken) headers.set('X-CSRF-Token', csrfToken)
  const response = await fetch(`${API_ORIGIN}${path}`, { ...options, method, headers, credentials: 'include' })
  const type = response.headers.get('content-type') ?? ''
  const payload = type.includes('application/json') ? await response.json().catch(() => null) : await response.text().catch(() => '')
  if (!response.ok) {
    let errMessage = ''
    if (payload && typeof payload === 'object') {
      errMessage = payload?.detail || payload?.error?.message || payload?.message || JSON.stringify(payload)
    } else if (typeof payload === 'string' && payload.trim()) {
      errMessage = payload
    }
    throw new Error(errMessage || `Request failed (${response.status}: ${response.statusText})`)
  }
  return payload as T
}

const fileEtags = new Map<string, string>()

export async function getFile(projectId: string, path: string) {
  const response = await fetch(`${API_ORIGIN}/api/projects/${encodeURIComponent(projectId)}/files/${path.split('/').map(encodeURIComponent).join('/')}`, { credentials: 'include', cache: 'no-store' })
  if (!response.ok) {
    const payload = await response.json().catch(() => null)
    const errMessage = payload?.detail || payload?.error?.message || payload?.message || `Could not load project file (${response.status}: ${response.statusText})`
    throw new Error(errMessage)
  }
  const etag = response.headers.get('etag') ?? ''
  fileEtags.set(`${projectId}:${path}`, etag)
  return { content: await response.text(), etag }
}

export function getFileRawUrl(projectId: string, path: string): string {
  return `${API_ORIGIN}/api/projects/${encodeURIComponent(projectId)}/files/${path.split('/').map(encodeURIComponent).join('/')}`
}

export async function saveFile(projectId: string, path: string, content: string) {
  return api<{ etag: string }>(`/api/projects/${encodeURIComponent(projectId)}/files/${path.split('/').map(encodeURIComponent).join('/')}`, {
    method: 'PUT',
    headers: { 'If-Match': fileEtags.get(`${projectId}:${path}`) ?? '' },
    body: JSON.stringify({ content }),
  }).then((result) => {
    fileEtags.set(`${projectId}:${path}`, result.etag)
    return result
  })
}

export async function deleteFile(projectId: string, path: string) {
  const result = await api<{ deleted: string }>(`/api/projects/${encodeURIComponent(projectId)}/files/${path.split('/').map(encodeURIComponent).join('/')}`, { method: 'DELETE' })
  fileEtags.delete(`${projectId}:${path}`)
  return result
}

export async function uploadAsset(projectId: string, file: File) {
  const headers = new Headers({ 'Content-Type': file.type || 'application/octet-stream' })
  if (csrfToken) headers.set('X-CSRF-Token', csrfToken)
  const path = file.name.split('/').map(encodeURIComponent).join('/')
  const response = await fetch(`${API_ORIGIN}/api/projects/${encodeURIComponent(projectId)}/assets/${path}`, { method: 'PUT', credentials: 'include', headers, body: file })
  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    const errMessage = payload?.detail || payload?.error?.message || payload?.message || `Could not upload asset (${response.status}: ${response.statusText})`
    throw new Error(errMessage)
  }
  return payload as { path: string; etag: string; size: number }
}

export async function* streamSse(path: string, body: unknown, signal?: AbortSignal) {
  const response = await fetch(`${API_ORIGIN}${path}`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken, Accept: 'text/event-stream' },
    body: JSON.stringify(body),
    signal,
  })
  if (!response.ok || !response.body) {
    const payload = await response.json().catch(() => null)
    let errMessage = ''
    if (payload && typeof payload === 'object') {
      errMessage = payload?.detail || payload?.error?.message || payload?.message || JSON.stringify(payload)
    }
    throw new Error(errMessage || `AI request failed (${response.status}: ${response.statusText})`)
  }
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  while (true) {
    const { done, value } = await reader.read()
    buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done })
    const events = buffer.split('\n\n')
    buffer = events.pop() ?? ''
    for (const event of events) {
      const lines = event.split('\n').filter((l) => l.trim() && !l.startsWith(':'))
      if (lines.length === 0) continue
      const type = lines.find((x) => x.startsWith('event:'))?.slice(6).trim() ?? 'message'
      const dataLine = lines.find((x) => x.startsWith('data:'))
      if (!dataLine) continue
      const data = dataLine.slice(5).trim()
      try {
        yield { type, data: JSON.parse(data) }
      } catch {
        yield { type, data: { text: data, message: data } }
      }
    }
    if (done) break
  }
}

export async function downloadProjectZip(projectId: string, fallbackSlug = 'game') {
  const response = await fetch(`${API_ORIGIN}/api/projects/${encodeURIComponent(projectId)}/export`, { credentials: 'include' })
  if (!response.ok) {
    const payload = await response.json().catch(() => null)
    throw new Error(payload?.detail || payload?.error?.message || 'Could not download project ZIP archive')
  }
  const blob = await response.blob()
  const url = window.URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  const cleanName = (fallbackSlug || 'game').replace(/[^a-zA-Z0-9_-]/g, '-')
  a.download = `${cleanName}.zip`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  window.URL.revokeObjectURL(url)
}

export async function trackGamePlay(username: string, slug: string): Promise<number> {
  try {
    const res = await api<{ plays: number }>(`/api/games/${encodeURIComponent(username)}/${encodeURIComponent(slug)}/play`, {
      method: 'POST',
      body: '{}',
    })
    return res.plays
  } catch {
    return 0
  }
}

export async function updateProjectDetails(projectId: string, details: { title: string; description: string; genre: string; allow_remix?: boolean }) {
  return api<{ project: Record<string, unknown> }>(`/api/projects/${encodeURIComponent(projectId)}/details`, {
    method: 'PATCH',
    body: JSON.stringify(details),
  })
}

export async function saveProjectThumbnail(projectId: string, thumbnail: string) {
  return api<{ success: boolean; thumbnail: string }>(`/api/projects/${encodeURIComponent(projectId)}/thumbnail`, {
    method: 'POST',
    body: JSON.stringify({ thumbnail }),
  })
}

export async function deleteProjectThumbnail(projectId: string) {
  return api<{ success: boolean }>(`/api/projects/${encodeURIComponent(projectId)}/thumbnail`, { method: 'DELETE' })
}

// Templates
export async function fetchTemplates() {
  return api<{ templates: TemplateItem[] }>('/api/templates')
}

// Multimodal Vision & Preview Eval Callback
export async function submitAiToolResult(
  projectId: string,
  callId: string,
  payload: {
    dataUrl?: string
    width?: number
    height?: number
    consoleErrors?: Array<{ level: string; message: string }>
    domElements?: Array<Record<string, unknown>>
    ok?: boolean
    output?: string
  },
) {
  return api<{ accepted: boolean }>(`/api/projects/${encodeURIComponent(projectId)}/ai/tool-result/${encodeURIComponent(callId)}`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

// Public Game Wrapper Page & Community Arcade
export async function fetchPublicGameMeta(username: string, slug: string) {
  return api<PublicGameMeta>(`/api/public/${encodeURIComponent(username)}/${encodeURIComponent(slug)}/meta`)
}

export async function toggleGameLike(username: string, slug: string) {
  return api<{ liked: boolean; likes_count: number }>(`/api/games/${encodeURIComponent(username)}/${encodeURIComponent(slug)}/like`, { method: 'POST', body: '{}' })
}

export async function fetchGameComments(username: string, slug: string) {
  return api<{ comments: GameComment[] }>(`/api/games/${encodeURIComponent(username)}/${encodeURIComponent(slug)}/comments`)
}

export async function postGameComment(username: string, slug: string, body: string) {
  return api<{ comment: GameComment }>(`/api/games/${encodeURIComponent(username)}/${encodeURIComponent(slug)}/comments`, {
    method: 'POST',
    body: JSON.stringify({ body }),
  })
}

export async function deleteGameComment(username: string, slug: string, commentId: string) {
  return api<{ deleted: boolean }>(`/api/games/${encodeURIComponent(username)}/${encodeURIComponent(slug)}/comments/${encodeURIComponent(commentId)}`, { method: 'DELETE' })
}

export async function remixPublicGame(username: string, slug: string) {
  return api<{ project: Record<string, unknown> }>(`/api/games/${encodeURIComponent(username)}/${encodeURIComponent(slug)}/remix`, { method: 'POST', body: '{}' })
}

export async function reportPublicGame(username: string, slug: string, reason: string, details: string) {
  return api<{ reported: boolean; report_id: string }>(`/api/games/${encodeURIComponent(username)}/${encodeURIComponent(slug)}/report`, {
    method: 'POST',
    body: JSON.stringify({ reason, details }),
  })
}

export async function fetchGameScores(username: string, slug: string) {
  return api<{ scores: GameScore[] }>(`/api/games/${encodeURIComponent(username)}/${encodeURIComponent(slug)}/scores`)
}

export async function submitGameScore(username: string, slug: string, score: number, playerName?: string) {
  return api<{ saved: boolean; entry: GameScore }>(`/api/games/${encodeURIComponent(username)}/${encodeURIComponent(slug)}/scores`, {
    method: 'POST',
    body: JSON.stringify({ score, player_name: playerName }),
  })
}

// Account Security & GDPR Self-Service
export async function forgotPassword(email: string) {
  return api<{ ok: boolean; message: string; development_code?: string }>('/api/auth/forgot-password', {
    method: 'POST',
    body: JSON.stringify({ email }),
  })
}

export async function resetPassword(email: string, code: string, new_password: string) {
  return api<{ ok: boolean; message: string }>('/api/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify({ email, code, new_password }),
  })
}

export async function changePassword(current_password: string, new_password: string, revoke_other_sessions = true) {
  return api<{ ok: boolean; message: string }>('/api/auth/change-password', {
    method: 'POST',
    body: JSON.stringify({ current_password, new_password, revoke_other_sessions }),
  })
}

export async function fetchActiveSessions() {
  return api<{ sessions: ActiveSession[] }>('/api/auth/sessions')
}

export async function logoutAllOtherSessions() {
  return api<{ ok: boolean; revoked: number }>('/api/auth/logout-all', { method: 'POST', body: '{}' })
}

export async function deleteAccount(payload: { password?: string; confirm_username?: string }) {
  return api<{ deleted: boolean }>('/api/account', { method: 'DELETE', body: JSON.stringify(payload) })
}
