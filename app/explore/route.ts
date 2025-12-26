// This route exists for Privy's Cross-Origin-Opener-Policy check
// Privy's embedded wallet feature requires this endpoint to verify COOP headers
export async function GET(request: Request) {
  // Check if this is a request from Privy (has specific headers or query params)
  const url = new URL(request.url)
  const isPrivyRequest = request.headers.get('user-agent')?.includes('Privy') || 
                         url.searchParams.has('privy-check')
  
  // If it's a direct browser navigation, redirect to homepage
  if (!isPrivyRequest && request.headers.get('accept')?.includes('text/html')) {
    return Response.redirect(new URL('/', request.url), 302)
  }
  
  // Otherwise, return the COOP header for Privy's check
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

