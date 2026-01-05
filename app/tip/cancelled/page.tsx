'use client'

import { useRouter } from 'next/navigation'
import { XCircle, X } from 'lucide-react'

export default function TipCancelledPage() {
  const router = useRouter()

  const handleClose = () => {
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

        <button
          onClick={handleClose}
          className="w-full bg-gray-700 text-white px-6 py-3 rounded-lg font-semibold hover:bg-gray-600 transition"
        >
          Go Back
        </button>
      </div>
    </div>
  )
}

