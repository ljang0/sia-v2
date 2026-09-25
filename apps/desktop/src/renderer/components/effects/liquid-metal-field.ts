// Shader settings adapted from Johuniq/jolyui's LiquidMetalButton (MIT).
// Uses the original Paper Shaders liquid-metal shader (Apache-2.0).
// See THIRD_PARTY_NOTICES.md for provenance and license terms.
import { emptyPixel, liquidMetalFragmentShader, ShaderMount } from '@paper-design/shaders';

const texture = new Image();
texture.src = emptyPixel;
const textureReady = texture.decode();

export async function createMetalField(host: HTMLElement) {
  await textureReady;
  const mount = new ShaderMount(
    host,
    liquidMetalFragmentShader,
    {
      u_image: texture,
      u_isImage: false,
      u_colorBack: [0.15, 0.24, 0.2, 1],
      u_colorTint: [0.8, 1, 0.89, 0.25],
      u_repetition: 4,
      u_softness: 0.5,
      u_shiftRed: 0.3,
      u_shiftBlue: 0.3,
      u_distortion: 0,
      u_contour: 0,
      u_angle: 45,
      u_shape: 1,
      u_scale: 8,
      u_offsetX: 0.1,
      u_offsetY: -0.1,
      u_originX: 0.5,
      u_originY: 0.5,
      u_worldWidth: 0,
      u_worldHeight: 0,
      u_fit: 1,
      u_rotation: 0,
    },
    { alpha: true, antialias: false, depth: false, powerPreference: 'low-power' },
    0, // Sia drives the clock at a bounded 30 fps instead of the display refresh rate.
    1200,
    1,
    Math.min(16000, Math.max(4096, host.clientWidth * host.clientHeight * 2.25)),
  );
  return {
    canvas: mount.canvasElement,
    render: (time: number) => mount.setFrame(time),
    dispose() {
      const gl = mount.canvasElement.getContext('webgl2');
      mount.dispose();
      gl?.getExtension('WEBGL_lose_context')?.loseContext();
    },
  };
}
