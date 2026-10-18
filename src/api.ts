const API_ORIGIN = (import.meta.env.VITE_API_ORIGIN as string | undefined)?.replace(/\/$/, '') ?? ''
let csrfToken = ''

export function setCsrfToken(value: string) { csrfToken = value }

export async function api<T = any>(path: string, options: RequestInit = {}): Promise<T> {
  const method = (options.method ?? 'GET').toUpperCase()
  const headers = new Headers(options.headers)
  if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method) && csrfToken) headers.set('X-CSRF-Token', csrfToken)
  const response = await fetch(`${API_ORIGIN}${path}`, { ...options, method, headers, credentials: 'include' })
  const type = response.headers.get('content-type') ?? ''
  const payload = type.includes('application/json') ? await response.json() : await response.text()
  if (!response.ok) throw new Error(typeof payload === 'object' ? payload?.error?.message ?? 'Request failed' : payload || 'Request failed')
  return payload as T
}

export async function getFile(projectId: string, path: string) {
  const response = await fetch(`${API_ORIGIN}/api/projects/${encodeURIComponent(projectId)}/files/${path.split('/').map(encodeURIComponent).join('/')}`, { credentials: 'include' })
  if (!response.ok) throw new Error('Could not load project file')
  const etag = response.headers.get('etag') ?? ''
  fileEtags.set(`${projectId}:${path}`, etag)
  return { content: await response.text(), etag }
}

export async function saveFile(projectId: string, path: string, content: string) {
  return api<{ etag: string }>(`/api/projects/${encodeURIComponent(projectId)}/files/${path.split('/').map(encodeURIComponent).join('/')}`, { method: 'PUT', headers: { 'If-Match': fileEtags.get(`${projectId}:${path}`) ?? '' }, body: JSON.stringify({ content }) }).then((result) => { fileEtags.set(`${projectId}:${path}`, result.etag); return result })
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
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload?.error?.message ?? 'Could not upload asset')
  return payload as { path: string; etag: string; size: number }
}

const fileEtags = new Map<string, string>()

export async function* streamSse(path: string, body: unknown) {
  const response = await fetch(`${API_ORIGIN}${path}`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken, Accept: 'text/event-stream' }, body: JSON.stringify(body) })
  if (!response.ok || !response.body) {
    const payload = await response.json().catch(() => ({}))
    throw new Error(payload?.error?.message ?? 'AI request failed')
  }
  const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = ''
  while (true) {
    const { done, value } = await reader.read(); buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done })
    const events = buffer.split('\n\n'); buffer = events.pop() ?? ''
    for (const event of events) {
      const lines = event.split('\n'); const type = lines.find(x => x.startsWith('event:'))?.slice(6).trim() ?? 'message'; const data = lines.find(x => x.startsWith('data:'))?.slice(5).trim() ?? '{}'
      try { yield { type, data: JSON.parse(data) } } catch { yield { type, data: { text: data } } }
    }
    if (done) break
  }
}
