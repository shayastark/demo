import 'server-only'

import { notifyFollowersProjectUpdate } from './notifications'
import { autoPublishScheduledProjectUpdates } from './projectUpdateAutopublish'
import type { ProjectUpdateRow } from './projectUpdates'
import { supabaseAdmin } from './supabaseAdmin'

type ProjectUpdateAutoPublishProject = {
  id: string
  title: string | null
}

async function autoPublishScheduledUpdatesForProject(project: ProjectUpdateAutoPublishProject): Promise<void> {
  await autoPublishScheduledProjectUpdates({
    projectId: project.id,
    projectTitle: project.title || 'Untitled project',
    debug: process.env.PROJECT_UPDATE_SCHEDULE_DEBUG === 'true',
    fetchDueDrafts: async (projectId, nowIso) => {
      const { data, error } = await supabaseAdmin
        .from('project_updates')
        .select('id, project_id, user_id, content, version_label, is_important, status, scheduled_publish_at')
        .eq('project_id', projectId)
        .eq('status', 'draft')
        .lte('scheduled_publish_at', nowIso)

      if (error) {
        console.error('Error fetching scheduled updates for autopublish:', error)
        return []
      }

      return (data || []) as ProjectUpdateRow[]
    },
    transitionDueDrafts: async (projectId, dueIds, nowIso) => {
      if (dueIds.length === 0) return []

      const { data, error } = await supabaseAdmin
        .from('project_updates')
        .update({
          status: 'published',
          published_at: nowIso,
          scheduled_publish_at: null,
        })
        .eq('project_id', projectId)
        .eq('status', 'draft')
        .in('id', dueIds)
        .lte('scheduled_publish_at', nowIso)
        .select('id, project_id, user_id, content, version_label, is_important')

      if (error) {
        console.error('Error auto-publishing scheduled updates:', error)
        return []
      }

      return data || []
    },
    notifyFollowers: async (row, projectTitle) => {
      await notifyFollowersProjectUpdate({
        creatorId: row.user_id,
        projectId: row.project_id,
        updateId: row.id,
        projectTitle,
        content: row.content,
        versionLabel: row.version_label,
        isImportant: row.is_important,
      })
    },
  })
}

export async function autoPublishScheduledUpdatesForProjects(
  projects: ProjectUpdateAutoPublishProject[]
): Promise<void> {
  const seen = new Set<string>()
  const uniqueProjects = projects.filter((project) => {
    if (!project.id || seen.has(project.id)) return false
    seen.add(project.id)
    return true
  })

  for (const project of uniqueProjects) {
    await autoPublishScheduledUpdatesForProject(project)
  }
}
