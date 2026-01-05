'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { CheckCircle, Heart } from 'lucide-react'

export default function TipSuccessPage() {
  useEffect(() => {
    // Confetti effect or celebration animation could go here
  }, [])

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
        
        <p className="text-gray-400 mb-8">
          Your tip has been sent successfully. The creator will receive your support shortly.
        </p>

        <div className="flex items-center justify-center gap-2 text-neon-green mb-8">
          <Heart className="w-5 h-5" />
          <span className="text-sm">You&apos;re awesome for supporting creators!</span>
        </div>

        <Link
          href="/dashboard"
          className="inline-block bg-neon-green text-black px-6 py-3 rounded-lg font-semibold hover:opacity-80 transition"
        >
          Back to Dashboard
        </Link>
      </div>
    </div>
  )
}

