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
    answer: 'Demo lets you share unreleased music with fans, collaborators, or anyone you choose. You control who can listen, view project metrics, and receive tips from fans.',
  },
  {
    question: 'How do I create a project?',
    answer: 'Head to your Dashboard and tap "New Project." Add a cover image, title, and upload your tracks. Share the link with whoever you want.',
  },
  {
    question: 'Can I share music privately?',
    answer: 'Yes! Each project has its own unique link. Only people with the link can access it.',
  },
  {
    question: 'How do tips work?',
    answer: 'Listeners can send you tips directly through your creator profile by accessing any of your projects. Transactions from Debit Cards/Credit Cards are handled by Stripe. Cryptocurrency transactions are handled by Daimo Pay. Connect your payment account or Web3 wallet in your creator profile to receive them.',
  },
  {
    question: 'Can listeners download my tracks?',
    answer: 'Only if you allow it. You control download permissions and share permissions, independently, for each project.',
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
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.85)' }}
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
