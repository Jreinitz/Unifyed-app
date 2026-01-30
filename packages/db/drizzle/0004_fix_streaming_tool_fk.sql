-- Fix streaming_tool_connections to reference profiles instead of creators
-- This is needed because auth now uses profiles table (Supabase Auth)

-- Drop the old foreign key constraint
ALTER TABLE "streaming_tool_connections" 
DROP CONSTRAINT IF EXISTS "streaming_tool_connections_creator_id_creators_id_fk";

-- Add new foreign key constraint to profiles
ALTER TABLE "streaming_tool_connections" 
ADD CONSTRAINT "streaming_tool_connections_creator_id_profiles_id_fk" 
FOREIGN KEY ("creator_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;
