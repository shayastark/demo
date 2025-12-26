// This route exists for Privy's Cross-Origin-Opener-Policy check
// Privy's embedded wallet feature requires this endpoint to verify COOP headers
export async function GET() {
  return new Response(null, {
    status: 200,
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
    },
  })
}

export async function HEAD() {
  return new Response(null, {
    status: 200,
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
    },
  })
}

