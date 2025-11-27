import React from 'react';
import { Player, Role, Rune, RuneType } from '../types';
import { Shield, Eye, Skull, User, Hexagon, Lock, Hourglass } from 'lucide-react';

interface PlayerCardProps {
  player: Player;
  userRole: Role;
  /** Callback when the user clicks the action button on this player */
  onAction: (playerId: string) => void;
  /** Text to display on the button (e.g., "Vote", "Kill", "Save") */
  actionLabel?: string;
  /** Whether the action button is currently disabled (e.g., cooldown or invalid target) */
  isActionDisabled?: boolean;
  /** If true, reveals the player's role (e.g., if User is Seer or Game Over) */
  isRevealed?: boolean; 
  /** Highlights the card visually as the currently selected target */
  isSelected?: boolean;
}

/**
 * Renders a single player card.
 * Displays Avatar, Name, Status (Alive/Dead), Role (if revealed), and equipped Runes.
 * Handles visual states for selection and death.
 */
const PlayerCard: React.FC<PlayerCardProps> = ({
  player,
  userRole,
  onAction,
  actionLabel,
  isActionDisabled,
  isRevealed,
  isSelected
}) => {
  const isUser = !player.isBot;
  
  // Determine if we show the role card
  // Show if: It's the user, the player is dead, the player is revealed (Seer), or both are Werewolves
  const showRole = isUser || !player.isAlive || isRevealed || (userRole === Role.WEREWOLF && player.role === Role.WEREWOLF);

  const getRoleIcon = (role: Role) => {
    switch (role) {
      case Role.WEREWOLF: return <Skull className="w-5 h-5 text-red-500" />;
      case Role.DOCTOR: return <Shield className="w-5 h-5 text-blue-500" />;
      case Role.SEER: return <Eye className="w-5 h-5 text-purple-500" />;
      default: return <User className="w-5 h-5 text-gray-500" />;
    }
  };

  /**
   * Generates tailwind classes and icons for Rune indicators.
   * Handles "Ready" vs "Cooldown" states.
   */
  const getRuneVisuals = (rune: Rune) => {
    const isReady = rune.currentCooldown === 0;
    
    let Icon = Hexagon;
    let colorClass = isReady ? 'text-purple-400' : 'text-slate-500';
    let borderClass = isReady ? 'border-purple-500/60 shadow-[0_0_8px_rgba(168,85,247,0.4)]' : 'border-slate-600 bg-slate-800';

    if (rune.type === RuneType.SIGHT) {
      Icon = Eye;
      if (isReady) {
        colorClass = 'text-cyan-400';
        borderClass = 'border-cyan-500/60 shadow-[0_0_8px_rgba(34,211,238,0.4)] bg-cyan-950/30';
      }
    } else if (rune.type === RuneType.SHIELD) {
      Icon = Shield;
      if (isReady) {
        colorClass = 'text-amber-400';
        borderClass = 'border-amber-500/60 shadow-[0_0_8px_rgba(251,191,36,0.4)] bg-amber-950/30';
      }
    }

    return { Icon, colorClass, borderClass };
  };

  const getBorderColor = () => {
    if (!player.isAlive) return 'border-slate-800/50';
    if (isSelected) return 'border-yellow-400 ring-2 ring-yellow-400/50 shadow-lg shadow-yellow-400/20';
    if (isUser) return 'border-emerald-500 shadow-md shadow-emerald-500/10';
    return 'border-slate-600';
  };

  return (
    <div 
      className={`relative flex flex-col items-center p-3 rounded-xl border-2 transition-all duration-500 ${getBorderColor()} ${player.isAlive ? 'bg-slate-800' : 'bg-slate-900/80 opacity-40'}`}
    >
      {/* Avatar */}
      <div className="relative mb-2 group">
        <img 
          src={player.avatar} 
          alt={player.name} 
          className={`w-16 h-16 rounded-full object-cover bg-slate-700 transition-all ${!player.isAlive && 'grayscale contrast-125'}`}
        />
        
        {/* Rune Badges */}
        {player.isAlive && player.runes.length > 0 && (
           <div className="absolute -bottom-2 -right-2 flex gap-1 z-10">
             {player.runes.map(rune => {
               const { Icon, colorClass, borderClass } = getRuneVisuals(rune);
               return (
                 <div 
                    key={rune.id} 
                    className={`relative rounded-full border p-1 ${borderClass} transition-all duration-300`} 
                    title={`${rune.name}: ${rune.description}`}
                  >
                    <Icon className={`w-3 h-3 ${colorClass}`} strokeWidth={2.5} />
                    {rune.currentCooldown > 0 && (
                       <div className="absolute inset-0 flex items-center justify-center bg-black/60 rounded-full backdrop-blur-[1px]">
                         <span className="text-[8px] font-bold text-white font-mono">{rune.currentCooldown}</span>
                       </div>
                    )}
                 </div>
               );
             })}
           </div>
        )}

        {/* Vote Count Badge */}
        {player.votesAgainst > 0 && player.isAlive && (
          <div className="absolute -top-1 -right-1 bg-red-600 text-white text-xs font-bold w-6 h-6 flex items-center justify-center rounded-full animate-bounce shadow-sm z-20">
            {player.votesAgainst}
          </div>
        )}
        {/* Death Indicator */}
        {!player.isAlive && (
          <div className="absolute inset-0 bg-black/60 rounded-full flex items-center justify-center backdrop-blur-[1px]">
            <Skull className="text-gray-400 w-8 h-8 opacity-90" />
          </div>
        )}
      </div>

      {/* Name */}
      <h3 className={`text-sm font-bold mb-1 ${player.isAlive ? 'text-slate-200' : 'text-slate-500 line-through'}`}>{player.name} {isUser && '(You)'}</h3>

      {/* Role Reveal */}
      <div className="h-6 mb-2">
        {showRole ? (
          <div className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border border-slate-700/50 ${player.isAlive ? 'text-slate-400 bg-slate-900/50' : 'text-slate-500 bg-black/20'}`}>
            {getRoleIcon(player.role)}
            <span>{player.role}</span>
          </div>
        ) : (
          <div className="text-xs text-slate-600 font-mono">???</div>
        )}
      </div>

      {/* Action Button */}
      {player.isAlive && actionLabel && (
        <button
          onClick={() => onAction(player.id)}
          disabled={isActionDisabled}
          className={`w-full py-1.5 px-2 text-xs font-bold rounded uppercase tracking-wider transition-all duration-200
            ${isSelected 
              ? 'bg-yellow-500 text-black hover:bg-yellow-400 shadow-[0_0_10px_rgba(234,179,8,0.4)]' 
              : 'bg-slate-700 text-slate-300 hover:bg-slate-600 hover:text-white'}
            ${isActionDisabled ? 'opacity-50 cursor-not-allowed' : 'active:scale-95'}
          `}
        >
          {isSelected ? 'Selected' : actionLabel}
        </button>
      )}
    </div>
  );
};

export default PlayerCard;