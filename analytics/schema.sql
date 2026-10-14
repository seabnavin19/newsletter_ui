-- One row per page view / event. `visitor` is a salted hash that changes every
-- day, so it can count unique visitors per day but can't be traced to an IP.
CREATE TABLE IF NOT EXISTS hits (
  day      TEXT    NOT NULL,          -- YYYY-MM-DD (UTC)
  ts       INTEGER NOT NULL,          -- unix ms
  type     TEXT    NOT NULL,          -- view | audio_play | share | story_video
  visitor  TEXT    NOT NULL,
  path     TEXT,
  ref      TEXT,                      -- referring site, e.g. tiktok.com
  country  TEXT,
  device   TEXT                       -- mobile | desktop
);
CREATE INDEX IF NOT EXISTS hits_day ON hits (day, type);
