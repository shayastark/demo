export interface Project {
  id: string
  creator_id: string
  title: string
  description?: string
  cover_image_url?: string
  allow_downloads: boolean
  sharing_enabled: boolean
  share_token: string
  pinned?: boolean
  created_at: string
  updated_at: string
}

export interface Track {
  id: string
  project_id: string
  title: string
  audio_url: string
  image_url?: string
  order: number
  created_at: string
}

export interface ProjectNote {
  id: string
  project_id: string
  content: string
  created_at: string
  updated_at: string
}

export interface TrackNote {
  id: string
  track_id: string
  content: string
  created_at: string
  updated_at: string
}

export interface ProjectMetrics {
  id: string
  project_id: string
  plays: number
  shares: number
  adds: number
  updated_at: string
}

export interface UserProject {
  id: string
  user_id: string
  project_id: string
  created_at: string
}

export interface User {
  id: string
  privy_id: string
  email?: string
  username?: string
  avatar_url?: string
  created_at: string
}

