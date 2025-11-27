import { GoogleGenAI, Type, Modality } from "@google/genai";
import { Player, Role, Phase, BotDayAction, BotNightAction } from "../types";
import { GEMINI_MODEL_FAST, GEMINI_MODEL_SMART } from "../constants";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// Helper to format players for the prompt
const formatPlayersForPrompt = (players: Player[]) => {
  return players.map(p => 
    `- ${p.name} (ID: ${p.id}) ${p.isAlive ? "[ALIVE]" : "[DEAD]"}`
  ).join("\n");
};

/**
 * Generates flavor text for the narrator.
 */
export const generateNarratorText = async (
  phase: Phase,
  dayCount: number,
  recentEvents: string,
  moonPhase: string
): Promise<string> => {
  const prompt = `
    You are the Narrator of a Werewolf game. 
    Current Phase: ${phase}
    Day: ${dayCount}
    Moon Phase: ${moonPhase}
    Recent Events: ${recentEvents}
    
    Write a short, atmospheric description (max 2 sentences) for the current situation. 
    Mention the moon or runes if relevant.
    If it's night, be spooky. If it's day, be tense.
    Do not use markdown. Just plain text.
  `;

  try {
    const response = await ai.models.generateContent({
      model: GEMINI_MODEL_FAST,
      contents: prompt,
    });
    return response.text?.trim() || "The wind howls through the trees...";
  } catch (error) {
    console.error("Narrator Gen Error", error);
    return "A strange silence falls over the village.";
  }
};

/**
 * Generates speech audio from text using Gemini TTS.
 * Returns the Base64 encoded audio string (Raw PCM).
 */
export const generateSpeech = async (text: string): Promise<string | null> => {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: 'Fenrir' },
          },
        },
      },
    });
    
    return response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data || null;
  } catch (error) {
    console.error("TTS Error", error);
    return null;
  }
};

/**
 * Simulates bot decisions during the DAY (Chat + Voting).
 */
export const generateBotDayActions = async (
  players: Player[],
  dayCount: number,
  logs: string[]
): Promise<BotDayAction[]> => {
  const aliveBots = players.filter(p => p.isAlive && p.isBot);
  if (aliveBots.length === 0) return [];

  const roleList = players.map(p => `${p.name}: ${p.role} (${p.isAlive ? 'Alive' : 'Dead'})`).join('\n');
  const recentLogs = logs.slice(-10).join('\n');

  const prompt = `
    You are simulating the AI players in a game of Werewolf.
    Day: ${dayCount}
    
    Players & Roles (Hidden info for simulation logic):
    ${roleList}

    Recent History:
    ${recentLogs}

    Task: Generate a chat message and a vote target for EACH alive bot.
    - Werewolves should try to blend in or frame villagers.
    - Villagers should try to find werewolves based on suspicion.
    - Seer/Doctor should be subtle.
    - 'voteTargetId' should be the ID of the player they want to eliminate. Can be null if abstaining (rarely).
    - 'chatMessage' should be short (under 20 words).

    Return a JSON Array.
  `;

  try {
    const response = await ai.models.generateContent({
      model: GEMINI_MODEL_SMART,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              playerId: { type: Type.STRING },
              chatMessage: { type: Type.STRING },
              voteTargetId: { type: Type.STRING, nullable: true },
              reasoning: { type: Type.STRING },
            },
            required: ["playerId", "chatMessage", "voteTargetId"],
          },
        },
      },
    });

    const text = response.text;
    if (!text) return [];
    return JSON.parse(text) as BotDayAction[];
  } catch (error) {
    console.error("Bot Day Action Error", error);
    return [];
  }
};

/**
 * Simulates bot decisions during the NIGHT (Killing, Saving, Checking, RUNES).
 */
export const generateBotNightActions = async (
  players: Player[],
  dayCount: number
): Promise<BotNightAction> => {
  const roleList = players.map(p => {
    const runeInfo = p.runes.map(r => `${r.name} (ID: ${r.id}, Cooldown: ${r.currentCooldown})`).join(', ');
    return `${p.name} (ID: ${p.id}): ${p.role} [${p.isAlive ? 'Alive' : 'Dead'}] [Runes: ${runeInfo}]`;
  }).join('\n');

  const prompt = `
    You are the Game Engine for a Werewolf game Night Phase.
    Day: ${dayCount}
    
    Players & Runes:
    ${roleList}

    Decide the targets for the active roles:
    1. Werewolves: Pick one ALIVE non-werewolf to KILL.
    2. Doctor: Pick one ALIVE player to SAVE (can be self).
    3. Seer: Pick one ALIVE player to CHECK (reveal role).

    ADDITIONALLY: Bots can use their RUNES if they are off cooldown (Cooldown: 0).
    - 'Lunar Sight' acts like Seer.
    - 'Guardian Ward' acts like Doctor.
    - 'Shadow Veil' protects self.
    
    If a bot uses a rune, add it to 'runeActions'. Use runes strategically but sparingly (20% chance if ready).
    
    Return JSON.
  `;

  try {
    const response = await ai.models.generateContent({
      model: GEMINI_MODEL_FAST,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
            type: Type.OBJECT,
            properties: {
                werewolfKillTargetId: { type: Type.STRING, nullable: true },
                doctorSaveTargetId: { type: Type.STRING, nullable: true },
                seerCheckTargetId: { type: Type.STRING, nullable: true },
                runeActions: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      playerId: { type: Type.STRING },
                      runeId: { type: Type.STRING },
                      targetId: { type: Type.STRING },
                    },
                    required: ["playerId", "runeId", "targetId"]
                  }
                }
            }
        }
      },
    });

    const text = response.text;
    if (!text) throw new Error("No response text");
    return JSON.parse(text) as BotNightAction;
  } catch (error) {
    console.error("Bot Night Action Error", error);
    // Fallback: Random actions
    const alivePlayers = players.filter(p => p.isAlive);
    const randomId = () => alivePlayers[Math.floor(Math.random() * alivePlayers.length)]?.id || null;
    return {
      werewolfKillTargetId: randomId(),
      doctorSaveTargetId: randomId(),
      seerCheckTargetId: randomId(),
      runeActions: []
    };
  }
};