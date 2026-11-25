-- FocusFlow SQLite Schema
CREATE TABLE IF NOT EXISTS sessions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  mode        TEXT NOT NULL CHECK (mode IN ('focus', 'break')),
  minutes     INTEGER NOT NULL,
  task        TEXT,
  finished_at TEXT NOT NULL,
  local_date  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Seed default settings if not exists
INSERT OR IGNORE INTO settings (key, value) VALUES ('focus_min', '25');
INSERT OR IGNORE INTO settings (key, value) VALUES ('short_break_min', '5');
INSERT OR IGNORE INTO settings (key, value) VALUES ('long_break_min', '15');
