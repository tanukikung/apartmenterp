-- HIGH-69 fix: Add CASCADE delete on Conversation.lineUserId to clean up orphaned
-- conversations and their messages when a LINE user account is deleted.
-- Previously no cascade was defined, causing orphaned conversation records.
ALTER TABLE "conversations" DROP CONSTRAINT IF EXISTS "Conversation_lineUserId_fkey";
ALTER TABLE "conversations" ADD CONSTRAINT "Conversation_lineUserId_fkey"
  FOREIGN KEY ("lineUserId") REFERENCES "line_users"("id") ON DELETE CASCADE;