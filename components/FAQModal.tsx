'use client'

import { X } from 'lucide-react'
import { useEffect } from 'react'

interface FAQModalProps {
  isOpen: boolean
  onClose: () => void
}

const faqs = [
  {
    question: 'What is Demo?',
    answer: 'Demo is a space for creators to share projects, build a public profile, post updates, attach supporting materials, and receive support from listeners. It is designed for rough cuts, works in progress, and finished releases alike.',
  },
  {
    question: 'What can I do as a creator on Demo?',
    answer: 'You can create projects, upload tracks, customize your creator profile, choose whether a project is public, unlisted, or private, post updates, share attachments, and receive tips from supporters.',
  },
  {
    question: 'What can I do as a listener or supporter?',
    answer: 'You can explore public projects, follow creators, save projects, listen to tracks, comment on releases, view updates and attachments, and support creators through tips when payments are enabled.',
  },
  {
    question: 'What is the difference between public, unlisted, and private projects?',
    answer: 'Public projects can appear on your creator profile. Unlisted projects are available by direct link but are not broadly listed. Private projects are limited to approved viewers and collaborators.',
  },
  {
    question: 'What appears on my creator profile?',
    answer: 'Your creator profile can show your avatar, display name, username, bio, links, and any projects you choose to make public.',
  },
  {
    question: 'How do follows and updates work?',
    answer: 'Following a creator makes it easier to keep up with what they share. Depending on your notification settings, you can also stay on top of project activity, creator updates, and other changes that matter to you.',
  },
  {
    question: 'What are comments, updates, and attachments for?',
    answer: 'Comments let listeners and collaborators respond directly to a project. Updates let creators share progress or announcements. Attachments let creators include links, files, and extra context alongside the work.',
  },
  {
    question: 'How do tips work?',
    answer: 'Supporters can tip creators through enabled payment methods. Card payments are handled through Stripe, and crypto support can be enabled through a connected wallet setup in your account.',
  },
  {
    question: 'Can people download my tracks?',
    answer: 'Only if you allow downloads for that specific project. Download permissions are controlled separately from visibility and sharing settings.',
  },
  {
    question: 'Is Demo only for finished releases?',
    answer: 'No. Demo is built for sharing music at any stage, whether you are testing an idea, collecting feedback, sharing with close collaborators, or putting out something ready for the public.',
  },
]

export default function FAQModal({ isOpen, onClose }: FAQModalProps) {
  // Close on escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    
    if (isOpen) {
      document.addEventListener('keydown', handleEscape)
      // Prevent body scroll when modal is open
      document.body.style.overflow = 'hidden'
    }
    
    return () => {
      document.removeEventListener('keydown', handleEscape)
      document.body.style.overflow = ''
    }
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div 
      className="fixed inset-0 flex items-center justify-center p-4"
      style={{ 
        backgroundColor: 'rgba(0, 0, 0, 0.85)',
        zIndex: 950,
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
      }}
      onClick={onClose}
    >
      <div 
        className="relative w-full max-w-lg max-h-[80vh] overflow-y-auto bg-gray-900 rounded-xl border border-gray-700"
        style={{ padding: '24px' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-gray-400 hover:text-white transition rounded-lg hover:bg-gray-800"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <h2 className="text-2xl font-bold text-white mb-6">FAQs</h2>

        {/* FAQ List */}
        <div className="space-y-6">
          {faqs.map((faq, index) => (
            <div key={index}>
              <h3 className="text-neon-green font-semibold mb-2">{faq.question}</h3>
              <p className="text-gray-300 text-sm leading-relaxed">{faq.answer}</p>
            </div>
          ))}
        </div>

        {/* Close button at bottom */}
        <button
          onClick={onClose}
          className="w-full mt-8 py-3 bg-white text-black font-semibold rounded-lg hover:bg-gray-200 transition"
        >
          Got it
        </button>
      </div>
    </div>
  )
}
