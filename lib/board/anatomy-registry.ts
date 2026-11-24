import { LabSceneDescriptor, LessonTone } from "@/types/lesson-board";

export interface AnatomyPackSpec {
  id: string;
  label: string;
  glbFile: string;
  keywords: RegExp;
  defaultMeshes: string[];
  attribution: string;
}

export const ANATOMY_PACK_CATALOG: readonly AnatomyPackSpec[] = [
  {
    id: "heart",
    label: "Human Heart & Great Vessels",
    glbFile: "heart.glb",
    keywords:
      /\b(heart|cardiac|myocard\w*|ventricle|atrium|atria|mitral|tricuspid|aort\w*|coronary|pericard\w*|endocard\w*|valv\w*)\b|القلب|قلب|صمام|بطين|أذين|شريان/i,
    defaultMeshes: ["left_ventricle", "right_ventricle", "aorta", "coronary_arteries"],
    attribution: "Z-Anatomy / BodyParts3D (CC-BY-SA)",
  },
  {
    id: "brain",
    label: "Human Brain & Cerebral Lobes",
    glbFile: "brain.glb",
    keywords:
      /\b(brain|cerebr\w*|cortex|hippocamp\w*|cerebell\w*|brainstem|thalam\w*|hypothalam\w*|amygdala|meninges|basal ganglia|stroke)\b|دماغ|الدماغ|مخ|المخ|قشرة مخية/i,
    defaultMeshes: ["cerebral_cortex", "cerebellum", "brainstem"],
    attribution: "Z-Anatomy / BodyParts3D (CC-BY-SA)",
  },
  {
    id: "lungs",
    label: "Lungs, Trachea & Bronchial Tree",
    glbFile: "lungs.glb",
    keywords:
      /\b(lung\w*|pulmonary|bronch\w*|alveol\w*|trachea\w*|pleura\w*|pneumothorax|respirat\w*|emphysema|asthma)\b|رئة|الرئة|رئتين|شعبة هوائية|قصبة هوائية/i,
    defaultMeshes: ["trachea", "right_lung", "left_lung", "bronchi"],
    attribution: "Z-Anatomy / BodyParts3D (CC-BY-SA)",
  },
  {
    id: "skeleton-skull",
    label: "Skull, Cranium & Jaw",
    glbFile: "skeleton-skull.glb",
    keywords:
      /\b(skull|crani\w*|mandibl\w*|maxilla\w*|zygomat\w*|sphenoid|tmj|temporomandibular|sinus\w*|mastoid)\b|جمجمة|الجمجمة|فك/i,
    defaultMeshes: ["cranium", "mandible", "maxilla"],
    attribution: "Z-Anatomy / BodyParts3D (CC-BY-SA)",
  },
  {
    id: "skeleton-spine",
    label: "Vertebral Column & Spinal Discs",
    glbFile: "skeleton-spine.glb",
    keywords:
      /\b(spine|spinal|vertebra\w*|cervical|thoracic|lumbar|sacr\w*|intervertebral|herniated disc|scoliosis|sciatica)\b|عمود فقري|فقرات|فقرة|غضروف/i,
    defaultMeshes: ["cervical_vertebrae", "lumbar_vertebrae", "intervertebral_disc"],
    attribution: "Z-Anatomy / BodyParts3D (CC-BY-SA)",
  },
  {
    id: "shoulder-joint",
    label: "Shoulder Joint & Rotator Cuff",
    glbFile: "shoulder-joint.glb",
    keywords:
      /\b(shoulder|rotator cuff|humerus|scapula|clavicle|glenoid|supraspinatus|infraspinatus|acromion|impingement)\b|الكتف|كتف/i,
    defaultMeshes: ["humerus", "scapula", "supraspinatus"],
    attribution: "Z-Anatomy / BodyParts3D (CC-BY-SA)",
  },
  {
    id: "knee-joint",
    label: "Knee Joint & Ligament Complex",
    glbFile: "knee-joint.glb",
    keywords:
      /\b(knee|meniscus|acl|pcl|cruciate|patella|femur|tibia|collateral ligament)\b|الركبة|ركبة/i,
    defaultMeshes: ["femur", "tibia", "patella", "meniscus", "acl"],
    attribution: "Z-Anatomy / BodyParts3D (CC-BY-SA)",
  },
  {
    id: "kidney-nephron",
    label: "Kidney, Renal Pelvis & Ureter",
    glbFile: "kidney-nephron.glb",
    keywords:
      /\b(kidney\w*|renal|nephron|glomerul\w*|ureter\w*|bowman|loop of henle|podocyte)\b|كلية|الكلية|كلى|حالب|كبيبة/i,
    defaultMeshes: ["renal_cortex", "renal_medulla", "ureter"],
    attribution: "Z-Anatomy / BodyParts3D (CC-BY-SA)",
  },
  {
    id: "liver-gi",
    label: "Liver, Biliary Tree & GI Tract",
    glbFile: "liver-gi.glb",
    keywords:
      /\b(liver|hepatic|biliary|gallbladder|bile duct|pancreas|stomach|gastric|duodenum|intestin\w*|colon)\b|كبد|الكبد|مرارة|معدة|بنكرياس|أمعاء/i,
    defaultMeshes: ["liver", "gallbladder", "stomach", "pancreas"],
    attribution: "Z-Anatomy / BodyParts3D (CC-BY-SA)",
  },
  {
    id: "eye-ear",
    label: "Eye Globe, Retina & Ear Apparatus",
    glbFile: "eye-ear.glb",
    keywords:
      /\b(eye|retina\w*|cornea\w*|uvea|optic nerve|glaucoma|cataract|cochlea|tympanic|vestibul\w*)\b|عين|العين|شبكية|قرنية|أذن/i,
    defaultMeshes: ["cornea", "lens", "retina", "optic_nerve"],
    attribution: "Z-Anatomy / BodyParts3D (CC-BY-SA)",
  },
  {
    id: "salivary-head-neck",
    label: "Salivary Glands & Head/Neck Complex",
    glbFile: "salivary-head-neck.glb",
    keywords:
      /\b(salivary|parotid|submandibular|sublingual|sjogren|xerostomia|pharynx|larynx|thyroid|tonsill\w*)\b|غدة لعابية|نكفية|غدة درقية|بلعوم|حنجرة/i,
    defaultMeshes: ["parotid_gland", "submandibular_gland", "thyroid_gland"],
    attribution: "Z-Anatomy / BodyParts3D (CC-BY-SA)",
  },
  {
    id: "nervous-system",
    label: "Peripheral & Cranial Nerve Plexus",
    glbFile: "nervous-system.glb",
    keywords:
      /\b(vagus|trigeminal|facial nerve|brachial plexus|sympathetic|parasympathetic|autonomic|axon|myelin|synapse)\b|عصب|أعصاب|مخي|سمبثاوي/i,
    defaultMeshes: ["cranial_nerves", "vagus_nerve", "plexus"],
    attribution: "Z-Anatomy / BodyParts3D (CC-BY-SA)",
  },
];

interface MoleculePattern {
  queryName: string;
  displayName: string;
  re: RegExp;
}

const KNOWN_COMPOUNDS: readonly MoleculePattern[] = [
  { queryName: "aspirin", displayName: "Aspirin (Acetylsalicylic Acid)", re: /\b(aspirin|acetylsalicylic acid)\b|أسبرين/i },
  { queryName: "acetaminophen", displayName: "Acetaminophen (Paracetamol)", re: /\b(acetaminophen|paracetamol)\b|باراسيتامول/i },
  { queryName: "ibuprofen", displayName: "Ibuprofen", re: /\b(ibuprofen)\b|إيبوبروفين/i },
  { queryName: "caffeine", displayName: "Caffeine", re: /\b(caffeine)\b|كافيين/i },
  { queryName: "glucose", displayName: "D-Glucose", re: /\b(glucose|dextrose)\b|جلوكوز/i },
  { queryName: "adenosine", displayName: "Adenosine", re: /\b(adenosine)\b/i },
  { queryName: "dopamine", displayName: "Dopamine", re: /\b(dopamine)\b|دوبامين/i },
  { queryName: "epinephrine", displayName: "Epinephrine (Adrenaline)", re: /\b(epinephrine|adrenaline)\b|أدرينالين/i },
  { queryName: "norepinephrine", displayName: "Norepinephrine (Noradrenaline)", re: /\b(norepinephrine|noradrenaline)\b/i },
  { queryName: "serotonin", displayName: "Serotonin (5-HT)", re: /\b(serotonin|5-ht)\b|سيروتونين/i },
  { queryName: "acetylcholine", displayName: "Acetylcholine", re: /\b(acetylcholine)\b|أسيتيل كولين/i },
  { queryName: "histamine", displayName: "Histamine", re: /\b(histamine)\b|هيستامين/i },
  { queryName: "warfarin", displayName: "Warfarin", re: /\b(warfarin)\b|وارفارين/i },
  { queryName: "metformin", displayName: "Metformin", re: /\b(metformin)\b|ميتفورمين/i },
  { queryName: "penicillin", displayName: "Penicillin", re: /\b(penicillin)\b|بنسلين/i },
  { queryName: "amoxicillin", displayName: "Amoxicillin", re: /\b(amoxicillin)\b|أموكسيسيلين/i },
  { queryName: "omeprazole", displayName: "Omeprazole", re: /\b(omeprazole)\b/i },
  { queryName: "atorvastatin", displayName: "Atorvastatin", re: /\b(atorvastatin)\b/i },
  { queryName: "furosemide", displayName: "Furosemide", re: /\b(furosemide)\b/i },
  { queryName: "digoxin", displayName: "Digoxin", re: /\b(digoxin)\b/i },
  { queryName: "morphine", displayName: "Morphine", re: /\b(morphine)\b|مورفين/i },
  { queryName: "lidocaine", displayName: "Lidocaine", re: /\b(lidocaine)\b|ليدوكائين/i },
  { queryName: "cholesterol", displayName: "Cholesterol", re: /\b(cholesterol)\b|كوليسترول/i },
  { queryName: "cortisol", displayName: "Cortisol", re: /\b(cortisol|hydrocortisone)\b|كورتيزول/i },
  { queryName: "testosterone", displayName: "Testosterone", re: /\b(testosterone)\b/i },
  { queryName: "urea", displayName: "Urea", re: /\b(urea)\b|يوريا/i },
  { queryName: "lactic acid", displayName: "Lactic Acid", re: /\b(lactic acid|lactate)\b|حمض اللاكتيك/i },
  { queryName: "ethanol", displayName: "Ethanol", re: /\b(ethanol)\b|إيثانول/i },
  { queryName: "pyruvate", displayName: "Pyruvate", re: /\b(pyruvate|pyruvic acid)\b/i },
  { queryName: "glutamate", displayName: "Glutamate", re: /\b(glutamate|gaba)\b/i },
];

export function getAnatomyAssetBaseUrl(): string | null {
  const raw = process.env.NEXT_PUBLIC_3D_ASSETS_BASE_URL?.trim();
  if (!raw) return null;
  return raw.replace(/\/+$/, "");
}

export function buildPackUrl(file: string): string | null {
  const base = getAnatomyAssetBaseUrl();
  if (!base) return null;
  const cleanFile = file.replace(/^\/+/, "");
  return `${base}/${cleanFile}`;
}

export function matchReal3DAsset(
  corpus: string,
  sectionTitle = "",
  nodes: Array<{ id: string; text: string; tone?: LessonTone }> = []
): LabSceneDescriptor | null {
  if (!corpus || !corpus.trim()) return null;

  // 1. Check Molecule 3D compounds if specifically taught (small-molecule drugs / metabolites)
  for (const compound of KNOWN_COMPOUNDS) {
    if (compound.re.test(corpus)) {
      return {
        tier: "molecule-3d",
        title: sectionTitle
          ? `${sectionTitle} — ${compound.displayName}`
          : `${compound.displayName} (3D Conformer)`,
        compoundName: compound.queryName,
        cam: "iso",
      };
    }
  }

  // 2. Check 12-pack Real GLB Anatomy Catalog when CDN base URL is configured
  for (const pack of ANATOMY_PACK_CATALOG) {
    if (pack.keywords.test(corpus)) {
      const url = buildPackUrl(pack.glbFile);
      if (url) {
        return {
          tier: "glb-anatomy",
          title: sectionTitle ? `${sectionTitle} — ${pack.label}` : pack.label,
          packId: pack.id,
          glbUrl: url,
          cam: "iso",
          highlightMeshes: pack.defaultMeshes,
          attribution: pack.attribution,
          labels: nodes.slice(0, 4).map((n, idx) => ({
            id: n.id,
            label: n.text,
            tone: n.tone,
            pos: [
              idx % 2 === 0 ? -0.65 : 0.65,
              0.5 - idx * 0.34,
              idx % 2 === 0 ? 0.25 : -0.2,
            ] as [number, number, number],
          })),
        };
      }
      break;
    }
  }

  return null;
}
