export function buildCollaboratorProjectPath(projectId: string): string {
  return `/projects/${encodeURIComponent(projectId)}`
}
