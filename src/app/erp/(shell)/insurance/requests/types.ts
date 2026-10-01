export type RequestRow = {
  id: string;
  createdAt: string;
  status: string;
  projectId: string | null;
  projectTitle: string | null;
  projectText: string | null;
  requesterName: string;
  requesterCompany: string | null;
  requesterEmail: string;
  requesterPhone: string | null;
  neededBy: string | null;
  /** matchedId/matchedName: the Certificate Holders profile with the same name, if any */
  holders: { name: string; address: string | null; matchedId: string | null; matchedName: string | null }[];
  reqGlOccurrenceCents: number | null;
  reqGlAggregateCents: number | null;
  reqAutoCents: number | null;
  reqUmbrellaCents: number | null;
  reqWcEmployersLiabilityCents: number | null;
  requiresAdditionalInsured: boolean;
  requiresWaiverOfSubrogation: boolean;
  requiresPrimaryNoncontributory: boolean;
  additionalInsureds: string | null;
  specialWording: string | null;
  notes: string | null;
  hasSample: boolean;
  coiCount: number;
};
