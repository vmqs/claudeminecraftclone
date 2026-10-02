import type { Entity } from '../../entity/Entity';
import { GL } from '../gl/GL';
import { ModelBase } from './ModelBase';
import { ModelRenderer } from './ModelRenderer';

const f = Math.fround;

/** The ender crystal (ModelEnderCrystal): two glass cubes and a core spinning above a bedrock base. */
export class ModelEnderCrystal extends ModelBase {
  private readonly cube: ModelRenderer;
  private readonly glass: ModelRenderer;
  private readonly base: ModelRenderer | null = null;

  constructor(_grow: number, withBase: boolean) {
    super();
    this.glass = new ModelRenderer(this, 'glass');
    this.glass.setTextureOffset(0, 0).addBox(-4, -4, -4, 8, 8, 8);
    this.cube = new ModelRenderer(this, 'cube');
    this.cube.setTextureOffset(32, 0).addBox(-4, -4, -4, 8, 8, 8);
    if (withBase) {
      this.base = new ModelRenderer(this, 'base');
      this.base.setTextureOffset(0, 16).addBox(-6, 0, -6, 12, 4, 12);
    }
  }

  override render(_e: Entity | null, _ls: number, spin: number, bob: number, _yaw: number, _pitch: number, scale: number): void {
    GL.pushMatrix();
    GL.scale(2, 2, 2);
    GL.translate(0, -0.5, 0);
    this.base?.render(scale);
    GL.rotate(spin, 0, 1, 0);
    GL.translate(0, f(f(0.8) + bob), 0);
    GL.rotate(60, f(0.7071), 0, f(0.7071));
    this.glass.render(scale);
    const k = f(0.875);
    GL.scale(k, k, k);
    GL.rotate(60, f(0.7071), 0, f(0.7071));
    GL.rotate(spin, 0, 1, 0);
    this.glass.render(scale);
    GL.scale(k, k, k);
    GL.rotate(60, f(0.7071), 0, f(0.7071));
    GL.rotate(spin, 0, 1, 0);
    this.cube.render(scale);
    GL.popMatrix();
  }
}
