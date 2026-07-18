import React from 'react';
import { StateTransition, STATE_METADATA } from './types';

interface StateTransitionTimelineProps {
  transitions: StateTransition[];
  currentState: string;
}

export const StateTransitionTimeline: React.FC<StateTransitionTimelineProps> = ({ 
  transitions,
  currentState 
}) => {
  if (transitions.length === 0) {
    return (
      <div className="text-gray-400 text-sm p-4">
        No state transitions recorded yet
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
        State History
      </div>
      {transitions.map((transition, index) => {
        const toMetadata = STATE_METADATA[transition.to as keyof typeof STATE_METADATA];
        const fromMetadata = STATE_METADATA[transition.from as keyof typeof STATE_METADATA];
        
        return (
          <div key={index} className="flex items-start gap-3 pb-3 border-b border-gray-800 last:border-0">
            <div className="flex flex-col items-center">
              <div 
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: toMetadata.color }}
              />
              {index < transitions.length - 1 && (
                <div className="w-0.5 h-8 bg-gray-700 mt-1" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm font-semibold text-white">
                  {toMetadata.label}
                </span>
                <span className="text-xs text-gray-500">
                  from {fromMetadata.label}
                </span>
              </div>
              <div className="text-xs text-gray-400 mb-1">
                {transition.reason.replace(/-/g, ' ')}
              </div>
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <span>{new Date(transition.timestamp).toLocaleTimeString()}</span>
                <span>•</span>
                <span className="capitalize">{transition.actor}</span>
                {transition.iteration && (
                  <>
                    <span>•</span>
                    <span>Iteration {transition.iteration}</span>
                  </>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};
