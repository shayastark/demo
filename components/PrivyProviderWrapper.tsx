'use client'

import { PrivyProvider } from '@privy-io/react-auth'
import { useEffect } from 'react'

export default function PrivyProviderWrapper({
  children,
}: {
  children: React.ReactNode
}) {
  const privyAppId = process.env.NEXT_PUBLIC_PRIVY_APP_ID || ''

  // If no app ID, show error message
  if (!privyAppId) {
    if (typeof window !== 'undefined') {
      console.error('PrivyProviderWrapper: NEXT_PUBLIC_PRIVY_APP_ID is missing')
    }
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center px-4">
        <div className="text-center max-w-md">
          <h1 className="text-2xl font-bold mb-4 text-red-400">Configuration Error</h1>
          <p className="text-neon-green mb-4 opacity-90">
            Privy App ID is missing. Please set NEXT_PUBLIC_PRIVY_APP_ID in your environment variables.
          </p>
        </div>
      </div>
    )
  }
  
  // Debug logging (only once, not in render)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      console.log('PrivyProviderWrapper: Initializing with App ID', privyAppId.substring(0, 10) + '...')
    }
  }, [privyAppId])

  // Add error handler for script loading failures
  useEffect(() => {
    if (typeof window === 'undefined') return
    
    const handleError = (event: ErrorEvent) => {
      // Ignore embedded-wallets script errors - they're not critical for basic auth
      if (event.filename?.includes('embedded-wallets')) {
        console.warn('Embedded wallets script failed to load, but authentication should still work')
        event.preventDefault() // Prevent error from propagating
        return true
      }
      return false
    }
    
    window.addEventListener('error', handleError, true)
    
    return () => {
      window.removeEventListener('error', handleError, true)
    }
  }, [])

  return (
    <PrivyProvider
      appId={privyAppId}
      config={{
        // Temporarily remove 'wallet' to test if it's causing embedded wallet script loading
        // You can add it back once we confirm the issue is resolved
        loginMethods: ['email', 'sms'],
        appearance: {
          theme: 'light',
          accentColor: '#000000',
        },
        // Explicitly disable embedded wallets
        embeddedWallets: {
          ethereum: {
            createOnLogin: 'off',
          },
        },
      }}
    >
      {children}
    </PrivyProvider>
  )
}

