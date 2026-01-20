'use client'

import { DaimoPayProvider, getDefaultConfig } from '@daimo/pay'
import { WagmiProvider, createConfig } from 'wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState, useEffect } from 'react'

const wagmiConfig = createConfig(getDefaultConfig({ appName: 'Demo' }))

function DaimoPayProviderInner({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient())

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <DaimoPayProvider>
          {children}
        </DaimoPayProvider>
      </QueryClientProvider>
    </WagmiProvider>
  )
}

export function DaimoPayProviderWrapper({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  // Don't render the Daimo provider during SSR to avoid localStorage errors
  if (!mounted) {
    return <>{children}</>
  }

  return <DaimoPayProviderInner>{children}</DaimoPayProviderInner>
}
