-- MisterWatch Admin + Knowledge Base — PostgreSQL / Neon
-- Run in Neon SQL Editor or: psql "$DATABASE_URL" -f schema.sql

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS admin_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(320) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  display_name VARCHAR(160),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE admin_users IS 'Administrator accounts for the dashboard; password_hash is bcrypt (cost 12 from seed).';
COMMENT ON COLUMN admin_users.email IS 'Login identifier, stored lowercase; unique.';
COMMENT ON COLUMN admin_users.password_hash IS 'bcrypt hash; never store plaintext passwords.';
COMMENT ON COLUMN admin_users.is_active IS 'If false, login is denied.';

CREATE TABLE IF NOT EXISTS knowledge_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(512) NOT NULL,
  slug VARCHAR(512),
  category VARCHAR(128) NOT NULL DEFAULT 'general',
  content TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_knowledge_active ON knowledge_entries (is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_knowledge_category ON knowledge_entries (category);
CREATE INDEX IF NOT EXISTS idx_knowledge_priority ON knowledge_entries (priority DESC);
CREATE INDEX IF NOT EXISTS idx_knowledge_created ON knowledge_entries (created_at DESC);

-- Optional: lightweight volume signal for dashboard (populated if you log from /chat later)
CREATE TABLE IF NOT EXISTS chat_events (
  id BIGSERIAL PRIMARY KEY,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_message_chars INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_chat_events_day ON chat_events (occurred_at DESC);

-- Online booking / Buchungsanfragen (Chat-Leads)
CREATE TABLE IF NOT EXISTS booking_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  watch_model VARCHAR(512) NOT NULL,
  quality_tier VARCHAR(64),
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  customer_name VARCHAR(200),
  email VARCHAR(320),
  phone VARCHAR(80),
  shipping_address TEXT,
  city VARCHAR(120),
  postal_code VARCHAR(32),
  country VARCHAR(80),
  notes TEXT,
  status VARCHAR(32) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'cancelled', 'done')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_booking_status ON booking_requests (status);
CREATE INDEX IF NOT EXISTS idx_booking_created ON booking_requests (created_at DESC);

-- Support / Kontakt / allgemeine Anfragen + Leads (Quelle Chat)
CREATE TABLE IF NOT EXISTS inquiries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inquiry_type VARCHAR(32) NOT NULL DEFAULT 'general' CHECK (inquiry_type IN ('general', 'support', 'lead')),
  subject VARCHAR(300),
  message TEXT NOT NULL,
  customer_name VARCHAR(200),
  email VARCHAR(320),
  phone VARCHAR(80),
  address_line VARCHAR(400),
  city VARCHAR(120),
  postal_code VARCHAR(32),
  country VARCHAR(80),
  status VARCHAR(32) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'archived')),
  admin_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inquiries_status ON inquiries (status);
CREATE INDEX IF NOT EXISTS idx_inquiries_type ON inquiries (inquiry_type);
CREATE INDEX IF NOT EXISTS idx_inquiries_created ON inquiries (created_at DESC);

-- Feedback aus dem Chat
CREATE TABLE IF NOT EXISTS feedback_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT,
  suggestion TEXT,
  email VARCHAR(320),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_feedback_rating ON feedback_entries (rating);
CREATE INDEX IF NOT EXISTS idx_feedback_created ON feedback_entries (created_at DESC);

-- Chatbot Theme (öffentlich lesbar ohne Auth)
CREATE TABLE IF NOT EXISTS chatbot_theme (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  theme JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO chatbot_theme (id, theme) VALUES (
  1,
  '{
    "bg": "#0a0a0a",
    "surface": "#111111",
    "card": "#181818",
    "border": "#2a2a2a",
    "accent": "#22c55e",
    "text": "#f5f5f5",
    "textDim": "#888888",
    "userBubble": "#22c55e",
    "botBubble": "#1e1e1e"
  }'::jsonb
) ON CONFLICT (id) DO NOTHING;

-- ───────────────────────────────────────────────────────────────────────────
-- Manual admin user (Supabase / psql): login checks password_hash with bcrypt.
-- Requires pgcrypto (created above). Use lowercase email. Never paste production
-- passwords into shared chat logs — run this only in your own SQL editor.
--
-- INSERT INTO admin_users (email, password_hash, display_name)
-- VALUES (
--   lower(trim('you@example.com')),
--   crypt('YourPasswordHereMin8Chars', gen_salt('bf', 12)),
--   'Admin'
-- )
-- ON CONFLICT (email) DO UPDATE SET
--   password_hash = EXCLUDED.password_hash,
--   is_active = TRUE,
--   updated_at = NOW();

