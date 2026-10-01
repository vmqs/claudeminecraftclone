/** MapColor: colours for maps (index and RGB). */
export class MapColor {
  static readonly mapColorArray: MapColor[] = [];
  static readonly airColor = new MapColor(0, 0);
  static readonly grassColor = new MapColor(1, 8368696);
  static readonly sandColor = new MapColor(2, 16247203);
  static readonly clothColor = new MapColor(3, 10987431);
  static readonly tntColor = new MapColor(4, 16711680);
  static readonly iceColor = new MapColor(5, 10526975);
  static readonly ironColor = new MapColor(6, 10987431);
  static readonly foliageColor = new MapColor(7, 31744);
  static readonly snowColor = new MapColor(8, 16777215);
  static readonly clayColor = new MapColor(9, 10791096);
  static readonly dirtColor = new MapColor(10, 12020271);
  static readonly stoneColor = new MapColor(11, 7368816);
  static readonly waterColor = new MapColor(12, 4210943);
  static readonly woodColor = new MapColor(13, 6837042);

  private constructor(
    readonly colorIndex: number,
    readonly colorValue: number,
  ) {
    MapColor.mapColorArray[colorIndex] = this;
  }
}

export class Material {
  private canBurn = false;
  private replaceable = false;
  private isTranslucent = false;
  private requiresNoTool = true;
  private mobilityFlag = 0;
  private alwaysHarvested = false;

  constructor(readonly materialMapColor: MapColor) {}

  isLiquid(): boolean {
    return false;
  }
  isSolid(): boolean {
    return true;
  }
  getCanBlockGrass(): boolean {
    return true;
  }
  blocksMovement(): boolean {
    return true;
  }
  setTranslucent(): this {
    this.isTranslucent = true;
    return this;
  }
  setRequiresTool(): this {
    this.requiresNoTool = false;
    return this;
  }
  setBurning(): this {
    this.canBurn = true;
    return this;
  }
  getCanBurn(): boolean {
    return this.canBurn;
  }
  setReplaceable(): this {
    this.replaceable = true;
    return this;
  }
  isReplaceable(): boolean {
    return this.replaceable;
  }
  isOpaque(): boolean {
    return this.isTranslucent ? false : this.blocksMovement();
  }
  isToolNotRequired(): boolean {
    return this.requiresNoTool;
  }
  getMaterialMobility(): number {
    return this.mobilityFlag;
  }
  setNoPushMobility(): this {
    this.mobilityFlag = 1;
    return this;
  }
  setImmovableMobility(): this {
    this.mobilityFlag = 2;
    return this;
  }
  setAlwaysHarvested(): this {
    this.alwaysHarvested = true;
    return this;
  }
  isAlwaysHarvested(): boolean {
    return this.alwaysHarvested;
  }

  // Instances are created at the end of the file (after the subclasses exist).
  static air: Material;
  static grass: Material;
  static ground: Material;
  static wood: Material;
  static rock: Material;
  static iron: Material;
  static anvil: Material;
  static water: Material;
  static lava: Material;
  static leaves: Material;
  static plants: Material;
  static vine: Material;
  static sponge: Material;
  static cloth: Material;
  static fire: Material;
  static sand: Material;
  static circuits: Material;
  static glass: Material;
  static redstoneLight: Material;
  static tnt: Material;
  static coral: Material;
  static ice: Material;
  static snow: Material;
  static craftedSnow: Material;
  static cactus: Material;
  static clay: Material;
  static pumpkin: Material;
  static dragonEgg: Material;
  static portal: Material;
  static cake: Material;
  static web: Material;
  static piston: Material;
}

export class MaterialTransparent extends Material {
  constructor(c: MapColor) {
    super(c);
    this.setReplaceable();
  }
  override isSolid(): boolean {
    return false;
  }
  override getCanBlockGrass(): boolean {
    return false;
  }
  override blocksMovement(): boolean {
    return false;
  }
}

export class MaterialLogic extends Material {
  constructor(c: MapColor) {
    super(c);
    this.setAlwaysHarvested();
  }
  override isSolid(): boolean {
    return false;
  }
  override getCanBlockGrass(): boolean {
    return false;
  }
  override blocksMovement(): boolean {
    return false;
  }
}

export class MaterialLiquid extends Material {
  constructor(c: MapColor) {
    super(c);
    this.setReplaceable();
    this.setNoPushMobility();
  }
  override isLiquid(): boolean {
    return true;
  }
  override blocksMovement(): boolean {
    return false;
  }
  override isSolid(): boolean {
    return false;
  }
}

export class MaterialPortal extends Material {
  override isSolid(): boolean {
    return false;
  }
  override getCanBlockGrass(): boolean {
    return false;
  }
  override blocksMovement(): boolean {
    return false;
  }
}

export class MaterialWeb extends Material {
  override blocksMovement(): boolean {
    return false;
  }
}

Material.air = new MaterialTransparent(MapColor.airColor);
Material.grass = new Material(MapColor.grassColor);
Material.ground = new Material(MapColor.dirtColor);
Material.wood = new Material(MapColor.woodColor).setBurning();
Material.rock = new Material(MapColor.stoneColor).setRequiresTool();
Material.iron = new Material(MapColor.ironColor).setRequiresTool();
Material.anvil = new Material(MapColor.ironColor).setRequiresTool().setImmovableMobility();
Material.water = new MaterialLiquid(MapColor.waterColor).setNoPushMobility();
Material.lava = new MaterialLiquid(MapColor.tntColor).setNoPushMobility();
Material.leaves = new Material(MapColor.foliageColor).setBurning().setTranslucent().setNoPushMobility();
Material.plants = new MaterialLogic(MapColor.foliageColor).setNoPushMobility();
Material.vine = new MaterialLogic(MapColor.foliageColor).setBurning().setNoPushMobility().setReplaceable();
Material.sponge = new Material(MapColor.clothColor);
Material.cloth = new Material(MapColor.clothColor).setBurning();
Material.fire = new MaterialTransparent(MapColor.airColor).setNoPushMobility();
Material.sand = new Material(MapColor.sandColor);
Material.circuits = new MaterialLogic(MapColor.airColor).setNoPushMobility();
Material.glass = new Material(MapColor.airColor).setTranslucent().setAlwaysHarvested();
Material.redstoneLight = new Material(MapColor.airColor).setAlwaysHarvested();
Material.tnt = new Material(MapColor.tntColor).setBurning().setTranslucent();
Material.coral = new Material(MapColor.foliageColor).setNoPushMobility();
Material.ice = new Material(MapColor.iceColor).setTranslucent().setAlwaysHarvested();
Material.snow = new MaterialLogic(MapColor.snowColor).setReplaceable().setTranslucent().setRequiresTool().setNoPushMobility();
Material.craftedSnow = new Material(MapColor.snowColor).setRequiresTool();
Material.cactus = new Material(MapColor.foliageColor).setTranslucent().setNoPushMobility();
Material.clay = new Material(MapColor.clayColor);
Material.pumpkin = new Material(MapColor.foliageColor).setNoPushMobility();
Material.dragonEgg = new Material(MapColor.foliageColor).setNoPushMobility();
Material.portal = new MaterialPortal(MapColor.airColor).setImmovableMobility();
Material.cake = new Material(MapColor.airColor).setNoPushMobility();
Material.web = new MaterialWeb(MapColor.clothColor).setRequiresTool().setNoPushMobility();
Material.piston = new Material(MapColor.stoneColor).setImmovableMobility();
