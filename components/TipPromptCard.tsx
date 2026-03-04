'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Heart } from 'lucide-react'
import {
  hasTipPromptConvertedInSession,
  getTipPromptDismissedUntil,
  markTipPromptDismissed,
  shouldShowTipPrompt,
  type TipPromptSource,
  type TipPromptTrigger,
} from '@/lib/tipPrompt'

interface TipPromptCardProps {
  source: TipPromptSource
  projectId: string
  creatorId: string
  authenticated: boolean
  isCreator: boolean
  viewerKey: string | null
  trackIds: string[]
  onSendTip: (trigger: TipPromptTrigger) => void
}

const PLAYBACK_SECONDS_THRESHOLD = 45
const PLAYBACK_RATIO_THRESHOLD = 0.6

export default function TipPromptCard({
  source,
  projectId,
  creatorId,
  authenticated,
  isCreator,
  viewerKey,
  trackIds,
  onSendTip,
}: TipPromptCardProps) {
  const [trigger, setTrigger] = useState<TipPromptTrigger | null>(null)
  const [visible, setVisible] = useState(false)
  const [dismissedUntil, setDismissedUntil] = useState<number | null>(null)
  const [convertedInSession, setConvertedInSession] = useState(false)
  const shownForTriggerRef = useRef<TipPromptTrigger | null>(null)

  const trackIdSet = useMemo(() => new Set(trackIds), [trackIds])

  const emitEvent = (action: 'eligible' | 'shown' | 'dismissed' | 'clicked' | 'converted', eventTrigger: TipPromptTrigger | null) => {
    if (typeof window === 'undefined') return
    window.dispatchEvent(
      new CustomEvent('tip_prompt_event', {
        detail: {
          schema: 'tip_prompt.v1',
          action,
          source,
          trigger: eventTrigger,
          project_id: projectId,
          creator_id: creatorId,
          authenticated,
          is_creator: isCreator,
        },
      })
    )
  }

  useEffect(() => {
    if (!viewerKey) return
    setDismissedUntil(getTipPromptDismissedUntil(projectId, viewerKey))
    setConvertedInSession(hasTipPromptConvertedInSession(projectId, viewerKey))
  }, [projectId, viewerKey])

  useEffect(() => {
    const onCommentSucceeded = () => {
      if (trigger) return
      setTrigger('comment_post')
      emitEvent('eligible', 'comment_post')
    }

    const onPlaybackTime = (event: Event) => {
      if (trigger) return
      const detail = (event as CustomEvent<{ trackId?: string; currentTime?: number; duration?: number }>).detail
      const trackId = detail?.trackId
      if (!trackId || !trackIdSet.has(trackId)) return

      const currentTime = Number(detail?.currentTime || 0)
      const duration = Number(detail?.duration || 0)
      const ratio = duration > 0 ? currentTime / duration : 0
      const reached = currentTime >= PLAYBACK_SECONDS_THRESHOLD || ratio >= PLAYBACK_RATIO_THRESHOLD
      if (!reached) return

      setTrigger('playback_threshold')
      emitEvent('eligible', 'playback_threshold')
    }

    window.addEventListener('comment_post_succeeded', onCommentSucceeded as EventListener)
    window.addEventListener('demo-playback-time', onPlaybackTime as EventListener)
    return () => {
      window.removeEventListener('comment_post_succeeded', onCommentSucceeded as EventListener)
      window.removeEventListener('demo-playback-time', onPlaybackTime as EventListener)
    }
  }, [trackIdSet, trigger])

  useEffect(() => {
    const nowMs = Date.now()
    const nextVisible = shouldShowTipPrompt({
      authenticated,
      isCreator,
      trigger,
      dismissedUntil,
      convertedInSession,
      nowMs,
    })

    setVisible(nextVisible)
    if (nextVisible && trigger && shownForTriggerRef.current !== trigger) {
      shownForTriggerRef.current = trigger
      emitEvent('shown', trigger)
    }
  }, [authenticated, isCreator, trigger, dismissedUntil, convertedInSession])

  useEffect(() => {
    const onConverted = (event: Event) => {
      const detail = (event as CustomEvent<Record<string, unknown>>).detail
      const eventProjectId = typeof detail?.project_id === 'string' ? detail.project_id : null
      if (!eventProjectId || eventProjectId !== projectId) return
      setConvertedInSession(true)
      emitEvent('converted', trigger)
    }

    window.addEventListener('tip_prompt_converted', onConverted as EventListener)
    return () => {
      window.removeEventListener('tip_prompt_converted', onConverted as EventListener)
    }
  }, [projectId, trigger])

  if (!visible || !trigger) return null

  return (
    <section className="mt-4 border border-gray-800/80 rounded-lg bg-gray-950/40 overflow-hidden">
      <div className="px-4 py-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-white font-medium">Enjoying this? Support the creator</p>
          <p className="text-xs text-gray-500">Your tip helps them keep sharing updates and tracks.</p>
        </div>
        <Heart className="w-4 h-4 text-neon-green shrink-0" />
      </div>
      <div className="px-4 pb-3 flex items-center gap-2">
        <button
          onClick={() => {
            emitEvent('clicked', trigger)
            setVisible(false)
            onSendTip(trigger)
          }}
          className="px-3 py-1.5 rounded-md bg-neon-green text-black text-xs font-semibold hover:opacity-90"
        >
          Send Tip
        </button>
        <button
          onClick={() => {
            if (viewerKey) {
              const now = Date.now()
              markTipPromptDismissed(projectId, viewerKey, now)
              setDismissedUntil(getTipPromptDismissedUntil(projectId, viewerKey))
            }
            setVisible(false)
            emitEvent('dismissed', trigger)
          }}
          className="px-3 py-1.5 rounded-md border border-gray-700 text-gray-300 text-xs hover:border-gray-600"
        >
          Not now
        </button>
      </div>
    </section>
  )
}

