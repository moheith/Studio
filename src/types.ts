export type Game = {
  id: string
  title: string
  creator: string
  genre: string
  color: string
  art: string
  plays: string
  description: string
  projectId?: string
  visibility?: 'private' | 'public'
}

export type FileEntry = { name: string; kind: 'file' | 'folder'; language?: string }
export type ChatMessage = {
  id: string
  role: 'user' | 'ai'
  text: string
  thought?: string
  time?: number
  tools?: string[]
  model?: string
}

export type User = { id?: string; username: string; email: string; avatar?: string; has_api_key?: boolean }
export type Page = 'home' | 'studio' | 'login' | 'register' | 'verify-email' | 'profile' | 'not-found'
