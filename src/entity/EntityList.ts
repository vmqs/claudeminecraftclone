import type { World } from '../world/World';
import type { Entity } from './Entity';

export type EntityConstructor = new (world: World) => Entity;

/**
 * An entity described by plain data (world-generation payloads, spawners, /summon): the
 * EntityList name, feet position and rotation, and optional savegame-style fields for the
 * entity's own readEntityFromNBT (a chest minecart's "Items", a villager's "Profession"...).
 */
export interface EntityDescriptor {
  name: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch?: number;
  data?: Record<string, unknown>;
  /** false: spawn as described, without initCreature's random set-up (structure mobs, loot carts). */
  init?: boolean;
}

/** Entities that take savegame-style fields (EntityDescriptor.data). */
export interface ReadsEntityData {
  readEntityFromNBT(tag: Record<string, unknown>): void;
}

/** EntityEggInfo: the spawn egg colours of a living entity. */
export interface EntityEggInfo {
  readonly spawnedID: number;
  readonly primaryColor: number;
  readonly secondaryColor: number;
}

/**
 * The 1.5.2 savegame names and network IDs (EntityList's static block), with the spawn egg
 * colours where the original has an egg. This is plain data: it is known before the entity
 * classes exist, and the world-generation worker can use the names in its descriptors.
 */
const ENTITY_TABLE: readonly (readonly [name: string, id: number, eggPrimary?: number, eggSecondary?: number])[] = [
  ['Item', 1],
  ['XPOrb', 2],
  ['Painting', 9],
  ['Arrow', 10],
  ['Snowball', 11],
  ['Fireball', 12],
  ['SmallFireball', 13],
  ['ThrownEnderpearl', 14],
  ['EyeOfEnderSignal', 15],
  ['ThrownPotion', 16],
  ['ThrownExpBottle', 17],
  ['ItemFrame', 18],
  ['WitherSkull', 19],
  ['PrimedTnt', 20],
  ['FallingSand', 21],
  ['FireworksRocketEntity', 22],
  ['Boat', 41],
  ['MinecartRideable', 42],
  ['MinecartChest', 43],
  ['MinecartFurnace', 44],
  ['MinecartTNT', 45],
  ['MinecartHopper', 46],
  ['MinecartSpawner', 47],
  ['Mob', 48],
  ['Monster', 49],
  ['Creeper', 50, 894731, 0],
  ['Skeleton', 51, 12698049, 4802889],
  ['Spider', 52, 3419431, 11013646],
  ['Giant', 53],
  ['Zombie', 54, 44975, 7969893],
  ['Slime', 55, 5349438, 8306542],
  ['Ghast', 56, 16382457, 12369084],
  ['PigZombie', 57, 15373203, 5009705],
  ['Enderman', 58, 1447446, 0],
  ['CaveSpider', 59, 803406, 11013646],
  ['Silverfish', 60, 7237230, 3158064],
  ['Blaze', 61, 16167425, 16775294],
  ['LavaSlime', 62, 3407872, 16579584],
  ['EnderDragon', 63],
  ['WitherBoss', 64],
  ['Bat', 65, 4996656, 986895],
  ['Witch', 66, 3407872, 5349438],
  ['Pig', 90, 15771042, 14377823],
  ['Sheep', 91, 15198183, 16758197],
  ['Cow', 92, 4470310, 10592673],
  ['Chicken', 93, 10592673, 16711680],
  ['Squid', 94, 2243405, 7375001],
  ['Wolf', 95, 14144467, 13545366],
  ['MushroomCow', 96, 10489616, 12040119],
  ['SnowMan', 97],
  ['Ozelot', 98, 15720061, 5653556],
  ['VillagerGolem', 99],
  ['Villager', 120, 5651507, 12422002],
  ['EnderCrystal', 200],
];

/**
 * EntityList: savegame name <-> network ID <-> constructor. Entity classes bind themselves with
 * `EntityList.addMapping(EntityPig, 'Pig')` in src/entity/Entities.ts (one line per class); the
 * IDs and egg colours come from the table above. Spawn eggs (item damage = entity ID), mob
 * spawners, biome spawn lists, /summon and the world-generation descriptors all go through it.
 */
export class EntityList {
  private static readonly nameToID = new Map<string, number>();
  private static readonly idToName = new Map<number, string>();
  private static readonly nameToClass = new Map<string, EntityConstructor>();
  private static readonly classToName = new Map<EntityConstructor, string>();
  /** Spawn eggs by entity ID, in the original's insertion order (creative tab order). */
  static readonly entityEggs = new Map<number, EntityEggInfo>();

  static {
    for (const [name, id, a, b] of ENTITY_TABLE) {
      EntityList.nameToID.set(name, id);
      EntityList.idToName.set(id, name);
      if (a !== undefined && b !== undefined) EntityList.entityEggs.set(id, { spawnedID: id, primaryColor: a, secondaryColor: b });
    }
  }

  /** Binds a class to its 1.5.2 name (the ID and egg come from the table; `id` adds a new one). */
  static addMapping(cls: EntityConstructor, name: string, id?: number): void {
    const known = EntityList.nameToID.get(name);
    const eid = id ?? known;
    if (eid === undefined) throw new Error(`EntityList: no ID for ${name}`);
    EntityList.nameToID.set(name, eid);
    EntityList.idToName.set(eid, name);
    EntityList.nameToClass.set(name, cls);
    EntityList.classToName.set(cls, name);
  }

  /**
   * Classes that have no savegame name in 1.5.2 (thrown eggs and fishing bobbers are never
   * saved), labelled for the dev tools only; the save and network lookups ignore them.
   */
  private static readonly unsavedByLabel = new Map<string, EntityConstructor>();
  private static readonly unsavedLabels = new Map<EntityConstructor, string>();

  static addUnsaved(cls: EntityConstructor, label: string): void {
    EntityList.unsavedByLabel.set(label, cls);
    EntityList.unsavedLabels.set(cls, label);
  }

  /** The savegame name, or else the dev label of an unsaved class (for debugging). */
  static getDebugName(e: Entity): string | null {
    const cls = e.constructor as EntityConstructor;
    return EntityList.classToName.get(cls) ?? EntityList.unsavedLabels.get(cls) ?? null;
  }

  /** getClassFromName, falling back to the unsaved classes' dev labels. */
  static getClassForDebug(name: string): EntityConstructor | null {
    return EntityList.nameToClass.get(name) ?? EntityList.unsavedByLabel.get(name) ?? null;
  }

  /** The class bound to a name, or null when it is not implemented yet. */
  static getClassFromName(name: string): EntityConstructor | null {
    return EntityList.nameToClass.get(name) ?? null;
  }

  static createEntityByName(name: string, world: World): Entity | null {
    const cls = EntityList.nameToClass.get(name);
    return cls ? new cls(world) : null;
  }

  /**
   * Creates an entity from a descriptor (not spawned): placed with setLocationAndAngles, then
   * given the descriptor's data when the class reads any. Null for names without a class yet.
   */
  static fromDescriptor(d: EntityDescriptor, world: World): Entity | null {
    const e = EntityList.createEntityByName(d.name, world);
    if (!e) return null;
    e.setLocationAndAngles(d.x, d.y, d.z, d.yaw, d.pitch ?? 0);
    const reader = e as Entity & Partial<ReadsEntityData>;
    if (d.data && typeof reader.readEntityFromNBT === 'function') reader.readEntityFromNBT(d.data);
    return e;
  }

  /**
   * createEntityFromNBT: a saved entity ("id" plus its fields), or null for unknown ids or
   * tags that fail to load (logged and skipped instead of crashing). Old "Minecart" tags with a
   * "Type" become the 1.5 minecart ids.
   */
  static createEntityFromNBT(tag: Record<string, unknown>, world: World): Entity | null {
    let id = typeof tag.id === 'string' ? tag.id : '';
    if (id === 'Minecart') {
      const type = Number(tag.Type ?? 0) | 0;
      id = type === 1 ? 'MinecartChest' : type === 2 ? 'MinecartFurnace' : 'MinecartRideable';
      tag.id = id;
      delete tag.Type;
    }
    const cls = EntityList.nameToClass.get(id);
    if (!cls) {
      console.warn(`Skipping Entity with id ${id}`);
      return null;
    }
    try {
      const e = new cls(world);
      e.readFromNBT(tag);
      return e;
    } catch (err) {
      console.warn(`Skipping Entity with id ${id}:`, err);
      return null;
    }
  }

  static createEntityByID(id: number, world: World): Entity | null {
    const name = EntityList.idToName.get(id);
    return name === undefined ? null : EntityList.createEntityByName(name, world);
  }

  /** The class bound to an ID (EntityList.getClassFromID), or null when not implemented yet. */
  static getClassFromID(id: number): EntityConstructor | null {
    const name = EntityList.idToName.get(id);
    return (name !== undefined && EntityList.nameToClass.get(name)) || null;
  }

  /** The savegame name of an entity's exact class (null when the class is not registered). */
  static getEntityString(e: Entity): string | null {
    return EntityList.classToName.get(e.constructor as EntityConstructor) ?? null;
  }

  static getEntityID(e: Entity): number {
    const name = EntityList.classToName.get(e.constructor as EntityConstructor);
    return name === undefined ? 0 : (EntityList.nameToID.get(name) ?? 0);
  }

  static getStringFromID(id: number): string | null {
    return EntityList.idToName.get(id) ?? null;
  }

  static getIDFromString(name: string): number {
    return EntityList.nameToID.get(name) ?? 0;
  }

  /** Whether a class is bound to the name (so spawn eggs and spawners can create it). */
  static isRegistered(name: string): boolean {
    return EntityList.nameToClass.has(name);
  }
}
