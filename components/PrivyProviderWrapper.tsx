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

  // Add comprehensive error handler for script loading failures
  useEffect(() => {
    if (typeof window === 'undefined') return
    
    const handleError = (event: ErrorEvent) => {
      // Ignore embedded-wallets script errors - they're not critical for basic auth
      if (event.filename?.includes('embedded-wallets') || 
          event.message?.includes('embedded-wallets') ||
          event.error?.message?.includes('embedded-wallets')) {
        console.warn('Embedded wallets script error caught and suppressed:', event.message)
        event.stopPropagation() // Stop error from bubbling
        event.stopImmediatePropagation() // Stop other handlers
        return true
      }
      return false
    }
    
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      // Catch promise rejections from embedded wallets
      if (event.reason?.message?.includes('embedded-wallets') ||
          event.reason?.toString()?.includes('embedded-wallets')) {
        console.warn('Embedded wallets promise rejection caught and suppressed')
        event.preventDefault() // Prevent unhandled rejection
        return true
      }
      return false
    }
    
    window.addEventListener('error', handleError, true)
    window.addEventListener('unhandledrejection', handleUnhandledRejection)
    
    return () => {
      window.removeEventListener('error', handleError, true)
      window.removeEventListener('unhandledrejection', handleUnhandledRejection)
    }
  }, [])

  return (
    <PrivyProvider
      appId={privyAppId}
      config={{
        loginMethods: ['email', 'wallet', 'sms'],
        appearance: {
          theme: 'light',
          accentColor: '#000000',
        },
        // Embedded wallets configuration - restored since they were working before
        embeddedWallets: {
          ethereum: {
            createOnLogin: 'users-without-wallets',
          },
        },
      }}
    >
      {children}
    </PrivyProvider>
  )
}

