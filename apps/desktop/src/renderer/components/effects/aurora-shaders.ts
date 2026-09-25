/**
 * Shape Waves noise/field adapted from React Bits by David Haz (c) 2026.
 * Source: DavidHDev/react-bits@28335f42448beecab58f6c7ab35c6c670264a617,
 * src/ts-default/Backgrounds/ShapeWaves/ShapeWaves.tsx.
 * MIT + Commons Clause; full terms in THIRD_PARTY_NOTICES.md.
 * Sia ports WGSL to WebGL 1 for LAN HTTP and adds aurora ribbons and its palette.
 */
export const vertexShader = `
attribute vec2 position;
varying vec2 uv;
void main() {
  uv = position * 0.5 + 0.5;
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

export const fragmentShader = `
precision highp float;
varying vec2 uv;
uniform vec2 resolution;
uniform float time;
uniform vec3 emerald;
uniform vec3 cyan;
uniform vec3 violet;
uniform float strength;

vec3 mod289(vec3 x) { return x - floor(x / 289.0) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x / 289.0) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x * 34.0) + 10.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
vec3 fadeCurve(vec3 t) { return t * t * t * (t * (t * 6.0 - 15.0) + 10.0); }

float cnoise(vec3 p) {
  vec3 pi0 = mod289(floor(p));
  vec3 pi1 = mod289(floor(p) + 1.0);
  vec3 pf0 = fract(p);
  vec3 pf1 = pf0 - 1.0;
  vec4 ix = vec4(pi0.x, pi1.x, pi0.x, pi1.x);
  vec4 iy = vec4(pi0.yy, pi1.yy);
  vec4 ixy = permute(permute(ix) + iy);
  vec4 ixy0 = permute(ixy + pi0.zzzz);
  vec4 ixy1 = permute(ixy + pi1.zzzz);
  vec4 gx0 = ixy0 / 7.0;
  vec4 gy0 = fract(floor(gx0) / 7.0) - 0.5;
  gx0 = fract(gx0);
  vec4 gz0 = 0.5 - abs(gx0) - abs(gy0);
  vec4 sz0 = step(gz0, vec4(0.0));
  gx0 -= sz0 * (step(vec4(0.0), gx0) - 0.5);
  gy0 -= sz0 * (step(vec4(0.0), gy0) - 0.5);
  vec4 gx1 = ixy1 / 7.0;
  vec4 gy1 = fract(floor(gx1) / 7.0) - 0.5;
  gx1 = fract(gx1);
  vec4 gz1 = 0.5 - abs(gx1) - abs(gy1);
  vec4 sz1 = step(gz1, vec4(0.0));
  gx1 -= sz1 * (step(vec4(0.0), gx1) - 0.5);
  gy1 -= sz1 * (step(vec4(0.0), gy1) - 0.5);
  vec3 g000 = vec3(gx0.x, gy0.x, gz0.x);
  vec3 g100 = vec3(gx0.y, gy0.y, gz0.y);
  vec3 g010 = vec3(gx0.z, gy0.z, gz0.z);
  vec3 g110 = vec3(gx0.w, gy0.w, gz0.w);
  vec3 g001 = vec3(gx1.x, gy1.x, gz1.x);
  vec3 g101 = vec3(gx1.y, gy1.y, gz1.y);
  vec3 g011 = vec3(gx1.z, gy1.z, gz1.z);
  vec3 g111 = vec3(gx1.w, gy1.w, gz1.w);
  vec4 norm0 = taylorInvSqrt(vec4(dot(g000,g000), dot(g010,g010), dot(g100,g100), dot(g110,g110)));
  g000 *= norm0.x; g010 *= norm0.y; g100 *= norm0.z; g110 *= norm0.w;
  vec4 norm1 = taylorInvSqrt(vec4(dot(g001,g001), dot(g011,g011), dot(g101,g101), dot(g111,g111)));
  g001 *= norm1.x; g011 *= norm1.y; g101 *= norm1.z; g111 *= norm1.w;
  vec4 nz = mix(
    vec4(dot(g000,pf0), dot(g100,vec3(pf1.x,pf0.yz)), dot(g010,vec3(pf0.x,pf1.y,pf0.z)), dot(g110,vec3(pf1.xy,pf0.z))),
    vec4(dot(g001,vec3(pf0.xy,pf1.z)), dot(g101,vec3(pf1.x,pf0.y,pf1.z)), dot(g011,vec3(pf0.x,pf1.yz)), dot(g111,pf1)),
    fadeCurve(pf0).z
  );
  vec2 ny = mix(nz.xy, nz.zw, fadeCurve(pf0).y);
  return 2.2 * mix(ny.x, ny.y, fadeCurve(pf0).x);
}
float fbm(vec3 p) {
  return (cnoise(p) + 0.5 * cnoise(p * 2.0)) / 1.5;
}

void main() {
  vec2 point = vec2(uv.x, 1.0 - uv.y);
  vec2 pixel = point * resolution;
  float cellSize = 5.0;
  vec2 center = (floor(pixel / cellSize) + 0.5) * cellSize;
  // Shape Waves' evolving two-octave field and three discrete shape bands.
  float noise = fbm(vec3(center / 190.0 + vec2(12.9898, 78.233), time * 0.1));
  float tone = clamp(noise * 0.5 + 0.5, 0.0, 1.0);
  float band = floor(min(tone, 0.999999) * 3.0);
  vec2 local = (pixel - center) / (cellSize * 0.5);
  float shape;
  if (band > 1.5) shape = max(abs(local.x), abs(local.y)) - 0.48;
  else if (band > 0.5) shape = length(local) - 0.52;
  else shape = max(abs(local.x) * 0.866 + local.y * 0.5, -local.y) - 0.28;
  float glyph = 1.0 - smoothstep(-0.15, 0.15, shape);

  // Wide translucent ribbons retain the Northern Lights feel; the reference's
  // geometry becomes a fine luminous texture instead of competing with text.
  float sweep = point.y * 1.65 + point.x * 0.32 + noise * 0.65;
  float ribbon = exp(-pow((sweep - 0.52) * 6.0, 2.0));
  float echo = exp(-pow((sweep - 1.03) * 8.0, 2.0));
  float glow = exp(-pow((sweep - 0.64) * 2.7, 2.0));
  vec3 color = mix(emerald, cyan, smoothstep(0.12, 0.7, point.x + noise * 0.35));
  color = mix(color, violet, smoothstep(0.48, 1.05, point.x + point.y * 0.28));
  float light = ribbon * 0.82 + echo * 0.34 + glow * 0.2;
  float texture = mix(0.68, 1.0, glyph);
  float alpha = clamp(light * texture * strength, 0.0, 0.8);
  gl_FragColor = vec4(color * alpha, alpha);
}
`;
