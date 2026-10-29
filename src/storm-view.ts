import { residentName } from './display.ts';
import type { State } from './sim.ts';

// View of the recorded physical storm, never another weather event or a mind reading.
export function buildingBreakdown(s: State) {
  return s.buildings.map((b) => ({
    id: b.id,
    kind: b.kind,
    complete: b.complete,
    progress: b.progress,
    preexisting: b.kind === 'town',
  }));
}
export function stormView(s: State) {
  const storm = s.story?.storm;
  if (!storm) return null;
  return {
    at: storm.at,
    buildings: storm.buildings,
    resources: storm.resources,
    people: storm.people.map((p) => ({
      ...p,
      name: residentName(s.villagers.find((v) => v.id === p.actor)!),
    })),
  };
}
const esc = (s: unknown) =>
  String(s).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
export function stormPanel(s: State): string {
  const view = stormView(s);
  if (!view) return '';
  const roofs = view.buildings
    .filter((b) => b.complete)
    .map(
      (b) =>
        `<rect x="${b.x - 30}" y="${b.y - 25}" width="60" height="45" fill="#ded4b9" stroke="#302a21"/><path d="M${b.x - 38} ${b.y - 25}l38 -24 38 24" fill="none" stroke="#302a21"/>`,
    )
    .join('');
  const people = view.people
    .filter((p) => p.map === 'yard')
    .map(
      (p) =>
        `<circle cx="${p.point.x}" cy="${p.point.y}" r="8" fill="${p.underRoof ? '#49644a' : '#754c43'}"/><text x="${p.point.x + 10}" y="${p.point.y}" font-size="17">${esc(p.name)}</text>`,
    )
    .join('');
  return `<section aria-label="The recorded storm"><h2>When the rain came</h2><svg class="storm-scene" viewBox="0 0 1000 700" role="img" aria-label="Residents and roofs at the actual storm; the same facts are listed below"><rect width="1000" height="700" fill="#adb8b6"/>${Array.from({ length: 30 }, (_, i) => `<path d="M${20 + i * 33} 20l-10 28 M${30 + i * 33} 300l-10 28 M${20 + i * 33} 600l-10 28" stroke="#52666f"/>`).join('')}${roofs}${people}</svg><ul>${view.people.map((p) => `<li>${esc(p.name)}: ${esc(p.map)}, ${p.underRoof === null ? 'roof exposure was not recorded' : p.underRoof ? 'under a roof' : 'outside the roofs'}.</li>`).join('')}</ul></section>`;
}
export function buildingPanel(s: State): string {
  const rows = buildingBreakdown(s),
    count = rows.filter((b) => b.complete && !b.preexisting).length;
  return `<section aria-label="Building breakdown"><h2>Buildings in this run</h2><p>${count} completed ${count === 1 ? 'building' : 'buildings'}, excluding the workshop hub.</p><ul>${rows.map((b) => `<li>${b.preexisting ? 'Workshop hub was here at the start; not counted' : `${b.kind === 'house' ? 'Guest cabin' : 'Storehouse'} ${esc(b.id)}: ${b.complete ? 'completed' : `unfinished (${Math.floor(b.progress * 100)}%)`}`}.</li>`).join('')}</ul></section>`;
}
