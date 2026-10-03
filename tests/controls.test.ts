// Controls and texture packs: key bindings and options (persistence, migration, reset), the
// sprint key in Hold and Toggle mode against a real World, the zoom key, and the texture
// pack importer (1.5 packs, 1.6+ resource packs, broken and hostile archives).
import '../src/block/Blocks';
import '../src/entity/Entities';
import { zipSync, strToU8 } from 'fflate';
import { BlockIds as B } from '../src/block/BlockIds';
import { EntityPlayerSP } from '../src/client/EntityPlayerSP';
import { EnumOptions, GameSettings } from '../src/client/GameSettings';
import { Keyboard } from '../src/client/Keyboard';
import { KeyBinding } from '../src/client/KeyBinding';
import { MovementInputFromOptions } from '../src/client/MovementInput';
import { ZoomKey } from '../src/client/Zoom';
import { PlayerSpawning } from '../src/entity/PlayerSpawning';
import { PlayerControllerMP } from '../src/client/PlayerControllerMP';
import { registerBlockItems } from '../src/item/Items';
import { Chunk } from '../src/world/Chunk';
import { World, WorldInfo } from '../src/world/World';
import { LIMITS, mcmetaToFrames, PackImportError, parseModernMap, pngSize, readTexturePack, type ImportedPack } from '../src/assets/PackImport';
import { CLASSIC_SIZES, MODERN_TEXTURES } from '../src/assets/ModernPackMap';
import { check, report } from './harness';

registerBlockItems();

// --- options in a fake localStorage ---------------------------------------------------------
const store = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
};

{
  const gs = new GameSettings();
  const names = gs.keyBindings.map((k) => k.keyDescription);
  check('25 bindings', gs.keyBindings.length === 25, String(gs.keyBindings.length));
  check('original 14 first, in order', names.slice(0, 14).join() === 'key.attack,key.use,key.forward,key.left,key.back,key.right,key.jump,key.sneak,key.drop,key.inventory,key.chat,key.playerlist,key.pickItem,key.command', names.slice(0, 14).join());
  check('sprint is I, zoom is C', gs.keyBindSprint.keyCode === 23 && gs.keyBindZoom.keyCode === 46);
  check('hotbar keys are 1-9', gs.keyBindsHotbar.map((k) => k.keyCode).join() === '2,3,4,5,6,7,8,9,10');
  check('English names without a lang file', gs.getKeyBindingDescription(14) === 'Sprint' && gs.getKeyBindingDescription(15) === 'Zoom' && gs.getKeyBindingDescription(24) === 'Hotbar Slot 9', [14, 15, 24].map((i) => gs.getKeyBindingDescription(i)).join('|'));
  check('sprint mode label', gs.getKeyBinding(EnumOptions.SPRINT_MODE) === 'Sprint: Hold');
  gs.setOptionValue(EnumOptions.SPRINT_MODE, 1);
  check('sprint mode toggles', gs.toggleSprint && gs.getKeyBinding(EnumOptions.SPRINT_MODE) === 'Sprint: Toggle');
  gs.setKeyBinding(15, 19); // zoom -> R
  gs.setKeyBinding(16, -97); // hotbar 1 -> mouse button 4
  const saved = store.get('mc152.options') ?? '';
  check('saved', saved.includes('toggleSprint:true') && saved.includes('key_of.key.zoom:19') && saved.includes('key_key.hotbar.1:-97'));
  const again = new GameSettings();
  check('loaded back', again.toggleSprint && again.keyBindZoom.keyCode === 19 && again.keyBindsHotbar[0].keyCode === -97);
  again.resetKeyBindings();
  check('reset keys', again.keyBindings.every((k) => k.keyCode === k.keyCodeDefault) && again.toggleSprint, again.keyBindings.map((k) => k.keyCode).join());
  check('reset keys saved', (store.get('mc152.options') ?? '').includes('key_of.key.zoom:46'));
  // Options saved before these bindings existed: the old ones load, the new ones keep defaults.
  store.set('mc152.options', ['music:0.5', 'key_key.forward:200', 'key_key.jump:46', 'fov:0.25'].join('\n'));
  const old = new GameSettings();
  check('migration keeps old values', old.keyBindForward.keyCode === 200 && old.keyBindJump.keyCode === 46 && old.musicVolume === 0.5);
  check('migration adds new defaults', old.keyBindSprint.keyCode === 23 && old.keyBindZoom.keyCode === 46 && old.keyBindsHotbar[8].keyCode === 10 && !old.toggleSprint);
  store.clear();
}

// --- the sprint key -------------------------------------------------------------------------
function makeWorld(): World {
  const info = new WorldInfo();
  info.gameType = 0;
  info.spawnX = 8;
  info.spawnY = 4;
  info.spawnZ = 8;
  const w = new World(info);
  for (let cx = -2; cx <= 2; cx++) for (let cz = -2; cz <= 2; cz++) w.addChunk(new Chunk(w as never, cx, cz));
  for (let x = -32; x < 48; x++) for (let z = -32; z < 48; z++) for (let y = 0; y < 4; y++) w.setBlock(x, y, z, y === 0 ? B.bedrock : B.stone);
  return w;
}

function sprintSession(toggle: boolean) {
  const gs = new GameSettings(false);
  gs.toggleSprint = toggle;
  KeyBinding.resetKeyBindingArrayAndHash();
  const w = makeWorld();
  const mc = {
    theWorld: w,
    thePlayer: null as EntityPlayerSP | null,
    sndManager: { playSound() {} },
    displayGuiScreen() {},
    playSoundFX() {},
    effectRenderer: { addEffect() {} },
    ingameGUI: { getChatGUI: () => ({ printChatMessage() {}, addTranslatedMessage() {} }) },
    gameSettings: gs,
    respawnPlayer() {},
  };
  const p = new EntityPlayerSP(mc as never, w, 'Player');
  mc.thePlayer = p;
  const pc = new PlayerControllerMP(mc as never);
  p.setLocationAndAngles(0.5, 4, 0.5, 0, 0);
  w.spawnEntityInWorld(p);
  pc.setGameType(PlayerSpawning.initializeGameType(p, w.worldInfo));
  pc.setPlayerCapabilities(p);
  p.movementInput = new MovementInputFromOptions(gs);
  const key = (k: KeyBinding, down: boolean) => {
    KeyBinding.setKeyBindState(k.keyCode, down);
    if (down) KeyBinding.onTick(k.keyCode);
  };
  const tick = (n = 1) => {
    for (let i = 0; i < n; i++) {
      p.onUpdate();
      w.updateEntities();
    }
  };
  return { gs, w, p, key, tick };
}

{
  const s = sprintSession(false);
  s.key(s.gs.keyBindForward, true);
  s.tick(3);
  check('walking does not sprint', !s.p.isSprinting());
  s.key(s.gs.keyBindSprint, true);
  s.tick(1);
  check('hold: sprints while held', s.p.isSprinting());
  s.tick(5);
  check('hold: keeps sprinting', s.p.isSprinting());
  s.key(s.gs.keyBindSprint, false);
  s.tick(1);
  check('hold: letting go stops', !s.p.isSprinting());
  // Double-tapping forward still works and is not stopped by the untouched sprint key.
  s.key(s.gs.keyBindForward, false);
  s.tick(1);
  s.key(s.gs.keyBindForward, true);
  s.tick(1);
  s.key(s.gs.keyBindForward, false);
  s.tick(1);
  s.key(s.gs.keyBindForward, true);
  s.tick(1);
  check('double-tap forward sprints', s.p.isSprinting());
  s.tick(3);
  check('double-tap sprint keeps going', s.p.isSprinting());
  // Conditions: hungry, sneaking, standing still.
  s.key(s.gs.keyBindForward, false);
  s.tick(1);
  check('stopping ends the sprint', !s.p.isSprinting());
  s.p.getFoodStats().setFoodLevel(6);
  s.key(s.gs.keyBindForward, true);
  s.key(s.gs.keyBindSprint, true);
  s.tick(2);
  check('hold: no sprint with 3 shanks', !s.p.isSprinting());
  s.p.getFoodStats().setFoodLevel(20);
  s.key(s.gs.keyBindSneak, true);
  s.tick(2);
  check('hold: no sprint while sneaking', !s.p.isSprinting());
  s.key(s.gs.keyBindSneak, false);
  s.tick(1);
  check('hold: starts once the conditions allow', s.p.isSprinting());
  s.key(s.gs.keyBindForward, false);
  s.tick(1);
  s.key(s.gs.keyBindForward, true);
  s.tick(1);
  check('hold: starts again after a stop', s.p.isSprinting());
}

{
  const s = sprintSession(true);
  s.key(s.gs.keyBindForward, true);
  s.key(s.gs.keyBindSprint, true);
  s.tick(1);
  s.key(s.gs.keyBindSprint, false);
  s.tick(1);
  check('toggle: one press turns sprint on', s.p.isSprinting() && s.gs.sprintToggledOn);
  s.tick(10);
  check('toggle: stays on without holding', s.p.isSprinting());
  s.key(s.gs.keyBindForward, false);
  s.tick(2);
  check('toggle: stopping ends the sprint', !s.p.isSprinting());
  s.key(s.gs.keyBindForward, true);
  s.tick(1);
  check('toggle: re-engages while toggled on', s.p.isSprinting());
  s.p.sprintingTicksLeft = 1;
  s.tick(1);
  s.tick(1);
  check('toggle: re-engages after the 30 s limit', s.p.isSprinting());
  s.key(s.gs.keyBindSprint, true);
  s.tick(1);
  s.key(s.gs.keyBindSprint, false);
  s.tick(1);
  check('toggle: a second press turns it off', !s.p.isSprinting() && !s.gs.sprintToggledOn);
  s.tick(5);
  check('toggle: stays off', !s.p.isSprinting());
}

// --- the zoom key ---------------------------------------------------------------------------
{
  const gs = new GameSettings(false);
  KeyBinding.resetKeyBindingArrayAndHash();
  const client = { gameSettings: gs, currentScreen: null as unknown, theWorld: {} as unknown };
  let released = 0;
  const zoom = new ZoomKey(client, () => released++);
  const down = (on: boolean) => Keyboard.push({ key: gs.keyBindZoom.keyCode, state: on, char: '\0', repeat: false });
  check('zoom off', !zoom.update() && zoom.apply(70) === 70);
  down(true);
  check('zoom while held', zoom.update() && zoom.apply(70) === 17.5 && gs.smoothCamera);
  client.currentScreen = {};
  check('no zoom with a screen open', !zoom.update() && !gs.smoothCamera && released === 1);
  client.currentScreen = null;
  gs.smoothCamera = true;
  check('zoom again', zoom.update() && gs.smoothCamera);
  down(false);
  check('release keeps an F8 smooth camera', !zoom.update() && gs.smoothCamera && released === 2);
  gs.keyBindZoom.keyCode = 19;
  Keyboard.push({ key: 19, state: true, char: '\0', repeat: false });
  check('rebound zoom key', zoom.update());
  Keyboard.push({ key: 19, state: false, char: '\0', repeat: false });
  zoom.update();
  while (Keyboard.next());
}

// --- texture pack import --------------------------------------------------------------------
/** Just enough of a PNG for the importer's header check. */
function png(w: number, h: number): Uint8Array {
  const out = new Uint8Array(33 + 12);
  out.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  const dv = new DataView(out.buffer);
  dv.setUint32(16, w);
  dv.setUint32(20, h);
  out.set([8, 6, 0, 0, 0], 24);
  out.set([0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44], 33);
  return out;
}

const modern = parseModernMap(MODERN_TEXTURES, CLASSIC_SIZES);
check('modern table', modern.textures.size > 1000 && modern.textures.get('blocks/log_oak.png')?.[0] === 'textures/blocks/tree_side.png' && modern.textures.get('block/oak_log.png')?.[0] === 'textures/blocks/tree_side.png');
check('modern table: GUI and entities', modern.textures.get('gui/widgets.png')?.[0] === 'gui/gui.png' && modern.textures.get('entity/pig/pig.png')?.[0] === 'mob/pig.png' && modern.sizes.get('mob/char.png')?.join() === '64,32');
check('modern table: carrots are not beetroots', modern.textures.get('block/carrots_stage0.png')?.join() === 'textures/blocks/carrots_0.png' && !modern.textures.has('block/beetroots_stage0.png'));

function expectError(name: string, fn: () => unknown): void {
  try {
    fn();
    check(name, false, 'no error');
  } catch (e) {
    check(name, e instanceof PackImportError, String(e));
  }
}

{
  const zip = zipSync({
    'My Pack/pack.txt': strToU8('Line one\nLine two'),
    'My Pack/pack.png': png(64, 64),
    'My Pack/textures/blocks/stone.png': png(32, 32),
    'My Pack/textures/blocks/water.png': png(32, 1024),
    'My Pack/textures/blocks/water.txt': strToU8('0*2,1*2'),
    'My Pack/textures/blocks/wide.png': png(64, 32),
    'My Pack/textures/items/apple.png': png(32, 32),
    'My Pack/gui/gui.png': png(512, 512),
    'My Pack/mob/pig.png': png(128, 64),
    'My Pack/ctm/glass/1.png': png(16, 16),
    'My Pack/textures/blocks/notes.psd': strToU8('x'),
    'My Pack/gui/broken.png': strToU8('not a png'),
    '__MACOSX/My Pack/._pack.txt': strToU8('junk'),
    'My Pack/.DS_Store': strToU8('junk'),
  });
  const pack = readTexturePack('My Pack.zip', zip, modern);
  const files = [...pack.files.keys()].sort();
  check('classic: name', pack.name === 'My Pack');
  check('classic: description', pack.description === 'Line one\nLine two', JSON.stringify(pack.description));
  check('classic: folder stripped and files kept', files.join() === 'gui/gui.png,mob/pig.png,pack.png,pack.txt,textures/blocks/stone.png,textures/blocks/water.png,textures/blocks/water.txt,textures/items/apple.png', files.join());
  check('classic: compatible', pack.layout === 'classic' && pack.compatible);
  check('classic: notes', pack.notes.some((n) => n.includes('left out')) && pack.notes.some((n) => n.includes('broken')), pack.notes.join('; '));
}

{
  // A pre-1.5 pack: no textures/ folder, so "Incompatible" like 1.5.2 shows it.
  const pack = readTexturePack('old.zip', zipSync({ 'terrain.png': png(256, 256), 'gui/gui.png': png(256, 256), 'pack.txt': strToU8('Old') }), modern);
  check('pre-1.5 pack is incompatible', !pack.compatible && pack.files.has('gui/gui.png') && !pack.files.has('terrain.png') && pack.notes.some((n) => n.includes('pre-1.5')), pack.notes.join('; '));
}

{
  const mcmeta = JSON.stringify({ pack: { pack_format: 1, description: { text: 'Modern ', extra: [{ text: 'pack', color: 'gold' }] } } });
  const zip = zipSync({
    'pack.mcmeta': strToU8(mcmeta),
    'pack.png': png(128, 128),
    'assets/minecraft/textures/blocks/log_oak.png': png(32, 32),
    'assets/minecraft/textures/blocks/water_still.png': png(32, 1024),
    'assets/minecraft/textures/blocks/water_still.png.mcmeta': strToU8(JSON.stringify({ animation: { frametime: 2 } })),
    'assets/minecraft/textures/gui/widgets.png': png(512, 512),
    'assets/minecraft/textures/entity/steve.png': png(64, 64),
    'assets/minecraft/textures/entity/pig/pig.png': png(64, 32),
    'assets/minecraft/textures/entity/chest/normal.png': png(64, 64),
    'assets/minecraft/textures/block/unknown_thing.png': png(16, 16),
    'assets/minecraft/models/block/stone.json': strToU8('{}'),
    'assets/minecraft/sounds.json': strToU8('{}'),
  });
  const pack = readTexturePack('Modern.zip', zip, modern);
  const f = pack.files;
  check('modern: layout and description', pack.layout === 'modern' && pack.description === 'Modern pack', pack.description);
  check('modern: blocks renamed', f.has('textures/blocks/tree_side.png') && f.has('textures/blocks/water.png'));
  check('modern: mcmeta animation', new TextDecoder().decode(f.get('textures/blocks/water.txt')).startsWith('0*2,1*2,'), String(f.has('textures/blocks/water.txt')));
  check('modern: gui and entities', f.has('gui/gui.png') && f.has('mob/pig.png') && f.has('item/chest.png') && f.has('pack.png'));
  check('modern: 64x64 skin left out', !f.has('mob/char.png'));
  check('modern: compatible', pack.compatible);
  check('modern: notes', pack.notes.some((n) => n.includes('format 1')) && pack.notes.some((n) => n.includes('different layout')) && pack.notes.some((n) => n.includes('no place')), pack.notes.join('; '));
  const later = readTexturePack('Later.zip', zipSync({ 'pack.mcmeta': strToU8('{"pack":{"pack_format":15,"description":"x"}}'), 'assets/minecraft/textures/entity/chest/normal.png': png(64, 64), 'assets/minecraft/textures/block/oak_log.png': png(16, 16) }), modern);
  check('modern: 1.15+ chests left out', !later.files.has('item/chest.png') && later.files.has('textures/blocks/tree_side.png'));
}

expectError('not a zip', () => readTexturePack('x.zip', strToU8('hello world, this is not a zip at all'), modern));
expectError('truncated zip', () => readTexturePack('x.zip', zipSync({ 'pack.txt': strToU8('x'), 'textures/blocks/stone.png': png(16, 16) }).slice(0, 40), modern));
expectError('nothing usable', () => readTexturePack('x.zip', zipSync({ 'readme.md': strToU8('x'), 'models/a.json': strToU8('{}') }), modern));
expectError('too large', () => readTexturePack('x.zip', new Uint8Array(LIMITS.zipBytes + 1), modern));
{
  // Unsafe names never become paths.
  const pack = readTexturePack('x.zip', zipSync({ '../evil.png': png(16, 16), 'textures/blocks/../../gui/gui.png': png(16, 16), 'textures/blocks/stone.png': png(16, 16) }), modern);
  check('unsafe paths dropped', [...pack.files.keys()].join() === 'textures/blocks/stone.png', [...pack.files.keys()].join());
}
check('pngSize', pngSize(png(48, 96))?.height === 96 && pngSize(strToU8('nope')) === null);
check('mcmeta frames list', mcmetaToFrames('{"animation":{"frametime":3,"frames":[0,{"index":2,"time":5},9]}}', 4) === '0*3,2*5');
check('mcmeta default', mcmetaToFrames('{"animation":{}}', 4) === null && mcmetaToFrames('garbage', 4) === null);

report();
