import { PrivyClient } from '@privy-io/node'

// Server-side Privy client for token verification
const privyAppId = process.env.NEXT_PUBLIC_PRIVY_APP_ID || ''
const privyAppSecret = process.env.PRIVY_APP_SECRET || ''

let privyClient: PrivyClient | null = null

function getPrivyClient(): PrivyClient {
  if (!privyClient) {
    if (!privyAppId || !privyAppSecret) {
      throw new Error('Privy credentials not configured')
    }
    privyClient = new PrivyClient({
      appId: privyAppId,
      appSecret: privyAppSecret,
    })
  }
  return privyClient
}

export interface AuthResult {
  success: boolean
  privyId?: string
  error?: string
}

/**
 * Verify a Privy access token from the Authorization header
 * Returns the user's Privy ID if valid
 */
export async function verifyPrivyToken(authHeader: string | null): Promise<AuthResult> {
  if (!authHeader) {
    return { success: false, error: 'No authorization header' }
  }

  const token = authHeader.replace('Bearer ', '')
  if (!token) {
    return { success: false, error: 'No token provided' }
  }

  try {
    const client = getPrivyClient()
    const verifiedClaims = await client.utils().auth().verifyAccessToken(token)
    
    return {
      success: true,
      privyId: verifiedClaims.user_id
    }
  } catch (error) {
    console.error('Token verification failed:', error)
    return { success: false, error: 'Invalid token' }
  }
}

/**
 * Get user from database by Privy ID
 */
export async function getUserByPrivyId(privyId: string) {
  const { supabaseAdmin } = await import('./supabaseAdmin')
  
  const { data: user, error } = await supabaseAdmin
    .from('users')
    .select('*')
    .eq('privy_id', privyId)
    .single()

  if (error || !user) {
    return null
  }

  return user
}
