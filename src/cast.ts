import { castForGame } from '@adam0white/lab-client';

const allocation = castForGame('commonstead');
const roles = [
  {
    name: 'Nora',
    work: 'She designs repairs and makes things.',
    sex: 'female',
    role: 'She lives here and designs repairs.',
    castId: 'hf.cast.nora.smallworks',
    family: 'She has an older brother, but they no longer have a close relationship.',
  },
  {
    name: 'Sam',
    work: 'He is learning repair work. He sometimes works in a kitchen and tests games at Commonstead, where he lives.',
    sex: 'male',
    role: 'He lives here, learns repair work and tests games.',
    castId: 'hf.cast.sam.smallworks',
    family: 'His mother and sister are part of his life.',
  },
  {
    name: 'Dai',
    work: 'He looks after the dam and has worked there for thirty-one years.',
    sex: 'male',
    role: 'He is visiting to teach maintenance. Someone else is covering his work at the dam.',
    castId: 'hf.cast.dai.glance',
    family: 'He is separated from his partner. His adult daughter lives near his home.',
  },
  {
    name: 'Nerys',
    work: 'She runs an inn and observes the river level.',
    sex: 'female',
    role: 'She is visiting as a host. Someone else is covering her work at the inn.',
    castId: 'hf.cast.nerys.glance',
    family: 'She lives with her partner of many years.',
  },
  {
    name: 'Dilek',
    work: 'She prepares cold dishes and later organises a shared kitchen.',
    sex: 'female',
    role: 'She lives here and prepares cold dishes in the shared kitchen.',
    castId: 'hf.cast.dilek.pass',
    family: 'She has a younger brother and a mother.',
  },
  {
    name: 'Burak',
    work: 'He works as an accountant.',
    sex: 'male',
    role: 'He lives here, manages the shared money and works as an accountant.',
    castId: 'hf.cast.burak.stairwell',
    family: 'He is single. His family lives elsewhere.',
  },
  {
    name: 'Sevim',
    work: 'She is a retired teacher. She volunteers to teach reading and writing for everyday use.',
    sex: 'female',
    role: 'She is visiting to tutor people and read records.',
    castId: 'hf.cast.sevim.stairwell',
    family: 'Her spouse has died. Her adult child lives in another country.',
  },
  {
    name: 'Oskar',
    work: 'He works as a photographer and takes climbing seriously as a hobby.',
    sex: 'male',
    role: 'He is visiting as a photographer. He also climbs as a hobby.',
    castId: 'hf.cast.oskar.rope',
    family: 'He has a younger sister.',
  },
] as const;
export const CAST = roles.map((role) => {
  const canonical = allocation.find((p) => p.castId === role.castId);
  if (!canonical) throw new Error('The resident list could not load. Reload the game and try again.');
  return { ...canonical, ...role };
});
export const openingProfile = (entry: (typeof CAST)[number]) => ({
  traits: structuredClone(entry.traits),
  values: structuredClone(entry.values),
});
// Authored possibilities become known only through the chosen workshop encounters.
export const DISCOVERIES = [
  [
    'I left a feature out of a handle design that would have made it easier to use. I preferred the simpler shape. I did not ask the person who would use it.',
    'Nora marks the workshop handle drawing as unfinished. She adds the easier grip back so a resident can try it. This does not show that the trial is complete or that she has repaired her relationship with her brother.',
  ],
  [
    'I once copied another player’s description of a game problem into a report. I could not make the same problem happen, but I still said I had checked it.',
    'Sam writes “I could not make this problem happen” in today’s workshop game note. He records what he actually tried. He still needs to correct the old report where he shared it.',
  ],
  [
    'I kept a list of checks in my head. I kept using a temporary solution after the sensor problem was fixed. I liked being needed, so that was hard to admit.',
    'Dai writes a workshop inspection card. He notes that the old temporary solution has not been checked. He leaves room for Nora to question it. He is not handing over his work at the dam.',
  ],
  [
    'That folded stand is for my telescope. I do not advertise stargazing at the inn. I cannot promise clear skies.',
    'Nerys marks a dark corner of the courtyard where people can choose to watch the night sky. Clouds may hide the stars, so she cannot promise they will see them. Her partner is looking after the inn.',
  ],
  [
    'I record kitchen sounds on my phone. That loose lid has a wonderful rattle. I leave people’s voices out unless they agree.',
    'Dilek records only the loose lid as a short personal sound recording. She does not record voices or upload or publish it. She can keep the recording to herself.',
  ],
  [
    'This folded card has a moving ferry inside. I make moving paper models when I want to make something that does not have to be useful.',
    'Burak gets permission to leave his unfinished paper ferry at the shared table. He keeps the shared money separate from his private hobby.',
  ],
  [
    'I kept a pupil’s exercise books. I called him lazy before I learned that he was caring for a sick parent. I have not admitted what I did wrong.',
    'Sevim asks what makes this equipment card hard to use before she corrects it. She privately drafts a note admitting what she did wrong. She does not send a letter or claim that anyone has forgiven her.',
  ],
  [
    'I combined two moments in a picture that people admired. My caption made it seem that a volunteer stayed through a storm. They had made the sensible choice to go home before then.',
    'Oskar drafts an accurate workshop photo caption. He leaves out anyone who did not agree to a photograph. He marks the repair as unfinished. He still needs to correct the story he published earlier.',
  ],
] as const;
