-- Short PIN (4–6 digits, stored hashed) for temporary privilege elevation on a device.
ALTER TABLE users ADD COLUMN IF NOT EXISTS pin_hash TEXT;
