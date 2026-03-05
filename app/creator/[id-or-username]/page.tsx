import PublicCreatorProfilePage from '@/components/PublicCreatorProfilePage'

export default async function Page({
  params,
}: {
  params: Promise<{ 'id-or-username': string }>
}) {
  const routeParams = await params
  return <PublicCreatorProfilePage identifier={routeParams['id-or-username']} />
}
