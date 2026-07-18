import React from 'react';
import { AgentState, STATE_METADATA, VALID_TRANSITIONS } from './types';

interface StateProgressBarProps {
  currentState: AgentState;
  onStateClick?: (state: AgentState) => void;
}

// Define the main pipeline flow for visualization
const PIPELINE_STATES: AgentState[] = [
  'planning',
  'editing',
  'building',
  'simulating',
  'analyzing',
  'patching',
  'rerunning',
  'completed',
];

export const StateProgressBar: React.FC<StateProgressBarProps> = ({ 
  currentState,
  onStateClick 
}) => {
  const currentIndex = PIPELINE_STATES.indexOf(currentState);
  const isTerminal = currentState === 'completed' || currentState === 'blocked' || currentState === 'stopped';
  
  return (
    <div className="flex items-center gap-1 p-4 bg-gray-900 rounded-lg">
      {PIPELINE_STATES.map((state, index) => {
        const metadata = STATE_METADATA[state];
        const isPast = index < currentIndex;
        const isCurrent = state === currentState;
        const isFuture = index > currentIndex;
        
        return (
          <React.Fragment key={state}>
            <button
              onClick={() => onStateClick?.(state)}
              className={`
                flex flex-col items-center gap-1 px-3 py-2 rounded transition-all
                ${isCurrent ? 'bg-opacity-20 scale-110' : ''}
                ${isPast ? 'opacity-60' : ''}
                ${isFuture ? 'opacity-30' : ''}
                hover:opacity-100 cursor-pointer
              `}
              style={{ 
                backgroundColor: isCurrent ? metadata.color : 'transparent',
                borderColor: metadata.color,
                borderWidth: isCurrent ? '2px' : '0'
              }}
              title={metadata.description}
            >
              <div 
                className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold text-white"
                style={{ backgroundColor: metadata.color }}
              >
                {isPast ? '✓' : metadata.icon}
              </div>
              <span className="text-xs text-white font-medium whitespace-nowrap">
                {metadata.label}
              </span>
            </button>
            {index < PIPELINE_STATES.length - 1 && (
              <div 
                className="flex-1 h-0.5 min-w-[20px]"
                style={{ 
                  backgroundColor: isPast ? metadata.color : '#374151'
                }}
              />
            )}
          </React.Fragment>
        );
      })}
      
      {(currentState === 'blocked' || currentState === 'stopped') && (
        <div className="ml-4 px-3 py-2 bg-red-900 bg-opacity-20 border-2 border-red-500 rounded">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold text-white bg-red-500">
              {STATE_METADATA[currentState].icon}
            </div>
            <span className="text-sm text-red-400 font-medium">
              {STATE_METADATA[currentState].label}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
