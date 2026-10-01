import { Vec3 } from '../../core/Vec3';
import { type DisplayList, GL } from '../gl/GL';
import { Tessellator } from '../gl/Tessellator';
import type { ModelBase } from './ModelBase';

const f = Math.fround;
const RAD_TO_DEG = f(180 / f(Math.PI));

export class PositionTextureVertex {
  constructor(
    readonly vector3D: Vec3,
    readonly texturePositionX: number,
    readonly texturePositionY: number,
  ) {}

  static of(x: number, y: number, z: number, u: number, v: number): PositionTextureVertex {
    return new PositionTextureVertex(new Vec3(x, y, z), u, v);
  }

  setTexturePosition(u: number, v: number): PositionTextureVertex {
    return new PositionTextureVertex(this.vector3D, u, v);
  }
}

export class TexturedQuad {
  vertexPositions: PositionTextureVertex[];
  invertNormal = false;

  constructor(v: PositionTextureVertex[], u0?: number, v0?: number, u1?: number, v1?: number, texW?: number, texH?: number) {
    this.vertexPositions = v;
    if (u0 !== undefined && texW !== undefined && texH !== undefined) {
      v[0] = v[0].setTexturePosition(f(u1! / texW), f(v0! / texH));
      v[1] = v[1].setTexturePosition(f(u0 / texW), f(v0! / texH));
      v[2] = v[2].setTexturePosition(f(u0 / texW), f(v1! / texH));
      v[3] = v[3].setTexturePosition(f(u1! / texW), f(v1! / texH));
    }
  }

  flipFace(): void {
    this.vertexPositions = [...this.vertexPositions].reverse();
  }

  draw(t: Tessellator, scale: number): void {
    const a = this.vertexPositions[1].vector3D.subtract(this.vertexPositions[0].vector3D);
    const b = this.vertexPositions[1].vector3D.subtract(this.vertexPositions[2].vector3D);
    const n = b.crossProduct(a).normalize();
    t.startDrawingQuads();
    if (this.invertNormal) t.setNormal(-f(n.xCoord), -f(n.yCoord), -f(n.zCoord));
    else t.setNormal(f(n.xCoord), f(n.yCoord), f(n.zCoord));
    for (let i = 0; i < 4; i++) {
      const p = this.vertexPositions[i];
      t.addVertexWithUV(f(p.vector3D.xCoord) * scale, f(p.vector3D.yCoord) * scale, f(p.vector3D.zCoord) * scale, p.texturePositionX, p.texturePositionY);
    }
    t.draw();
  }
}

export class ModelBox {
  private readonly quadList: TexturedQuad[] = [];
  readonly posX1: number;
  readonly posY1: number;
  readonly posZ1: number;
  readonly posX2: number;
  readonly posY2: number;
  readonly posZ2: number;
  boxName: string | null = null;

  constructor(r: ModelRenderer, texU: number, texV: number, x: number, y: number, z: number, w: number, h: number, d: number, grow: number) {
    this.posX1 = x;
    this.posY1 = y;
    this.posZ1 = z;
    this.posX2 = x + w;
    this.posY2 = y + h;
    this.posZ2 = z + d;
    let x2 = f(x + w);
    const y2 = f(y + h);
    const z2 = f(z + d);
    x = f(x - grow);
    y = f(y - grow);
    z = f(z - grow);
    x2 = f(x2 + grow);
    const yy2 = f(y2 + grow);
    const zz2 = f(z2 + grow);
    if (r.mirror) [x, x2] = [x2, x];
    const v0 = PositionTextureVertex.of(x, y, z, 0, 0);
    const v1 = PositionTextureVertex.of(x2, y, z, 0, 8);
    const v2 = PositionTextureVertex.of(x2, yy2, z, 8, 8);
    const v3 = PositionTextureVertex.of(x, yy2, z, 8, 0);
    const v4 = PositionTextureVertex.of(x, y, zz2, 0, 0);
    const v5 = PositionTextureVertex.of(x2, y, zz2, 0, 8);
    const v6 = PositionTextureVertex.of(x2, yy2, zz2, 8, 8);
    const v7 = PositionTextureVertex.of(x, yy2, zz2, 8, 0);
    const tw = r.textureWidth;
    const th = r.textureHeight;
    this.quadList.push(new TexturedQuad([v5, v1, v2, v6], texU + d + w, texV + d, texU + d + w + d, texV + d + h, tw, th));
    this.quadList.push(new TexturedQuad([v0, v4, v7, v3], texU, texV + d, texU + d, texV + d + h, tw, th));
    this.quadList.push(new TexturedQuad([v5, v4, v0, v1], texU + d, texV, texU + d + w, texV + d, tw, th));
    this.quadList.push(new TexturedQuad([v2, v3, v7, v6], texU + d + w, texV + d, texU + d + w + w, texV, tw, th));
    this.quadList.push(new TexturedQuad([v1, v0, v3, v2], texU + d, texV + d, texU + d + w, texV + d + h, tw, th));
    this.quadList.push(new TexturedQuad([v4, v5, v6, v7], texU + d + w + d, texV + d, texU + d + w + d + w, texV + d + h, tw, th));
    if (r.mirror) for (const q of this.quadList) q.flipFace();
  }

  render(t: Tessellator, scale: number): void {
    for (const q of this.quadList) q.draw(t, scale);
  }
}

/** A posable model part (ModelRenderer): boxes compiled into a display list, plus children. */
export class ModelRenderer {
  textureWidth = 64;
  textureHeight = 32;
  private textureOffsetX = 0;
  private textureOffsetY = 0;
  rotationPointX = 0;
  rotationPointY = 0;
  rotationPointZ = 0;
  rotateAngleX = 0;
  rotateAngleY = 0;
  rotateAngleZ = 0;
  private compiled = false;
  private displayList: DisplayList | null = null;
  mirror = false;
  showModel = true;
  isHidden = false;
  readonly cubeList: ModelBox[] = [];
  childModels: ModelRenderer[] | null = null;
  offsetX = 0;
  offsetY = 0;
  offsetZ = 0;

  constructor(
    private readonly baseModel: ModelBase,
    texU = 0,
    texV = 0,
    readonly boxName: string | null = null,
  ) {
    baseModel.boxList.push(this);
    this.setTextureSize(baseModel.textureWidth, baseModel.textureHeight);
    this.setTextureOffset(texU, texV);
  }

  addChild(r: ModelRenderer): void {
    (this.childModels ??= []).push(r);
  }

  setTextureOffset(u: number, v: number): this {
    this.textureOffsetX = u;
    this.textureOffsetY = v;
    return this;
  }

  addBox(x: number, y: number, z: number, w: number, h: number, d: number, grow = 0): this {
    this.cubeList.push(new ModelBox(this, this.textureOffsetX, this.textureOffsetY, x, y, z, w, h, d, grow));
    return this;
  }

  setRotationPoint(x: number, y: number, z: number): void {
    this.rotationPointX = x;
    this.rotationPointY = y;
    this.rotationPointZ = z;
  }

  private renderChildren(scale: number): void {
    if (this.childModels) for (const c of this.childModels) c.render(scale);
  }

  render(scale: number): void {
    if (this.isHidden || !this.showModel) return;
    if (!this.compiled) this.compileDisplayList(scale);
    GL.translate(this.offsetX, this.offsetY, this.offsetZ);
    if (this.rotateAngleX !== 0 || this.rotateAngleY !== 0 || this.rotateAngleZ !== 0) {
      GL.pushMatrix();
      GL.translate(this.rotationPointX * scale, this.rotationPointY * scale, this.rotationPointZ * scale);
      if (this.rotateAngleZ !== 0) GL.rotate(this.rotateAngleZ * RAD_TO_DEG, 0, 0, 1);
      if (this.rotateAngleY !== 0) GL.rotate(this.rotateAngleY * RAD_TO_DEG, 0, 1, 0);
      if (this.rotateAngleX !== 0) GL.rotate(this.rotateAngleX * RAD_TO_DEG, 1, 0, 0);
      GL.callList(this.displayList!);
      this.renderChildren(scale);
      GL.popMatrix();
    } else if (this.rotationPointX === 0 && this.rotationPointY === 0 && this.rotationPointZ === 0) {
      GL.callList(this.displayList!);
      this.renderChildren(scale);
    } else {
      GL.translate(this.rotationPointX * scale, this.rotationPointY * scale, this.rotationPointZ * scale);
      GL.callList(this.displayList!);
      this.renderChildren(scale);
      GL.translate(-this.rotationPointX * scale, -this.rotationPointY * scale, -this.rotationPointZ * scale);
    }
    GL.translate(-this.offsetX, -this.offsetY, -this.offsetZ);
  }

  renderWithRotation(scale: number): void {
    if (this.isHidden || !this.showModel) return;
    if (!this.compiled) this.compileDisplayList(scale);
    GL.pushMatrix();
    GL.translate(this.rotationPointX * scale, this.rotationPointY * scale, this.rotationPointZ * scale);
    if (this.rotateAngleY !== 0) GL.rotate(this.rotateAngleY * RAD_TO_DEG, 0, 1, 0);
    if (this.rotateAngleX !== 0) GL.rotate(this.rotateAngleX * RAD_TO_DEG, 1, 0, 0);
    if (this.rotateAngleZ !== 0) GL.rotate(this.rotateAngleZ * RAD_TO_DEG, 0, 0, 1);
    GL.callList(this.displayList!);
    GL.popMatrix();
  }

  /** Applies this part's transform without drawing (to attach held items). */
  postRender(scale: number): void {
    if (this.isHidden || !this.showModel) return;
    if (!this.compiled) this.compileDisplayList(scale);
    if (this.rotateAngleX !== 0 || this.rotateAngleY !== 0 || this.rotateAngleZ !== 0) {
      GL.translate(this.rotationPointX * scale, this.rotationPointY * scale, this.rotationPointZ * scale);
      if (this.rotateAngleZ !== 0) GL.rotate(this.rotateAngleZ * RAD_TO_DEG, 0, 0, 1);
      if (this.rotateAngleY !== 0) GL.rotate(this.rotateAngleY * RAD_TO_DEG, 0, 1, 0);
      if (this.rotateAngleX !== 0) GL.rotate(this.rotateAngleX * RAD_TO_DEG, 1, 0, 0);
    } else if (this.rotationPointX !== 0 || this.rotationPointY !== 0 || this.rotationPointZ !== 0) {
      GL.translate(this.rotationPointX * scale, this.rotationPointY * scale, this.rotationPointZ * scale);
    }
  }

  private compileDisplayList(scale: number): void {
    this.displayList = GL.genList();
    GL.newList(this.displayList);
    const t = Tessellator.instance;
    for (const b of this.cubeList) b.render(t, scale);
    GL.endList();
    this.compiled = true;
  }

  setTextureSize(w: number, h: number): this {
    this.textureWidth = w;
    this.textureHeight = h;
    return this;
  }
}
