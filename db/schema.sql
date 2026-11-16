-- Schéma SQLite officiel de l'application Doolee
-- Stocke uniquement les métadonnées et références des templates graphiques.
-- Aucune photographie utilisateur n'est jamais enregistrée dans cette base.

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS app_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  filename TEXT NOT NULL UNIQUE,
  mime_type TEXT NOT NULL CHECK (mime_type IN ('image/png', 'image/jpeg', 'image/webp')),
  file_size INTEGER NOT NULL CHECK (file_size > 0),
  width INTEGER NOT NULL CHECK (width > 0),
  height INTEGER NOT NULL CHECK (height > 0),
  frame_x INTEGER NOT NULL CHECK (frame_x >= 0),
  frame_y INTEGER NOT NULL CHECK (frame_y >= 0),
  frame_width INTEGER NOT NULL CHECK (frame_width > 0),
  frame_height INTEGER NOT NULL CHECK (frame_height > 0),
  frame_shape TEXT NOT NULL DEFAULT 'rect' CHECK (frame_shape IN ('rect', 'rounded', 'circle')),
  layer_mode TEXT NOT NULL DEFAULT 'behind' CHECK (layer_mode IN ('behind', 'front')),
  is_sample INTEGER NOT NULL DEFAULT 0 CHECK (is_sample IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_templates_updated_at ON templates (updated_at DESC);
