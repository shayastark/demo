import type { Metadata } from 'next'
import SharedProjectPage from '@/components/SharedProjectPage'
import { supabaseServer } from '@/lib/supabaseServer'

type SharePageParams = {
  params: Promise<{ token: string }>
}

export async function generateMetadata({ params }: SharePageParams): Promise<Metadata> {
  const { token } = await params

  try {
    const { data: project } = await supabaseServer
      .from('projects')
      .select('title, description, cover_image_url')
      .eq('share_token', token)
      .single()

    const baseTitle = project?.title || 'Demo - Share Music On Your Terms'
    const description =
      project?.description || 'Listen to this unreleased project on Demo.'

    const imageUrl = project?.cover_image_url || '/mixtape-cassette.png'

    return {
      title: baseTitle,
      description,
      openGraph: {
        title: baseTitle,
        description,
        images: [{ url: imageUrl }],
      },
      twitter: {
        card: 'summary_large_image',
        title: baseTitle,
        description,
        images: [imageUrl],
      },
    }
  } catch {
    return {
      title: 'Demo - Share Music On Your Terms',
      description: 'Listen to this unreleased project on Demo.',
      openGraph: {
        title: 'Demo - Share Music On Your Terms',
        description: 'Listen to this unreleased project on Demo.',
        images: [{ url: '/mixtape-cassette.png' }],
      },
      twitter: {
        card: 'summary_large_image',
        title: 'Demo - Share Music On Your Terms',
        description: 'Listen to this unreleased project on Demo.',
        images: ['/mixtape-cassette.png'],
      },
    }
  }
}

export default async function SharePage({ params }: SharePageParams) {
  const { token } = await params
  return <SharedProjectPage token={token} />
}

