import { Role, RuneType, Rune } from './types';
import { v4 as uuidv4 } from 'uuid';

export const AVATAR_URLS = [
  'https://picsum.photos/seed/p1/200',
  'https://picsum.photos/seed/p2/200',
  'https://picsum.photos/seed/p3/200',
  'https://picsum.photos/seed/p4/200',
  'https://picsum.photos/seed/p5/200',
  'https://picsum.photos/seed/p6/200',
  'https://picsum.photos/seed/p7/200',
  'https://picsum.photos/seed/p8/200',
];

export const BOT_NAMES = [
  "Silas", "Elara", "Gideon", "Thorne", "Rowan", "Lysandra", "Kael", "Mara"
];

export const ROLE_DESCRIPTIONS = {
  [Role.VILLAGER]: "Find the werewolves and vote them out during the day.",
  [Role.WEREWOLF]: "Kill a villager each night without getting caught.",
  [Role.SEER]: "Wake up at night to learn the true role of one player.",
  [Role.DOCTOR]: "Wake up at night to protect one player from being killed.",
};

export const INITIAL_LOG_MESSAGE = "Welcome to Darkwood. The runes are glowing...";

export const GEMINI_MODEL_FAST = "gemini-2.5-flash";
export const GEMINI_MODEL_SMART = "gemini-2.5-flash";

export const MOON_PHASES = [
  "New Moon", "Waxing Crescent", "First Quarter", "Waxing Gibbous", "Full Moon", "Waning Gibbous", "Last Quarter", "Waning Crescent"
];

// Available Runes for distribution
export const AVAILABLE_RUNES: Omit<Rune, 'id' | 'currentCooldown'>[] = [
  {
    name: "Lunar Sight",
    type: RuneType.SIGHT,
    description: "Reveal the true role of a target.",
    cooldown: 3
  },
  {
    name: "Guardian Ward",
    type: RuneType.SHIELD,
    description: "Protect a target from death for one night.",
    cooldown: 3
  },
  {
    name: "Shadow Veil",
    type: RuneType.SHIELD,
    description: "Protect yourself from death for one night.",
    cooldown: 4
  }
];

export const getRandomRune = (): Rune => {
  const template = AVAILABLE_RUNES[Math.floor(Math.random() * AVAILABLE_RUNES.length)];
  return {
    ...template,
    id: uuidv4(),
    currentCooldown: 0
  };
};