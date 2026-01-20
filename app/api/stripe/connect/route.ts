import { NextRequest, NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe'
import { supabase } from '@/lib/supabase'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { verifyPrivyToken, getUserByPrivyId } from '@/lib/auth'

// Create a Stripe Connect account for a creator
export async function POST(request: NextRequest) {
  try {
    // Verify the user's identity
    const authResult = await verifyPrivyToken(request.headers.get('authorization'))
    
    if (!authResult.success || !authResult.privyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get the user from the token (not from request body!)
    const user = await getUserByPrivyId(authResult.privyId)
    
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const { email } = await request.json()

    let accountId = user.stripe_account_id

    // Create new Connect account if none exists
    if (!accountId) {
      const account = await stripe.accounts.create({
        type: 'express',
        email: email || user.email || undefined,
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
        business_type: 'individual',
      })

      accountId = account.id

      // Save account ID to database using admin client
      const { error: updateError } = await supabaseAdmin
        .from('users')
        .update({ stripe_account_id: accountId })
        .eq('id', user.id)

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
    // Verify the user's identity
    const authResult = await verifyPrivyToken(request.headers.get('authorization'))
    
    if (!authResult.success || !authResult.privyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get the user from the token
    const user = await getUserByPrivyId(authResult.privyId)
    
    if (!user) {
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

    // Update database if status changed using admin client
    if (onboardingComplete !== user.stripe_onboarding_complete) {
      await supabaseAdmin
        .from('users')
        .update({ stripe_onboarding_complete: onboardingComplete })
        .eq('id', user.id)
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
