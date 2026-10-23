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
) {
  const box = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  if (canvas.width !== Math.round(box.width * dpr) || canvas.height !== Math.round(box.height * dpr)) {
    canvas.width = Math.round(box.width * dpr);
    canvas.height = Math.round(box.height * dpr);
  }
  const c = canvas.getContext('2d');
  if (!c) return;
  c.setTransform(canvas.width / 1000, 0, 0, canvas.height / 700, 0, 0);
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
  for (const node of NODES) {
    c.save();
    c.translate(node.x, node.y);
    c.strokeStyle = '#4f5b3b';
    c.lineWidth = 3;
    if (node.kind === 'wood') {
      for (let j = 0; j < 5; j++) {
        const x = (j % 3) * 31 - 30,
          y = Math.floor(j / 3) * 38 - 20;
        c.fillStyle = '#7f8d5c';
        c.beginPath();
        c.moveTo(x, y - 38);
        c.lineTo(x - 24, y + 19);
        c.lineTo(x + 24, y + 19);
        c.closePath();
        c.fill();
        c.stroke();
        c.beginPath();
        c.moveTo(x, y + 18);
        c.lineTo(x, y + 37);
        c.stroke();
      }
    } else if (node.kind === 'stone') {
      for (let j = 0; j < 5; j++) {
        c.fillStyle = '#a7aaa0';
        c.beginPath();
        c.ellipse((j % 3) * 30 - 25, Math.floor(j / 3) * 25 - 15, 24, 19, j * 0.3, 0, 7);
        c.fill();
        c.stroke();
      }
    } else {
      for (let j = 0; j < 6; j++) {
        c.fillStyle = '#859163';
        c.beginPath();
        c.ellipse((j % 3) * 31 - 28, Math.floor(j / 3) * 25 - 15, 22, 19, 0, 0, 7);
        c.fill();
        c.stroke();
        c.fillStyle = '#98624d';
        c.beginPath();
        c.arc((j % 3) * 31 - 28, Math.floor(j / 3) * 25 - 15, 5, 0, 7);
        c.fill();
      }
    }
    c.fillStyle = '#23201b';
    c.font = '22px Georgia';
    c.textAlign = 'center';
    c.fillText(
      node.kind === 'food' ? 'Berry beds' : node.kind === 'wood' ? 'Woodland' : 'Stone ridge',
      0,
      87,
    );
    c.restore();
  }
  for (const b of s.buildings) {
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
    c.font = '21px Georgia';
    c.textAlign = 'center';
    c.fillText(b.kind === 'town' ? 'Town centre' : b.kind === 'house' ? 'House' : 'Storehouse', 0, 76);
    c.restore();
  }
  const colors = ['#3d5a73', '#865c46', '#4f6b3a', '#8a7152', '#6b617f'];
  for (const [i, v] of s.villagers.entries()) {
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
    c.font = '20px Georgia';
    c.textAlign = 'center';
    c.fillText(v.name, 0, 47);
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
    c.fillStyle = '#f3ecdd';
    c.fillRect(12, 12, 650, 46);
    c.fillStyle = '#c2412d';
    c.font = '23px Georgia';
    c.fillText(`Place ${placing} on open ground · Cancel below`, 26, 42);
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
