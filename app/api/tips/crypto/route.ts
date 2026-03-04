import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { createTipNotification } from '@/lib/notifications'
import { isValidUUID, isValidTxHash } from '@/lib/validation'
import { verifyPrivyToken, getUserByPrivyId } from '@/lib/auth'

let cachedHasTipSupportColumns: boolean | null = null

async function hasTipSupportColumns(): Promise<boolean> {
  if (cachedHasTipSupportColumns !== null) return cachedHasTipSupportColumns

  const { data: columns, error } = await supabaseAdmin
    .from('information_schema.columns')
    .select('column_name')
    .eq('table_schema', 'public')
    .eq('table_name', 'tips')
    .in('column_name', ['project_id', 'tipper_user_id'])

  if (error) {
    cachedHasTipSupportColumns = false
    return cachedHasTipSupportColumns
  }

  const names = new Set((columns || []).map((column) => column.column_name))
  cachedHasTipSupportColumns = names.has('project_id') && names.has('tipper_user_id')
  return cachedHasTipSupportColumns
}

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
      projectId,
    } = await request.json()

    const authResult = await verifyPrivyToken(request.headers.get('authorization'))
    const authenticatedUser =
      authResult.success && authResult.privyId ? await getUserByPrivyId(authResult.privyId) : null

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
    const insertPayload: Record<string, unknown> = {
      creator_id: creatorId,
      amount: amountInCents,
      currency: 'usdc',
      tipper_username: sanitizedUsername,
      message: sanitizedMessage,
      stripe_payment_intent_id: txHash, // Store tx hash for reference
      stripe_session_id: paymentId, // Store Daimo payment ID for reference
      status: 'completed',
      is_read: false,
    }

    if (await hasTipSupportColumns()) {
      insertPayload.project_id = typeof projectId === 'string' && isValidUUID(projectId) ? projectId : null
      insertPayload.tipper_user_id = authenticatedUser?.id || null
    }

    const { data, error } = await supabaseAdmin
      .from('tips')
      .insert(insertPayload)
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
