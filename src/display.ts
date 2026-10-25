/** Turn semantic task and status keys into player sentences. */
export function nextTask(
  target: string,
  buildings: ReadonlyArray<{ id: string; kind: string }> = [],
): string {
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
  return status === 'attending own routine; light shared tasks after 0:30'
    ? 'is following their usual routine. They can help with light tasks after 0:30.'
    : status;
}

/** Package assignment keys describe occupations, not full player sentences. */
export function assignmentText(assignment: string): string {
  const work: Record<string, string> = {
    'cold station': 'preparing cold food',
    'shared-kitchen planning': 'planning the shared kitchen',
    'accounts ledger': 'keeping the account book',
    'invoice reconciliation': 'checking invoices against payments',
    'volunteer reading tutor': 'teaching reading as a volunteer',
    'volunteer practical-writing tutor': 'teaching writing for everyday use as a volunteer',
    'photography assignment': 'taking photographs',
    'photograph editing': 'editing photographs',
    'dam inspection': 'inspecting the dam',
    'dam records': 'keeping the dam records',
    'inn service': 'serving guests at the inn',
    'inn stores': 'looking after supplies at the inn',
    'repair design': 'designing repairs',
    'repair making': 'making repairs',
    'supervised repair bench': 'doing repair work with supervision',
    'kitchen assistance': 'helping in the kitchen',
  };
  return work[assignment] ? `Their current work is ${work[assignment]}.` : assignment;
}

export function admissionLine(facts: {
  cast: { name: string };
  assignment: string;
  life: { work: string; place: string };
  contacts: string[];
}): string {
  const time =
    facts.life.work === 'local-help'
      ? 'They have set aside time to help locally.'
      : facts.life.work === 'free-time'
        ? 'They have left some time free.'
        : 'They have kept time for their usual routine.';
  const place =
    facts.life.place === 'home'
      ? 'at home'
      : facts.life.place === 'public-garden'
        ? 'at the public garden'
        : 'at their local workplace';
  return `${facts.cast.name} has a current work assignment. ${assignmentText(facts.assignment)} ${time} They last stopped ${place}.${facts.contacts.length ? ` They read public work notes from ${facts.contacts.join(', ')}. The writers’ views are not recorded.` : ''}`;
}
