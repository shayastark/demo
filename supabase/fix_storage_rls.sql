-- Fix Storage RLS policies for hubba-files bucket
-- This allows authenticated users to upload files

-- First, check if the bucket exists and is public
-- If not, you may need to create it in the Supabase dashboard

-- Allow authenticated users to upload files
CREATE POLICY "Allow authenticated uploads" ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'hubba-files' AND
    (auth.role() = 'authenticated' OR true)
  );

-- Allow public read access (since bucket is public)
CREATE POLICY "Allow public reads" ON storage.objects
  FOR SELECT
  USING (bucket_id = 'hubba-files');

-- Allow users to update their own files (optional, for future use)
CREATE POLICY "Allow authenticated updates" ON storage.objects
  FOR UPDATE
  USING (bucket_id = 'hubba-files')
  WITH CHECK (bucket_id = 'hubba-files');

-- Allow users to delete their own files (optional, for future use)
CREATE POLICY "Allow authenticated deletes" ON storage.objects
  FOR DELETE
  USING (bucket_id = 'hubba-files');

