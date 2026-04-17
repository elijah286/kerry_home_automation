-- Correct Anthropic model IDs that were stored with the wrong date-suffix
-- format (e.g. claude-sonnet-4-20250514) to the correct API names.
UPDATE system_settings
SET value = '"claude-sonnet-4-6"',
    updated_at = NOW()
WHERE key = 'llm_anthropic_model'
  AND (value::text ILIKE '%claude-sonnet-4-2%' OR value::text = '"claude-sonnet-4-20250514"');

UPDATE system_settings
SET value = '"claude-opus-4-6"',
    updated_at = NOW()
WHERE key = 'llm_anthropic_model'
  AND (value::text ILIKE '%claude-opus-4-2%' OR value::text = '"claude-opus-4-20250514"');

UPDATE system_settings
SET value = '"claude-haiku-4-5"',
    updated_at = NOW()
WHERE key = 'llm_anthropic_model'
  AND (value::text ILIKE '%claude-haiku-4-2%' OR value::text = '"claude-haiku-4-20250514"');
