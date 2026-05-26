-- Persist the Claude Agent SDK's own session id alongside our episodic session.
-- The SDK keeps the full conversation transcript keyed by this id; passing it
-- back as `options.resume` on subsequent turns is what gives a chat
-- multi-turn coherence. Without it every turn was stateless and the coach
-- would "forget" things said earlier in the same conversation.
ALTER TABLE sessions ADD COLUMN sdk_session_id TEXT;
