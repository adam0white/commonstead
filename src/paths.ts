/** Bounded host geometry only. Deterministic four-neighbour routes; no human planning or physical model. */
export type Point = { x: number; y: number };
export type Place = 'yard' | 'quay' | 'courtyard';
export type Wall = Point & { w: number; h: number };
export const MAPS: Record<Place, { name: string; walls: Wall[] }> = {
  yard: { name: 'Workshop yard', walls: [{ x: 350, y: 150, w: 50, h: 250 }] },
  quay: { name: 'Quay and records desk', walls: [{ x: 450, y: 100, w: 50, h: 350 }] },
  courtyard: { name: 'Courtyard and post slot', walls: [{ x: 300, y: 250, w: 350, h: 50 }] },
};
export function blocked(map: Place, p: Point): boolean {
  return (
    p.x < 25 ||
    p.x > 975 ||
    p.y < 25 ||
    p.y > 675 ||
    MAPS[map].walls.some(
      (w) => p.x >= w.x - 15 && p.x <= w.x + w.w + 15 && p.y >= w.y - 15 && p.y <= w.y + w.h + 15,
    )
  );
}
export function route(map: Place, from: Point, to: Point): Point[] | null {
  if (blocked(map, from) || blocked(map, to)) return null;
  const cell = (p: Point) => [Math.round((p.x - 25) / 50), Math.round((p.y - 25) / 50)] as const;
  const [sx, sy] = cell(from),
    [tx, ty] = cell(to);
  const key = (x: number, y: number) => y * 20 + x;
  if (blocked(map, { x: 25 + sx * 50, y: 25 + sy * 50 })) return null;
  const start = key(sx, sy),
    end = key(tx, ty);
  const queue = [start],
    parents = new Map<number, number | null>([[start, null]]);
  for (let i = 0; i < queue.length && !parents.has(end); i++) {
    const n = queue[i];
    if (n === undefined) break;
    for (const [dx, dy] of [
      [1, 0],
      [0, 1],
      [-1, 0],
      [0, -1],
    ] as const) {
      const x = (n % 20) + dx,
        y = Math.floor(n / 20) + dy,
        next = key(x, y);
      if (
        x < 0 ||
        x >= 20 ||
        y < 0 ||
        y >= 14 ||
        parents.has(next) ||
        blocked(map, { x: 25 + x * 50, y: 25 + y * 50 })
      )
        continue;
      parents.set(next, n);
      queue.push(next);
    }
  }
  if (!parents.has(end)) return null;
  const out: Point[] = [to];
  for (let n: number | null = end; n !== null && n !== start; n = parents.get(n) ?? null)
    out.push({ x: 25 + (n % 20) * 50, y: 25 + Math.floor(n / 20) * 50 });
  out.reverse();
  // A grid centre at the start avoids diagonal corner cutting from arbitrary positions.
  return [{ x: 25 + sx * 50, y: 25 + sy * 50 }, ...out];
}
