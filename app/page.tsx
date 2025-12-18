import { Suspense } from 'react'
import ClientHomePage from '@/components/ClientHomePage'

export const dynamic = 'force-dynamic'

function LoadingFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-black text-white">
      <div className="text-center">Loading...</div>
    </div>
  )
}

export default function Home() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <ClientHomePage />
    </Suspense>
  )
}

