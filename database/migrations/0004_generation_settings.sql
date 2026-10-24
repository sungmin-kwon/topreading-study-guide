-- Admin is the source of editable generation settings. Upgrade the previous
-- default once, instead of translating it invisibly on every runtime read.
UPDATE app_settings SET value='gpt-6-luna', updated_at=now()
WHERE key='OPENAI_MODEL' AND value='gpt-5-mini';
INSERT INTO app_settings(key,value) VALUES
  ('OPENAI_MODEL','gpt-6-luna'),
  ('MAX_GENERATION_CHAPTERS','80'),
  ('MAX_GENERATION_ITEMS','2500')
ON CONFLICT(key) DO NOTHING;
