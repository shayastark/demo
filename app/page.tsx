import ClientHomePage from '@/components/ClientHomePage'

// Removed Suspense and force-dynamic to prevent re-render issues
// These were causing hydration mismatches and infinite loops
export default function Home() {
  return <ClientHomePage />
}

