import Stripe from 'stripe'

// Lazy-initialize Stripe to avoid build-time errors when env vars aren't set
let stripeInstance: Stripe | null = null

function getStripeClient(): Stripe {
  if (!stripeInstance) {
    if (!process.env.STRIPE_SECRET_KEY) {
      throw new Error('STRIPE_SECRET_KEY is not set')
    }
    stripeInstance = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: '2025-12-15.clover',
      typescript: true,
    })
  }
  return stripeInstance
}

// Export a proxy that lazily accesses the Stripe client
export const stripe = new Proxy({} as Stripe, {
  get(_, prop) {
    return getStripeClient()[prop as keyof Stripe]
  }
})

// Platform fee percentage (e.g., 5%)
export const PLATFORM_FEE_PERCENT = 5

// Predefined tip amounts
export const TIP_AMOUNTS = [
  { value: 100, label: '$1' },
  { value: 500, label: '$5' },
  { value: 2000, label: '$20' },
  { value: 10000, label: '$100' },
]
