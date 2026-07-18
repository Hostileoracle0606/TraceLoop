# FSM State Visualization Components

This directory contains React components for visualizing and interacting with the TraceLoop agent's finite state machine (FSM).

## Components

### StateIndicator
A simple visual indicator showing the current FSM state with an icon and label.

**Props:**
- `state: AgentState` - The current agent state
- `size?: 'sm' | 'md' | 'lg'` - Size of the indicator (default: 'md')
- `showDescription?: boolean` - Whether to show the state description (default: false)

**Example:**
```tsx
<StateIndicator state="building" size="lg" showDescription={true} />
```

### StateProgressBar
A horizontal progress bar showing the FSM state progression through the main pipeline.

**Props:**
- `currentState: AgentState` - The current agent state
- `onStateClick?: (state: AgentState) => void` - Callback when a state is clicked

**Example:**
```tsx
<StateProgressBar 
  currentState="analyzing" 
  onStateClick={(state) => console.log('Clicked:', state)} 
/>
```

### StateActionPanel
A panel showing available state transitions and actions for the current state.

**Props:**
- `currentState: AgentState` - The current agent state
- `onTransition: (toState: AgentState, reason: string) => void` - Callback for state transitions
- `onStop: () => void` - Callback to stop the agent
- `disabled?: boolean` - Whether actions are disabled (default: false)

**Example:**
```tsx
<StateActionPanel
  currentState="patching"
  onTransition={(to, reason) => handleTransition(to, reason)}
  onStop={() => handleStop()}
/>
```

### StateTransitionTimeline
A timeline showing the history of state transitions.

**Props:**
- `transitions: StateTransition[]` - Array of state transitions
- `currentState: string` - The current state (for styling)

**Example:**
```tsx
<StateTransitionTimeline
  transitions={task.activityLogs}
  currentState={task.status}
/>
```

### FSMIntegration
The main integration component that connects to the backend tRPC router and displays the full FSM visualization.

**Props:**
- `taskId: string` - The ID of the task to visualize
- `initialStatus?: AgentState` - Initial status (default: 'planning')

**Example:**
```tsx
<FSMIntegration taskId="123e4567-e89b-12d3-a456-426614174000" />
```

## Types

### AgentState
The 11 possible states of the agent FSM:
- `clarification-needed` - Agent needs more information
- `planning` - Generating implementation plan
- `editing` - Modifying source files
- `building` - Compiling firmware
- `simulating` - Running Renode simulation
- `analyzing` - Analyzing trace with causal engine
- `patching` - Proposing fix based on root cause
- `rerunning` - Starting next iteration
- `completed` - All assertions passed (terminal)
- `blocked` - Budget exhausted or no progress (terminal)
- `stopped` - User cancelled (terminal)

### StateTransition
Represents a state transition event:
```typescript
interface StateTransition {
  from: AgentState;
  to: AgentState;
  reason: TransitionReason;
  timestamp: string;
  actor: 'user' | 'agent' | 'system';
  iteration?: number;
}
```

## State Categories

States are categorized into four types:
- **LLM States**: `clarification-needed`, `planning`, `editing`, `patching`
- **Compute States**: `building`, `simulating`, `analyzing`
- **Control States**: `rerunning`
- **Terminal States**: `completed`, `blocked`, `stopped`

## Backend Integration

The FSMIntegration component connects to the backend tRPC router at `http://localhost:3000` and uses the following endpoints:
- `tasks.get` - Fetch task data
- `tasks.transition` - Transition task state
- `tasks.stop` - Stop the agent

## Usage in TraceLoop

The FSM view is accessible from the main navigation menu. Users can:
1. Click "FSM" in the sidebar
2. Enter a task ID
3. View the state machine progression
4. See available transitions
5. Monitor the transition history
6. Stop the agent if needed

## Styling

All components use Tailwind CSS classes and follow the existing TraceLoop design system with:
- Dark theme (gray-900 backgrounds)
- Color-coded states matching the state metadata
- Responsive layouts
- Hover and disabled states
