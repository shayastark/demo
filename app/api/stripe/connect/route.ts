import { NextRequest, NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe'
import { supabase } from '@/lib/supabase'

// Create a Stripe Connect account for a creator
export async function POST(request: NextRequest) {
  try {
    const { userId, email } = await request.json()

    if (!userId) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 })
    }

    // Check if user already has a Stripe account
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('stripe_account_id, stripe_onboarding_complete')
      .eq('id', userId)
      .single()

    if (userError) {
      console.error('Error fetching user:', userError)
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    let accountId = user.stripe_account_id

    // Create new Connect account if none exists
    if (!accountId) {
      const account = await stripe.accounts.create({
        type: 'express',
        email: email || undefined,
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
        business_type: 'individual',
      })

      accountId = account.id

      // Save account ID to database
      const { error: updateError } = await supabase
        .from('users')
        .update({ stripe_account_id: accountId })
        .eq('id', userId)

      if (updateError) {
        console.error('Error saving Stripe account ID:', updateError)
        return NextResponse.json({ error: 'Failed to save account' }, { status: 500 })
      }
    }

    // Create account link for onboarding
    const origin = request.headers.get('origin') || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    
    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${origin}/account?stripe=refresh`,
      return_url: `${origin}/account?stripe=success`,
      type: 'account_onboarding',
    })

    return NextResponse.json({ url: accountLink.url })
  } catch (error) {
    console.error('Error creating Connect account:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create account' },
      { status: 500 }
    )
  }
}

// Check Connect account status
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')

    if (!userId) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 })
    }

    const { data: user, error: userError } = await supabase
      .from('users')
      .select('stripe_account_id, stripe_onboarding_complete')
      .eq('id', userId)
      .single()

    if (userError || !user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    if (!user.stripe_account_id) {
      return NextResponse.json({ 
        hasAccount: false, 
        onboardingComplete: false 
      })
    }

    // Check account status with Stripe
    const account = await stripe.accounts.retrieve(user.stripe_account_id)
    const onboardingComplete = account.details_submitted && account.charges_enabled

    // Update database if status changed
    if (onboardingComplete !== user.stripe_onboarding_complete) {
      await supabase
        .from('users')
        .update({ stripe_onboarding_complete: onboardingComplete })
        .eq('id', userId)
    }

    return NextResponse.json({
      hasAccount: true,
      onboardingComplete,
      chargesEnabled: account.charges_enabled,
      payoutsEnabled: account.payouts_enabled,
    })
  } catch (error) {
    console.error('Error checking Connect status:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to check status' },
      { status: 500 }
    )
  }
}

