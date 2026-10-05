-- Work anniversaries were dropped from the Management calendar. Moves any
-- events someone filed under it to Other first so the delete can't fail.
UPDATE "ManagementEvent" SET "categoryId" = 'mgmtcat_other'
WHERE "categoryId" IN (SELECT "id" FROM "ManagementCategory" WHERE "builtinKey" = 'ANNIVERSARIES')
  AND EXISTS (SELECT 1 FROM "ManagementCategory" WHERE "id" = 'mgmtcat_other');

DELETE FROM "ManagementCategory" WHERE "builtinKey" = 'ANNIVERSARIES'
  AND NOT EXISTS (SELECT 1 FROM "ManagementEvent" e WHERE e."categoryId" = "ManagementCategory"."id");
