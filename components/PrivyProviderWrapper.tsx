'use client'

import { PrivyProvider } from '@privy-io/react-auth'
import { PrivyWagmiProvider } from '@privy-io/wagmi'
import { configureChains } from 'wagmi'
import { base, baseSepolia } from 'wagmi/chains'
import { createConfig } from 'wagmi'
import { publicProvider } from 'wagmi/providers/public'

const { chains, publicClient, webSocketPublicClient } = configureChains(
  [base, baseSepolia],
  [publicProvider()]
)

const wagmiConfig = createConfig({
  autoConnect: true,
  publicClient,
  webSocketPublicClient,
})

export default function PrivyProviderWrapper({
  children,
}: {
  children: React.ReactNode
}) {
  const privyAppId = process.env.NEXT_PUBLIC_PRIVY_APP_ID || ''

  return (
    <PrivyProvider
      appId={privyAppId}
      config={{
        loginMethods: ['email', 'wallet', 'sms'],
        appearance: {
          theme: 'light',
          accentColor: '#000000',
        },
        embeddedWallets: {
          createOnLogin: 'users-without-wallets',
        },
      }}
    >
      <PrivyWagmiProvider wagmiConfig={wagmiConfig}>
        {children}
      </PrivyWagmiProvider>
    </PrivyProvider>
  )
}

