import { castForGame } from '@adam0white/lab-client';

const allocation = castForGame('commonstead');
const roles = [
  {
    name: 'Nora',
    sex: 'female',
    role: 'Resident repair designer',
    castId: 'hf.cast.nora.smallworks',
    family: 'She has an estranged older brother.',
  },
  {
    name: 'Sam',
    sex: 'male',
    role: 'Repair apprentice; resident game playtester',
    castId: 'hf.cast.sam.smallworks',
    family: 'His mother and sister are part of his life.',
  },
  {
    name: 'Dai',
    sex: 'male',
    role: 'Guest maintenance mentor; dam cover arranged',
    castId: 'hf.cast.dai.glance',
    family: 'Separated; an adult daughter lives near his home.',
  },
  {
    name: 'Nerys',
    sex: 'female',
    role: 'Guest host; inn cover arranged',
    castId: 'hf.cast.nerys.glance',
    family: 'Lives with a long-term partner.',
  },
  {
    name: 'Dilek',
    sex: 'female',
    role: 'Shared-kitchen resident; cold-station cook',
    castId: 'hf.cast.dilek.pass',
    family: 'She has a younger brother and a mother.',
  },
  {
    name: 'Burak',
    sex: 'male',
    role: 'Resident treasurer; accountant',
    castId: 'hf.cast.burak.stairwell',
    family: 'Single; his family lives elsewhere.',
  },
  {
    name: 'Sevim',
    sex: 'female',
    role: 'Guest tutor and records reader',
    castId: 'hf.cast.sevim.stairwell',
    family: 'Widowed; an adult child lives abroad.',
  },
  {
    name: 'Oskar',
    sex: 'male',
    role: 'Guest photographer; amateur climber',
    castId: 'hf.cast.oskar.rope',
    family: 'He has a younger sister.',
  },
] as const;
export const CAST = roles.map((role) => {
  const canonical = allocation.find((p) => p.castId === role.castId);
  if (!canonical) throw new Error('Canonical allocation missing');
  return { ...canonical, ...role };
});
export const openingProfile = (entry: (typeof CAST)[number]) => ({
  traits: structuredClone(entry.traits),
  values: structuredClone(entry.values),
});
// Authored possibilities become known only through the chosen workshop encounters.
export const DISCOVERIES = [
  [
    'I left a useful accessibility feature out of a handle design because I preferred its clean line. I did not ask its user.',
    'Nora marks the workshop handle drawing unfinished and restores the accessible grip for a resident trial. No claim of a completed trial or reconciliation with her brother.',
  ],
  [
    'I once copied another player’s bug description into a report I could not reproduce. I still called it checked.',
    'Sam labels today’s workshop game note “not reproduced” and records his actual attempt. The old report still needs a correction where it was shared.',
  ],
  [
    'I kept a list of checks in my head. One workaround outlived the sensor fault. Being needed made that hard to admit.',
    'Dai writes a workshop inspection card and marks the old workaround unverified. He leaves space for Nora to question it. This is not a dam handover.',
  ],
  [
    'That folded stand is for my telescope. I keep astronomy out of the inn’s advertising; clear skies are not a service I can promise.',
    'Nerys marks a dark courtyard corner for an optional evening watch. Clouds may cover it; no sighting is promised. Her partner has the inn covered.',
  ],
  [
    'I record kitchen sounds on my phone. That loose lid has a wonderful rattle. I leave people’s voices out unless they agree.',
    'Dilek records the loose lid alone for a private sound postcard. No voices, upload or publication. She can keep the recording to herself.',
  ],
  [
    'This folded card has a moving ferry inside. I make paper mechanisms when I want work that need not be useful.',
    'Burak leaves his unfinished paper ferry at the shared table with permission. The shared account stays separate from his private hobby.',
  ],
  [
    'I kept a pupil’s exercise books. I called him lazy before learning he was caring for a sick parent. I have not acknowledged my part.',
    'Sevim asks what makes this equipment card hard to use before correcting it. She drafts an acknowledgement privately; no letter is sent or forgiveness claimed.',
  ],
  [
    'An admired picture joined two moments. My caption implied a volunteer stayed through a storm after they had sensibly gone home.',
    'Oskar drafts an accurate workshop caption, leaves out anyone who declined a photograph and marks the repair unfinished. His earlier published story still needs correction.',
  ],
] as const;
