'use client'

import { useState, useEffect } from 'react'
import { DaimoPayProvider, DaimoPayButton, getDefaultConfig } from '@daimo/pay'
import { WagmiProvider, createConfig } from 'wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { baseUSDC } from '@daimo/pay-common'
import { getAddress } from 'viem'
import { showToast } from '@/components/Toast'

interface CryptoTipButtonProps {
  creatorName: string
  walletAddress: string
  amount: string // Amount in dollars as string, e.g. "5.00"
  onSuccess?: () => void
}

// Create config outside component to avoid re-creation
const wagmiConfig = createConfig(getDefaultConfig({ appName: 'Demo' }))
const queryClient = new QueryClient()

function CryptoTipButtonInner({ creatorName, walletAddress, amount, onSuccess }: CryptoTipButtonProps) {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <DaimoPayProvider>
          <DaimoPayButton
            appId="pay-demo"
            intent={`Tip ${creatorName}`}
            toAddress={walletAddress as `0x${string}`}
            toChain={baseUSDC.chainId}
            toToken={getAddress(baseUSDC.token)}
            toUnits={amount}
            refundAddress={walletAddress as `0x${string}`}
            onPaymentStarted={(e) => {
              console.log('Crypto tip started:', e)
            }}
            onPaymentCompleted={(e) => {
              console.log('Crypto tip completed:', e)
              showToast(`Tip of $${amount} sent successfully!`, 'success')
              onSuccess?.()
            }}
          />
        </DaimoPayProvider>
      </QueryClientProvider>
    </WagmiProvider>
  )
}

export default function CryptoTipButton(props: CryptoTipButtonProps) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  // Don't render during SSR
  if (!mounted) {
    return (
      <button
        disabled
        style={{
          width: '100%',
          padding: '12px',
          borderRadius: '8px',
          border: 'none',
          backgroundColor: '#39FF14',
          color: '#000',
          fontSize: '14px',
          fontWeight: 600,
          opacity: 0.5,
        }}
      >
        Loading...
      </button>
    )
  }

  return <CryptoTipButtonInner {...props} />
}
