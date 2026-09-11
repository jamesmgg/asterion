/** 512-pixel equirectangular tiles, with one-pixel gutters; v increases north. */
export function tileBounds(level: number, x: number, y: number) {
  const nx = 2 ** (level + 1),
    ny = 2 ** level;
  return { u0: x / nx, u1: (x + 1) / nx, v0: 1 - (y + 1) / ny, v1: 1 - y / ny };
}
export function detailLevel(projectedCircumference: number, maxLevel: number) {
  return Math.max(
    0,
    Math.min(
      maxLevel,
      Math.ceil(Math.log2(Math.max(1, projectedCircumference) / 1024)),
    ),
  );
}
