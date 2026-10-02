import { JavaRandom } from '../../core/JavaRandom';
import type { Entity } from '../../entity/Entity';
import type { EntityLightningBolt } from '../../entity/EntityLightningBolt';
import { GL } from '../gl/GL';
import { Tessellator } from '../gl/Tessellator';
import { Render } from './Render';

const f = Math.fround;

/**
 * RenderLightningBolt: a jagged main channel of 8 segments, 16 blocks each, with two branches,
 * drawn as four additive, widening triangle-strip shells. The shape is replayed from
 * boltVertex, so it holds still for a strike and changes with every restrike.
 */
export class RenderLightningBolt extends Render {
  doRender(e: Entity, x: number, y: number, z: number, _yaw: number, _pt: number): void {
    const bolt = e as EntityLightningBolt;
    const t = Tessellator.instance;
    GL.disable(GL.TEXTURE_2D);
    GL.disable(GL.LIGHTING);
    GL.enable(GL.BLEND);
    GL.blendFunc(GL.SRC_ALPHA, GL.ONE);
    // Offsets of the main channel's joints, from the top (index 7) down to the ground.
    const jointX = new Float64Array(8);
    const jointZ = new Float64Array(8);
    let endX = 0;
    let endZ = 0;
    const shape = new JavaRandom(bolt.boltVertex);
    for (let i = 7; i >= 0; i--) {
      jointX[i] = endX;
      jointZ[i] = endZ;
      endX += shape.nextInt(11) - 5;
      endZ += shape.nextInt(11) - 5;
    }
    for (let shell = 0; shell < 4; shell++) {
      const rand = new JavaRandom(bolt.boltVertex);
      for (let branch = 0; branch < 3; branch++) {
        let top = 7;
        let bottom = 0;
        if (branch > 0) {
          top = 7 - branch;
          bottom = top - 2;
        }
        let ox = jointX[top] - endX;
        let oz = jointZ[top] - endZ;
        for (let seg = top; seg >= bottom; seg--) {
          const prevX = ox;
          const prevZ = oz;
          if (branch === 0) {
            ox += rand.nextInt(11) - 5;
            oz += rand.nextInt(11) - 5;
          } else {
            ox += rand.nextInt(31) - 15;
            oz += rand.nextInt(31) - 15;
          }
          t.startDrawing(GL.TRIANGLE_STRIP);
          const c = f(0.5);
          t.setColorRGBA_F(f(f(0.9) * c), f(f(0.9) * c), f(1 * c), f(0.3));
          // Half widths at the segment's upper and lower joint; the main channel widens upwards.
          let upper = 0.1 + shell * 0.2;
          if (branch === 0) upper *= seg * 0.1 + 1;
          let lower = 0.1 + shell * 0.2;
          if (branch === 0) lower *= (seg - 1) * 0.1 + 1;
          for (let corner = 0; corner < 5; corner++) {
            let ux = x + 0.5 - upper;
            let uz = z + 0.5 - upper;
            if (corner === 1 || corner === 2) ux += upper * 2;
            if (corner === 2 || corner === 3) uz += upper * 2;
            let lx = x + 0.5 - lower;
            let lz = z + 0.5 - lower;
            if (corner === 1 || corner === 2) lx += lower * 2;
            if (corner === 2 || corner === 3) lz += lower * 2;
            t.addVertex(lx + ox, y + seg * 16, lz + oz);
            t.addVertex(ux + prevX, y + (seg + 1) * 16, uz + prevZ);
          }
          t.draw();
        }
      }
    }
    GL.disable(GL.BLEND);
    GL.enable(GL.LIGHTING);
    GL.enable(GL.TEXTURE_2D);
  }
}
