/** Player wording only. Stored simulation text and replay hashes stay unchanged. */
const wording: Record<string, string> = {
  'Prepared boards, small ballast bags and hand tools only. No powered tools or structural work.':
    'Use prepared boards, small ballast bags and hand tools. Do not use powered tools or change the building structure.',
  'A short rest, then back to my task.': 'I will rest for a short time, then return to my task.',
  'I need water. A drink, then back to work.': 'I need water. I will have a drink, then return to work.',
  'Food and water here, then resume.': 'They will eat and drink here, then return to their tasks.',
  'Rest here for 35 seconds, then resume.': 'They will rest here for 35 seconds, then return to their tasks.',
  'attending own routine; light shared tasks after 0:30':
    'is following their own routine. They can help with light tasks after 0:30.',
  'available for agreed light tasks': 'is available for agreed light tasks.',
  'Resident repair designer': 'They work as a repair designer at the workshop',
  'Repair apprentice; resident game playtester':
    'They are a repair apprentice and a fictional game playtester',
  'Guest maintenance mentor; dam cover arranged':
    'They are a guest maintenance mentor. Someone is covering his work at the dam',
  'Guest host; inn cover arranged': 'They are a guest host. Someone is covering her work at the inn',
  'Shared-kitchen resident; cold-station cook': 'They work in the shared kitchen preparing cold food',
  'Resident treasurer; accountant': 'They are an accountant and the workshop treasurer',
  'Guest tutor and records reader': 'They are a guest tutor who also reads records',
  'Guest photographer; amateur climber': 'They are a guest photographer and an amateur climber',
  'Separated; an adult daughter lives near his home.':
    'He is separated. His adult daughter lives near his home.',
  'Lives with a long-term partner.': 'She lives with a long-term partner.',
  'Single; his family lives elsewhere.': 'He is single. His family lives elsewhere.',
  'Widowed; an adult child lives abroad.': 'She is widowed. Her adult child lives abroad.',
  'No voices, upload or publication.': 'She does not record voices, upload anything or publish it.',
  'No claim of a completed trial or reconciliation with her brother.':
    'The trial has not happened yet. She has not reconciled with her brother.',
  'Light prepared-material work only. Use a trolley; choose a comfortable load. No electrical, structural or powered-tool work.':
    'Use a trolley and choose a comfortable load of prepared materials. Do not do electrical work, change the building structure or use powered tools.',
};

export function displayText(text: string): string {
  if (wording[text]) return wording[text];
  let out = text.replaceAll('kit store', 'storehouse');
  out = out
    .replaceAll('cold-station', 'cold-food preparation')
    .replaceAll('cold station', 'cold-food preparation area');
  out = out
    .replaceAll('river-level witness', 'observer of river levels')
    .replaceAll('invoice reconciliation', 'checking invoices against payments');
  for (const [before, after] of Object.entries(wording)) out = out.replaceAll(before, after);
  out = out.replace(/^(.*?) → move\.$/, '$1 will move to the selected place.');
  out = out.replace(
    /^(.*?) → (.*?)\.$/,
    (_match, names, target) => `${names} will start ${nextTask(target)}.`,
  );
  out = out.replace(
    /^(.*?) completed; shared supplies are ready for the storm\.$/,
    'The $1 is finished. The shared supplies are ready for the storm.',
  );
  out = out.replace(
    /^(.*?) completed; two more housing spaces\.$/,
    'The $1 is ready. There is room for two more people.',
  );
  return out;
}
function nextTask(target: string, buildings: ReadonlyArray<{ id: string; kind: string }> = []): string {
  const tasks: Record<string, string> = {
    food: 'collecting meals',
    meals: 'collecting meals',
    wood: 'collecting prepared boards',
    'prepared boards': 'collecting prepared boards',
    stone: 'collecting ballast bags',
    'ballast bags': 'collecting ballast bags',
    idle: 'waiting',
    move: 'moving to the selected place',
    house: 'preparing a guest cabin',
    'guest cabin': 'preparing a guest cabin',
    storehouse: 'assembling the storehouse',
    'kit store': 'assembling the storehouse',
  };
  const building = buildings.find((b) => b.id === target);
  if (building) return building.kind === 'house' ? 'preparing a guest cabin' : 'assembling the storehouse';
  return tasks[target] ?? 'the assigned task';
}
export function personStatus(
  status: string,
  buildings: ReadonlyArray<{ id: string; kind: string }> = [],
): string {
  const phrases: Record<string, string> = {
    waiting: 'is waiting.',
    moving: 'is moving.',
    working: 'is working.',
    'working under protest': 'is working under protest.',
    'waiting / refused': 'has refused this task and is waiting.',
    'available for agreed light tasks': 'can help with agreed light tasks.',
    'chapter paused at action boundary': 'has finished their current action and is waiting.',
  };
  if (phrases[status]) return phrases[status];
  const parts = status.split('; then ');
  if (parts.length === 2) {
    const refused = (parts[0] ?? '').startsWith('waiting / refused; ');
    const task = (parts[0] ?? '')
      .replace('waiting / refused; ', '')
      .replace('eating / drinking', 'eating and drinking');
    const target = parts[1] ?? 'idle';
    return `${refused ? 'has refused work and ' : ''}is ${task}. Then they will ${target === 'idle' ? 'wait' : `resume ${nextTask(target, buildings)}`}.`;
  }
  return displayText(status);
}
