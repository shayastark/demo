import { NextRequest, NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe'
import { supabase } from '@/lib/supabase'
import Stripe from 'stripe'

export async function POST(request: NextRequest) {
  const body = await request.text()
  const signature = request.headers.get('stripe-signature')

  if (!signature) {
    return NextResponse.json({ error: 'No signature' }, { status: 400 })
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
  if (!webhookSecret) {
    console.error('STRIPE_WEBHOOK_SECRET is not set')
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 })
  }

  let event: Stripe.Event

  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret)
  } catch (err) {
    console.error('Webhook signature verification failed:', err)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        
        if (session.metadata?.type === 'tip') {
          // Get message from payment intent metadata
          let message = null
          if (session.payment_intent) {
            const paymentIntent = await stripe.paymentIntents.retrieve(session.payment_intent as string)
            message = paymentIntent.metadata?.message || null
          }
          
          // Store tip in database (email captured for records, username for display)
          const { error: tipError } = await supabase
            .from('tips')
            .insert({
              creator_id: session.metadata.creator_id,
              amount: session.amount_total,
              currency: session.currency || 'usd',
              tipper_email: session.customer_email || null,
              tipper_username: session.metadata.tipper_username || null,
              message: message,
              stripe_session_id: session.id,
              stripe_payment_intent_id: session.payment_intent as string || null,
              status: 'completed',
            })

          if (tipError) {
            console.error('Error saving tip to database:', tipError)
          }
        }
        break
      }

      case 'payment_intent.succeeded': {
        const paymentIntent = event.data.object as Stripe.PaymentIntent
        console.log('Payment succeeded:', paymentIntent.id)
        break
      }

      case 'account.updated': {
        const account = event.data.object as Stripe.Account
        
        // Update onboarding status when account is updated
        if (account.details_submitted && account.charges_enabled) {
          const { error } = await supabase
            .from('users')
            .update({ stripe_onboarding_complete: true })
            .eq('stripe_account_id', account.id)

          if (error) {
            console.error('Error updating onboarding status:', error)
          } else {
            console.log('Creator onboarding completed:', account.id)
          }
        }
        break
      }

      case 'payout.paid': {
        const payout = event.data.object as Stripe.Payout
        console.log('Payout completed:', payout.id, payout.amount)
        break
      }

      default:
        console.log('Unhandled event type:', event.type)
    }

    return NextResponse.json({ received: true })
  } catch (error) {
    console.error('Error processing webhook:', error)
    return NextResponse.json(
      { error: 'Webhook handler failed' },
      { status: 500 }
    )
  }
}

// Disable body parsing for webhook (we need raw body for signature verification)
export const config = {
  api: {
    bodyParser: false,
  },
}

