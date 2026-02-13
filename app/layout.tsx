import type { Metadata, Viewport } from 'next'
import { Outfit } from 'next/font/google'
import './globals.css'
import PrivyProviderWrapper from '@/components/PrivyProviderWrapper'
import ToastContainer from '@/components/Toast'
import BottomTabBar from '@/components/BottomTabBar'

const outfit = Outfit({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-outfit',
  weight: ['300', '400', '500', '600', '700', '800'],
})

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
}

export const metadata: Metadata = {
  title: 'Demo - Share Music On Your Terms',
  description: 'Share your unreleased tracks on your terms',
  openGraph: {
    title: 'Demo - Share Music On Your Terms',
    description: 'Share your unreleased tracks on your terms',
    images: [
      {
        url: '/mixtape-cassette.png',
        width: 1024,
        height: 640,
        alt: 'Demo - Share your music',
      },
    ],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Demo - Share Music On Your Terms',
    description: 'Share your unreleased tracks on your terms',
    images: ['/mixtape-cassette.png'],
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className={outfit.variable}>
      <body className={outfit.className}>
        <PrivyProviderWrapper>
          {children}
          <ToastContainer />
          <BottomTabBar />
        </PrivyProviderWrapper>
      </body>
    </html>
  )
}

