import { NextRequest, NextResponse } from 'next/server'
import { stripe, PLATFORM_FEE_PERCENT } from '@/lib/stripe'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { isValidUUID } from '@/lib/validation'
import { verifyPrivyToken, getUserByPrivyId } from '@/lib/auth'

export async function POST(request: NextRequest) {
  try {
    const {
      creatorId,
      amount,
      tipperEmail,
      tipperUsername,
      message,
      projectId,
      tipPromptSource,
      tipPromptTrigger,
      viewerKey,
    } = await request.json()

    const authResult = await verifyPrivyToken(request.headers.get('authorization'))
    const authenticatedUser =
      authResult.success && authResult.privyId ? await getUserByPrivyId(authResult.privyId) : null

    if (!creatorId || !amount) {
      return NextResponse.json(
        { error: 'Creator ID and amount are required' },
        { status: 400 }
      )
    }

    // Validate creatorId format
    if (!isValidUUID(creatorId)) {
      return NextResponse.json(
        { error: 'Invalid creator ID format' },
        { status: 400 }
      )
    }

    // Validate amount is a number
    if (typeof amount !== 'number' || isNaN(amount)) {
      return NextResponse.json(
        { error: 'Amount must be a number' },
        { status: 400 }
      )
    }

    // Validate amount (minimum $1, maximum $500)
    if (amount < 100 || amount > 50000) {
      return NextResponse.json(
        { error: 'Amount must be between $1 and $500' },
        { status: 400 }
      )
    }

    // Sanitize optional text fields
    const sanitizedUsername = tipperUsername ? String(tipperUsername).slice(0, 100) : ''
    const sanitizedMessage = message ? String(message).slice(0, 500) : ''

    // Get creator's Stripe account (use admin client for server-side query)
    const { data: creator, error: creatorError } = await supabaseAdmin
      .from('users')
      .select('stripe_account_id, stripe_onboarding_complete, username')
      .eq('id', creatorId)
      .single()

    if (creatorError || !creator) {
      return NextResponse.json({ error: 'Creator not found' }, { status: 404 })
    }

    if (!creator.stripe_account_id || !creator.stripe_onboarding_complete) {
      return NextResponse.json(
        { error: 'Creator has not set up payments yet' },
        { status: 400 }
      )
    }

    // Calculate platform fee
    const platformFee = Math.round(amount * (PLATFORM_FEE_PERCENT / 100))

    // Use the configured app URL for redirects — never trust the Origin header
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    const hasPromptContext =
      typeof projectId === 'string' &&
      isValidUUID(projectId) &&
      (tipPromptSource === 'project_detail' || tipPromptSource === 'shared_project') &&
      (tipPromptTrigger === 'playback_threshold' || tipPromptTrigger === 'comment_post')

    const successUrl = hasPromptContext
      ? `${appUrl}/tip/success?session_id={CHECKOUT_SESSION_ID}&project_id=${encodeURIComponent(projectId)}&source=${encodeURIComponent(tipPromptSource)}&trigger=${encodeURIComponent(tipPromptTrigger)}&creator_id=${encodeURIComponent(creatorId)}${typeof viewerKey === 'string' && viewerKey ? `&viewer_key=${encodeURIComponent(viewerKey.slice(0, 120))}` : ''}`
      : `${appUrl}/tip/success?session_id={CHECKOUT_SESSION_ID}`

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: `Tip for ${creator.username || 'Creator'}`,
              description: sanitizedMessage ? `Message: ${sanitizedMessage}` : 'Thank you for supporting this creator!',
            },
            unit_amount: amount,
          },
          quantity: 1,
        },
      ],
      payment_intent_data: {
        application_fee_amount: platformFee,
        transfer_data: {
          destination: creator.stripe_account_id,
        },
        metadata: {
          creator_id: creatorId,
          tipper_username: sanitizedUsername,
          message: sanitizedMessage,
          project_id: typeof projectId === 'string' && isValidUUID(projectId) ? projectId : '',
          tipper_user_id: authenticatedUser?.id || '',
        },
      },
      customer_email: tipperEmail || undefined,
      success_url: successUrl,
      cancel_url: `${appUrl}/tip/cancelled`,
      metadata: {
        creator_id: creatorId,
        tipper_username: sanitizedUsername,
        type: 'tip',
        project_id: typeof projectId === 'string' && isValidUUID(projectId) ? projectId : '',
        tipper_user_id: authenticatedUser?.id || '',
      },
    })

    return NextResponse.json({ url: session.url })
  } catch (error) {
    console.error('Error creating tip session:', error)
    return NextResponse.json(
      { error: 'Failed to create payment session' },
      { status: 500 }
    )
  }
}

