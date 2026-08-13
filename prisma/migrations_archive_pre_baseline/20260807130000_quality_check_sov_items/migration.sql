-- CreateTable
CREATE TABLE "_QualityCheckSOVItems" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "_QualityCheckSOVItems_AB_unique" ON "_QualityCheckSOVItems"("A", "B");

-- CreateIndex
CREATE INDEX "_QualityCheckSOVItems_B_index" ON "_QualityCheckSOVItems"("B");

-- AddForeignKey
ALTER TABLE "_QualityCheckSOVItems" ADD CONSTRAINT "_QualityCheckSOVItems_A_fkey" FOREIGN KEY ("A") REFERENCES "ProjectSOVItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_QualityCheckSOVItems" ADD CONSTRAINT "_QualityCheckSOVItems_B_fkey" FOREIGN KEY ("B") REFERENCES "QualityCheck"("id") ON DELETE CASCADE ON UPDATE CASCADE;
