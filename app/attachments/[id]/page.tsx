import AttachmentViewerPage from '@/components/AttachmentViewerPage'

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <AttachmentViewerPage attachmentId={id} />
}
