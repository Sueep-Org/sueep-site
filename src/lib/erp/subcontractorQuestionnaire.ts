/** Single source of truth for the subcontractor questionnaire, shared by the
 * public /careers application form (src/app/(marketing)/careers/
 * SubcontractorQuestionnaire.tsx) and its read-only display on the ERP
 * candidate profile (src/app/erp/(shell)/candidates/[id]/
 * SubcontractorInfoSection.tsx). Adding/editing a field here changes both
 * places at once, so the two never drift apart.
 *
 * Every field's submitted form name is `sub_${key}` (see
 * subFieldName below) and lands in CandidateApplication.responses, the
 * existing free-form JSON blob every /careers field not explicitly known by
 * the API route already flows into. No schema change needed. */

export type SubFieldType = "text" | "number" | "textarea" | "yesno" | "select" | "checkboxGroup";

export type SubField = {
  key: string;
  label: string;
  type: SubFieldType;
  /** For "select" and "checkboxGroup". */
  options?: string[];
  optional?: boolean;
  placeholder?: string;
};

export type SubSection = {
  id: string;
  title: string;
  fields: SubField[];
};

/** The literal form field name a SubField's answer is submitted/stored under. */
export function subFieldName(key: string): string {
  return `sub_${key}`;
}

/** Gate field: shown near the top of the careers form, not part of any
 * section above, controls whether the rest of the questionnaire renders. */
export const SUBCONTRACTOR_GATE_FIELD = "sub_isSubcontractor";

export const SUBCONTRACTOR_QUESTIONNAIRE: SubSection[] = [
  {
    id: "company",
    title: "Company Information",
    fields: [
      { key: "legalCompanyName", label: "Legal Company Name", type: "text" },
      { key: "dba", label: "DBA (if applicable)", type: "text", optional: true },
      { key: "federalEin", label: "Federal EIN", type: "text" },
      { key: "businessAddress", label: "Business Address", type: "text" },
      { key: "mailingAddress", label: "Mailing Address (if different)", type: "text", optional: true },
      { key: "primaryContact", label: "Primary Contact", type: "text" },
      { key: "officePhone", label: "Office Phone", type: "text" },
      { key: "cellPhone", label: "Cell Phone", type: "text" },
      { key: "companyEmail", label: "Email", type: "text" },
      { key: "website", label: "Website", type: "text", optional: true },
      { key: "yearBusinessStarted", label: "Year Business Started", type: "number" },
      { key: "numberOfEmployees", label: "Number of Employees", type: "number" },
      { key: "numberOfFieldSupervisors", label: "Number of Field Supervisors", type: "number" },
      { key: "numberOfCrews", label: "Number of Crews", type: "number" },
      { key: "serviceArea", label: "Service Area (States/Cities)", type: "text" },
      { key: "unionStatus", label: "Union or Non-Union?", type: "select", options: ["Union", "Non-Union"] },
      { key: "diverseOwned", label: "Minority/Woman/Veteran Owned?", type: "text", optional: true },
    ],
  },
  {
    id: "experience",
    title: "Company Experience",
    fields: [
      { key: "yearsCommercialPainting", label: "Years performing commercial painting", type: "number" },
      { key: "yearsResidentialPainting", label: "Years performing residential painting", type: "number" },
      { key: "largestProjectCompleted", label: "Largest project completed", type: "text" },
      { key: "largestActiveWorkforceManaged", label: "Largest active workforce managed", type: "text" },
      { key: "averageProjectSize", label: "Average project size", type: "text" },
      { key: "typicalContractSize", label: "Typical contract size", type: "text" },
      { key: "annualRevenue", label: "Annual revenue", type: "text" },
      { key: "projectsCompletedLastYear", label: "Number of projects completed last year", type: "number" },
      {
        key: "marketsServed",
        label: "Markets Served",
        type: "checkboxGroup",
        options: [
          "Multifamily", "Commercial Offices", "Healthcare", "Hospitality", "Retail",
          "Schools", "Government", "Industrial", "New Construction", "Renovations", "Turnovers",
        ],
      },
    ],
  },
  {
    id: "services",
    title: "Services Offered",
    fields: [
      {
        key: "servicesOffered",
        label: "Check all that apply",
        type: "checkboxGroup",
        options: [
          "Interior Painting", "Exterior Painting", "Drywall Repair", "Wall Coverings", "Caulking",
          "Waterproofing", "Epoxy Floors", "Concrete Coatings", "Pressure Washing", "Cabinet Painting",
          "Wood Staining", "Texture Repair", "Parking Garage Coatings", "Line Striping", "High Rise Painting",
          "Lift Work", "Spray Finishes", "Brush/Roll Finishes", "Specialty Coatings",
        ],
      },
    ],
  },
  {
    id: "workforce",
    title: "Workforce",
    fields: [
      { key: "totalEmployees", label: "Total Employees", type: "number" },
      { key: "fullTimeEmployees", label: "Full-Time Employees", type: "number" },
      { key: "partTimeEmployees", label: "Part-Time Employees", type: "number" },
      { key: "crewType", label: "W2 or 1099 crews?", type: "select", options: ["W2", "1099", "Both"] },
      { key: "averageCrewSize", label: "Average crew size", type: "number" },
      { key: "largestCrewAvailable", label: "Largest crew available", type: "number" },
      { key: "manpowerWithin48Hours", label: "Can you provide manpower within 48 hours?", type: "yesno" },
      { key: "employeesSpeakEnglish", label: "Do employees speak English?", type: "yesno" },
      { key: "supervisorsSpeakEnglish", label: "Do supervisors speak English?", type: "yesno" },
    ],
  },
  {
    id: "safety",
    title: "Safety Program",
    fields: [
      { key: "writtenSafetyProgram", label: "Do you have a written safety program?", type: "yesno" },
      { key: "weeklyToolboxTalks", label: "Do you conduct weekly toolbox talks?", type: "yesno" },
      { key: "oshaTraining", label: "Do employees receive OSHA training?", type: "yesno" },
      { key: "ppeWorn", label: "Do employees wear PPE?", type: "yesno" },
      { key: "oshaViolations5yr", label: "Have you had any OSHA violations within the last 5 years?", type: "yesno" },
      { key: "oshaViolationsExplain", label: "If yes, explain", type: "textarea", optional: true },
      { key: "emr", label: "Experience Modification Rate (EMR)", type: "text" },
      { key: "recordableIncidentRate", label: "Recordable Incident Rate (if known)", type: "text", optional: true },
    ],
  },
  {
    id: "insurance",
    title: "Insurance",
    fields: [
      { key: "generalLiabilityCoverage", label: "General Liability Coverage", type: "text" },
      { key: "workersCompensation", label: "Workers Compensation", type: "text" },
      { key: "commercialAuto", label: "Commercial Auto", type: "text" },
      { key: "umbrellaLiability", label: "Umbrella Liability", type: "text" },
      { key: "professionalLiability", label: "Professional Liability (if applicable)", type: "text", optional: true },
      { key: "insuranceAgentName", label: "Insurance Agent Name", type: "text" },
      { key: "insuranceAgentEmail", label: "Insurance Agent Email", type: "text" },
      { key: "insuranceAgentPhone", label: "Insurance Agent Phone", type: "text" },
      { key: "policyExpirationDates", label: "Policy Expiration Dates", type: "text" },
    ],
  },
  {
    id: "licensing",
    title: "Licensing",
    fields: [
      { key: "stateContractorLicenseNumbers", label: "State Contractor License Number(s)", type: "text" },
      { key: "licenseClassification", label: "License Classification", type: "text" },
      { key: "licenseExpirationDate", label: "Expiration Date", type: "text" },
      { key: "statesLicensedIn", label: "States Licensed In", type: "text" },
    ],
  },
  {
    id: "financial",
    title: "Financial Stability",
    fields: [
      { key: "everFiledBankruptcy", label: "Have you ever filed bankruptcy?", type: "yesno" },
      { key: "pendingLitigation", label: "Any pending litigation?", type: "yesno" },
      { key: "liensAgainstCompany", label: "Any liens against your company?", type: "yesno" },
      { key: "canFinancePayroll", label: "Can you finance payroll for 30–60 days?", type: "yesno" },
      { key: "averageMonthlyPayroll", label: "Average monthly payroll", type: "text" },
    ],
  },
  {
    id: "equipment",
    title: "Equipment",
    fields: [
      {
        key: "equipmentOwned",
        label: "Check all equipment owned",
        type: "checkboxGroup",
        options: [
          "Extension Ladders", "Scaffolding", "Boom Lift", "Scissor Lift", "Pressure Washer",
          "Airless Sprayers", "HVLP Sprayers", "Floor Grinders", "HEPA Vacuums", "Drywall Sanders",
          "Company Vehicles", "Box Trucks",
        ],
      },
    ],
  },
  {
    id: "quality",
    title: "Quality Control",
    fields: [
      { key: "dedicatedSuperintendent", label: "Do you have a dedicated superintendent?", type: "yesno" },
      { key: "completePunchLists", label: "Do you complete punch lists?", type: "yesno" },
      { key: "internalQualityInspections", label: "Do you perform internal quality inspections?", type: "yesno" },
      { key: "whoSignsOffWork", label: "Who signs off completed work?", type: "text" },
      { key: "warrantyCallsHandled", label: "How are warranty calls handled?", type: "textarea" },
    ],
  },
];

/** Fields dropped from the Contractor profile's manual-entry form (but kept
 * in the full questionnaire above) because they now have their own
 * dedicated, editable home elsewhere on the profile — asking for them here
 * too just gives staff two answers for the same thing that never sync.
 * /careers applicants and linked CandidateApplication records still answer
 * the real questionnaire in full; this only narrows the manual fallback. */
const CONTRACTOR_MANUAL_EXCLUDED_FIELDS = new Set([
  "primaryContact", // -> Contractor.contractorFullName (Personal information section)
  "officePhone", // -> Contractor.phone (Personal information section)
  "cellPhone", // -> Contractor.phone (Personal information section)
  "companyEmail", // -> Contractor.email (General Info tab)
  "businessAddress", // -> Contractor.address (Personal information section)
  "mailingAddress", // -> Contractor.address (Personal information section)
  "workersCompensation", // -> structured Insurance & Workers Comp section
  "policyExpirationDates", // -> workersCompExpiresAt in the Insurance & Workers Comp section
]);

/** The compliance-critical subset staff can manually enter on a Contractor
 * profile when there's no linked CandidateApplication to pull this from —
 * see ContractorQuestionnaireCard and the questionnaireFields prop on
 * ContractorInsuranceSection. All fields here are "text" / "number" /
 * "select", which keeps their field renderers simple. */
export const CONTRACTOR_MANUAL_SECTIONS: SubSection[] = SUBCONTRACTOR_QUESTIONNAIRE.filter((s) =>
  ["company", "insurance", "licensing"].includes(s.id)
).map((s) => ({ ...s, fields: s.fields.filter((f) => !CONTRACTOR_MANUAL_EXCLUDED_FIELDS.has(f.key)) }));
