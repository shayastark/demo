-- Add notifications table for in-app notifications
-- Run this in your Supabase SQL Editor

-- Create the notifications table
CREATE TABLE IF NOT EXISTS notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL, -- 'tip_received', 'project_saved', 'new_follower', etc.
  title VARCHAR(255) NOT NULL,
  message TEXT,
  data JSONB DEFAULT '{}', -- Additional data (tip amount, tipper name, project id, etc.)
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  read_at TIMESTAMP WITH TIME ZONE
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications(user_id, is_read) WHERE is_read = false;
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);

-- Enable Row Level Security
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- RLS policy: Users can only read their own notifications
CREATE POLICY "Users can read own notifications"
  ON notifications
  FOR SELECT
  USING (auth.uid()::text = user_id::text OR user_id IN (
    SELECT id FROM users WHERE privy_id = auth.uid()::text
  ));

-- Note: Inserts/updates will be done via service role key in API routes

-- Enable Realtime for this table
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;

-- Grant necessary permissions for realtime
GRANT SELECT ON notifications TO authenticated;
GRANT SELECT ON notifications TO anon;
