import React from 'react';
import { AgentState, STATE_METADATA, VALID_TRANSITIONS, requiresLLM, requiresCompute } from './types';

interface StateActionPanelProps {
  currentState: AgentState;
  onTransition: (toState: AgentState, reason: string) => void;
  onStop: () => void;
  disabled?: boolean;
}

export const StateActionPanel: React.FC<StateActionPanelProps> = ({ 
  currentState,
  onTransition,
  onStop,
  disabled = false
}) => {
  const metadata = STATE_METADATA[currentState];
  const validNextStates = VALID_TRANSITIONS[currentState];
  const isLLMState = requiresLLM(currentState);
  const isComputeState = requiresCompute(currentState);
  const isTerminal = currentState === 'completed' || currentState === 'stopped';

  return (
    <div className="bg-gray-900 rounded-lg p-6 border border-gray-800">
      <div className="mb-4">
        <div className="flex items-center gap-3 mb-2">
          <div 
            className="w-10 h-10 rounded-full flex items-center justify-center text-lg font-bold text-white"
            style={{ backgroundColor: metadata.color }}
          >
            {metadata.icon}
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white">{metadata.label}</h3>
            <p className="text-sm text-gray-400">{metadata.description}</p>
          </div>
        </div>
        
        <div className="flex gap-2 mt-3">
          {isLLMState && (
            <span className="px-2 py-1 bg-blue-900 bg-opacity-30 text-blue-400 text-xs rounded">
              LLM Active
            </span>
          )}
          {isComputeState && (
            <span className="px-2 py-1 bg-cyan-900 bg-opacity-30 text-cyan-400 text-xs rounded">
              Compute Active
            </span>
          )}
          {isTerminal && (
            <span className="px-2 py-1 bg-gray-800 text-gray-400 text-xs rounded">
              Terminal State
            </span>
          )}
        </div>
      </div>

      {!isTerminal && (
        <>
          <div className="border-t border-gray-800 pt-4 mt-4">
            <h4 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">
              Available Transitions
            </h4>
            <div className="space-y-2">
              {validNextStates.map((nextState) => {
                const nextMetadata = STATE_METADATA[nextState];
                return (
                  <button
                    key={nextState}
                    onClick={() => {
                      const reason = nextState === 'stopped' 
                        ? 'user-cancelled' 
                        : `${currentState}-to-${nextState}`;
                      onTransition(nextState, reason);
                    }}
                    disabled={disabled}
                    className="w-full flex items-center gap-3 p-3 bg-gray-800 hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed rounded transition-colors"
                  >
                    <div 
                      className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold text-white"
                      style={{ backgroundColor: nextMetadata.color }}
                    >
                      {nextMetadata.icon}
                    </div>
                    <div className="flex-1 text-left">
                      <div className="text-sm font-medium text-white">
                        {nextMetadata.label}
                      </div>
                      <div className="text-xs text-gray-400">
                        {nextMetadata.description}
                      </div>
                    </div>
                    <div className="text-gray-500">→</div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="border-t border-gray-800 pt-4 mt-4">
            <button
              onClick={onStop}
              disabled={disabled}
              className="w-full flex items-center justify-center gap-2 p-3 bg-red-900 bg-opacity-20 hover:bg-opacity-30 text-red-400 border border-red-900 disabled:opacity-50 disabled:cursor-not-allowed rounded transition-colors"
            >
              <span className="text-lg">⏹</span>
              <span className="text-sm font-medium">Stop Agent</span>
            </button>
          </div>
        </>
      )}

      {isTerminal && (
        <div className="border-t border-gray-800 pt-4 mt-4">
          <div className="text-center text-gray-400 text-sm">
            {currentState === 'completed' 
              ? '✓ Agent completed successfully' 
              : '⏹ Agent stopped by user'}
          </div>
        </div>
      )}
    </div>
  );
};
