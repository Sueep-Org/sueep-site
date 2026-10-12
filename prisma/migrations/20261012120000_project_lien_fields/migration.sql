-- What the lien filing deadline on a job depends on: the state, who hired Sueep, the kind of property, and the last day of work.
ALTER TABLE "Project" ADD COLUMN "lienState" TEXT;
ALTER TABLE "Project" ADD COLUMN "lienRole" TEXT;
ALTER TABLE "Project" ADD COLUMN "lienResidential" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Project" ADD COLUMN "lienLastWorkDate" TIMESTAMP(3);
