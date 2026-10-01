import { GL } from './gl/GL';

// The two fixed light directions of RenderHelper (normalised (0.2, 1, -0.7) and (-0.2, 1, 0.7)).
const L0 = normalize([0.2, 1.0, -0.7]);
const L1 = normalize([-0.2, 1.0, 0.7]);

function normalize(v: number[]): number[] {
  const f = Math.fround;
  const x = f(v[0]), y = v[1], z = f(v[2]);
  const len = Math.sqrt(x * x + y * y + z * z);
  return [x / len, y / len, z / len];
}

/** Transforms a direction (w = 0) by the current model-view matrix, as glLight(GL_POSITION) does. */
function toEye(v: number[]): number[] {
  const m = GL.modelview.top;
  const x = m[0] * v[0] + m[4] * v[1] + m[8] * v[2];
  const y = m[1] * v[0] + m[5] * v[1] + m[9] * v[2];
  const z = m[2] * v[0] + m[6] * v[1] + m[10] * v[2];
  const len = Math.hypot(x, y, z) || 1;
  return [x / len, y / len, z / len];
}

export const RenderHelper = {
  disableStandardItemLighting(): void {
    GL.disable(GL.LIGHTING);
    GL.disable(GL.LIGHT0);
    GL.disable(GL.LIGHT1);
    GL.disable(GL.COLOR_MATERIAL);
  },

  /** Diffuse 0.6 per light, ambient 0.4; the light directions are captured in eye space now. */
  enableStandardItemLighting(): void {
    GL.enable(GL.LIGHTING);
    GL.enable(GL.LIGHT0);
    GL.enable(GL.LIGHT1);
    GL.enable(GL.COLOR_MATERIAL);
    GL.setLights(toEye(L0), toEye(L1));
  },

  enableGUIStandardItemLighting(): void {
    GL.pushMatrix();
    GL.rotate(-30, 0, 1, 0);
    GL.rotate(165, 1, 0, 0);
    RenderHelper.enableStandardItemLighting();
    GL.popMatrix();
  },
};
