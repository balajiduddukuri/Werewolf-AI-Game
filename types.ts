export enum Role {
  VILLAGER = 'Villager',
  WEREWOLF = 'Werewolf',
  SEER = 'Seer',
  DOCTOR = 'Doctor',
}

export enum Phase {
  SETUP = 'SETUP',
  NIGHT_INTRO = 'NIGHT_INTRO',
  NIGHT_ACTION = 'NIGHT_ACTION',
  DAY_INTRO = 'DAY_INTRO',
  DAY_DISCUSSION = 'DAY_DISCUSSION',
  DAY_VOTING = 'DAY_VOTING',
  GAME_OVER = 'GAME_OVER',
}

export enum RuneType {
  SIGHT = 'SIGHT',   // Reveal role
  SHIELD = 'SHIELD', // Protect
}

export interface Rune {
  id: string;
  name: string;
  type: RuneType;
  description: string;
  cooldown: number;
  currentCooldown: number; // 0 = Ready
}

export interface Player {
  id: string;
  name: string;
  role: Role;
  isAlive: boolean;
  isBot: boolean;
  avatar: string;
  votesAgainst: number;
  runes: Rune[];
}

export interface LogEntry {
  id: string;
  phase: Phase;
  text: string;
  source?: string; // 'Narrator' or Player Name
  type: 'narrative' | 'chat' | 'system' | 'action';
}

export interface GameState {
  players: Player[];
  phase: Phase;
  dayCount: number;
  moonPhase: string; // 'Full Moon', 'New Moon', etc.
  logs: LogEntry[];
  winner: 'Villagers' | 'Werewolves' | null;
  userPlayerId: string;
  targets: {
    werewolf: string | null;
    doctor: string | null;
    seer: string | null;
  };
  seerKnowledge: Record<string, Role>;
}

export interface BotDayAction {
  playerId: string;
  chatMessage: string;
  voteTargetId: string | null;
  reasoning: string;
}

export interface BotNightAction {
  werewolfKillTargetId: string | null;
  doctorSaveTargetId: string | null;
  seerCheckTargetId: string | null;
  // Bots can also use runes
  runeActions: {
    playerId: string;
    runeId: string;
    targetId: string;
  }[];
}