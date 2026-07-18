import React from 'react';
import { AgentState, STATE_METADATA } from './types';

interface StateIndicatorProps {
  state: AgentState;
  size?: 'sm' | 'md' | 'lg';
  showDescription?: boolean;
}

export const StateIndicator: React.FC<StateIndicatorProps> = ({ 
  state, 
  size = 'md',
  showDescription = false 
}) => {
  const metadata = STATE_METADATA[state];
  
  const sizeClasses = {
    sm: 'w-8 h-8 text-xs',
    md: 'w-12 h-12 text-sm',
    lg: 'w-16 h-16 text-base'
  };

  return (
    <div className="flex items-center gap-3">
      <div 
        className={`${sizeClasses[size]} rounded-full flex items-center justify-center font-bold text-white`}
        style={{ backgroundColor: metadata.color }}
        title={metadata.description}
      >
        {metadata.icon}
      </div>
      <div className="flex flex-col">
        <span className="font-semibold text-white">{metadata.label}</span>
        {showDescription && (
          <span className="text-xs text-gray-400">{metadata.description}</span>
        )}
      </div>
    </div>
  );
};
