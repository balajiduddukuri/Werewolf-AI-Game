import React, { useState, useEffect, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Moon, Sun, RefreshCw, Loader2, Hexagon, BookOpen, X, Shield, Eye, Users, MousePointer2, Volume2, Trophy, Skull } from 'lucide-react';
import confetti from 'canvas-confetti';

import PlayerCard from './components/PlayerCard';
import GameLog from './components/GameLog';
import { Player, Role, Phase, LogEntry, GameState, Rune, RuneType } from './types';
import { AVATAR_URLS, BOT_NAMES, ROLE_DESCRIPTIONS, INITIAL_LOG_MESSAGE, getRandomRune, MOON_PHASES } from './constants';
import { generateNarratorText, generateBotDayActions, generateBotNightActions, generateSpeech } from './services/geminiService';
import { playRawAudio } from './services/audioService';

// --- State Management ---
const initialState: GameState = {
  players: [],
  phase: Phase.SETUP,
  dayCount: 0,
  moonPhase: MOON_PHASES[0],
  logs: [],
  winner: null,
  userPlayerId: '',
  targets: { werewolf: null, doctor: null, seer: null },
  seerKnowledge: {},
};

function App() {
  const [state, setState] = useState<GameState>(initialState);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedActionTarget, setSelectedActionTarget] = useState<string | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [isReadingRules, setIsReadingRules] = useState(false);
  const [autoNarrate, setAutoNarrate] = useState(true);
  
  // New State for Rune UI
  const [activeActionType, setActiveActionType] = useState<'ROLE' | 'RUNE'>('ROLE');
  const [selectedRuneId, setSelectedRuneId] = useState<string | null>(null);

  const processedLogIds = useRef<Set<string>>(new Set());

  const addLog = (text: string, type: LogEntry['type'] = 'system', source?: string) => {
    setState(prev => ({
      ...prev,
      logs: [...prev.logs, { id: uuidv4(), phase: prev.phase, text, type, source }]
    }));
  };

  // --- Auto-Narrate Logic ---
  useEffect(() => {
    if (!autoNarrate) return;

    const narrativeLogs = state.logs.filter(l => l.type === 'narrative' && !processedLogIds.current.has(l.id));
    
    if (narrativeLogs.length > 0) {
      const latestLog = narrativeLogs[narrativeLogs.length - 1];
      processedLogIds.current.add(latestLog.id);
      
      // Small delay to ensure previous audio might have cleared
      setTimeout(async () => {
        try {
          const audio = await generateSpeech(latestLog.text);
          if (audio) await playRawAudio(audio);
        } catch (e) {
          console.error("Auto-narrate failed", e);
        }
      }, 500);
    }
  }, [state.logs, autoNarrate]);


  // --- Game Setup ---
  const startGame = (selectedRole: Role) => {
    const rolesPool = [selectedRole, Role.WEREWOLF, Role.SEER, Role.DOCTOR, Role.VILLAGER, Role.VILLAGER, Role.VILLAGER, Role.WEREWOLF];
    // Shuffle remaining roles for bots
    const botRoles = rolesPool.slice(1).sort(() => Math.random() - 0.5);
    
    const userPlayer: Player = {
      id: uuidv4(),
      name: "You",
      role: selectedRole,
      isAlive: true,
      isBot: false,
      avatar: AVATAR_URLS[0],
      votesAgainst: 0,
      runes: [getRandomRune()] // User gets a rune
    };

    const bots: Player[] = botRoles.map((role, idx) => ({
      id: uuidv4(),
      name: BOT_NAMES[idx],
      role: role,
      isAlive: true,
      isBot: true,
      avatar: AVATAR_URLS[idx + 1],
      votesAgainst: 0,
      runes: [getRandomRune()] // Bots get a rune
    }));

    const allPlayers = [userPlayer, ...bots].sort(() => Math.random() - 0.5);

    setState({
      ...initialState,
      players: allPlayers,
      userPlayerId: userPlayer.id,
      phase: Phase.NIGHT_INTRO,
      dayCount: 1,
      moonPhase: MOON_PHASES[0],
      logs: [{ id: uuidv4(), phase: Phase.SETUP, text: INITIAL_LOG_MESSAGE, type: 'narrative' }]
    });
    processedLogIds.current.clear();
  };

  const resetGame = () => {
    setState(initialState);
    processedLogIds.current.clear();
  };

  // --- Audio ---
  const handleReadRules = async () => {
      if (isReadingRules) return;
      setIsReadingRules(true);
      const rulesText = "Welcome to Darkwood. Villagers must find and vote out Werewolves. Werewolves must eliminate Villagers. At night, use your Runes and abilities. By day, discuss and vote.";
      try {
        const audio = await generateSpeech(rulesText);
        if (audio) await playRawAudio(audio);
      } catch (e) {
          console.error(e);
      } finally {
          setIsReadingRules(false);
      }
  };

  // --- Phase Transitions ---

  // Trigger phase logic when phase changes
  useEffect(() => {
    const runPhase = async () => {
      if (state.phase === Phase.NIGHT_INTRO) {
        setIsLoading(true);
        // Cycle Moon Phase
        const moonIdx = (state.dayCount - 1) % MOON_PHASES.length;
        const currentMoon = MOON_PHASES[moonIdx];
        
        // Cooldown Reduction for Night
        const nextPlayers = state.players.map(p => ({
          ...p,
          runes: p.runes.map(r => ({
            ...r,
            currentCooldown: Math.max(0, r.currentCooldown - 1)
          }))
        }));

        setState(prev => ({ ...prev, moonPhase: currentMoon, players: nextPlayers }));

        const text = await generateNarratorText(state.phase, state.dayCount, "Night falls. Runes begin to hum.", currentMoon);
        addLog(text, 'narrative');
        setIsLoading(false);
        
        // Reset Action UI
        setActiveActionType('ROLE');
        setSelectedRuneId(null);
        setSelectedActionTarget(null);
        
        setTimeout(() => setState(prev => ({ ...prev, phase: Phase.NIGHT_ACTION })), 2000);
      } 
      else if (state.phase === Phase.DAY_INTRO) {
        processNightResults();
      }
      else if (state.phase === Phase.DAY_DISCUSSION) {
        runDayDiscussion();
      }
    };
    runPhase();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.phase]);

  // --- Night Logic ---

  const handleNightAction = (targetId: string) => {
    setSelectedActionTarget(targetId);
  };
  
  const toggleRuneMode = (rune: Rune) => {
    if (rune.currentCooldown > 0) return; // Cannot use if on cooldown
    
    if (selectedRuneId === rune.id) {
        // Deselect
        setActiveActionType('ROLE');
        setSelectedRuneId(null);
        setSelectedActionTarget(null);
    } else {
        // Select
        setActiveActionType('RUNE');
        setSelectedRuneId(rune.id);
        setSelectedActionTarget(null); // Reset target when switching tools
    }
  };

  const confirmNightAction = async () => {
    if (!selectedActionTarget && userPlayer?.isAlive) return;

    setIsLoading(true);

    // 1. Get Bot Actions (Roles + Runes)
    const botActions = await generateBotNightActions(state.players, state.dayCount);

    // 2. Resolve Actions
    // We collect all "protects", "kills", "reveals" regardless of source (Role or Rune)
    let kills: string[] = [];
    let saves: string[] = []; // IDs of saved players
    let reveals: string[] = []; // IDs of revealed players (for user)

    // A. Bot Roles
    if (botActions.werewolfKillTargetId) kills.push(botActions.werewolfKillTargetId);
    if (botActions.doctorSaveTargetId) saves.push(botActions.doctorSaveTargetId);
    
    // B. Bot Runes
    botActions.runeActions?.forEach(ra => {
      const runePlayer = state.players.find(p => p.id === ra.playerId);
      const rune = runePlayer?.runes.find(r => r.id === ra.runeId);
      if (rune && rune.type === RuneType.SHIELD) saves.push(ra.targetId);
      if (rune && rune.type === RuneType.SIGHT) {
          // Bots learn info silently
      }
    });

    // C. User Action
    const user = userPlayer!;
    let userUsedRuneId: string | null = null;

    if (user.isAlive && selectedActionTarget) {
        if (activeActionType === 'ROLE') {
            if (user.role === Role.WEREWOLF) kills.push(selectedActionTarget);
            if (user.role === Role.DOCTOR) saves.push(selectedActionTarget);
            if (user.role === Role.SEER) reveals.push(selectedActionTarget);
        } else if (activeActionType === 'RUNE' && selectedRuneId) {
            const rune = user.runes.find(r => r.id === selectedRuneId);
            if (rune) {
                userUsedRuneId = rune.id;
                addLog(`You activated ${rune.name}!`, 'action', 'You');
                
                if (rune.type === RuneType.SHIELD) saves.push(selectedActionTarget);
                if (rune.type === RuneType.SIGHT) reveals.push(selectedActionTarget);
            }
        }
    }

    // D. Process Seer/Rune Knowledge
    let newKnowledge = { ...state.seerKnowledge };
    reveals.forEach(targetId => {
        const target = state.players.find(p => p.id === targetId);
        if (target) {
            addLog(`The mists clear... ${target.name} is a ${target.role}.`, 'system');
            newKnowledge[target.id] = target.role;
        }
    });

    // E. Update Player State (Cooldowns)
    let nextPlayers = state.players.map(p => {
        if (p.id === user.id && userUsedRuneId) {
            return {
                ...p,
                runes: p.runes.map(r => r.id === userUsedRuneId ? { ...r, currentCooldown: r.cooldown + 1 } : r)
            };
        }
        // Bots: assume they used the rune if they said so (simple sync)
        const botAction = botActions.runeActions?.find(ba => ba.playerId === p.id);
        if (botAction) {
             return {
                ...p,
                runes: p.runes.map(r => r.id === botAction.runeId ? { ...r, currentCooldown: r.cooldown + 1 } : r)
            };
        }
        return p;
    });

    // Store pending results for Day Intro processing
    const primaryWWTarget = kills.length > 0 ? kills[0] : null; 
    const primaryDocTarget = saves.includes(primaryWWTarget || '') ? primaryWWTarget : null;

    setState(prev => ({
      ...prev,
      players: nextPlayers,
      targets: { 
          werewolf: primaryWWTarget, 
          doctor: primaryDocTarget, 
          seer: null 
      },
      seerKnowledge: newKnowledge,
      phase: Phase.DAY_INTRO
    }));
    
    setSelectedActionTarget(null);
    setSelectedRuneId(null);
    setIsLoading(false);
  };

  const processNightResults = async () => {
    setIsLoading(true);
    const { werewolf: killedId, doctor: savedId } = state.targets;
    
    let victimName = null;
    let narrative = `The sun rises on a ${state.moonPhase}. The village is peaceful.`;

    let nextPlayers = state.players.map(p => ({ ...p }));

    if (killedId) {
      if (killedId === savedId) {
        narrative = "The sun rises. A rune flashed in the night, protecting the innocent from the beast's claws!";
      } else {
        const victim = nextPlayers.find(p => p.id === killedId);
        if (victim) {
          victim.isAlive = false;
          victimName = victim.name;
          narrative = `The sun rises. Tragedy strikes! ${victimName} was found dead, torn apart by a beast.`;
        }
      }
    }

    const flavor = await generateNarratorText(Phase.DAY_INTRO, state.dayCount, narrative, state.moonPhase);
    addLog(flavor, 'narrative');
    if (victimName) addLog(`${victimName} has died.`, 'system');

    setState(prev => ({
      ...prev,
      players: nextPlayers,
      phase: Phase.DAY_DISCUSSION
    }));
    
    checkWinCondition(nextPlayers);
    setIsLoading(false);
  };

  // --- Day Logic ---

  const runDayDiscussion = async () => {
    setIsLoading(true);
    // Generate Bot Chats
    const logsText = state.logs.map(l => `${l.source || 'System'}: ${l.text}`);
    const botMoves = await generateBotDayActions(state.players, state.dayCount, logsText);

    // Apply chats progressively
    for (const move of botMoves) {
      const player = state.players.find(p => p.id === move.playerId);
      if (player && player.isAlive) {
        addLog(move.chatMessage, 'chat', player.name);
        await new Promise(r => setTimeout(r, 800)); // Delay for readability
      }
    }

    // Auto-transition to voting after chat
    setIsLoading(false);
    setState(prev => ({ ...prev, phase: Phase.DAY_VOTING }));
  };

  const handleVote = (targetId: string) => {
    setSelectedActionTarget(targetId);
  };

  const confirmVote = async () => {
    if (!selectedActionTarget && userPlayer?.isAlive) return;
    setIsLoading(true);

    const botActions = await generateBotDayActions(state.players, state.dayCount, state.logs.slice(-5).map(l => l.text));
    
    const voteCounts: Record<string, number> = {};
    
    botActions.forEach(action => {
      if (action.voteTargetId) {
        voteCounts[action.voteTargetId] = (voteCounts[action.voteTargetId] || 0) + 1;
      }
    });

    if (userPlayer?.isAlive && selectedActionTarget) {
      voteCounts[selectedActionTarget] = (voteCounts[selectedActionTarget] || 0) + 1;
      addLog(`You voted for ${state.players.find(p => p.id === selectedActionTarget)?.name}`, 'action', 'You');
    }

    let eliminatedId: string | null = null;
    let maxVotes = 0;
    Object.entries(voteCounts).forEach(([id, count]) => {
      if (count > maxVotes) {
        maxVotes = count;
        eliminatedId = id;
      } else if (count === maxVotes) {
        eliminatedId = null; // Tie
      }
    });

    let nextPlayers = state.players.map(p => ({ 
      ...p, 
      votesAgainst: voteCounts[p.id] || 0 
    }));

    setState(prev => ({ ...prev, players: nextPlayers }));
    await new Promise(r => setTimeout(r, 2000));

    if (eliminatedId) {
      const eliminated = nextPlayers.find(p => p.id === eliminatedId);
      if (eliminated) {
        eliminated.isAlive = false;
        // Combined Narrative log for better Auto-Narrate flow
        addLog(`${eliminated.name} was voted out by the village.`, 'system');
        addLog(`The village has spoken. ${eliminated.name} is executed. They were a ${eliminated.role}.`, 'narrative');
      }
    } else {
      addLog("The village could not agree on who to execute.", 'system');
      addLog("The sun sets without an execution. The village trembles.", 'narrative');
    }

    nextPlayers = nextPlayers.map(p => ({ ...p, votesAgainst: 0 }));

    const win = checkWinCondition(nextPlayers);
    if (!win) {
       setState(prev => ({
        ...prev,
        players: nextPlayers,
        phase: Phase.NIGHT_INTRO,
        dayCount: prev.dayCount + 1,
        targets: { werewolf: null, doctor: null, seer: null }
      }));
      setSelectedActionTarget(null);
    }
    setIsLoading(false);
  };

  // --- Utilities ---

  const checkWinCondition = (currentPlayers: Player[]) => {
    const aliveWerewolves = currentPlayers.filter(p => p.isAlive && p.role === Role.WEREWOLF).length;
    const aliveVillagers = currentPlayers.filter(p => p.isAlive && p.role !== Role.WEREWOLF).length;

    if (aliveWerewolves === 0) {
      setWinner('Villagers');
      return true;
    }
    if (aliveWerewolves >= aliveVillagers) {
      setWinner('Werewolves');
      return true;
    }
    return false;
  };

  const setWinner = (team: 'Villagers' | 'Werewolves') => {
    setState(prev => ({ ...prev, winner: team, phase: Phase.GAME_OVER }));
    addLog(`Game Over! The ${team} have won!`, 'narrative');
    confetti({
      particleCount: 200,
      spread: 90,
      origin: { y: 0.6 },
      colors: team === 'Villagers' ? ['#60a5fa', '#3b82f6', '#ffffff'] : ['#ef4444', '#b91c1c', '#000000']
    });
  };

  const userPlayer = state.players.find(p => p.id === state.userPlayerId);
  
  // --- Rendering Helpers ---

  const getActionPrompt = () => {
    if (state.phase === Phase.NIGHT_ACTION && userPlayer?.isAlive) {
      if (activeActionType === 'RUNE' && selectedRuneId) {
          const r = userPlayer.runes.find(r => r.id === selectedRuneId);
          return `Select a target for ${r?.name}`;
      }
      return "Choose your action.";
    }
    if (state.phase === Phase.DAY_VOTING && userPlayer?.isAlive) {
      return "Vote for a suspect to eliminate.";
    }
    if (!userPlayer?.isAlive && state.phase !== Phase.GAME_OVER && state.phase !== Phase.SETUP) {
      return "You are dead. You can only watch.";
    }
    return "";
  };

  const getRuneIcon = (type: RuneType, size = 16) => {
    switch (type) {
      case RuneType.SIGHT: return <Eye size={size} />;
      case RuneType.SHIELD: return <Shield size={size} />;
      default: return <Hexagon size={size} />;
    }
  };

  // Dynamic Atmospheric Backgrounds using Radial Gradients
  const getBackgroundClass = () => {
    if (state.phase === Phase.SETUP) return 'bg-slate-950';
    if (state.phase.includes('NIGHT')) {
       // Deep, cold night
       return 'bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-950 via-slate-950 to-black';
    }
    // Warm, hazy day
    return 'bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-amber-900/40 via-slate-900 to-slate-950';
  };

  // --- Main Render ---
  return (
    <div className={`min-h-screen text-slate-200 font-sans selection:bg-purple-500/30 transition-all duration-[2000ms] ${getBackgroundClass()}`}>
      
      {/* Header */}
      <header className="p-4 border-b border-slate-800 bg-slate-900/50 backdrop-blur flex justify-between items-center sticky top-0 z-20 transition-all duration-1000">
        <div className="flex items-center gap-2">
           <div className={`p-2 rounded-full transition-colors duration-1000 ${state.phase.includes('NIGHT') ? 'bg-indigo-900 text-indigo-200 shadow-[0_0_15px_rgba(99,102,241,0.5)]' : 'bg-orange-500 text-yellow-900 shadow-[0_0_15px_rgba(249,115,22,0.5)]'}`}>
             {state.phase.includes('NIGHT') ? <Moon size={20} /> : <Sun size={20} />}
           </div>
           <div>
             <h1 className="font-cinzel font-bold text-xl tracking-wide">Darkwood</h1>
             <p className="text-xs text-slate-500">Day {state.dayCount} • {state.moonPhase}</p>
           </div>
        </div>
        
        {state.phase !== Phase.SETUP && (
             <div className="flex items-center gap-4">
               {/* Mobile/Compact Role View */}
               <div className="text-right hidden sm:block">
                 <div className="text-xs text-slate-400">Your Role</div>
                 <div className="font-bold text-emerald-400 font-cinzel">{userPlayer?.role}</div>
               </div>
             </div>
        )}
      </header>

      <main className="container mx-auto p-4 md:p-6 lg:max-w-6xl">
        
        {/* SETUP SCREEN */}
        {state.phase === Phase.SETUP && (
          <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-8 animate-fadeIn relative">
             <div className="text-center space-y-4 max-w-lg">
               <h2 className="text-4xl font-cinzel text-slate-100">Welcome to Darkwood</h2>
               <p className="text-slate-400">A village shrouded in mystery. Equip your runes. Trust no one.</p>
             </div>
             
             <div className="grid grid-cols-2 gap-4 w-full max-w-md">
               {[Role.VILLAGER, Role.WEREWOLF, Role.SEER, Role.DOCTOR].map(role => (
                 <button 
                  key={role}
                  onClick={() => startGame(role)}
                  className="group relative p-6 bg-slate-800 border border-slate-700 rounded-xl hover:border-purple-500 hover:bg-slate-750 transition-all flex flex-col items-center gap-2"
                 >
                   <span className="font-cinzel font-bold text-lg group-hover:text-purple-400">{role}</span>
                   <span className="text-xs text-slate-500 text-center">{ROLE_DESCRIPTIONS[role]}</span>
                 </button>
               ))}
             </div>

             <button 
                onClick={() => setShowHelp(true)}
                className="flex items-center gap-2 text-slate-400 hover:text-purple-400 transition-colors text-sm mt-8"
             >
                <BookOpen size={16} />
                <span>How to Play & Rules</span>
             </button>

             {/* Help Modal */}
             {showHelp && (
                 <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fadeIn">
                     <div className="bg-slate-900 border border-slate-700 p-6 md:p-8 rounded-2xl max-w-2xl w-full max-h-[85vh] overflow-y-auto relative shadow-2xl scrollbar-hide">
                        <button 
                          onClick={() => setShowHelp(false)}
                          className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors"
                        >
                          <X size={24} />
                        </button>
                        
                        <div className="flex justify-between items-end mb-6 border-b border-purple-500/30 pb-2">
                           <h2 className="text-3xl font-cinzel text-purple-400">Game Rules</h2>
                           <button 
                              onClick={handleReadRules}
                              disabled={isReadingRules}
                              className="flex items-center gap-2 text-xs font-bold text-slate-400 hover:text-white bg-slate-800 px-3 py-1.5 rounded-full transition-all disabled:opacity-50"
                           >
                              {isReadingRules ? <Loader2 size={14} className="animate-spin"/> : <Volume2 size={14} />}
                              {isReadingRules ? 'Reading...' : 'Read Aloud'}
                           </button>
                        </div>
                        
                        <div className="space-y-6 text-slate-300">
                          <section>
                            <h3 className="text-lg font-bold text-white mb-2 flex items-center gap-2"><Users size={18}/> Objective</h3>
                            <p className="text-sm leading-relaxed">
                              Darkwood is a social deduction game. 
                              <span className="text-blue-400 font-bold"> Villagers</span> must find and vote out all Werewolves. 
                              <span className="text-red-400 font-bold"> Werewolves</span> must eliminate Villagers until they equal or outnumber them.
                            </p>
                          </section>

                          <section>
                            <h3 className="text-lg font-bold text-white mb-2 flex items-center gap-2"><Moon size={18}/> Phases</h3>
                            <ul className="list-disc pl-5 space-y-2 text-sm">
                              <li><strong className="text-indigo-400">Night:</strong> Special roles (Werewolf, Seer, Doctor) wake up to perform actions. Runes become active.</li>
                              <li><strong className="text-orange-400">Day:</strong> All survivors discuss events, read logs, and vote to eliminate a suspect.</li>
                            </ul>
                          </section>

                          <section>
                            <h3 className="text-lg font-bold text-white mb-2 flex items-center gap-2"><Hexagon size={18}/> Runes System</h3>
                            <p className="text-sm leading-relaxed mb-2">
                              Every player starts with one random <strong className="text-purple-400">Rune</strong>. 
                              Runes are powerful artifacts that can turn the tide of the game.
                            </p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              <div className="bg-slate-800 p-3 rounded border border-slate-700">
                                <div className="font-bold text-purple-300 text-xs mb-1">COOLDOWNS</div>
                                <p className="text-xs">Runes have cooldowns. Use them wisely, as they may not be available when you need them most.</p>
                              </div>
                              <div className="bg-slate-800 p-3 rounded border border-slate-700">
                                <div className="font-bold text-purple-300 text-xs mb-1">TYPES</div>
                                <p className="text-xs">
                                  <span className="text-emerald-400">Sight</span> reveals roles. 
                                  <span className="text-blue-400"> Shield</span> protects from death.
                                </p>
                              </div>
                            </div>
                          </section>

                          <section>
                            <h3 className="text-lg font-bold text-white mb-2 flex items-center gap-2"><Shield size={18}/> Roles</h3>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 text-sm">
                                <div><span className="text-red-500 font-bold">Werewolf:</span> Kills one player each night.</div>
                                <div><span className="text-blue-500 font-bold">Doctor:</span> Saves one player from death.</div>
                                <div><span className="text-purple-500 font-bold">Seer:</span> Reveals the true role of a player.</div>
                                <div><span className="text-slate-400 font-bold">Villager:</span> No night ability, but wields the vote.</div>
                            </div>
                          </section>
                        </div>
                     </div>
                 </div>
             )}
          </div>
        )}

        {/* MAIN GAME GRID */}
        {state.phase !== Phase.SETUP && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[calc(100vh-140px)]">
            
            {/* Left: Player Grid */}
            <div className="lg:col-span-2 flex flex-col gap-4">
               {/* Prompt Bar */}
               <div className="bg-slate-900/80 p-4 rounded-xl border border-slate-700/50 flex flex-col sm:flex-row justify-between items-center shadow-2xl gap-4 backdrop-blur-md">
                  <div className="flex-1 w-full sm:w-auto">
                    <h3 className="font-bold text-slate-200 text-lg font-cinzel mb-1 flex items-center gap-2">
                      {state.phase.includes('NIGHT') ? <Moon size={18} className="text-indigo-400"/> : <Sun size={18} className="text-orange-400"/>}
                      {state.winner ? `Winner: ${state.winner}` : getActionPrompt()}
                    </h3>
                    {!state.winner && (
                      <p className="text-xs text-slate-500">{state.phase.replace('_', ' ')}</p>
                    )}
                  </div>

                  {/* RUNE SELECTION UI */}
                  {state.phase === Phase.NIGHT_ACTION && userPlayer?.isAlive && (
                      <div className="flex gap-3 overflow-x-auto pb-1 max-w-full">
                          <button 
                              onClick={() => { setActiveActionType('ROLE'); setSelectedRuneId(null); setSelectedActionTarget(null); }}
                              className={`
                                relative p-2 rounded-xl border transition-all duration-300 flex flex-col items-center justify-center min-w-[70px] h-[70px]
                                ${activeActionType === 'ROLE' 
                                  ? 'bg-emerald-950/50 border-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.3)] text-white' 
                                  : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-emerald-500/50'}
                              `}
                          >
                              <div className={`mb-1 ${activeActionType === 'ROLE' ? 'text-emerald-400' : ''}`}>
                                 <MousePointer2 size={18} />
                              </div>
                              <span className="text-[10px] font-bold uppercase tracking-wider">Role</span>
                          </button>
                          
                          {userPlayer.runes.map(rune => {
                              const isReady = rune.currentCooldown === 0;
                              const isSelected = selectedRuneId === rune.id;
                              
                              let activeColor = 'border-purple-500 shadow-[0_0_15px_rgba(168,85,247,0.3)] bg-purple-900/20';
                              if (rune.type === RuneType.SIGHT) activeColor = 'border-cyan-400 shadow-[0_0_15px_rgba(34,211,238,0.3)] bg-cyan-900/20';
                              if (rune.type === RuneType.SHIELD) activeColor = 'border-amber-400 shadow-[0_0_15px_rgba(251,191,36,0.3)] bg-amber-900/20';

                              return (
                                <button
                                    key={rune.id}
                                    onClick={() => toggleRuneMode(rune)}
                                    disabled={!isReady}
                                    className={`
                                      relative p-2 rounded-xl border transition-all duration-300 flex flex-col items-center justify-center min-w-[70px] h-[70px] group overflow-hidden
                                      ${isSelected ? activeColor : 'bg-slate-800 border-slate-700 text-slate-400'}
                                      ${!isReady ? 'opacity-60 grayscale cursor-not-allowed border-slate-800 bg-slate-900' : 'hover:-translate-y-1 hover:border-slate-500'}
                                    `}
                                    title={rune.description}
                                >
                                    {isReady && <div className="absolute inset-0 bg-gradient-to-t from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />}
                                    
                                    <div className={`mb-1 ${isSelected || isReady ? (rune.type === RuneType.SIGHT ? 'text-cyan-400' : rune.type === RuneType.SHIELD ? 'text-amber-400' : 'text-purple-400') : 'text-slate-500'}`}>
                                      {getRuneIcon(rune.type, 18)}
                                    </div>
                                    <span className="text-[9px] font-bold uppercase tracking-wider max-w-[64px] truncate">{rune.name.split(' ')[0]}</span>
                                    
                                    {!isReady && (
                                        <div className="absolute inset-0 flex items-center justify-center bg-black/70 backdrop-blur-[1px] z-10">
                                            <span className="text-xs font-bold text-red-400 font-mono">{rune.currentCooldown}T</span>
                                        </div>
                                    )}
                                </button>
                              );
                          })}
                      </div>
                  )}
                  
                  {/* Action Confirmation Buttons */}
                  {state.phase === Phase.NIGHT_ACTION && userPlayer?.isAlive && (
                    <button 
                      onClick={confirmNightAction}
                      disabled={!selectedActionTarget || isLoading}
                      className={`
                        px-6 py-3 rounded-lg font-bold transition-all flex items-center gap-2 text-sm shadow-lg
                        ${activeActionType === 'RUNE' ? 'bg-purple-600 hover:bg-purple-500 shadow-purple-500/20' : 'bg-indigo-600 hover:bg-indigo-500 shadow-indigo-500/20'}
                        disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none text-white
                      `}
                    >
                      {isLoading && <Loader2 className="animate-spin" size={16} />}
                      {activeActionType === 'RUNE' ? 'CAST RUNE' : 'CONFIRM'}
                    </button>
                  )}
                   {state.phase === Phase.DAY_VOTING && userPlayer?.isAlive && (
                    <button 
                      onClick={confirmVote}
                      disabled={!selectedActionTarget || isLoading}
                      className="bg-red-600 hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-6 py-3 rounded-lg font-bold transition-all flex items-center gap-2 shadow-lg shadow-red-500/20"
                    >
                      {isLoading && <Loader2 className="animate-spin" size={16} />}
                      ELIMINATE
                    </button>
                  )}
               </div>

               {/* Players */}
               <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 overflow-y-auto pr-2 pb-20">
                 {state.players.map(player => {
                   let canAct = false;
                   let actionLabel = "";
                   
                   if (state.phase === Phase.NIGHT_ACTION && userPlayer?.isAlive) {
                      if (activeActionType === 'ROLE') {
                          // Standard Role Logic
                          if (userPlayer.role === Role.WEREWOLF && player.role !== Role.WEREWOLF && player.isAlive) {
                            canAct = true; actionLabel = "Kill";
                          }
                          if (userPlayer.role === Role.DOCTOR && player.isAlive) {
                            canAct = true; actionLabel = "Save";
                          }
                          if (userPlayer.role === Role.SEER && player.isAlive && player.id !== userPlayer.id) {
                            canAct = true; actionLabel = "Check";
                          }
                      } else if (activeActionType === 'RUNE' && selectedRuneId) {
                          // Rune Targeting Logic
                          const rune = userPlayer.runes.find(r => r.id === selectedRuneId);
                          if (rune && player.isAlive) {
                              if (rune.type === RuneType.SHIELD) {
                                  canAct = true; actionLabel = "Ward";
                              } else if (rune.type === RuneType.SIGHT && player.id !== userPlayer.id) {
                                  canAct = true; actionLabel = "Scry";
                              }
                          }
                      }
                   }

                   if (state.phase === Phase.DAY_VOTING && userPlayer?.isAlive && player.isAlive && player.id !== userPlayer.id) {
                      canAct = true; actionLabel = "Vote";
                   }

                   const isRevealed = state.winner !== null || (userPlayer?.role === Role.SEER && state.seerKnowledge[player.id] !== undefined);

                   return (
                     <PlayerCard 
                        key={player.id}
                        player={player}
                        userRole={userPlayer?.role || Role.VILLAGER}
                        onAction={state.phase === Phase.NIGHT_ACTION ? handleNightAction : handleVote}
                        actionLabel={actionLabel}
                        isActionDisabled={!canAct}
                        isSelected={selectedActionTarget === player.id}
                        isRevealed={isRevealed}
                     />
                   )
                 })}
               </div>
            </div>

            {/* Right: Game Log */}
            <div className="lg:col-span-1 h-[300px] lg:h-auto">
              <GameLog 
                logs={state.logs} 
                autoNarrate={autoNarrate} 
                onToggleAutoNarrate={() => setAutoNarrate(!autoNarrate)} 
              />
            </div>

          </div>
        )}
      </main>

      {/* GAME OVER MODAL */}
      {state.winner && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md animate-fadeIn">
              <div className="flex flex-col items-center justify-center p-8 max-w-lg w-full text-center space-y-6">
                  {state.winner === 'Villagers' ? <Trophy size={64} className="text-yellow-400 mb-4 animate-bounce" /> : <Skull size={64} className="text-red-500 mb-4 animate-pulse" />}
                  
                  <h2 className="text-5xl font-cinzel font-bold text-white tracking-widest uppercase drop-shadow-[0_0_15px_rgba(255,255,255,0.3)]">
                    {state.winner === 'Villagers' ? 'Victory' : 'Defeat'}
                  </h2>
                  <p className="text-xl text-slate-300">
                    The <span className={state.winner === 'Villagers' ? 'text-blue-400 font-bold' : 'text-red-500 font-bold'}>{state.winner}</span> have prevailed.
                  </p>
                  
                  <button 
                    onClick={resetGame}
                    className="group relative inline-flex items-center justify-center px-8 py-3 text-lg font-bold text-white transition-all duration-200 bg-emerald-600 font-cinzel rounded-full hover:bg-emerald-500 hover:shadow-[0_0_20px_rgba(16,185,129,0.5)] focus:outline-none ring-offset-2 focus:ring-2 ring-emerald-400"
                  >
                     <RefreshCw className="mr-2 group-hover:rotate-180 transition-transform duration-500" />
                     Play Again
                  </button>
              </div>
          </div>
      )}

      {/* Loading Overlay */}
      {isLoading && state.phase !== Phase.NIGHT_INTRO && (
        <div className="fixed bottom-4 right-4 bg-slate-800 text-white px-4 py-2 rounded-full shadow-lg flex items-center gap-2 text-sm z-50 border border-slate-700">
          <Loader2 className="animate-spin" size={16} />
          Thinking...
        </div>
      )}
    </div>
  );
}

export default App;