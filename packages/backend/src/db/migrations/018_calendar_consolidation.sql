-- Consolidate gamechanger + sportsengine entries into unified 'calendar' integration
UPDATE integration_entries
SET integration = 'calendar', updated_at = NOW()
WHERE integration IN ('gamechanger', 'sportsengine');

DELETE FROM integration_configs WHERE id IN ('gamechanger', 'sportsengine');
