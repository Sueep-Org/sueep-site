-- The day a required lien notice went out, so the ERP can tell whether a job is ready to file.
ALTER TABLE "Project" ADD COLUMN "lienNoticeSentOn" TIMESTAMP(3);
