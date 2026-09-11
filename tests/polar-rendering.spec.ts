import { test, expect } from "@playwright/test";
import { surfaceFragment } from "../src/shaders.ts";

for (const scenario of [
  { name: "Planet", crater: false, tile: -1 },
  { name: "Crater", crater: true, tile: -1 },
  { name: "Crater first longitude tile", crater: true, tile: 0 },
  { name: "Crater last longitude tile", crater: true, tile: 0.75 },
])
  test(`${scenario.name} preserves the surface texture footprint at the meridian`, async ({
    page,
  }) => {
    const result = await page.evaluate(
      ({ fragment, crater, tile }) => {
        const canvas = document.createElement("canvas");
        canvas.width = 128;
        canvas.height = 32;
        const gl = canvas.getContext("webgl2")!;
        if (!gl)
          throw new Error("WebGL 2 is required for the planetary renderer");
        function shader(type: number, source: string) {
          const s = gl.createShader(type)!;
          gl.shaderSource(s, source);
          gl.compileShader(s);
          if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
            throw new Error(gl.getShaderInfoLog(s)!);
          return s;
        }
        const program = gl.createProgram()!;
        gl.attachShader(
          program,
          shader(
            gl.VERTEX_SHADER,
            `#version 300 es
      out vec2 vUv;out vec3 vNormal;out vec3 vWorld;out vec3 vObject;
      void main(){
        vec2 p=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2));
        gl_Position=vec4(p*2.-1.,0.,1.);
        vUv=vec2(.873+p.x*.25,.5+p.y*.01);
        vNormal=vec3(-1.,0.,0.);vWorld=vObject=vec3(-1.,0.,(p.x-.508)*.1);
      }`,
          ),
        );
        gl.attachShader(
          program,
          shader(
            gl.FRAGMENT_SHADER,
            `#version 300 es
      precision highp float;precision highp int;
      #define varying in
      #define texture2D texture
      out vec4 outputColor;
      #define gl_FragColor outputColor
      uniform vec3 cameraPosition;
      ${fragment.replace(/#include <[^>]+>/g, "")}`,
          ),
        );
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS))
          throw new Error(gl.getProgramInfoLog(program)!);
        gl.useProgram(program);
        const texture = gl.createTexture()!;
        gl.bindTexture(gl.TEXTURE_2D, texture);
        // Only a discontinuous longitude derivative chooses the dark diagnostic
        // mips: the continuous footprint is under one texel throughout this quad.
        for (let level = 0; level <= 8; level++) {
          const size = 256 >> level;
          const rgba = new Uint8Array(size * size * 4);
          for (let i = 0; i < rgba.length; i += 4) {
            rgba[i] = rgba[i + 1] = rgba[i + 2] = level === 0 ? 255 : 0;
            rgba[i + 3] = 255;
          }
          gl.texImage2D(
            gl.TEXTURE_2D,
            level,
            gl.RGBA,
            size,
            size,
            0,
            gl.RGBA,
            gl.UNSIGNED_BYTE,
            rgba,
          );
        }
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(
          gl.TEXTURE_2D,
          gl.TEXTURE_MIN_FILTER,
          gl.LINEAR_MIPMAP_LINEAR,
        );
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.uniform1f(gl.getUniformLocation(program, "star"), 1);
        gl.uniform1f(gl.getUniformLocation(program, "albedoScale"), 1);
        gl.uniform1f(
          gl.getUniformLocation(program, "craterPatch"),
          crater ? 1 : 0,
        );
        gl.uniform1f(gl.getUniformLocation(program, "craterPatchIndex"), -1);
        gl.uniform1f(gl.getUniformLocation(program, "tiled"), tile < 0 ? 0 : 1);
        gl.uniform1f(
          gl.getUniformLocation(program, "patchTiled"),
          tile < 0 ? 0 : 1,
        );
        gl.uniform1f(gl.getUniformLocation(program, "detailBlend"), 1);
        gl.uniform4f(
          gl.getUniformLocation(program, "tileRect"),
          Math.max(0, tile),
          0,
          0.25,
          1,
        );
        gl.uniform4f(
          gl.getUniformLocation(program, "patchRect"),
          Math.max(0, tile),
          0,
          0.25,
          1,
        );
        gl.uniform3f(
          gl.getUniformLocation(program, "cameraPosition"),
          -3,
          0,
          0,
        );
        gl.uniform3f(gl.getUniformLocation(program, "sunDir"), -1, 0, 0);
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.clearColor(1, 1, 1, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        const pixels = new Uint8Array(canvas.width * 4);
        gl.readPixels(
          0,
          16,
          canvas.width,
          1,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          pixels,
        );
        const dark = [];
        let rendered = 0;
        for (let x = 0; x < canvas.width; x++) {
          if (pixels[x * 4 + 1] < 240) dark.push(x);
          if (pixels[x * 4 + 3] === 255) rendered++;
        }
        return { dark, rendered, error: gl.getError() };
      },
      { fragment: surfaceFragment, ...scenario },
    );
    expect(result.error).toBe(0);
    expect(
      result.rendered,
      "the corresponding surface must actually be drawn",
    ).toBeGreaterThan(30);
    expect(
      result.dark,
      "texture filtering must not paint a dark north–south seam",
    ).toEqual([]);
  });
