-- Create tips table to track incoming tips
CREATE TABLE IF NOT EXISTS tips (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  creator_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL, -- Amount in cents
  currency TEXT DEFAULT 'usd',
  tipper_email TEXT,
  message TEXT,
  stripe_payment_intent_id TEXT,
  stripe_session_id TEXT,
  status TEXT DEFAULT 'completed',
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_tips_creator_id ON tips(creator_id);
CREATE INDEX IF NOT EXISTS idx_tips_created_at ON tips(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tips_unread ON tips(creator_id, is_read) WHERE is_read = false;

-- Enable RLS
ALTER TABLE tips ENABLE ROW LEVEL SECURITY;

-- Allow anyone to insert tips (webhook needs this)
CREATE POLICY "Allow insert tips"
ON tips FOR INSERT
WITH CHECK (true);

-- Allow creators to view their own tips
CREATE POLICY "Creators can view own tips"
ON tips FOR SELECT
USING (true);

-- Allow creators to update their own tips (mark as read)
CREATE POLICY "Creators can update own tips"
ON tips FOR UPDATE
USING (true)
WITH CHECK (true);

