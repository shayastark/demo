import Stripe from 'stripe'

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('STRIPE_SECRET_KEY is not set')
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2025-12-15.clover',
  typescript: true,
})

// Platform fee percentage (e.g., 5%)
export const PLATFORM_FEE_PERCENT = 5

// Predefined tip amounts
export const TIP_AMOUNTS = [
  { value: 300, label: '$3' },
  { value: 500, label: '$5' },
  { value: 1000, label: '$10' },
  { value: 2000, label: '$20' },
]

