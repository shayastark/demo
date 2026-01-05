'use client'

import Link from 'next/link'
import { XCircle } from 'lucide-react'

export default function TipCancelledPage() {
  return (
    <div className="min-h-screen bg-black flex items-center justify-center px-4">
      <div className="text-center max-w-md">
        <div 
          className="mx-auto mb-6 w-20 h-20 rounded-full flex items-center justify-center"
          style={{ backgroundColor: 'rgba(107, 114, 128, 0.2)' }}
        >
          <XCircle className="w-10 h-10 text-gray-400" />
        </div>
        
        <h1 className="text-3xl font-bold text-white mb-4">
          Payment Cancelled
        </h1>
        
        <p className="text-gray-400 mb-8">
          Your tip was not processed. No charges were made.
        </p>

        <Link
          href="/dashboard"
          className="inline-block bg-gray-700 text-white px-6 py-3 rounded-lg font-semibold hover:bg-gray-600 transition"
        >
          Back to Dashboard
        </Link>
      </div>
    </div>
  )
}

