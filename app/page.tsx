import { redirect } from 'next/navigation'
import { usePrivy } from '@privy-io/react-auth'
import ClientHomePage from '@/components/ClientHomePage'

export default function Home() {
  return <ClientHomePage />
}

