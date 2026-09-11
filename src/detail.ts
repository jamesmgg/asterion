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
/** Keep the near plane above the ground even at the minimum close-up altitude. */
export function closeUpNearPlane(distance: number, maximumRelief: number) {
  return Math.min(
    0.005,
    Math.max(0.00001, (distance - 1 - maximumRelief) * 0.1),
  );
}
