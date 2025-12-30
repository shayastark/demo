import type { Metadata } from 'next'
import './globals.css'
import PrivyProviderWrapper from '@/components/PrivyProviderWrapper'
import ToastContainer from '@/components/Toast'

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
        <PrivyProviderWrapper>
          {children}
          <ToastContainer />
        </PrivyProviderWrapper>
      </body>
    </html>
  )
}

