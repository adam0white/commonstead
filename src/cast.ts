import { TRAIT_KEYS, type Traits, VALUE_KEYS, type Values } from '@adam0white/human-framework';

// Registry edition 2026-10-23. No opening priors override a continuing Person.
export const CAST = [
  {
    name: 'Nora',
    sex: 'female',
    role: 'Resident repair designer',
    castId: 'hf.cast.nora.smallworks',
    age: 28,
    family: 'Estranged older brother remains background; no canonical partner.',
    traits: {
      honesty: 0.7,
      conscientiousness: 0.6,
      extraversion: 0.45,
      agreeableness: 0.5,
      emotionality: 0.5,
      openness: 0.85,
    },
    values: {
      selfDirection: 0.9,
      stimulation: 0.8,
    },
  },
  {
    name: 'Sam',
    sex: 'male',
    role: 'Repair apprentice; resident game playtester',
    castId: 'hf.cast.sam.smallworks',
    age: 18,
    family: 'Mother and sister remain background; no merger with older source Neighbours Sam.',
    traits: {
      honesty: 0.65,
      conscientiousness: 0.5,
      extraversion: 0.6,
      agreeableness: 0.65,
      emotionality: 0.55,
      openness: 0.8,
    },
    values: {
      achievement: 0.8,
      stimulation: 0.7,
    },
  },
  {
    name: 'Dai',
    sex: 'male',
    role: 'Guest maintenance mentor; dam cover arranged',
    castId: 'hf.cast.dai.glance',
    age: 63,
    family: 'Separated; an adult daughter lives nearby, newly authored.',
    traits: {
      honesty: 0.7,
      emotionality: 0.3,
      extraversion: 0.35,
      agreeableness: 0.35,
      conscientiousness: 0.75,
      openness: 0.45,
    },
    values: {},
  },
  {
    name: 'Nerys',
    sex: 'female',
    role: 'Guest host; inn cover arranged',
    castId: 'hf.cast.nerys.glance',
    age: 47,
    family: 'Lives with a long-term partner who remains background.',
    traits: {
      honesty: 0.75,
      conscientiousness: 0.7,
      extraversion: 0.75,
      agreeableness: 0.6,
      emotionality: 0.55,
      openness: 0.65,
    },
    values: {},
  },
  {
    name: 'Dilek',
    sex: 'female',
    role: 'Shared-kitchen resident; cold-station cook',
    castId: 'hf.cast.dilek.pass',
    age: 34,
    family: 'Younger brother and mother remain unnamed background relatives.',
    traits: {
      honesty: 0.7,
      conscientiousness: 0.55,
      extraversion: 0.6,
      emotionality: 0.65,
    },
    values: {},
  },
  {
    name: 'Burak',
    sex: 'male',
    role: 'Resident treasurer; accountant',
    castId: 'hf.cast.burak.stairwell',
    age: 31,
    family: 'Single; family elsewhere remains unnamed.',
    traits: {
      honesty: 0.8,
      extraversion: 0.3,
      agreeableness: 0.7,
      conscientiousness: 0.8,
      openness: 0.5,
    },
    values: {},
  },
  {
    name: 'Sevim',
    sex: 'female',
    role: 'Guest tutor and records reader',
    castId: 'hf.cast.sevim.stairwell',
    age: 69,
    family: 'Widowed; an adult child lives abroad, newly authored background.',
    traits: {
      honesty: 0.6,
      extraversion: 0.6,
      agreeableness: 0.35,
      conscientiousness: 0.85,
      openness: 0.4,
    },
    values: {},
  },
  {
    name: 'Oskar',
    sex: 'male',
    role: 'Guest photographer; amateur climber',
    castId: 'hf.cast.oskar.rope',
    age: 34,
    family: 'Younger sister remains background; no canonical partner.',
    traits: {
      conscientiousness: 0.45,
      emotionality: 0.2,
      agreeableness: 0.4,
      extraversion: 0.75,
      openness: 0.6,
      honesty: 0.55,
    },
    values: {},
  },
] as const;

export function openingProfile(entry: (typeof CAST)[number]) {
  return {
    traits: { ...Object.fromEntries(TRAIT_KEYS.map((key) => [key, 0.5])), ...entry.traits } as Traits,
    values: { ...Object.fromEntries(VALUE_KEYS.map((key) => [key, 0.5])), ...entry.values } as Values,
  };
}
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
