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
  thumbnail?: string
  allow_remix?: boolean
  likes_count?: number
  play_url?: string
  share_url?: string
}

export type FileEntry = { name: string; kind: 'file' | 'folder'; language?: string }

export type ModelUsage = {
  name: string
  alias: string
  input_tokens: number
  output_tokens: number
  total_tokens: number
  duration_seconds: number
  status: 'completed' | 'cascaded' | 'failed'
  error?: string
}

export type ChatTelemetry = {
  models: ModelUsage[]
  total_tokens: number
  total_duration: number
}

export type WaterfallTransition = {
  from_model: string
  from_alias: string
  to_model: string
  to_alias: string
  reason: string
}

export type GroundingSource = {
  title?: string
  url: string
}

export type GroundingData = {
  queries: string[]
  sources: GroundingSource[]
}

export type ChatMessage = {
  id: string
  role: 'user' | 'ai'
  text: string
  thought?: string
  time?: number
  tools?: string[]
  model?: string
  mode?: 'build' | 'plan'
  telemetry?: ChatTelemetry
  waterfallTransitions?: WaterfallTransition[]
  grounding?: GroundingData
}

export type UserTokens = {
  total_tokens: number
  input_tokens: number
  output_tokens: number
  max_single_turn_tokens: number
  turns_count: number
}

export type User = {
  id?: string
  username: string
  display_name?: string
  bio?: string
  email: string
  avatar?: string
  auth_provider?: string
  has_api_key?: boolean
  waterfall?: string[]
  tokens?: UserTokens
  created_at?: number
}

export type TemplateItem = {
  id: string
  title: string
  category: string
  genre: string
  badge: string
  description: string
  stack: string[]
  accent: string
}

export type ProjectCheckpoint = {
  id: string
  label: string
  file_count: number
  created_at: number
  files?: Record<string, string>
}

export type GameComment = {
  id: string
  project_id: string
  user_id: string
  username: string
  display_name: string
  avatar?: string | null
  body: string
  created_at: number
}

export type GameScore = {
  id: string
  player: string
  score: number
  created_at: number
}

export type ActiveSession = {
  id: string
  created_at: number
  user_agent: string
  ip_hint: string
  current: boolean
}

export type PublicGameMeta = {
  id: string
  username: string
  slug: string
  title: string
  description: string
  genre: string
  plays: number
  likes_count: number
  user_liked: boolean
  comments_count: number
  allow_remix: boolean
  thumbnail?: string | null
  play_url?: string | null
  play_origin?: string
  share_url?: string | null
  created_at?: number
  updated_at?: number
  creator_profile?: {
    username: string
    display_name: string
    bio: string
    avatar?: string | null
  }
}

export type Page =
  | 'home'
  | 'arcade'
  | 'templates'
  | 'play'
  | 'settings'
  | 'docs'
  | 'terms'
  | 'privacy'
  | 'studio'
  | 'login'
  | 'register'
  | 'verify-email'
  | 'setup-profile'
  | 'profile'
  | 'not-found'
