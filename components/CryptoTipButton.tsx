'use client'

import { useState, useEffect } from 'react'
import { DaimoPayProvider, DaimoPayButton, getDefaultConfig } from '@daimo/pay'
import { WagmiProvider, createConfig } from 'wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { baseUSDC } from '@daimo/pay-common'
import { getAddress } from 'viem'
import { showToast } from '@/components/Toast'

interface CryptoTipButtonProps {
  creatorId: string
  creatorName: string
  walletAddress: string
  amount: string // Amount in dollars as string, e.g. "5.00"
  tipperUsername?: string | null
  onSuccess?: () => void
}

// Create config outside component to avoid re-creation
const wagmiConfig = createConfig(getDefaultConfig({ appName: 'Demo' }))
const queryClient = new QueryClient()

function CryptoTipButtonInner({ 
  creatorId,
  creatorName, 
  walletAddress, 
  amount, 
  tipperUsername,
  onSuccess 
}: CryptoTipButtonProps) {
  
  const recordCryptoTip = async (paymentId: string, txHash: string, chainId: number) => {
    try {
      const response = await fetch('/api/tips/crypto', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          creatorId,
          amount,
          tipperUsername,
          paymentId,
          txHash,
          chainId,
        }),
      })
      
      if (!response.ok) {
        console.error('Failed to record crypto tip')
      }
    } catch (error) {
      console.error('Error recording crypto tip:', error)
    }
  }
  
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
            closeOnSuccess={true}
            onPaymentStarted={(e) => {
              console.log('Crypto tip started:', e)
            }}
            onPaymentCompleted={async (e) => {
              console.log('Crypto tip completed:', e)
              
              // Record the tip in the database
              await recordCryptoTip(
                e.paymentId,
                e.txHash,
                e.chainId
              )
              
              // Small delay to let modal close first
              setTimeout(() => {
                showToast(`Tip of $${amount} sent! 🎉`, 'success')
                onSuccess?.()
              }, 500)
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
