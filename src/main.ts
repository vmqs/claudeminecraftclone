import { ResourceManager, setResourceManager } from './assets/ResourceManager';

async function boot(): Promise<void> {
  const canvas = document.getElementById('game') as HTMLCanvasElement;
  const rm = new ResourceManager();
  await rm.init();
  setResourceManager(rm);
  canvas.dataset.ready = '1';
}

void boot();
