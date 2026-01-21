// Utility for storing a pending project to save after login/onboarding

export interface PendingProject {
  projectId: string
  title: string
  token: string
  savedAt: number // timestamp for cleanup of stale entries
}

const STORAGE_KEY = 'hubba_pending_project'
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

export function setPendingProject(project: Omit<PendingProject, 'savedAt'>): void {
  if (typeof window === 'undefined') return
  
  const pendingProject: PendingProject = {
    ...project,
    savedAt: Date.now(),
  }
  
  localStorage.setItem(STORAGE_KEY, JSON.stringify(pendingProject))
}

export function getPendingProject(): PendingProject | null {
  if (typeof window === 'undefined') return null
  
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) return null
    
    const project: PendingProject = JSON.parse(stored)
    
    // Check if it's too old
    if (Date.now() - project.savedAt > MAX_AGE_MS) {
      clearPendingProject()
      return null
    }
    
    return project
  } catch {
    return null
  }
}

export function clearPendingProject(): void {
  if (typeof window === 'undefined') return
  localStorage.removeItem(STORAGE_KEY)
}
