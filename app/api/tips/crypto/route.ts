import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export async function POST(request: NextRequest) {
  try {
    const { 
      creatorId, 
      amount, 
      tipperUsername,
      message,
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
    const { data, error } = await supabaseAdmin
      .from('tips')
      .insert({
        creator_id: creatorId,
        amount: amountInCents,
        currency: 'usdc',
        tipper_username: tipperUsername || null,
        message: message || null,
        stripe_payment_intent_id: txHash || null, // Store tx hash for reference
        stripe_session_id: paymentId || null, // Store payment ID for reference
        status: 'completed',
        is_read: false,
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
