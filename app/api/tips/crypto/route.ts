import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { createTipNotification } from '@/lib/notifications'
import { isValidUUID, isValidTxHash } from '@/lib/validation'

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

    // --- Validation ---

    if (!creatorId || !amount || !txHash || !paymentId) {
      return NextResponse.json(
        { error: 'Missing required fields: creatorId, amount, txHash, and paymentId are required' },
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

    // Validate tx hash format
    if (!isValidTxHash(txHash)) {
      return NextResponse.json(
        { error: 'Invalid transaction hash format' },
        { status: 400 }
      )
    }

    // Validate and bound the amount (min $0.01, max $500)
    const parsedAmount = parseFloat(amount)
    if (isNaN(parsedAmount) || parsedAmount < 0.01 || parsedAmount > 500) {
      return NextResponse.json(
        { error: 'Amount must be between $0.01 and $500' },
        { status: 400 }
      )
    }

    // Convert dollar amount to cents for consistency with Stripe tips
    const amountInCents = Math.round(parsedAmount * 100)

    // Sanitize optional text fields
    const sanitizedUsername = tipperUsername ? String(tipperUsername).slice(0, 100) : null
    const sanitizedMessage = message ? String(message).slice(0, 500) : null

    // --- Duplicate prevention ---
    // Check if this txHash has already been recorded to prevent replay attacks
    const { data: existingTip } = await supabaseAdmin
      .from('tips')
      .select('id')
      .eq('stripe_payment_intent_id', txHash)
      .single()

    if (existingTip) {
      return NextResponse.json(
        { error: 'This transaction has already been recorded' },
        { status: 409 }
      )
    }

    // --- Verify creator exists ---
    const { data: creator } = await supabaseAdmin
      .from('users')
      .select('id, wallet_address')
      .eq('id', creatorId)
      .single()

    if (!creator) {
      return NextResponse.json(
        { error: 'Creator not found' },
        { status: 404 }
      )
    }

    // TODO: Add server-side on-chain verification via Daimo Pay API
    // to confirm txHash is a real, completed transaction with the correct
    // amount and recipient before marking as completed.
    // For now, we rely on duplicate prevention and field validation.

    // Insert the tip record
    const { data, error } = await supabaseAdmin
      .from('tips')
      .insert({
        creator_id: creatorId,
        amount: amountInCents,
        currency: 'usdc',
        tipper_username: sanitizedUsername,
        message: sanitizedMessage,
        stripe_payment_intent_id: txHash, // Store tx hash for reference
        stripe_session_id: paymentId, // Store Daimo payment ID for reference
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

    // Create a notification for the creator
    await createTipNotification({
      creatorId,
      amount: amountInCents,
      tipperUsername: sanitizedUsername,
      message: sanitizedMessage,
      currency: 'usdc',
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
