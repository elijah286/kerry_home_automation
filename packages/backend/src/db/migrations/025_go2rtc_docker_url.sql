-- go2rtc now runs as a Docker Compose service. Update any UniFi Protect
-- entries still pointing at localhost:1984 to use the Docker DNS name.
UPDATE integration_entries
SET config = jsonb_set(config, '{go2rtc_url}', '"http://go2rtc:1984"'),
    updated_at = NOW()
WHERE integration = 'unifi'
  AND config->>'go2rtc_url' IN ('http://localhost:1984', 'http://127.0.0.1:1984');
