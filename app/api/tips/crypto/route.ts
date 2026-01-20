import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function POST(request: NextRequest) {
  try {
    const { 
      creatorId, 
      amount, 
      tipperUsername,
      paymentId,
      txHash,
      chainId,
    } = await request.json()

    if (!creatorId || !amount) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    // Convert dollar amount to cents for consistency with Stripe tips
    const amountInCents = Math.round(parseFloat(amount) * 100)

    // Insert the tip record
    const { data, error } = await supabase
      .from('tips')
      .insert({
        creator_id: creatorId,
        amount: amountInCents,
        currency: 'usdc',
        tipper_username: tipperUsername || null,
        message: null,
        stripe_payment_intent_id: null,
        stripe_session_id: null,
        status: 'completed',
        is_read: false,
        is_anonymous: !tipperUsername,
        // Store crypto-specific data in a way that's compatible with existing schema
        // Using stripe_session_id field to store payment reference
        // In future, could add dedicated crypto columns
      })
      .select()
      .single()

    if (error) {
      console.error('Error recording crypto tip:', error)
      return NextResponse.json(
        { error: 'Failed to record tip' },
        { status: 500 }
      )
    }

    console.log('Crypto tip recorded:', {
      tipId: data.id,
      creatorId,
      amount: amountInCents,
      paymentId,
      txHash,
      chainId,
    })

    return NextResponse.json({ success: true, tipId: data.id })
  } catch (error) {
    console.error('Error in crypto tip endpoint:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
