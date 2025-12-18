import type { Metadata } from 'next'
import SharedProjectPage from '@/components/SharedProjectPage'
import { supabaseServer } from '@/lib/supabaseServer'

type SharePageParams = {
  params: { token: string }
}

export async function generateMetadata({ params }: SharePageParams): Promise<Metadata> {
  const { token } = params

  try {
    const { data: project } = await supabaseServer
      .from('projects')
      .select('title, description, cover_image_url')
      .eq('share_token', token)
      .single()

    const baseTitle = project?.title || 'Hubba - Share Your Music'
    const description =
      project?.description || 'Listen to this unreleased project on Hubba.'

    const imageUrl = project?.cover_image_url

    return {
      title: baseTitle,
      description,
      openGraph: {
        title: baseTitle,
        description,
        ...(imageUrl && {
          images: [{ url: imageUrl }],
        }),
      },
      twitter: {
        card: 'summary_large_image',
        title: baseTitle,
        description,
        ...(imageUrl && {
          images: [imageUrl],
        }),
      },
    }
  } catch {
    return {
      title: 'Hubba - Share Your Music',
      description: 'Listen to this unreleased project on Hubba.',
    }
  }
}

export default function SharePage({ params }: SharePageParams) {
  const { token } = params
  return <SharedProjectPage token={token} />
}

