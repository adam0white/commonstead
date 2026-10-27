import { residentName } from './display.ts';
import { MAPS, type Place } from './paths.ts';
import { openPlacementGround } from './placement.ts';
import { NODES, type State } from './sim.ts';
export interface PointerMark {
  x: number;
  y: number;
  x2: number;
  y2: number;
  held: number;
}
export function draw(
  canvas: HTMLCanvasElement,
  s: State,
  selected: string[],
  mark: PointerMark | null,
  placing: string,
  viewedMap: Place = 'yard',
  candidate: { x: number; y: number } = { x: 650, y: 500 },
) {
  const box = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  if (canvas.width !== Math.round(box.width * dpr) || canvas.height !== Math.round(box.height * dpr)) {
    canvas.width = Math.round(box.width * dpr);
    canvas.height = Math.round(box.height * dpr);
  }
  const c = canvas.getContext('2d');
  if (!c) return;
  const scale = Math.min(box.width / 1000, box.height / 700);
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.fillStyle = '#d9d8ba';
  c.fillRect(0, 0, box.width, box.height);
  c.setTransform(
    dpr * scale,
    0,
    0,
    dpr * scale,
    (dpr * (box.width - 1000 * scale)) / 2,
    (dpr * (box.height - 700 * scale)) / 2,
  );
  c.fillStyle = '#d9d8ba';
  c.fillRect(0, 0, 1000, 700);
  c.lineWidth = 1.5;
  // Stable hand-drawn contours; render has no simulation RNG.
  c.strokeStyle = '#c5c5a5';
  for (let i = 0; i < 12; i++) {
    c.beginPath();
    c.ellipse(i * 97 - 30, 420 + (i % 3) * 55, 150, 65, -0.3, 0, Math.PI * 2);
    c.stroke();
  }
  c.fillStyle = '#c7c6a5';
  c.beginPath();
  c.moveTo(390, 700);
  c.bezierCurveTo(450, 420, 550, 440, 510, 0);
  c.lineTo(560, 0);
  c.bezierCurveTo(600, 450, 500, 450, 440, 700);
  c.fill();
  if (placing && !s.settlement) {
    // Each dot is an exact tested centre, not a promise that an order will succeed.
    const obstacles = [...s.buildings, ...NODES];
    c.fillStyle = '#397553';
    for (let y = 55; y <= 645; y += 20) {
      for (let x = 55; x <= 945; x += 20) {
        if (!openPlacementGround(x, y, obstacles)) continue;
        c.beginPath();
        c.arc(x, y, 3, 0, Math.PI * 2);
        c.fill();
      }
    }
  }
  if (s.settlement) {
    for (const wall of MAPS[viewedMap].walls) {
      c.fillStyle = '#6e665a';
      c.fillRect(wall.x, wall.y, wall.w, wall.h);
      c.strokeStyle = '#23201b';
      c.strokeRect(wall.x, wall.y, wall.w, wall.h);
    }
    c.fillStyle = '#23201b';
    c.font = '24px Georgia';
    c.fillText(MAPS[viewedMap].name, 30, 40);
    c.fillText('Passage', 35, 625);
  }
  for (const node of s.settlement ? [{ id: 'cache', kind: 'wood' as const, x: 775, y: 475 }] : NODES) {
    c.save();
    c.translate(node.x, node.y);
    c.strokeStyle = '#4f5b3b';
    c.lineWidth = 3;
    // Delivered prepared materials, not trees, quarry or berry beds.
    for (let j = 0; j < 4; j++) {
      const x = (j % 2) * 42 - 40,
        y = Math.floor(j / 2) * 25 - 25;
      c.fillStyle = node.kind === 'wood' ? '#ad8962' : node.kind === 'stone' ? '#a7aaa0' : '#859163';
      c.fillRect(x, y, node.kind === 'wood' ? 70 : 35, 20);
      c.strokeRect(x, y, node.kind === 'wood' ? 70 : 35, 20);
      if (node.kind === 'food') c.fillText('+', x + 12, y + 15);
    }
    c.fillStyle = '#23201b';
    c.font = `${Math.max(22, 16 / scale)}px Georgia`;
    c.textAlign = 'center';
    if (scale >= 0.4)
      c.fillText(
        s.settlement
          ? 'Supply cache'
          : node.kind === 'food'
            ? 'Meal crates'
            : node.kind === 'wood'
              ? 'Prepared boards'
              : 'Ballast bags',
        0,
        87,
      );
    c.restore();
  }
  for (const b of s.settlement && viewedMap !== 'yard' ? [] : s.buildings) {
    c.save();
    c.translate(b.x, b.y);
    if (selected.includes(b.id)) {
      c.strokeStyle = '#c2412d';
      c.lineWidth = 4;
      c.strokeRect(-61, -60, 122, 105);
    }
    c.globalAlpha = b.complete ? 1 : 0.65;
    c.fillStyle = b.kind === 'town' ? '#e6d3ab' : '#ede2c8';
    c.strokeStyle = '#5e5344';
    c.lineWidth = 3;
    c.fillRect(-46, -28, 92, 67);
    c.strokeRect(-46, -28, 92, 67);
    c.fillStyle = b.kind === 'storehouse' ? '#79856b' : '#a97659';
    c.beginPath();
    c.moveTo(-59, -26);
    c.lineTo(0, -72);
    c.lineTo(59, -26);
    c.closePath();
    c.fill();
    c.stroke();
    c.fillStyle = '#6e665a';
    c.fillRect(-10, 10, 20, 29);
    c.globalAlpha = 1;
    if (!b.complete) {
      c.strokeStyle = '#c2412d';
      c.lineWidth = 6;
      c.beginPath();
      c.moveTo(-46, 48);
      c.lineTo(-46 + 92 * b.progress, 48);
      c.stroke();
    }
    c.fillStyle = '#23201b';
    c.font = `${Math.max(21, 16 / scale)}px Georgia`;
    c.textAlign = 'center';
    if (b.kind !== 'town') c.fillText(b.kind === 'house' ? 'Guest cabin' : 'Storehouse', 0, 76);
    c.restore();
  }
  const colors = ['#3d5a73', '#865c46', '#4f6b3a', '#8a7152', '#6b617f'];
  for (const [i, v] of s.villagers.entries()) {
    if (s.settlement && s.settlement.actors[v.id]?.map !== viewedMap) continue;
    c.save();
    c.translate(v.x, v.y);
    if (selected.includes(v.id)) {
      c.strokeStyle = '#c2412d';
      c.lineWidth = 4;
      c.beginPath();
      c.ellipse(0, 15, 23, 12, 0, 0, 7);
      c.stroke();
    }
    const tired = s.tick >= 60 && v.person.body.exertion > 0.4;
    c.rotate(tired ? 0.13 : 0);
    c.strokeStyle = '#342e26';
    c.lineWidth = 4;
    c.beginPath();
    c.moveTo(-7, 3);
    c.lineTo(-10, 22);
    c.moveTo(7, 3);
    c.lineTo(12, 22);
    c.stroke();
    c.fillStyle = colors[i % colors.length] ?? '#4f6b3a';
    c.fillRect(-11, -17, 22, 27);
    c.strokeRect(-11, -17, 22, 27);
    c.fillStyle = '#d5b48d';
    c.beginPath();
    c.arc(0, -27, 10, 0, 7);
    c.fill();
    c.stroke();
    c.rotate(tired ? -0.13 : 0);
    c.fillStyle = '#23201b';
    c.font = `${Math.max(20, 16 / scale)}px Georgia`;
    c.textAlign = 'center';
    if (scale >= 0.4 && selected.includes(v.id)) c.fillText(residentName(v), 0, 47);
    c.restore();
  }
  // Label the hub above its roof and after people, so the arrival group cannot paint over it.
  const hub = s.buildings.find((b) => b.kind === 'town');
  if (hub && (!s.settlement || viewedMap === 'yard')) {
    c.save();
    c.font = `${Math.max(21, 16 / scale)}px Georgia`;
    c.textAlign = 'center';
    const width = c.measureText('Workshop hub').width + 16;
    c.fillStyle = '#f3ecdd';
    c.fillRect(hub.x - width / 2, hub.y - 122, width, 32);
    c.fillStyle = '#23201b';
    c.fillText('Workshop hub', hub.x, hub.y - 98);
    c.restore();
  }
  const command = s.inputs.at(-1)?.command;
  if (command?.kind === 'order' && !['rest', 'meal', 'push'].includes(command.target)) {
    const target = [...NODES, ...s.buildings].find((n) => n.id === command.target);
    const x = target?.x ?? command.x,
      y = target?.y ?? command.y;
    if (x !== undefined && y !== undefined) {
      c.strokeStyle = '#c2412d';
      c.lineWidth = 3;
      c.beginPath();
      c.arc(x, y, 27, 0, Math.PI * 2);
      c.moveTo(x - 37, y);
      c.lineTo(x + 37, y);
      c.moveTo(x, y - 37);
      c.lineTo(x, y + 37);
      c.stroke();
    }
  }
  if (placing) {
    const site = mark ? { x: mark.x2, y: mark.y2 } : candidate;
    c.save();
    c.translate(site.x, site.y);
    c.strokeStyle =
      !s.settlement && openPlacementGround(site.x, site.y, [...s.buildings, ...NODES])
        ? '#245c3d'
        : '#a13727';
    c.lineWidth = 4;
    c.setLineDash([8, 5]);
    // Same footprint as the building drawing above; circle shows centre spacing.
    c.beginPath();
    c.arc(0, 0, 90, 0, Math.PI * 2);
    c.stroke();
    c.setLineDash([]);
    c.strokeRect(-46, -28, 92, 67);
    c.beginPath();
    c.moveTo(-59, -26);
    c.lineTo(0, -72);
    c.lineTo(59, -26);
    c.closePath();
    c.stroke();
    c.restore();
  }
  if (mark) {
    c.strokeStyle = '#c2412d';
    c.lineWidth = 3;
    if (Math.hypot(mark.x2 - mark.x, mark.y2 - mark.y) > 14) {
      c.setLineDash([8, 5]);
      c.strokeRect(mark.x, mark.y, mark.x2 - mark.x, mark.y2 - mark.y);
      c.setLineDash([]);
    } else if (mark.held > 0) {
      c.beginPath();
      c.arc(mark.x, mark.y, 30, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * mark.held);
      c.stroke();
    }
  }
}
