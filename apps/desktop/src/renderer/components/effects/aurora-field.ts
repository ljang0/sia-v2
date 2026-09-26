import { fragmentShader, vertexShader } from './aurora-shaders';

/** One bounded WebGL pass, including on the phone's HTTP LAN link. */
export function createAuroraField(canvas: HTMLCanvasElement) {
  const gl = canvas.getContext('webgl', {
    alpha: true,
    antialias: false,
    depth: false,
    stencil: false,
    powerPreference: 'low-power',
  });
  if (!gl) throw new Error('Aurora graphics unavailable');
  const shaders: WebGLShader[] = [];
  const program = gl.createProgram();
  const buffer = gl.createBuffer();
  const dispose = () => {
    gl.deleteBuffer(buffer);
    gl.deleteProgram(program);
    shaders.forEach((shader) => gl.deleteShader(shader));
  };
  try {
    if (!program || !buffer) throw new Error('Aurora graphics unavailable');
    for (const [type, source] of [
      [gl.VERTEX_SHADER, vertexShader],
      [gl.FRAGMENT_SHADER, fragmentShader],
    ] as const) {
      const shader = gl.createShader(type);
      if (!shader) throw new Error('Aurora graphics unavailable');
      shaders.push(shader);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
        throw new Error('Aurora shader unavailable');
      gl.attachShader(program, shader);
    }
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS))
      throw new Error('Aurora program unavailable');
    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, 'position');
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    const clock = gl.getUniformLocation(program, 'time');
    const resolution = gl.getUniformLocation(program, 'resolution');
    return {
      resize(width: number, height: number) {
        // Preserve the field's proportions with bounded work even on large desktop displays.
        const scale = Math.min(1, 600 / Math.max(1, width), 590 / Math.max(1, height));
        const nextWidth = Math.max(1, Math.round(width * scale));
        const nextHeight = Math.max(1, Math.round(height * scale));
        // Reassigning even the same dimensions clears Safari's drawing buffer.
        if (canvas.width !== nextWidth) canvas.width = nextWidth;
        if (canvas.height !== nextHeight) canvas.height = nextHeight;
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.uniform2f(resolution, canvas.width, canvas.height);
      },
      theme(style: CSSStyleDeclaration) {
        for (const name of ['emerald', 'cyan', 'violet']) {
          const hex = style.getPropertyValue(`--aurora-${name}`).trim().slice(1);
          gl.uniform3fv(
            gl.getUniformLocation(program, name),
            [0, 2, 4].map((offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255),
          );
        }
        gl.uniform1f(
          gl.getUniformLocation(program, 'strength'),
          Number(style.getPropertyValue('--aurora-strength')) * 1.5,
        );
      },
      render(seconds: number) {
        gl.uniform1f(clock, seconds);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      },
      dispose,
    };
  } catch (error) {
    dispose();
    throw error;
  }
}
