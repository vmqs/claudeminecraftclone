import type { Minecraft } from '../client/Minecraft';
import type { Profiler } from '../client/Profiler';
import { MathHelper } from '../core/MathHelper';
import { GL } from '../render/gl/GL';
import { Tessellator } from '../render/gl/Tessellator';

const f = Math.fround;

/** DecimalFormat("##0.00"). */
function pct(v: number): string {
  return v.toFixed(2);
}

/**
 * The Shift+F3 profiler pie chart (Minecraft.displayDebugInfo / updateDebugProfilerName): the
 * children of the selected section as slices, 0 goes up a level and 1-9 open a child.
 */
export class GuiProfilerChart {
  debugProfilerName = 'root';

  constructor(private readonly profiler: Profiler) {}

  /** updateDebugProfilerName: 0 = parent, n = the n-th child. */
  select(n: number): void {
    const data = this.profiler.getProfilingData(this.debugProfilerName);
    if (!data || data.length === 0) return;
    const head = data.shift()!;
    if (n === 0) {
      if (head.name.length > 0) {
        const i = this.debugProfilerName.lastIndexOf('.');
        if (i >= 0) this.debugProfilerName = this.debugProfilerName.substring(0, i);
      }
    } else {
      n--;
      if (n < data.length && data[n].name !== 'unspecified') {
        if (this.debugProfilerName.length > 0) this.debugProfilerName += '.';
        this.debugProfilerName += data[n].name;
      }
    }
  }

  draw(mc: Minecraft): void {
    if (!this.profiler.profilingEnabled) return;
    const data = this.profiler.getProfilingData(this.debugProfilerName);
    if (!data || data.length === 0) return;
    const head = data.shift()!;
    GL.clear(GL.DEPTH_BUFFER_BIT);
    GL.matrixMode(GL.PROJECTION);
    GL.loadIdentity();
    GL.ortho(0, mc.displayWidth, mc.displayHeight, 0, 1000, 3000);
    GL.matrixMode(GL.MODELVIEW);
    GL.loadIdentity();
    GL.translate(0, 0, -2000);
    GL.lineWidth(1);
    GL.disable(GL.TEXTURE_2D);
    const t = Tessellator.instance;
    const r = 160;
    const cx = mc.displayWidth - r - 10;
    const cy = mc.displayHeight - r * 2;
    GL.enable(GL.BLEND);
    t.startDrawingQuads();
    t.setColorRGBA(0, 0, 0, 200);
    t.addVertex(f(cx - f(r * f(1.1))), f(f(cy - f(r * f(0.6))) - 16), 0);
    t.addVertex(f(cx - f(r * f(1.1))), cy + r * 2, 0);
    t.addVertex(f(cx + f(r * f(1.1))), cy + r * 2, 0);
    t.addVertex(f(cx + f(r * f(1.1))), f(f(cy - f(r * f(0.6))) - 16), 0);
    t.draw();
    GL.disable(GL.BLEND);
    let start = 0;
    for (const res of data) {
      const steps = MathHelper.floor_double(res.sectionPercent / 4) + 1;
      const angle = (i: number) => f(((start + (res.sectionPercent * i) / steps) * f(Math.PI) * 2) / 100);
      t.startDrawing(GL.TRIANGLE_FAN);
      t.setColorOpaque_I(res.getColor());
      t.addVertex(cx, cy, 0);
      for (let i = steps; i >= 0; i--) {
        const a = angle(i);
        t.addVertex(f(cx + f(MathHelper.sin(a) * r)), f(cy - f(f(MathHelper.cos(a) * r) * 0.5)), 0);
      }
      t.draw();
      t.startDrawing(GL.TRIANGLE_STRIP);
      t.setColorOpaque_I((res.getColor() & 0xfefefe) >> 1);
      for (let i = steps; i >= 0; i--) {
        const a = angle(i);
        const x = f(cx + f(MathHelper.sin(a) * r));
        const y = f(cy - f(f(MathHelper.cos(a) * r) * 0.5));
        t.addVertex(x, y, 0);
        t.addVertex(x, f(y + 10), 0);
      }
      t.draw();
      start += res.sectionPercent;
    }
    GL.enable(GL.TEXTURE_2D);
    const fr = mc.fontRenderer;
    let s = '';
    if (head.name !== 'unspecified') s += '[0] ';
    s += head.name.length === 0 ? 'ROOT ' : head.name + ' ';
    fr.drawStringWithShadow(s, cx - r, cy - r / 2 - 16, 0xffffff);
    s = pct(head.globalPercent) + '%';
    fr.drawStringWithShadow(s, cx + r - fr.getStringWidth(s), cy - r / 2 - 16, 0xffffff);
    for (let i = 0; i < data.length; i++) {
      const res = data[i];
      const y = cy + r / 2 + i * 8 + 20;
      s = (res.name === 'unspecified' ? '[?] ' : `[${i + 1}] `) + res.name;
      fr.drawStringWithShadow(s, cx - r, y, res.getColor());
      s = pct(res.sectionPercent) + '%';
      fr.drawStringWithShadow(s, cx + r - 50 - fr.getStringWidth(s), y, res.getColor());
      s = pct(res.globalPercent) + '%';
      fr.drawStringWithShadow(s, cx + r - fr.getStringWidth(s), y, res.getColor());
    }
  }
}
