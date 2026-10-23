import type { OfferSection } from "./offerLetters";

/**
 * The two letters Sueep used before offer letters moved into the ERP
 * (Software Engineer and Estimator, 2026). "Add starter templates" on the
 * Offer templates page creates any of these that don't exist yet by name.
 */

const AT_WILL =
  "Please note that your employment with Sueep LLC is **at-will**, meaning either you or the company may terminate the employment relationship at any time, with or without cause or notice.";

const POSITION_DETAILS = [
  "- **Title:** {title}",
  "- **Employment Type:** {employmentType}",
  "- **Start Date:** {startDate}",
  "- **Reports To:** {reportsTo}",
].join("\n");

type Starter = { name: string; description: string; sections: OfferSection[] };

export const STARTER_TEMPLATES: Starter[] = [
  {
    name: "Standard",
    description: "Salary and benefits, hybrid office days, trial period. No commission.",
    sections: [
      { key: "header", title: "", kind: "text", enabled: true, body: "**Employment Offer Letter**\n\n**{firstName},**" },
      {
        key: "intro",
        title: "",
        kind: "text",
        enabled: true,
        body:
          "We are pleased to extend this offer of employment for the position of **{title}** with **Sueep**. We are excited about the potential for you to join our growing team and help expand our footprint in the commercial cleaning and painting division. Your position will be {workMode}, reporting to our office located at:\n\n" +
          "**{officeAddress} - This position will require in-office {inOfficeDays} days per week.**",
      },
      { key: "position", title: "Position Details", kind: "text", enabled: true, body: POSITION_DETAILS },
      {
        key: "compensation",
        title: "Compensation and Benefits",
        kind: "text",
        enabled: true,
        body: [
          "Your base salary will be based on **{salary} annually**. Your package also includes health and insurance benefits.",
          "",
          "- **Health Insurance** 25% Sueep contribution via Independence Blue Cross",
          "- **15 Days Paid Time Off (PTO)** per calendar year, (4.62 hours accrued monthly)",
          "- **Paid Company Holidays** in accordance with company policy",
        ].join("\n"),
      },
      {
        key: "expectations",
        title: "Performance and Expectations",
        kind: "text",
        enabled: true,
        body:
          "This position is offered with an initial **{trialDays}-day trial period,** during which your performance and fit for the role will be evaluated.\n\n" +
          "Your primary focus will be on developing technology solutions and systems for the already established Sueep Business. You are expected to represent Sueep LLC professionally and maintain a consistent organization through proactive innovation, development, and execution.",
      },
      { key: "at-will", title: "At-Will Employment", kind: "text", enabled: true, body: AT_WILL },
      {
        key: "acknowledgment",
        title: "Acknowledgment",
        kind: "text",
        enabled: true,
        body:
          "We believe you will make a significant contribution to Sueep's continued growth and success. Please confirm your acceptance of this offer by signing and returning this letter by {signByDate}.\n\n" +
          "We look forward to welcoming you to the team.",
      },
      { key: "signatures", title: "", kind: "signature", enabled: true, body: "Sincerely," },
    ],
  },
  {
    name: "With commission",
    description: "Salary and benefits plus the commission ladder, accelerators and margin tiers.",
    sections: [
      {
        key: "header",
        title: "",
        kind: "text",
        enabled: true,
        body: [
          "**Sueep**",
          "",
          "3500 Scotts Lane Unit F22",
          "Philadelphia, Pennsylvania, 19129",
          "",
          "contact@sueep.com | www.sueep.com",
          "",
          "**{today}**",
          "",
          "**{firstName}**,",
        ].join("\n"),
      },
      {
        key: "intro",
        title: "",
        kind: "text",
        enabled: true,
        body: "We are pleased to extend this offer of employment for the position of **{title}** with **Sueep**. We are excited about the potential of having you join our growing team and contribute to expanding our footprint in the commercial painting division.",
      },
      { key: "position", title: "Position Details", kind: "text", enabled: true, body: POSITION_DETAILS },
      {
        key: "compensation",
        title: "Compensation and Benefits",
        kind: "text",
        enabled: true,
        body: [
          "Your annual base salary will be {salary}. Your package also includes health insurance benefits and PTO.",
          "",
          "In addition, you will be eligible for a **commission structure** based on the profitability of the contracts you close. Details of the commission plan, including tiered percentages and performance expectations, are set out in the **Commission Plan Agreement below**.",
          "",
          "You will also receive:",
          "",
          "- **Health Insurance Coverage** - Independence Blue Cross (effective after standard waiting period) Sueep will cover up to 25%",
          "- **15 Days Paid Time Off (PTO)** per calendar year, accrued monthly",
          "- **Paid Company Holidays** in accordance with company policy",
        ].join("\n"),
      },
      {
        key: "commission",
        title: "",
        kind: "commission",
        enabled: true,
        body: "Sueep Sales Performance Ladder - {salary} Base with {commissionRate} commission on profit\n\nCommercial Painting",
      },
      {
        key: "expectations",
        title: "Performance and Expectations",
        kind: "text",
        enabled: true,
        body: "Your primary focus will be on acquiring, estimating, and managing new commercial painting contracts. You are expected to represent Sueep LLC professionally and maintain a consistent bidding pipeline through proactive outreach, relationship building, and client retention.",
      },
      { key: "at-will", title: "At-Will Employment", kind: "text", enabled: true, body: AT_WILL },
      {
        key: "acknowledgment",
        title: "Acknowledgment",
        kind: "text",
        enabled: true,
        body:
          "To confirm your acceptance of this offer, please sign and return this letter by {signByDate}.\n\n" +
          "We look forward to having you as part of the Sueep team and are confident that your contribution will play an important role in our continued success.",
      },
      { key: "signatures", title: "", kind: "signature", enabled: true, body: "Sincerely," },
    ],
  },
];

/** A new blank template: one text section and the signatures. */
export function emptyTemplateSections(): OfferSection[] {
  return [
    { key: "intro", title: "", kind: "text", enabled: true, body: "**{firstName},**\n\nWe are pleased to extend this offer of employment for the position of **{title}** with **Sueep**." },
    { key: "signatures", title: "", kind: "signature", enabled: true, body: "Sincerely," },
  ];
}

export const DEFAULT_SIGNER = { name: "Edwin Giraldo", title: "Managing Partner" };
