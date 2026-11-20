-- ============================================================================
-- LEKALO ZHIIDE — STAGE 4.5.9B: MANUAL PASSWORD RESET TOKENS MIGRATION
-- Target Database: lekalo_test (PostgreSQL 18+ / Neon)
-- Security: Stores ONLY SHA-256 hashes of reset tokens. Never stores raw tokens.
-- Lifecycle: TTL 15 minutes, single-use enforced by is_used flag.
-- ============================================================================

-- 1. Create table password_reset_tokens
CREATE TABLE IF NOT EXISTS "password_reset_tokens" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "token_hash" VARCHAR(255) NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "is_used" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- 2. Create unique index for token_hash lookup and collision prevention
CREATE UNIQUE INDEX IF NOT EXISTS "password_reset_tokens_token_hash_key" 
ON "password_reset_tokens"("token_hash");

-- 3. Create index for fast user-specific token filtering and cleanup
CREATE INDEX IF NOT EXISTS "password_reset_tokens_user_id_idx" 
ON "password_reset_tokens"("user_id");

-- 4. Add foreign key referencing users(id) with CASCADE delete/update
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'password_reset_tokens_user_id_fkey'
    ) THEN
        ALTER TABLE "password_reset_tokens"
        ADD CONSTRAINT "password_reset_tokens_user_id_fkey"
        FOREIGN KEY ("user_id") REFERENCES "users"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END
$$;
