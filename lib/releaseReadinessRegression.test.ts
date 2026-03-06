import test from 'node:test'
import assert from 'node:assert/strict'
import { buildProjectPolicySnapshot } from './projectAccessPolicy'
import { canViewerSeeProjectUpdate } from './projectUpdates'
import {
  parseProjectAccessRequestCreateInput,
  parseProjectAccessRequestReviewInput,
  shouldUpsertAccessGrantOnReview,
} from './projectAccessRequests'
import { isProjectAccessGrantActive } from './projectAccess'
import { autoPublishScheduledProjectUpdates } from './projectUpdateAutopublish'
import { filterProjectUpdateSubscriberIdsByMode } from './projectSubscriptions'
import { selectPublicCreatorProjects } from './publicCreatorProfile'
import { selectPublicExploreRows } from './explore'
import { splitNotificationsBySnooze } from './notificationSnooze'
import { buildNotificationDigestGroups } from './notificationDigest'
import { getPreferenceFieldForNotificationType } from './notificationPreferences'
import { buildProjectAccessInviteTargetPath } from './projectAccessNotifications'
import type { InboxNotification } from './notificationInbox'

const privateProject = {
  id: 'p-private',
  creator_id: 'creator-1',
  visibility: 'private',
  sharing_enabled: false,
} as const

test('critical path: private request -> approve -> access granted', () => {
  const create = parseProjectAccessRequestCreateInput({
    project_id: '11111111-1111-1111-1111-111111111111',
    note: '  please approve  ',
  })
  assert.notEqual(create, null)

  const review = parseProjectAccessRequestReviewInput({
    id: '22222222-2222-2222-2222-222222222222',
    action: 'approve',
  })
  assert.notEqual(review, null)
  assert.equal(shouldUpsertAccessGrantOnReview('approve'), true)

  const blockedBefore = buildProjectPolicySnapshot({
    userId: 'requester-1',
    project: privateProject,
    isDirectAccess: true,
    hasActiveGrant: false,
    grantRole: null,
  })
  assert.equal(blockedBefore.canView, false)

  const grantedAfter = buildProjectPolicySnapshot({
    userId: 'requester-1',
    project: privateProject,
    isDirectAccess: true,
    hasActiveGrant: true,
    grantRole: 'viewer',
  })
  assert.equal(grantedAfter.canView, true)
})

test('critical path: collaborator role change updates permission matrix', () => {
  const viewer = buildProjectPolicySnapshot({
    userId: 'u-role',
    project: privateProject,
    isDirectAccess: true,
    hasActiveGrant: true,
    grantRole: 'viewer',
  })
  assert.equal(viewer.canComment, false)
  assert.equal(viewer.canPostUpdate, false)

  const commenter = buildProjectPolicySnapshot({
    userId: 'u-role',
    project: privateProject,
    isDirectAccess: true,
    hasActiveGrant: true,
    grantRole: 'commenter',
  })
  assert.equal(commenter.canComment, true)
  assert.equal(commenter.canPostUpdate, false)

  const contributor = buildProjectPolicySnapshot({
    userId: 'u-role',
    project: privateProject,
    isDirectAccess: true,
    hasActiveGrant: true,
    grantRole: 'contributor',
  })
  assert.equal(contributor.canComment, true)
  assert.equal(contributor.canPostUpdate, true)
})

test('critical path: draft scheduled publish autopublishes with single notification', async () => {
  let status: 'draft' | 'published' = 'draft'
  let notifyCount = 0
  const nowIso = '2026-03-01T00:00:00.000Z'

  const [first, second] = await Promise.all([
    autoPublishScheduledProjectUpdates({
      projectId: 'p1',
      projectTitle: 'Demo Project',
      nowIso,
      fetchDueDrafts: async () =>
        status === 'draft'
          ? [
              {
                id: 'update-1',
                project_id: 'p1',
                user_id: 'creator-1',
                content: 'scheduled',
                version_label: 'v3',
                is_important: false,
                status: 'draft',
                scheduled_publish_at: '2026-03-01T00:00:00.000Z',
              },
            ]
          : [],
      transitionDueDrafts: async () => {
        if (status !== 'draft') return []
        status = 'published'
        return [
          {
            id: 'update-1',
            project_id: 'p1',
            user_id: 'creator-1',
            content: 'scheduled',
            version_label: 'v3',
            is_important: false,
          },
        ]
      },
      notifyFollowers: async () => {
        notifyCount += 1
      },
      logInfo: () => {},
      logError: () => {},
    }),
    autoPublishScheduledProjectUpdates({
      projectId: 'p1',
      projectTitle: 'Demo Project',
      nowIso,
      fetchDueDrafts: async () =>
        status === 'draft'
          ? [
              {
                id: 'update-1',
                project_id: 'p1',
                user_id: 'creator-1',
                content: 'scheduled',
                version_label: 'v3',
                is_important: false,
                status: 'draft',
                scheduled_publish_at: '2026-03-01T00:00:00.000Z',
              },
            ]
          : [],
      transitionDueDrafts: async () => {
        if (status !== 'draft') return []
        status = 'published'
        return [
          {
            id: 'update-1',
            project_id: 'p1',
            user_id: 'creator-1',
            content: 'scheduled',
            version_label: 'v3',
            is_important: false,
          },
        ]
      },
      notifyFollowers: async () => {
        notifyCount += 1
      },
      logInfo: () => {},
      logError: () => {},
    }),
  ])

  assert.equal([first.outcome, second.outcome].sort().join(','), 'lost_race,won_transition')
  assert.equal(notifyCount, 1)
})

test('critical path: important update + mode matrix all/important/mute', () => {
  const rows = [
    { user_id: 'u-all', notification_mode: 'all' as const },
    { user_id: 'u-important', notification_mode: 'important' as const },
    { user_id: 'u-mute', notification_mode: 'mute' as const },
  ]
  const nonImportantRecipients = filterProjectUpdateSubscriberIdsByMode({
    rows,
    isImportant: false,
  })
  const importantRecipients = filterProjectUpdateSubscriberIdsByMode({
    rows,
    isImportant: true,
  })
  assert.deepEqual(nonImportantRecipients.sort(), ['u-all'])
  assert.deepEqual(importantRecipients.sort(), ['u-all', 'u-important'])
})

test('negative/security: private + expired + draft + visibility boundaries remain safe', () => {
  const unauthorized = buildProjectPolicySnapshot({
    userId: 'viewer-1',
    project: privateProject,
    isDirectAccess: true,
    hasActiveGrant: false,
    grantRole: null,
  })
  assert.equal(unauthorized.canView, false)

  const nowMs = Date.parse('2026-03-10T00:00:00.000Z')
  assert.equal(isProjectAccessGrantActive('2026-03-09T00:00:00.000Z', nowMs), false)
  assert.equal(canViewerSeeProjectUpdate('draft', false), false)

  const publicOnlyProfile = selectPublicCreatorProjects([
    {
      id: 'pub',
      title: 'Public',
      share_token: 't1',
      cover_image_url: null,
      visibility: 'public',
      sharing_enabled: true,
      created_at: '2026-03-01T00:00:00.000Z',
    },
    {
      id: 'unlisted',
      title: 'Unlisted',
      share_token: 't2',
      cover_image_url: null,
      visibility: 'unlisted',
      sharing_enabled: true,
      created_at: '2026-03-02T00:00:00.000Z',
    },
  ])
  assert.deepEqual(publicOnlyProfile.map((row) => row.id), ['pub'])

  const publicOnlyExplore = selectPublicExploreRows([
    {
      id: 'pub',
      title: 'Public',
      cover_image_url: null,
      creator_id: 'c1',
      visibility: 'public',
      sharing_enabled: true,
      share_token: 't1',
      created_at: '2026-03-01T00:00:00.000Z',
    },
    {
      id: 'unlisted',
      title: 'Unlisted',
      cover_image_url: null,
      creator_id: 'c1',
      visibility: 'unlisted',
      sharing_enabled: true,
      share_token: 't2',
      created_at: '2026-03-02T00:00:00.000Z',
    },
  ])
  assert.deepEqual(publicOnlyExplore.map((row) => row.id), ['pub'])
})

test('notification regressions: snooze/digest/type mapping and invite route safety after revoke', () => {
  const notifications: InboxNotification[] = [
    {
      id: 'n-track',
      type: 'new_track',
      title: 'Update',
      message: null,
      data: { project_id: 'p1' },
      is_read: false,
      created_at: '2026-03-10T01:00:00.000Z',
    },
    {
      id: 'n-tip',
      type: 'tip_received',
      title: 'Tip',
      message: null,
      data: {},
      is_read: false,
      created_at: '2026-03-10T02:00:00.000Z',
    },
  ]

  const split = splitNotificationsBySnooze({
    notifications,
    snoozes: [{ scope_key: 'project:p1:type:new_track', snoozed_until: '2026-03-11T00:00:00.000Z' }],
    nowMs: Date.parse('2026-03-10T03:00:00.000Z'),
  })
  assert.deepEqual(split.active.map((row) => row.id), ['n-tip'])
  assert.deepEqual(split.snoozed.map((row) => row.id), ['n-track'])

  const digestGroups = buildNotificationDigestGroups({ notifications: split.active })
  assert.equal(digestGroups.length, 1)
  assert.equal(digestGroups[0].group_type, 'tip_received')

  assert.equal(getPreferenceFieldForNotificationType('new_track'), 'notify_project_updates')
  assert.equal(getPreferenceFieldForNotificationType('tip_received'), 'notify_tips')

  const invitePath = buildProjectAccessInviteTargetPath('11111111-1111-1111-1111-111111111111')
  assert.equal(invitePath, '/dashboard/projects/11111111-1111-1111-1111-111111111111')
  const revokedAccess = buildProjectPolicySnapshot({
    userId: 'invitee-1',
    project: privateProject,
    isDirectAccess: true,
    hasActiveGrant: false,
    grantRole: null,
  })
  assert.equal(revokedAccess.canView, false)
})
