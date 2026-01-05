'use client'

import { useRouter } from 'next/navigation'
import { XCircle } from 'lucide-react'

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

