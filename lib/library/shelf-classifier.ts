import { IBook, SourceCategoryType } from "@/types";

export type ShelfGroupingMode = "smart" | "specialty" | "format";

export type CanonicalSpecialtyId =
  | "internal_medicine"
  | "cardiology"
  | "surgery"
  | "neurology"
  | "pulmonology"
  | "gastroenterology"
  | "nephrology"
  | "endocrinology"
  | "pediatrics"
  | "obgyn"
  | "pharmacology"
  | "pathology"
  | "software_engineering"
  | "general";

export interface SpecialtyMeta {
  id: CanonicalSpecialtyId;
  label: string;
  subTitle: string;
  accentColor: string;
  badge: string;
}

export const CANONICAL_SPECIALTIES: Record<CanonicalSpecialtyId, SpecialtyMeta> = {
  internal_medicine: {
    id: "internal_medicine",
    label: "INTERNAL MEDICINE & MRCP",
    subTitle: "SYSTEMIC PATHOPHYSIOLOGY & CLINICAL CANON",
    accentColor: "#f59e0b",
    badge: "Internal Med",
  },
  cardiology: {
    id: "cardiology",
    label: "CARDIOVASCULAR MEDICINE",
    subTitle: "HEMODYNAMICS, ECG & VALVULAR PATHOLOGY",
    accentColor: "#ef4444",
    badge: "Cardiology",
  },
  surgery: {
    id: "surgery",
    label: "CLINICAL SURGERY & OPERATIVE",
    subTitle: "SURGICAL SWELLINGS, HISTORY & BEDSIDE SIGNS",
    accentColor: "#f97316",
    badge: "Surgery",
  },
  neurology: {
    id: "neurology",
    label: "NEUROLOGY & NEUROSCIENCE",
    subTitle: "CENTRAL LOCALIZATION, STROKE & NEUROANATOMY",
    accentColor: "#8b5cf6",
    badge: "Neurology",
  },
  pulmonology: {
    id: "pulmonology",
    label: "PULMONOLOGY & RESPIRATORY",
    subTitle: "VENTILATION, GAS EXCHANGE & AIRWAY PATHOLOGY",
    accentColor: "#06b6d4",
    badge: "Pulmonology",
  },
  gastroenterology: {
    id: "gastroenterology",
    label: "GASTROENTEROLOGY & HEPATOLOGY",
    subTitle: "GI TRACT, HEPATIC MECHANISMS & BILIARY SYSTEMS",
    accentColor: "#eab308",
    badge: "Gastroenterology",
  },
  nephrology: {
    id: "nephrology",
    label: "NEPHROLOGY & RENAL MEDICINE",
    subTitle: "GLOMERULAR DYNAMICS & ACID-BASE HOMEOSTASIS",
    accentColor: "#3b82f6",
    badge: "Nephrology",
  },
  endocrinology: {
    id: "endocrinology",
    label: "ENDOCRINOLOGY & METABOLISM",
    subTitle: "HORMONAL AXES, GLUCOSE HOMEOSTASIS & GLANDS",
    accentColor: "#14b8a6",
    badge: "Endocrinology",
  },
  pediatrics: {
    id: "pediatrics",
    label: "PEDIATRICS & DEVELOPMENT",
    subTitle: "NEONATAL CARE & CHILD HEALTH FOUNDATIONS",
    accentColor: "#10b981",
    badge: "Pediatrics",
  },
  obgyn: {
    id: "obgyn",
    label: "OBSTETRICS & GYNECOLOGY",
    subTitle: "MATERNAL-FETAL MEDICINE & REPRODUCTIVE HEALTH",
    accentColor: "#ec4899",
    badge: "OB/GYN",
  },
  pharmacology: {
    id: "pharmacology",
    label: "PHARMACOLOGY & THERAPEUTICS",
    subTitle: "PHARMACOKINETICS, RECEPTORS & DRUG MECHANICS",
    accentColor: "#6366f1",
    badge: "Pharmacology",
  },
  pathology: {
    id: "pathology",
    label: "PATHOLOGY & HISTOLOGY",
    subTitle: "CELLULAR MORPHOLOGY & TISSUE ARCHITECTURE",
    accentColor: "#d946ef",
    badge: "Pathology",
  },
  software_engineering: {
    id: "software_engineering",
    label: "COMPUTER SCIENCE & SYSTEMS",
    subTitle: "ALGORITHMS, ARCHITECTURE & COMPUTATIONAL LOGIC",
    accentColor: "#64748b",
    badge: "Software",
  },
  general: {
    id: "general",
    label: "GENERAL MEDICAL LIBRARY",
    subTitle: "CURATED CLINICAL STUDIES & CORE FOUNDATIONS",
    accentColor: "#a8a29e",
    badge: "General",
  },
};

export const FORMAT_META: Record<
  SourceCategoryType,
  { title: string; subTitle: string; badge: string; accentColor: string }
> = {
  textbook: {
    title: "REFERENCE TEXTBOOKS",
    subTitle: "COMPREHENSIVE TREATISES & CLINICAL REFERENCES",
    badge: "Textbook",
    accentColor: "#d97706",
  },
  lecture_notes: {
    title: "LECTURES & HANDOUTS",
    subTitle: "FACULTY SLIDES & UNIVERSITY SYLLABI",
    badge: "Lecture",
    accentColor: "#3b82f6",
  },
  clinical_sheet: {
    title: "CLINICAL SHEETS & PROTOCOLS",
    subTitle: "BEDSIDE ALGORITHMS & POCKET GUIDES",
    badge: "Clinical Sheet",
    accentColor: "#10b981",
  },
  guideline_paper: {
    title: "GUIDELINES & EVIDENCE",
    subTitle: "CONSENSUS PAPERS & CLINICAL TRIALS",
    badge: "Guideline",
    accentColor: "#8b5cf6",
  },
  exam_review: {
    title: "HIGH-YIELD & EXAM RECALL",
    subTitle: "RAPID REVISION & BOARD PREPARATION",
    badge: "Exam Review",
    accentColor: "#ec4899",
  },
};

export interface ResolvedBookCoordinates {
  canonicalSpecialty: CanonicalSpecialtyId;
  specialtyMeta: SpecialtyMeta;
  sourceCategory: SourceCategoryType;
  formatMeta: typeof FORMAT_META[SourceCategoryType];
  customSection: string | null;
  displaySpecialty: string;
  displayFormat: string;
}

export type ResolvedBookShelfCoordinates = ResolvedBookCoordinates;

export interface ShelfBay {
  id: string;
  key: string;
  title: string;
  subTitle: string;
  badgeLabel: string;
  accentColor: string;
  isCustomSection: boolean;
  books: IBook[];
}

/**
 * Infer canonical specialty from book metadata (explicit overrides, title, domain, subspecialty)
 */
export function inferCanonicalSpecialty(book: IBook): CanonicalSpecialtyId {
  // 1. Explicit topic check
  const rawTopic = (book.topic || "").trim().toLowerCase();
  const domain = (book.domain || book.blueprint?.domain || "").toLowerCase();
  const title = (book.title || "").toLowerCase();
  const subspecialty = (book.subspecialty || book.blueprint?.subspecialty || "").toLowerCase();
  const combined = `${title} ${rawTopic} ${domain} ${subspecialty}`;

  if (
    combined.includes("mrcp") ||
    combined.includes("internal med") ||
    combined.includes("harrison") ||
    combined.includes("kumar") ||
    combined.includes("davidson") ||
    combined.includes("cecil")
  ) {
    return "internal_medicine";
  }

  if (
    combined.includes("cardio") ||
    combined.includes("heart") ||
    combined.includes("ecg") ||
    combined.includes("ekg") ||
    combined.includes("murmur") ||
    combined.includes("valve") ||
    combined.includes("angina") ||
    combined.includes("braunwald")
  ) {
    return "cardiology";
  }

  if (
    combined.includes("surg") ||
    combined.includes("swelling") ||
    combined.includes("hernia") ||
    combined.includes("ulcer") ||
    combined.includes("appendic") ||
    combined.includes("cholecyst") ||
    combined.includes("bailey") ||
    combined.includes("browse") ||
    combined.includes("sabiston") ||
    combined.includes("schwartz")
  ) {
    return "surgery";
  }

  if (
    combined.includes("neuro") ||
    combined.includes("brain") ||
    combined.includes("stroke") ||
    combined.includes("seizure") ||
    combined.includes("cortex") ||
    combined.includes("adams") ||
    combined.includes("kandel")
  ) {
    return "neurology";
  }

  if (
    combined.includes("pulmon") ||
    combined.includes("lung") ||
    combined.includes("chest") ||
    combined.includes("respir") ||
    combined.includes("asthma") ||
    combined.includes("copd")
  ) {
    return "pulmonology";
  }

  if (
    combined.includes("gastro") ||
    combined.includes("liver") ||
    combined.includes("hepat") ||
    combined.includes("cirrhosis") ||
    combined.includes("crohn") ||
    combined.includes("bowel")
  ) {
    return "gastroenterology";
  }

  if (
    combined.includes("nephro") ||
    combined.includes("renal") ||
    combined.includes("kidney") ||
    combined.includes("dialysis")
  ) {
    return "nephrology";
  }

  if (
    combined.includes("endocrin") ||
    combined.includes("diabetes") ||
    combined.includes("thyroid") ||
    combined.includes("adrenal")
  ) {
    return "endocrinology";
  }

  if (
    combined.includes("pediatr") ||
    combined.includes("paediatr") ||
    combined.includes("neonat") ||
    combined.includes("child") ||
    combined.includes("nelson")
  ) {
    return "pediatrics";
  }

  if (
    combined.includes("obgyn") ||
    combined.includes("obstetr") ||
    combined.includes("gynec") ||
    combined.includes("gynaec") ||
    combined.includes("pregnancy")
  ) {
    return "obgyn";
  }

  if (
    combined.includes("pharm") ||
    combined.includes("drug") ||
    combined.includes("pharmacokin") ||
    combined.includes("katzung")
  ) {
    return "pharmacology";
  }

  if (
    combined.includes("pathol") ||
    combined.includes("histol") ||
    combined.includes("robbins")
  ) {
    return "pathology";
  }

  if (
    combined.includes("code") ||
    combined.includes("software") ||
    combined.includes("algorithm") ||
    combined.includes("python") ||
    combined.includes("typescript") ||
    combined.includes("system design")
  ) {
    return "software_engineering";
  }

  // Fallback check against raw topic
  if (rawTopic && rawTopic !== "general") {
    for (const [key, meta] of Object.entries(CANONICAL_SPECIALTIES)) {
      if (meta.label.toLowerCase().includes(rawTopic) || rawTopic.includes(key)) {
        return key as CanonicalSpecialtyId;
      }
    }
  }

  return "general";
}

/**
 * Infer or validate source format (textbook vs lecture vs sheet vs exam review)
 */
export function inferSourceCategory(book: IBook): SourceCategoryType {
  const explicit = book.sourceCategory as SourceCategoryType | undefined;
  const title = (book.title || "").toLowerCase();
  const totalPages = book.totalPages || book.totalSegments || 0;

  // 1. If explicit category is not generic textbook, trust it
  if (explicit && explicit !== "textbook") {
    return explicit;
  }

  // 2. High-confidence keywords for clinical sheet
  if (
    title.includes("sheet") ||
    title.includes("pocket") ||
    title.includes("bedside") ||
    title.includes("protocol") ||
    title.includes("checklist") ||
    title.includes("history taking") ||
    title.includes("examination sheet")
  ) {
    return "clinical_sheet";
  }

  // 3. High-confidence keywords for lecture notes
  if (
    title.includes("lecture") ||
    title.includes("slide") ||
    title.includes("handout") ||
    title.includes("dr.") ||
    title.includes("session") ||
    (totalPages > 0 && totalPages <= 65 && !title.includes("volume") && !title.includes("essentials"))
  ) {
    return "lecture_notes";
  }

  // 4. Exam review / high-yield
  if (
    title.includes("first aid") ||
    title.includes("recall") ||
    title.includes("qbank") ||
    title.includes("board review") ||
    title.includes("revision")
  ) {
    return "exam_review";
  }

  // 5. Clinical guideline
  if (
    title.includes("guideline") ||
    title.includes("consensus") ||
    title.includes("recommendation") ||
    title.includes("trial")
  ) {
    return "guideline_paper";
  }

  return "textbook";
}

/**
 * Classify a book with type-safe coordinates for the bookshelf
 */
export function classifyBookForShelf(book: IBook): ResolvedBookCoordinates {
  const canonicalSpecialty = inferCanonicalSpecialty(book);
  const specialtyMeta = CANONICAL_SPECIALTIES[canonicalSpecialty];
  const sourceCategory = inferSourceCategory(book);
  const formatMeta = FORMAT_META[sourceCategory];
  const customSection = (book as any).customSection?.trim() || null;

  const displaySpecialty = customSection || (book.topic && book.topic !== "General" ? book.topic : specialtyMeta.badge);
  const displayFormat = formatMeta.badge;

  return {
    canonicalSpecialty,
    specialtyMeta,
    sourceCategory,
    formatMeta,
    customSection,
    displaySpecialty,
    displayFormat,
  };
}

/**
 * Builds coordinate-locked shelf bays according to the selected mode
 */
export function buildCoordinateShelfBays(
  books: IBook[],
  mode: ShelfGroupingMode = "smart",
): ShelfBay[] {
  if (books.length === 0) return [];

  const classified = books.map((book) => ({
    book,
    coords: classifyBookForShelf(book),
  }));

  // 1. Check if user has custom sections assigned
  const customBaysMap = new Map<string, IBook[]>();
  const uncustomedItems: { book: IBook; coords: ResolvedBookCoordinates }[] = [];

  classified.forEach((item) => {
    if (item.coords.customSection) {
      const sectionName = item.coords.customSection;
      if (!customBaysMap.has(sectionName)) {
        customBaysMap.set(sectionName, []);
      }
      customBaysMap.get(sectionName)!.push(item.book);
    } else {
      uncustomedItems.push(item);
    }
  });

  const bays: ShelfBay[] = [];

  // Always render custom sections first as dedicated architectural bays
  for (const [sectionName, secBooks] of customBaysMap.entries()) {
    bays.push({
      id: `custom_${sectionName.toLowerCase().replace(/\s+/g, "_")}`,
      key: `custom_${sectionName}`,
      title: sectionName.toUpperCase(),
      subTitle: "CURATED USER STUDY SECTION",
      badgeLabel: "Custom Section",
      accentColor: "#d97706",
      isCustomSection: true,
      books: secBooks,
    });
  }

  if (uncustomedItems.length === 0) {
    return bays;
  }

  // 2. Decide grouping strategy for remaining books
  if (mode === "format") {
    // Pure format grouping
    const formatMap = new Map<SourceCategoryType, IBook[]>();
    const order: SourceCategoryType[] = [
      "textbook",
      "lecture_notes",
      "clinical_sheet",
      "guideline_paper",
      "exam_review",
    ];

    uncustomedItems.forEach(({ book, coords }) => {
      const cat = coords.sourceCategory;
      if (!formatMap.has(cat)) formatMap.set(cat, []);
      formatMap.get(cat)!.push(book);
    });

    order.forEach((cat) => {
      const bList = formatMap.get(cat);
      if (bList && bList.length > 0) {
        bays.push({
          id: `format_${cat}`,
          key: `format_${cat}`,
          title: FORMAT_META[cat].title,
          subTitle: FORMAT_META[cat].subTitle,
          badgeLabel: FORMAT_META[cat].badge,
          accentColor: FORMAT_META[cat].accentColor,
          isCustomSection: false,
          books: bList,
        });
      }
    });

    return bays;
  }

  if (mode === "specialty") {
    // Pure specialty grouping
    const specialtyMap = new Map<CanonicalSpecialtyId, IBook[]>();
    uncustomedItems.forEach(({ book, coords }) => {
      const spec = coords.canonicalSpecialty;
      if (!specialtyMap.has(spec)) specialtyMap.set(spec, []);
      specialtyMap.get(spec)!.push(book);
    });

    for (const [specId, bList] of specialtyMap.entries()) {
      if (bList.length > 0) {
        const meta = CANONICAL_SPECIALTIES[specId];
        bays.push({
          id: `spec_${specId}`,
          key: `spec_${specId}`,
          title: meta.label,
          subTitle: meta.subTitle,
          badgeLabel: meta.badge,
          accentColor: meta.accentColor,
          isCustomSection: false,
          books: bList,
        });
      }
    }

    return bays;
  }

  // 3. Smart Mode (Default)
  // Check how many distinct specialties exist
  const distinctSpecialties = new Set(uncustomedItems.map((i) => i.coords.canonicalSpecialty));
  const distinctFormats = new Set(uncustomedItems.map((i) => i.coords.sourceCategory));

  if (distinctSpecialties.size > 1) {
    // Multi-specialty library: Partition by Specialty!
    const specialtyMap = new Map<CanonicalSpecialtyId, IBook[]>();
    uncustomedItems.forEach(({ book, coords }) => {
      const spec = coords.canonicalSpecialty;
      if (!specialtyMap.has(spec)) specialtyMap.set(spec, []);
      specialtyMap.get(spec)!.push(book);
    });

    for (const [specId, bList] of specialtyMap.entries()) {
      if (bList.length > 0) {
        const meta = CANONICAL_SPECIALTIES[specId];
        bays.push({
          id: `smart_spec_${specId}`,
          key: `smart_spec_${specId}`,
          title: meta.label,
          subTitle: meta.subTitle,
          badgeLabel: meta.badge,
          accentColor: meta.accentColor,
          isCustomSection: false,
          books: bList,
        });
      }
    }
  } else if (distinctFormats.size > 1) {
    // Single specialty, but multiple formats (e.g., Textbooks vs. Lectures vs. Sheets)
    const formatMap = new Map<SourceCategoryType, IBook[]>();
    const order: SourceCategoryType[] = [
      "textbook",
      "lecture_notes",
      "clinical_sheet",
      "guideline_paper",
      "exam_review",
    ];

    uncustomedItems.forEach(({ book, coords }) => {
      const cat = coords.sourceCategory;
      if (!formatMap.has(cat)) formatMap.set(cat, []);
      formatMap.get(cat)!.push(book);
    });

    order.forEach((cat) => {
      const bList = formatMap.get(cat);
      if (bList && bList.length > 0) {
        bays.push({
          id: `smart_format_${cat}`,
          key: `smart_format_${cat}`,
          title: FORMAT_META[cat].title,
          subTitle: FORMAT_META[cat].subTitle,
          badgeLabel: FORMAT_META[cat].badge,
          accentColor: FORMAT_META[cat].accentColor,
          isCustomSection: false,
          books: bList,
        });
      }
    });
  } else {
    // Only 1 specialty and 1 format: still create a single distinguished bay with rich styling
    const single = uncustomedItems[0].coords;
    bays.push({
      id: "smart_unified_bay",
      key: "smart_unified_bay",
      title: single.specialtyMeta.label,
      subTitle: single.specialtyMeta.subTitle,
      badgeLabel: single.specialtyMeta.badge,
      accentColor: single.specialtyMeta.accentColor,
      isCustomSection: false,
      books: uncustomedItems.map((i) => i.book),
    });
  }

  return bays;
}
