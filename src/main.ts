import { ResourceManager, setResourceManager } from './assets/ResourceManager';
import './block/Blocks';
import './item/Items';
import './item/ItemBindings';
import './gui/inventory/ContainerBindings';
import { installDevHooks } from './client/DevTools';
import { Minecraft } from './client/Minecraft';
import { GL } from './render/gl/GL';

async function boot(): Promise<void> {
  const canvas = document.getElementById('game') as HTMLCanvasElement;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.round(canvas.clientWidth * dpr));
  canvas.height = Math.max(1, Math.round(canvas.clientHeight * dpr));
  GL.init(canvas);
  GL.pixelRatio = dpr;
  const rm = new ResourceManager();
  await rm.init();
  setResourceManager(rm);
  const mc = new Minecraft(canvas, rm);
  await mc.startGame();
  mc.run();
  installDevHooks(mc, new URLSearchParams(location.search));
  canvas.dataset.ready = '1';
  canvas.focus();
}

void boot().catch((e: unknown) => {
  console.error(e);
  document.body.style.color = '#fff';
  document.body.textContent = `Failed to start: ${e instanceof Error ? e.message : String(e)}`;
});
