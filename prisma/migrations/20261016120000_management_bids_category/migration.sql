-- Bids category on the Management calendar: bid due dates and job walks from
-- HubSpot, reminders 3 days and 1 day before. Adds one row only.
INSERT INTO "ManagementCategory" ("id", "updatedAt", "builtinKey", "name", "color", "remindDays", "sortOrder")
VALUES ('mgmtcat_bids', CURRENT_TIMESTAMP, 'BIDS', 'Bids', 'indigo', ARRAY[3, 1]::INTEGER[], 10)
ON CONFLICT ("builtinKey") DO NOTHING;
