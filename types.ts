/**
 * Represents the specific role assigned to a player.
 * Roles determine the unique abilities available during the Night Phase.
 */
export enum Role {
  VILLAGER = 'Villager', // No special ability, votes during day
  WEREWOLF = 'Werewolf', // Kills at night
  SEER = 'Seer',         // Checks roles at night
  DOCTOR = 'Doctor',     // Saves players at night
}

/**
 * The sequence of game states.
 * The game loop cycles through NIGHT -> DAY -> NIGHT until a win condition is met.
 */
export enum Phase {
  SETUP = 'SETUP',                   // Game configuration screen
  NIGHT_INTRO = 'NIGHT_INTRO',       // Transition / Atmosphere setting
  NIGHT_ACTION = 'NIGHT_ACTION',     // Players perform abilities/runes
  DAY_INTRO = 'DAY_INTRO',           // Results of the night are revealed
  DAY_DISCUSSION = 'DAY_DISCUSSION', // Bots generate chat messages
  DAY_VOTING = 'DAY_VOTING',         // Players vote to eliminate
  GAME_OVER = 'GAME_OVER',           // Victory screen
}

/**
 * Types of Runes available in the game.
 * Runes provide secondary abilities independent of the main Role.
 */
export enum RuneType {
  SIGHT = 'SIGHT',   // Reveals information (similar to Seer)
  SHIELD = 'SHIELD', // Protects from death (similar to Doctor)
}

/**
 * A magical item possessed by a player.
 * Runes have cooldowns preventing spam usage.
 */
export interface Rune {
  id: string;
  name: string;
  type: RuneType;
  description: string;
  cooldown: number;        // Total turns to wait after use
  currentCooldown: number; // Current turns remaining (0 = Ready)
}

/**
 * Represents a participant in the game (User or AI Bot).
 */
export interface Player {
  id: string;
  name: string;
  role: Role;
  isAlive: boolean;
  isBot: boolean;
  avatar: string; // URL to avatar image
  votesAgainst: number; // Accumulator for day voting
  runes: Rune[]; // Inventory of runes
}

/**
 * A single entry in the game's history log.
 * Used for display in the UI and context for the AI.
 */
export interface LogEntry {
  id: string;
  phase: Phase;
  text: string;
  source?: string; // 'Narrator', 'System', or Player Name
  type: 'narrative' | 'chat' | 'system' | 'action';
}

/**
 * The root state object for the application.
 */
export interface GameState {
  players: Player[];
  phase: Phase;
  dayCount: number;
  moonPhase: string; // Atmospheric text (e.g., 'Full Moon')
  logs: LogEntry[];
  winner: 'Villagers' | 'Werewolves' | null;
  userPlayerId: string;
  
  // Pending actions selected during the night
  targets: {
    werewolf: string | null;
    doctor: string | null;
    seer: string | null;
  };
  
  // Information revealed to the Seer (or User via Seer/Rune)
  seerKnowledge: Record<string, Role>;
}

/**
 * Structure for AI response during the Day Phase.
 */
export interface BotDayAction {
  playerId: string;
  chatMessage: string;
  voteTargetId: string | null; // Who they want to eliminate
  reasoning: string; // Internal logic (unused in UI but good for CoT)
}

/**
 * Structure for AI response during the Night Phase.
 * Aggregates all role actions and rune usage.
 */
export interface BotNightAction {
  werewolfKillTargetId: string | null;
  doctorSaveTargetId: string | null;
  seerCheckTargetId: string | null;
  
  // Bots can use runes in addition to their role action
  runeActions: {
    playerId: string;
    runeId: string;
    targetId: string;
  }[];
}