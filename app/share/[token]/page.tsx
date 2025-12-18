import SharedProjectPage from '@/components/SharedProjectPage'

export default async function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  return <SharedProjectPage token={token} />
}

