/**
 * The single "uber shader" that emulates the fixed-function pipeline the original used:
 * texture * colour (vertex colour or glColor), two-light RenderHelper diffuse lighting,
 * the lightmap on texture unit 1, alpha test, and linear/exp fog.
 */
export const VERT_SRC = /* glsl */ `#version 300 es
precision highp float;
layout(location = 0) in vec3 a_pos;
layout(location = 1) in vec2 a_uv;
layout(location = 2) in vec4 a_color;
layout(location = 3) in vec3 a_normal;
layout(location = 4) in vec2 a_light;

uniform mat4 u_proj;
uniform mat4 u_mv;
uniform mat4 u_texMat;
uniform float u_posScale;
uniform int u_lighting;
uniform vec3 u_light0;
uniform vec3 u_light1;
uniform mat3 u_normalMat;

out vec2 v_uv;
out vec4 v_color;
out vec2 v_light;
out vec3 v_eye;

void main() {
  vec4 eye = u_mv * vec4(a_pos * u_posScale, 1.0);
  gl_Position = u_proj * eye;
  v_eye = eye.xyz;
  v_uv = (u_texMat * vec4(a_uv, 0.0, 1.0)).xy;
  vec4 c = a_color;
  if (u_lighting != 0) {
    vec3 n = normalize(u_normalMat * a_normal);
    float d = 0.4 + 0.6 * max(dot(n, u_light0), 0.0) + 0.6 * max(dot(n, u_light1), 0.0);
    c.rgb = clamp(c.rgb * d, 0.0, 1.0);
  }
  v_color = c;
  // Lightmap texture matrix of the original: scale 1/256, translate 8.
  v_light = (a_light + 8.0) / 256.0;
}
`;

export const FRAG_SRC = /* glsl */ `#version 300 es
precision highp float;
in vec2 v_uv;
in vec4 v_color;
in vec2 v_light;
in vec3 v_eye;

uniform sampler2D u_tex;
uniform sampler2D u_lightmap;
uniform int u_useTex;
uniform int u_useLightmap;
uniform float u_alphaRef;
uniform int u_fogMode;
uniform vec3 u_fogParams; // start, end, density
uniform vec3 u_fogColor;

out vec4 fragColor;

void main() {
  vec4 c = v_color;
  if (u_useTex != 0) c *= texture(u_tex, v_uv);
  if (u_useLightmap != 0) c.rgb *= texture(u_lightmap, v_light).rgb;
  if (c.a <= u_alphaRef) discard;
  if (u_fogMode != 0) {
    float dist = abs(v_eye.z); // eye-plane depth, as fixed-function GL computes fog
    float f;
    if (u_fogMode == 1) f = (u_fogParams.y - dist) / (u_fogParams.y - u_fogParams.x);
    else f = exp(-u_fogParams.z * dist);
    f = clamp(f, 0.0, 1.0);
    c.rgb = mix(u_fogColor, c.rgb, f);
  }
  fragColor = c;
}
`;

export function compileProgram(gl: WebGL2RenderingContext, vs: string, fs: string): WebGLProgram {
  const make = (type: number, src: string): WebGLShader => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      throw new Error('shader compile failed: ' + gl.getShaderInfoLog(s));
    }
    return s;
  };
  const p = gl.createProgram()!;
  gl.attachShader(p, make(gl.VERTEX_SHADER, vs));
  gl.attachShader(p, make(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    throw new Error('program link failed: ' + gl.getProgramInfoLog(p));
  }
  return p;
}
