import { resolveProjectVisibility } from '@/lib/projectVisibility'

const USERNAME_IDENTIFIER_REGEX = /^[a-zA-Z0-9_-]{3,50}$/

export interface PublicCreatorUserRow {
  id: string
  display_name?: string | null
  username: string | null
  email: string | null
  avatar_url: string | null
  bio: string | null
  contact_email: string | null
  website: string | null
  instagram: string | null
  twitter: string | null
  farcaster: string | null
}

export interface PublicCreatorProjectRow {
  id: string
  title: string | null
  share_token: string | null
  cover_image_url: string | null
  visibility: string | null
  sharing_enabled: boolean | null
  created_at: string
}

export interface PublicCreatorProjectItem {
  id: string
  title: string
  cover_image_url: string | null
  created_at: string
  target_path: string
}

export function parseCreatorIdentifier(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  if (!trimmed) return null
  if (isUuidLike(trimmed)) return trimmed
  if (USERNAME_IDENTIFIER_REGEX.test(trimmed)) return trimmed
  return null
}

export function buildCreatorDisplayName(user: {
  display_name?: string | null
  username?: string | null
  email?: string | null
}): string {
  const displayName = user.display_name?.trim()
  if (displayName) return displayName
  const username = user.username?.trim()
  if (username) return username
  const email = user.email?.trim()
  if (email) return email
  return 'Creator'
}

export function getCreatorPublicPath(args: { id: string; username?: string | null }): string {
  const slug = args.username?.trim()
  if (slug && USERNAME_IDENTIFIER_REGEX.test(slug)) {
    return `/creator/${encodeURIComponent(slug)}`
  }
  return `/creator/${encodeURIComponent(args.id)}`
}

export function selectPublicCreatorProjects(rows: PublicCreatorProjectRow[]): PublicCreatorProjectItem[] {
  return [...rows]
    .filter((row) => {
      const visibility = resolveProjectVisibility(row.visibility, row.sharing_enabled)
      return visibility === 'public'
    })
    .sort((a, b) => {
      const timeDiff = new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      if (timeDiff !== 0) return timeDiff
      return b.id.localeCompare(a.id)
    })
    .map((row) => ({
      id: row.id,
      title: row.title?.trim() || 'Untitled project',
      cover_image_url: row.cover_image_url || null,
      created_at: row.created_at,
      target_path: row.share_token ? `/share/${row.share_token}` : '/dashboard',
    }))
}

export function resolveViewerIsFollowing(args: {
  viewerUserId: string | null
  creatorId: string
  hasFollowRow: boolean
}): boolean {
  if (!args.viewerUserId) return false
  if (args.viewerUserId === args.creatorId) return false
  return args.hasFollowRow
}

function isUuidLike(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
}
