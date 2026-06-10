export type ChecklistItem = { id: string; label: string };
export type ChecklistSubsection = { id: string; title: string; items: ChecklistItem[] };
export type ChecklistSection = { id: string; title: string; subsections: ChecklistSubsection[] };

export const UNIT_CHECKLIST_SECTIONS: ChecklistSection[] = [
  {
    id: "entry",
    title: "1. Entry & Safety",
    subsections: [
      {
        id: "entry-general",
        title: "General",
        items: [
          { id: "entry-vacant", label: "Unit vacant" },
          { id: "entry-utilities", label: "Utilities operational" },
          { id: "entry-belongings", label: "No personal belongings left behind" },
          { id: "entry-damages", label: "Report damages to supervisor" },
          { id: "entry-lockbox", label: "Lockbox/key returned" },
        ],
      },
      {
        id: "entry-trash",
        title: "Trash Removal",
        items: [
          { id: "trash-remove", label: "Remove all trash" },
          { id: "trash-food", label: "Remove food/debris" },
          { id: "trash-cabinets", label: "Empty all cabinets of remaining items" },
          { id: "trash-abandoned", label: "Dispose of abandoned belongings per client instructions" },
        ],
      },
    ],
  },
  {
    id: "kitchen",
    title: "2. Kitchen",
    subsections: [
      {
        id: "kitchen-fridge",
        title: "Refrigerator",
        items: [
          { id: "fridge-exterior", label: "Exterior cleaned" },
          { id: "fridge-shelves", label: "Interior shelves cleaned" },
          { id: "fridge-drawers", label: "Drawers cleaned" },
          { id: "fridge-freezer", label: "Freezer cleaned" },
          { id: "fridge-under", label: "Under the refrigerator cleaned (if accessible)" },
          { id: "fridge-behind", label: "Move the refrigerator and clean behind it (if accessible)" },
        ],
      },
      {
        id: "kitchen-oven",
        title: "Oven / Range",
        items: [
          { id: "oven-interior", label: "Interior cleaned" },
          { id: "oven-exterior", label: "Exterior cleaned" },
          { id: "oven-burners", label: "Burner tops cleaned" },
          { id: "oven-panel", label: "Control panel cleaned" },
        ],
      },
      {
        id: "kitchen-microwave",
        title: "Microwave",
        items: [
          { id: "micro-interior", label: "Interior cleaned" },
          { id: "micro-exterior", label: "Exterior cleaned" },
        ],
      },
      {
        id: "kitchen-dishwasher",
        title: "Dishwasher",
        items: [
          { id: "dw-interior", label: "Interior cleaned" },
          { id: "dw-exterior", label: "Exterior wiped" },
        ],
      },
      {
        id: "kitchen-cabinets",
        title: "Cabinets & Countertops",
        items: [
          { id: "cab-fronts", label: "Cabinet fronts wiped" },
          { id: "cab-interior", label: "Cabinet interiors wiped" },
          { id: "counter-sanitized", label: "Countertops sanitized" },
          { id: "backsplash", label: "Backsplash cleaned" },
        ],
      },
      {
        id: "kitchen-sink",
        title: "Sink Area",
        items: [
          { id: "k-sink", label: "Sink cleaned" },
          { id: "k-faucet", label: "Faucet polished" },
          { id: "k-drain", label: "Drain free of debris" },
        ],
      },
      {
        id: "kitchen-floors",
        title: "Floors",
        items: [
          { id: "k-swept", label: "Swept" },
          { id: "k-vac-edges", label: "Vacuumed edges" },
          { id: "k-mopped", label: "Mopped" },
          { id: "k-stains", label: "Remove stains, compound, debris, etc (if possible)" },
        ],
      },
    ],
  },
  {
    id: "bathroom",
    title: "3. Bathroom(s)",
    subsections: [
      {
        id: "bath-toilet",
        title: "Toilet",
        items: [
          { id: "toilet-bowl", label: "Clean bowl" },
          { id: "toilet-seat", label: "Clean seat" },
          { id: "toilet-exterior", label: "Clean exterior" },
          { id: "toilet-base", label: "Base cleaned" },
        ],
      },
      {
        id: "bath-shower",
        title: "Shower/Tub",
        items: [
          { id: "shower-scum", label: "Remove soap scum" },
          { id: "shower-mildew", label: "Remove mildew" },
          { id: "shower-fixtures", label: "Clean fixtures" },
          { id: "shower-doors", label: "Clean doors/track" },
        ],
      },
      {
        id: "bath-vanity",
        title: "Vanity",
        items: [
          { id: "vanity-counter", label: "Countertop sanitized" },
          { id: "vanity-sink", label: "Sink cleaned" },
          { id: "vanity-faucet", label: "Faucet polished" },
        ],
      },
      {
        id: "bath-mirrors",
        title: "Mirrors",
        items: [
          { id: "mirror-streaks", label: "Streak-free" },
        ],
      },
      {
        id: "bath-floors",
        title: "Floors",
        items: [
          { id: "b-swept", label: "Swept" },
          { id: "b-mopped", label: "Mopped" },
        ],
      },
      {
        id: "bath-fan",
        title: "Exhaust Fan",
        items: [
          { id: "fan-dust", label: "Dust removed" },
        ],
      },
    ],
  },
  {
    id: "bedrooms",
    title: "4. Bedrooms",
    subsections: [
      {
        id: "bed-general",
        title: "General",
        items: [
          { id: "bed-dust", label: "Dust surfaces" },
          { id: "bed-closet-shelves", label: "Clean closet shelves" },
          { id: "bed-closet-rods", label: "Wipe closet rods" },
          { id: "bed-cobwebs", label: "Remove cobwebs" },
        ],
      },
      {
        id: "bed-windows",
        title: "Windows",
        items: [
          { id: "bed-win-glass", label: "Interior glass cleaned" },
          { id: "bed-win-sills", label: "Window sills cleaned" },
          { id: "bed-win-tracks", label: "Tracks vacuumed" },
        ],
      },
      {
        id: "bed-floors",
        title: "Floors",
        items: [
          { id: "bed-vacuum", label: "Vacuum carpet" },
          { id: "bed-spot", label: "Spot treat stains" },
          { id: "bed-sweep", label: "Sweep hard floors" },
          { id: "bed-mop", label: "Mop hard floors" },
        ],
      },
    ],
  },
  {
    id: "living",
    title: "5. Living Room / Common Areas",
    subsections: [
      {
        id: "living-surfaces",
        title: "Surfaces",
        items: [
          { id: "liv-dust", label: "Dust all reachable surfaces" },
          { id: "liv-cobwebs", label: "Remove cobwebs" },
          { id: "liv-doors", label: "Wipe doors" },
        ],
      },
      {
        id: "living-windows",
        title: "Windows",
        items: [
          { id: "liv-win-glass", label: "Interior glass cleaned" },
          { id: "liv-win-sills", label: "Sills cleaned" },
        ],
      },
      {
        id: "living-floors",
        title: "Floors",
        items: [
          { id: "liv-vacuum", label: "Vacuum carpet" },
          { id: "liv-sweep", label: "Sweep" },
          { id: "liv-mop", label: "Mop" },
        ],
      },
    ],
  },
  {
    id: "fixtures",
    title: "6. Doors, Trim & Fixtures",
    subsections: [
      {
        id: "fix-throughout",
        title: "Throughout Unit",
        items: [
          { id: "fix-doors", label: "Interior doors cleaned" },
          { id: "fix-frames", label: "Door frames wiped" },
          { id: "fix-baseboards", label: "Baseboards cleaned" },
          { id: "fix-switches", label: "Light switches cleaned" },
          { id: "fix-outlets", label: "Outlet covers cleaned" },
          { id: "fix-fixtures", label: "Light fixtures dusted" },
          { id: "fix-fan", label: "Ceiling fan dusted" },
        ],
      },
    ],
  },
  {
    id: "final",
    title: "7. Final Inspection",
    subsections: [
      {
        id: "final-qc",
        title: "Quality Control",
        items: [
          { id: "qc-dust", label: "No visible dust" },
          { id: "qc-trash", label: "No visible trash" },
          { id: "qc-mirror-streaks", label: "No streaks on mirrors" },
          { id: "qc-glass-streaks", label: "No streaks on glass" },
          { id: "qc-floors", label: "Floors presentable" },
          { id: "qc-appliances", label: "Appliances inspection complete" },
          { id: "qc-bathrooms", label: "Bathrooms inspection complete" },
          { id: "qc-kitchen", label: "Kitchen inspection complete" },
        ],
      },
      {
        id: "final-docs",
        title: "Documentation",
        items: [
          { id: "doc-photos", label: "Final photos taken" },
          { id: "doc-damage", label: "Damage photos uploaded" },
          { id: "doc-notes", label: "Notes entered" },
        ],
      },
      {
        id: "final-completion",
        title: "Completion",
        items: [
          { id: "unit-ready", label: "Unit ready for leasing/showing" },
        ],
      },
    ],
  },
];

export const ALL_CHECKLIST_ITEM_IDS: string[] = UNIT_CHECKLIST_SECTIONS.flatMap((s) =>
  s.subsections.flatMap((ss) => ss.items.map((i) => i.id))
);
