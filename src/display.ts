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
    shelter: 'shelter at the workshop hub',
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
  name = 'This person',
): string {
  const phrases: Record<string, string> = {
    waiting: 'is waiting.',
    moving: 'is moving.',
    working: 'is working.',
    'working under protest': 'is working under protest.',
    'waiting / refused': 'has refused this task and is waiting.',
    'available for agreed light tasks': 'can help with agreed light tasks.',
    'chapter paused at action boundary': 'has finished and is waiting.',
  };
  if (phrases[status]) return phrases[status];
  const parts = status.split('; then ');
  if (parts.length === 2) {
    const refused = (parts[0] ?? '').startsWith('waiting / refused; ');
    const task = (parts[0] ?? '')
      .replace('waiting / refused; ', '')
      .replace('eating / drinking', 'eating and drinking');
    const target = parts[1] ?? 'idle';
    return `${refused ? 'has refused work and ' : ''}is ${task}. Then ${name} will ${target === 'idle' ? 'wait' : `go back to ${nextTask(target, buildings)}`}.`;
  }
  return status === 'attending own routine; light shared tasks after 0:30'
    ? `is following the usual routine. ${name} can help with light tasks after 0:30.`
    : status;
}

/** Package assignment keys describe occupations, not full player sentences. */
export function assignmentText(assignment: string, name = 'This person'): string {
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
  return work[assignment] ? `${name} is ${work[assignment]}.` : assignment;
}

export function admissionLine(facts: {
  cast: { name: string };
  assignment: string;
  life: { work: string; place: string };
  contacts: string[];
}): string {
  const time =
    facts.life.work === 'local-help'
      ? `${facts.cast.name} has set aside time to help locally.`
      : facts.life.work === 'free-time'
        ? `${facts.cast.name} has left some time free.`
        : `${facts.cast.name} has kept time for the usual routine.`;
  const place =
    facts.life.place === 'home'
      ? 'at home'
      : facts.life.place === 'public-garden'
        ? 'at the public garden'
        : 'at the local workplace';
  return `${time} The last stop was ${place}.${facts.contacts.length ? ` ${facts.cast.name} read public work notes from ${facts.contacts.join(', ')}. The writers’ views are not recorded.` : ''}`;
}

/** Helpers have stable simulation identities and natural names in the workshop. */
export function residentName(person: { id: string; name: string }): string {
  const names = [
    'Aylin',
    'Mina',
    'Leyla',
    'Elif',
    'Zeynep',
    'Esra',
    'Selin',
    'Ceren',
    'Ece',
    'Ipek',
    'Deniz',
    'Asli',
    'Seda',
    'Bahar',
    'Lale',
    'Gul',
    'Ada',
    'Beren',
    'Defne',
    'Duru',
    'Ezgi',
    'Funda',
    'Gizem',
    'Hande',
    'Idil',
    'Jale',
    'Leman',
    'Melis',
    'Nazli',
    'Oya',
    'Pelin',
    'Rana',
    'Selen',
    'Tulin',
    'Yasemin',
    'Zeliha',
    'Suna',
    'Nevin',
    'Filiz',
    'Ayla',
  ];
  const helperIndex = Number(person.id.slice(1)) - 9;
  return person.id.startsWith('v') && helperIndex >= 0
    ? (names[helperIndex] ?? 'A local helper')
    : person.name;
}

/** Explain elapsed-time gates at display time; recorded messages stay byte-exact. */
export function eventText(message: string): string {
  return message
    .replace(
      'Spend a minute together. Then offer a break and wait five seconds.',
      'After the game clock reaches 1:00, offer a break and wait five game seconds during that break. No shared location or earlier conversation is required.',
    )
    .replace(
      'Return these carried materials to the workshop hub first.',
      'This person is still carrying materials. Ask again after they deliver them at the hub, or choose Bring carried materials to the hub.',
    )
    .replace(
      'Spend a minute together before inviting a private story.',
      'After one minute of play at Steady, you may invite a private story. Pauses do not count. No shared location or earlier conversation is required.',
    );
}
