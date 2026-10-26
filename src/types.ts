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
  has_api_key?: boolean
  waterfall?: string[]
  tokens?: UserTokens
  created_at?: number
}
export type Page = 'home' | 'arcade' | 'studio' | 'login' | 'register' | 'verify-email' | 'setup-profile' | 'profile' | 'not-found'
