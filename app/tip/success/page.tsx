'use client'

import { useRouter } from 'next/navigation'
import { CheckCircle, Heart, X } from 'lucide-react'

export default function TipSuccessPage() {
  const router = useRouter()

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
      <div className="relative text-center max-w-md bg-gray-900 rounded-2xl p-8 border border-gray-800">
        {/* Close button */}
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 p-2 text-gray-400 hover:text-white transition"
        >
          <X className="w-5 h-5" />
        </button>

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
          className="w-full bg-neon-green text-black px-6 py-3 rounded-lg font-semibold hover:opacity-80 transition"
        >
          Continue Listening
        </button>
      </div>
    </div>
  )
}

