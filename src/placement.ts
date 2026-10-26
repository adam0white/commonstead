/** The native short chapter's existing centre/spacing predicate. No eligibility or effects. */
export function openPlacementGround(
  x: number,
  y: number,
  obstacles: readonly { x: number; y: number }[],
): boolean {
  return !(
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    x < 55 ||
    x > 945 ||
    y < 55 ||
    y > 645 ||
    obstacles.some((b) => Math.hypot(b.x - x, b.y - y) < 90)
  );
}
