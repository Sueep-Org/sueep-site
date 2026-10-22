-- Job brief contacts as rows (name, role, email, phone). The old "contacts" text column is kept.
ALTER TABLE "ProjectWorkOrderRecord" ADD COLUMN "contactList" JSONB;
