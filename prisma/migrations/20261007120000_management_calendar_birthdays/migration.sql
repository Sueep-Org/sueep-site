-- Birthdays on the Management calendar, filled from Employee/Contractor dateOfBirth.
INSERT INTO "ManagementCategory" ("id", "updatedAt", "builtinKey", "name", "color", "remindDays", "sortOrder")
VALUES ('mgmtcat_birthdays', CURRENT_TIMESTAMP, 'BIRTHDAYS', 'Birthdays', 'pink', ARRAY[7], 10)
ON CONFLICT DO NOTHING;
