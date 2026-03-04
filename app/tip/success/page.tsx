'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle, Heart } from 'lucide-react'
import { markTipPromptConvertedInSession } from '@/lib/tipPrompt'

export default function TipSuccessPage() {
  const router = useRouter()

  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    const source = params.get('source')
    const trigger = params.get('trigger')
    const projectId = params.get('project_id')
    const creatorId = params.get('creator_id')
    const viewerKey = params.get('viewer_key')

    const hasPromptContext =
      !!projectId &&
      (source === 'project_detail' || source === 'shared_project') &&
      (trigger === 'playback_threshold' || trigger === 'comment_post')

    if (!hasPromptContext) return
    if (viewerKey) {
      markTipPromptConvertedInSession(projectId, viewerKey)
    }

    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('tip_prompt_converted', {
          detail: {
            schema: 'tip_prompt.v1',
            action: 'converted',
            source,
            trigger,
            project_id: projectId,
            creator_id: creatorId || null,
            authenticated: true,
            is_creator: false,
          },
        })
      )
    }
  }, [])

  const handleClose = () => {
    // Go back 2 pages (skip the Stripe checkout page)
    if (window.history.length > 2) {
      window.history.go(-2)
    } else {
      router.push('/dashboard')
    }
  }

  return (
    <div className="min-h-screen bg-black flex items-center justify-center px-4">
      <div className="text-center max-w-md">
        <div 
          className="mx-auto mb-6 w-20 h-20 rounded-full flex items-center justify-center"
          style={{ backgroundColor: 'rgba(57, 255, 20, 0.1)' }}
        >
          <CheckCircle className="w-10 h-10 text-neon-green" />
        </div>
        
        <h1 className="text-3xl font-bold text-white mb-4">
          Thank You!
        </h1>
        
        <p className="text-gray-400 mb-6">
          Your tip has been sent successfully. The creator will receive your support shortly.
        </p>

        <div className="flex items-center justify-center gap-2 text-neon-green mb-8">
          <Heart className="w-5 h-5" />
          <span className="text-sm">You&apos;re awesome for supporting creators!</span>
        </div>

        <button
          onClick={handleClose}
          className="text-sm text-gray-400 hover:text-white transition"
        >
          Close
        </button>
      </div>
    </div>
  )
}

