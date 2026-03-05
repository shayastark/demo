export const PROJECT_VISIBILITY_VALUES = ['public', 'unlisted', 'private'] as const
export type ProjectVisibility = (typeof PROJECT_VISIBILITY_VALUES)[number]

export function isProjectVisibility(value: unknown): value is ProjectVisibility {
  return typeof value === 'string' && PROJECT_VISIBILITY_VALUES.includes(value as ProjectVisibility)
}

export function parseProjectVisibility(value: unknown): ProjectVisibility | null {
  if (!isProjectVisibility(value)) return null
  return value
}

export function resolveProjectVisibility(value: unknown, sharingEnabled?: boolean | null): ProjectVisibility {
  if (isProjectVisibility(value)) return value
  return sharingEnabled === false ? 'private' : 'unlisted'
}

export function canViewerAccessProject(args: {
  visibility: ProjectVisibility
  isCreator: boolean
  isDirectAccess: boolean
  isGrantedUser?: boolean
}): boolean {
  if (args.isCreator) return true
  if (args.visibility === 'private') return !!args.isGrantedUser
  if (args.visibility === 'public') return true
  return args.isDirectAccess
}

export function shouldShowProjectOnCreatorProfile(args: {
  visibility: ProjectVisibility
  isCreator: boolean
}): boolean {
  if (args.isCreator) return true
  return args.visibility === 'public'
}

