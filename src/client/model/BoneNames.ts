/**
 * Recognises humanoid bone and mesh names of the common rigs: Mixamo ("mixamorig:LeftUpLeg"),
 * Rockstar RAGE ("SKEL_L_UpperArm", "SKEL_Head") and the RDR/GTA component meshes ("uppr",
 * "lowr", "teef"), 3ds Max Biped ("Bip01 L Thigh"), Unreal ("upperarm_l", "calf_r"), Unity /
 * Rigify ("thigh.L", "DEF-forearm.R"), Roblox R6/R15 ("Left Arm", "LeftUpperArm") and plain names
 * ("head", "neck", "spine", "arm", "leg", "thigh", "calf").
 */

export type BodyRegion = 'head' | 'neck' | 'body' | 'arm' | 'leg';
export type Side = 'L' | 'R' | null;

export interface NameClass {
  region: BodyRegion | null;
  side: Side;
  /** Finer kind for pivots and hands: 'upper' (shoulder / hip joint), 'hand', 'foot', 'toe', 'clavicle'... */
  kind: string;
}

/** Splits a name into lower-case words: camelCase, digits, separators and namespace prefixes. */
export function nameTokens(name: string): string[] {
  const s = name
    .replace(/^.*[:|]/, '') // namespaces (mixamorig:, Armature|)
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/([a-zA-Z])(\d)/g, '$1 $2')
    .replace(/(\d)([a-zA-Z])/g, '$1 $2')
    .toLowerCase();
  return s.split(/[^a-z0-9]+/).filter((t) => t.length > 0);
}

const HEAD_WORDS = ['head', 'skull', 'jaw', 'eye', 'eyes', 'ear', 'nose', 'face', 'facial', 'brow', 'eyebrow', 'lip', 'lips', 'cheek', 'tongue', 'teeth', 'tooth', 'teef', 'hair', 'hat', 'helmet', 'forehead', 'chin', 'nostril', 'mouth', 'cap', 'beard', 'moustache', 'mustache', 'berd', 'eyelid', 'lid', 'lash', 'eyelash', 'glasses', 'mask', 'hood', 'scalp', 'pupil', 'iris'];
const BODY_WORDS = ['spine', 'chest', 'pelvis', 'torso', 'abdomen', 'belly', 'waist', 'cog', 'breast', 'back', 'body', 'trunk', 'stomach', 'uppr', 'jbib', 'shirt', 'jacket', 'vest', 'coat', 'belt', 'root', 'hips', 'hip', 'center', 'centre', 'main', 'torso', 'ribs', 'rib', 'clavicle', 'collar', 'shoulder', 'scapula', 'cape', 'backpack', 'holster'];
const ARM_WORDS = ['arm', 'upperarm', 'forearm', 'lowerarm', 'elbow', 'armroll', 'wrist', 'wristroll', 'hand', 'hands', 'palm', 'finger', 'fingers', 'thumb', 'index', 'middle', 'ring', 'pinky', 'pinkie', 'little', 'digit', 'carpal', 'metacarpal', 'glove', 'gloves', 'sleeve', 'bicep', 'biceps', 'ulna', 'radius', 'humerus', 'uparm', 'loarm', 'forearm'];
const LEG_WORDS = ['leg', 'legs', 'thigh', 'upleg', 'upperleg', 'lowerleg', 'calf', 'shin', 'knee', 'ankle', 'foot', 'feet', 'toe', 'toes', 'ball', 'heel', 'lowr', 'pants', 'trousers', 'shoe', 'shoes', 'boot', 'boots', 'sock', 'socks', 'hiproll', 'femur', 'tibia', 'fibula', 'upleg', 'thighroll', 'sneaker', 'sneakers', 'skirt'];

const HAND_KINDS = ['hand', 'hands', 'wrist', 'palm', 'glove', 'gloves'];
const FOOT_KINDS = ['foot', 'feet', 'ankle', 'shoe', 'shoes', 'boot', 'boots'];
const TOE_KINDS = ['toe', 'toes', 'ball'];

const LIMB_NEIGHBOURS = ['upper', 'lower', 'up', 'lo', 'fore', 'arm', 'leg', 'thigh', 'calf', 'shin', 'knee', 'foot', 'hand', 'clavicle', 'shoulder', 'hip', 'toe', 'finger', 'thumb', 'elbow', 'wrist', 'ankle', 'forearm', 'upperarm', 'eye', 'ear', 'side'];

/**
 * Left or right from the words. A one-letter "l" / "r" only counts at either end of the name or
 * next to a limb word ("arm_r", "SKEL_L_UpperArm", "Bip01 L Thigh"), not inside codes such as
 * Rockstar's "hand_000_r" (r for race).
 */
function sideOf(tokens: string[]): Side {
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t === 'left' || t === 'lft') return 'L';
    if (t === 'right' || t === 'rgt') return 'R';
    if (t === 'l' || t === 'r' || t === 'lt' || t === 'rt') {
      const edge = i === 0 || i === tokens.length - 1;
      const near = [tokens[i - 1], tokens[i + 1]].some((n) => n !== undefined && LIMB_NEIGHBOURS.some((w) => n.startsWith(w)));
      if (edge || near) return t[0] === 'l' ? 'L' : 'R';
    }
  }
  return null;
}

/** "lhand" / "rthigh" style names: a side letter glued to a known word. */
function gluedSide(t: string, words: string[]): { side: Side; word: string } | null {
  if (t.length < 4) return null;
  const c = t[0];
  if (c !== 'l' && c !== 'r') return null;
  const rest = t.slice(1);
  if (words.includes(rest)) return { side: c === 'l' ? 'L' : 'R', word: rest };
  return null;
}

export function classifyName(name: string): NameClass {
  const tokens = nameTokens(name);
  let side = sideOf(tokens);
  const has = (list: string[]) => tokens.some((t) => list.includes(t));
  const hasPrefix = (prefixes: string[]) => tokens.some((t) => prefixes.some((p) => t.startsWith(p)));
  // Glued sides ("lhand", "rthigh").
  for (const t of tokens) {
    const g = gluedSide(t, [...ARM_WORDS, ...LEG_WORDS]);
    if (g) {
      side ??= g.side;
      tokens.push(g.word);
    }
  }
  const joined = tokens.join(' ');
  const kindOf = (): string => {
    if (has(HAND_KINDS) || hasPrefix(['finger', 'thumb', 'index', 'pinky', 'middle', 'ring'])) return 'hand';
    if (has(TOE_KINDS)) return 'toe';
    if (has(FOOT_KINDS)) return 'foot';
    if (has(['clavicle', 'collar', 'shoulder', 'scapula'])) return 'clavicle';
    if (has(['neck'])) return 'neck';
    if (has(['head'])) return 'head';
    if (has(['forearm', 'lowerarm', 'elbow', 'calf', 'shin', 'knee', 'lowerleg'])) return 'lower';
    return 'upper';
  };
  // Neck before head: "neck" alone is the body's top.
  if (has(['neck'])) return { region: 'neck', side, kind: 'neck' };
  if (has(HEAD_WORDS) || hasPrefix(['eye', 'hair', 'teef', 'brow', 'lash'])) return { region: 'head', side, kind: 'head' };
  // Hips with a side are the thigh joints; without one, the pelvis.
  if ((has(['hip', 'hips']) || hasPrefix(['hiproll'])) && side) return { region: 'leg', side, kind: 'upper' };
  if (has(['up']) && has(['leg'])) return { region: 'leg', side, kind: 'upper' };
  if (/\b(up|upper|lower|lo|fore)\s?(arm)\b/.test(joined) || has(ARM_WORDS) || hasPrefix(['finger', 'thumb', 'forearm', 'upperarm', 'armroll', 'wristroll'])) {
    if (has(['clavicle', 'collar', 'shoulder', 'scapula']) && !has(['arm', 'upperarm'])) return { region: 'body', side, kind: 'clavicle' };
    return { region: 'arm', side, kind: kindOf() };
  }
  if (has(LEG_WORDS) || hasPrefix(['thigh', 'calf', 'knee', 'ankle', 'toe'])) return { region: 'leg', side, kind: kindOf() };
  if (has(BODY_WORDS)) return { region: 'body', side, kind: kindOf() };
  return { region: null, side, kind: '' };
}
