import { NextRequest, NextResponse } from 'next/server'
import { stripe, PLATFORM_FEE_PERCENT } from '@/lib/stripe'
import { supabase } from '@/lib/supabase'

export async function POST(request: NextRequest) {
  try {
    const { creatorId, amount, tipperEmail, tipperUsername, message } = await request.json()

    if (!creatorId || !amount) {
      return NextResponse.json(
        { error: 'Creator ID and amount are required' },
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

    // Get creator's Stripe account
    const { data: creator, error: creatorError } = await supabase
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

    // Create Checkout Session with Connect
    const origin = request.headers.get('origin') || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: `Tip for ${creator.username || 'Creator'}`,
              description: message ? `Message: ${message}` : 'Thank you for supporting this creator!',
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
          tipper_username: tipperUsername || '',
          message: message || '',
        },
      },
      customer_email: tipperEmail || undefined,
      success_url: `${origin}/tip/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/tip/cancelled`,
      metadata: {
        creator_id: creatorId,
        tipper_username: tipperUsername || '',
        type: 'tip',
      },
    })

    return NextResponse.json({ url: session.url })
  } catch (error) {
    console.error('Error creating tip session:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create payment' },
      { status: 500 }
    )
  }
}

