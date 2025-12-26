import type { Metadata } from 'next'
import './globals.css'
import PrivyProviderWrapper from '@/components/PrivyProviderWrapper'

export const metadata: Metadata = {
  title: 'Hubba - Share Your Music',
  description: 'Platform for creators to share demos and unreleased tracks',
  viewport: {
    width: 'device-width',
    initialScale: 1,
    maximumScale: 1,
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body>
        <PrivyProviderWrapper>{children}</PrivyProviderWrapper>
      </body>
    </html>
  )
}

