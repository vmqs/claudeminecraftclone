/** Column-major 4x4 matrices (like OpenGL), stored in Float64Array for precision. */
export type Mat4 = Float64Array;

export function mat4Identity(out: Mat4 = new Float64Array(16)): Mat4 {
  out.fill(0);
  out[0] = out[5] = out[10] = out[15] = 1;
  return out;
}

/** out = a * b */
export function mat4Mul(out: Mat4, a: Mat4, b: Mat4): Mat4 {
  const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
  const a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
  const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
  const a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];
  for (let i = 0; i < 4; i++) {
    const b0 = b[i * 4], b1 = b[i * 4 + 1], b2 = b[i * 4 + 2], b3 = b[i * 4 + 3];
    out[i * 4] = a00 * b0 + a10 * b1 + a20 * b2 + a30 * b3;
    out[i * 4 + 1] = a01 * b0 + a11 * b1 + a21 * b2 + a31 * b3;
    out[i * 4 + 2] = a02 * b0 + a12 * b1 + a22 * b2 + a32 * b3;
    out[i * 4 + 3] = a03 * b0 + a13 * b1 + a23 * b2 + a33 * b3;
  }
  return out;
}

export function mat4Invert(out: Mat4, m: Mat4): Mat4 | null {
  const a00 = m[0], a01 = m[1], a02 = m[2], a03 = m[3];
  const a10 = m[4], a11 = m[5], a12 = m[6], a13 = m[7];
  const a20 = m[8], a21 = m[9], a22 = m[10], a23 = m[11];
  const a30 = m[12], a31 = m[13], a32 = m[14], a33 = m[15];
  const b00 = a00 * a11 - a01 * a10;
  const b01 = a00 * a12 - a02 * a10;
  const b02 = a00 * a13 - a03 * a10;
  const b03 = a01 * a12 - a02 * a11;
  const b04 = a01 * a13 - a03 * a11;
  const b05 = a02 * a13 - a03 * a12;
  const b06 = a20 * a31 - a21 * a30;
  const b07 = a20 * a32 - a22 * a30;
  const b08 = a20 * a33 - a23 * a30;
  const b09 = a21 * a32 - a22 * a31;
  const b10 = a21 * a33 - a23 * a31;
  const b11 = a22 * a33 - a23 * a32;
  let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
  if (!det) return null;
  det = 1 / det;
  out[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det;
  out[1] = (a02 * b10 - a01 * b11 - a03 * b09) * det;
  out[2] = (a31 * b05 - a32 * b04 + a33 * b03) * det;
  out[3] = (a22 * b04 - a21 * b05 - a23 * b03) * det;
  out[4] = (a12 * b08 - a10 * b11 - a13 * b07) * det;
  out[5] = (a00 * b11 - a02 * b08 + a03 * b07) * det;
  out[6] = (a32 * b02 - a30 * b05 - a33 * b01) * det;
  out[7] = (a20 * b05 - a22 * b02 + a23 * b01) * det;
  out[8] = (a10 * b10 - a11 * b08 + a13 * b06) * det;
  out[9] = (a01 * b08 - a00 * b10 - a03 * b06) * det;
  out[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det;
  out[11] = (a21 * b02 - a20 * b04 - a23 * b00) * det;
  out[12] = (a11 * b07 - a10 * b09 - a12 * b06) * det;
  out[13] = (a00 * b09 - a01 * b07 + a02 * b06) * det;
  out[14] = (a31 * b01 - a30 * b03 - a32 * b00) * det;
  out[15] = (a20 * b03 - a21 * b01 + a22 * b00) * det;
  return out;
}

const tmp = new Float64Array(16);

/** A GL matrix stack (glPushMatrix/glPopMatrix + transforms that post-multiply). */
export class MatrixStack {
  private stack: Mat4[] = [];
  private depth = 0;
  /** Bumped on every change so dependants can cache derived data. */
  version = 0;

  constructor(private readonly maxDepth = 64) {
    for (let i = 0; i < maxDepth; i++) this.stack.push(mat4Identity());
  }

  get top(): Mat4 {
    return this.stack[this.depth];
  }

  push(): void {
    if (this.depth + 1 >= this.maxDepth) throw new Error('matrix stack overflow');
    this.stack[this.depth + 1].set(this.stack[this.depth]);
    this.depth++;
  }

  pop(): void {
    if (this.depth === 0) throw new Error('matrix stack underflow');
    this.depth--;
    this.version++;
  }

  /** The number of pushes outstanding. */
  get stackDepth(): number {
    return this.depth;
  }

  /** Pops back to an earlier depth (after a renderer threw between its push and pop). */
  restoreDepth(depth: number): void {
    if (depth < 0 || depth > this.depth) return;
    this.depth = depth;
    this.version++;
  }

  loadIdentity(): void {
    mat4Identity(this.top);
    this.version++;
  }

  load(m: ArrayLike<number>): void {
    this.top.set(m);
    this.version++;
  }

  multMatrix(m: Mat4): void {
    mat4Mul(tmp, this.top, m);
    this.top.set(tmp);
    this.version++;
  }

  translate(x: number, y: number, z: number): void {
    const m = this.top;
    m[12] += m[0] * x + m[4] * y + m[8] * z;
    m[13] += m[1] * x + m[5] * y + m[9] * z;
    m[14] += m[2] * x + m[6] * y + m[10] * z;
    m[15] += m[3] * x + m[7] * y + m[11] * z;
    this.version++;
  }

  scale(x: number, y: number, z: number): void {
    const m = this.top;
    for (let i = 0; i < 4; i++) {
      m[i] *= x;
      m[4 + i] *= y;
      m[8 + i] *= z;
    }
    this.version++;
  }

  /** glRotatef: angle in degrees around (x, y, z). */
  rotate(angleDeg: number, x: number, y: number, z: number): void {
    const len = Math.hypot(x, y, z);
    if (len === 0) return;
    x /= len;
    y /= len;
    z /= len;
    const a = (angleDeg * Math.PI) / 180;
    const c = Math.cos(a);
    const s = Math.sin(a);
    const t = 1 - c;
    const r = mat4Identity(rot);
    r[0] = x * x * t + c;
    r[1] = y * x * t + z * s;
    r[2] = x * z * t - y * s;
    r[4] = x * y * t - z * s;
    r[5] = y * y * t + c;
    r[6] = y * z * t + x * s;
    r[8] = x * z * t + y * s;
    r[9] = y * z * t - x * s;
    r[10] = z * z * t + c;
    this.multMatrix(r);
  }

  ortho(left: number, right: number, bottom: number, top: number, near: number, far: number): void {
    const m = mat4Identity(rot);
    m[0] = 2 / (right - left);
    m[5] = 2 / (top - bottom);
    m[10] = -2 / (far - near);
    m[12] = -(right + left) / (right - left);
    m[13] = -(top + bottom) / (top - bottom);
    m[14] = -(far + near) / (far - near);
    this.multMatrix(m);
  }

  /** gluPerspective. */
  perspective(fovyDeg: number, aspect: number, near: number, far: number): void {
    const f = 1 / Math.tan((fovyDeg * Math.PI) / 360);
    const m = rot.fill(0);
    m[0] = f / aspect;
    m[5] = f;
    m[10] = (far + near) / (near - far);
    m[11] = -1;
    m[14] = (2 * far * near) / (near - far);
    this.multMatrix(m);
  }
}

const rot = new Float64Array(16);
