/**
 * Client-side API utilities for making authenticated requests
 */

type RequestMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'

interface ApiRequestOptions {
  method?: RequestMethod
  body?: unknown
  getAccessToken: () => Promise<string | null>
}

/**
 * Make an authenticated API request
 * @param endpoint - API endpoint (e.g., '/api/user')
 * @param options - Request options including auth token getter
 */
export async function apiRequest<T = unknown>(
  endpoint: string,
  options: ApiRequestOptions
): Promise<{ data?: T; error?: string }> {
  const { method = 'GET', body, getAccessToken } = options

  try {
    const token = await getAccessToken()
    
    if (!token) {
      return { error: 'Not authenticated' }
    }

    const headers: Record<string, string> = {
      'Authorization': `Bearer ${token}`,
    }

    if (body) {
      headers['Content-Type'] = 'application/json'
    }

    const response = await fetch(endpoint, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    })

    const data = await response.json()

    if (!response.ok) {
      return { error: data.error || 'Request failed' }
    }

    return { data }
  } catch (error) {
    console.error('API request error:', error)
    return { error: 'Network error' }
  }
}
