import SharedProjectPage from '@/components/SharedProjectPage'

export default function SharePage({ params }: { params: { token: string } }) {
  return <SharedProjectPage token={params.token} />
}

