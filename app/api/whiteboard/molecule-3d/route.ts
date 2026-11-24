import { NextRequest, NextResponse } from "next/server";

export interface MoleculeAtom {
  aid: number;
  element: string;
  x: number;
  y: number;
  z: number;
}

export interface MoleculeBond {
  aid1: number;
  aid2: number;
  order: number;
}

export interface Molecule3DResponse {
  compoundName: string;
  cid: number;
  atoms: MoleculeAtom[];
  bonds: MoleculeBond[];
}

const ELEMENT_BY_Z: Record<number, string> = {
  1: "H",
  5: "B",
  6: "C",
  7: "N",
  8: "O",
  9: "F",
  11: "Na",
  12: "Mg",
  15: "P",
  16: "S",
  17: "Cl",
  19: "K",
  20: "Ca",
  26: "Fe",
  30: "Zn",
  35: "Br",
  53: "I",
};

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_CACHE_ENTRIES = 120;
const moleculeCache = new Map<
  string,
  { payload: Molecule3DResponse; ts: number }
>();

function setCache(key: string, payload: Molecule3DResponse) {
  if (moleculeCache.size >= MAX_CACHE_ENTRIES) {
    const oldest = moleculeCache.keys().next().value;
    if (oldest) moleculeCache.delete(oldest);
  }
  moleculeCache.set(key, { payload, ts: Date.now() });
}

interface PubChemCompound {
  id?: { id?: { cid?: number } };
  atoms?: { aid?: number[]; element?: number[] };
  bonds?: { aid1?: number[]; aid2?: number[]; order?: number[] };
  coords?: Array<{
    conformers?: Array<{ x?: number[]; y?: number[]; z?: number[] }>;
  }>;
}

async function fetchPubChemJson(url: string): Promise<PubChemCompound | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { PC_Compounds?: PubChemCompound[] };
    return data?.PC_Compounds?.[0] ?? null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeMolecule(
  compoundName: string,
  comp: PubChemCompound
): Molecule3DResponse | null {
  const aids = comp.atoms?.aid || [];
  const elems = comp.atoms?.element || [];
  const conf = comp.coords?.[0]?.conformers?.[0];
  const xs = conf?.x || [];
  const ys = conf?.y || [];
  const zs = conf?.z || [];

  if (aids.length === 0 || xs.length === 0 || ys.length === 0) {
    return null;
  }

  let meanX = 0;
  let meanY = 0;
  let meanZ = 0;
  const rawAtoms: MoleculeAtom[] = [];
  for (let i = 0; i < aids.length; i++) {
    const x = Number(xs[i] ?? 0);
    const y = Number(ys[i] ?? 0);
    const z = Number(zs[i] ?? 0);
    meanX += x;
    meanY += y;
    meanZ += z;
    rawAtoms.push({
      aid: aids[i],
      element: ELEMENT_BY_Z[elems[i]] || "C",
      x,
      y,
      z,
    });
  }

  meanX /= rawAtoms.length;
  meanY /= rawAtoms.length;
  meanZ /= rawAtoms.length;

  const atoms = rawAtoms.map((a) => ({
    ...a,
    x: Number((a.x - meanX).toFixed(4)),
    y: Number((a.y - meanY).toFixed(4)),
    z: Number((a.z - meanZ).toFixed(4)),
  }));

  const aid1 = comp.bonds?.aid1 || [];
  const aid2 = comp.bonds?.aid2 || [];
  const orders = comp.bonds?.order || [];
  const bonds: MoleculeBond[] = [];
  for (let i = 0; i < aid1.length; i++) {
    bonds.push({
      aid1: aid1[i],
      aid2: aid2[i],
      order: orders[i] || 1,
    });
  }

  return {
    compoundName,
    cid: comp.id?.id?.cid || 0,
    atoms,
    bonds,
  };
}

export async function GET(req: NextRequest) {
  const rawName = req.nextUrl.searchParams.get("name")?.trim() || "";
  if (!rawName || rawName.length > 80 || !/^[\p{L}\p{N}\s\-(),']+$/u.test(rawName)) {
    return NextResponse.json(
      { error: "Provide a valid ?name= compound parameter." },
      { status: 400 }
    );
  }

  const cacheKey = rawName.toLowerCase();
  const cached = moleculeCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return NextResponse.json(cached.payload, { status: 200 });
  }

  const encoded = encodeURIComponent(rawName);
  let comp = await fetchPubChemJson(
    `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/${encoded}/JSON?record_type=3d`
  );
  if (!comp) {
    comp = await fetchPubChemJson(
      `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/${encoded}/JSON`
    );
  }

  if (!comp) {
    return NextResponse.json(
      { error: `Compound "${rawName}" could not be loaded from PubChem.` },
      { status: 404 }
    );
  }

  const normalized = normalizeMolecule(rawName, comp);
  if (!normalized) {
    return NextResponse.json(
      { error: `No coordinate conformer found for "${rawName}".` },
      { status: 422 }
    );
  }

  setCache(cacheKey, normalized);
  return NextResponse.json(normalized, { status: 200 });
}
