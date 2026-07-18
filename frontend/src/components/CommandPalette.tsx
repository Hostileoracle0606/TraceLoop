import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useFocusTrap, commandItemAriaLabel } from './AccessibilityHelpers';

export interface Command {
  id: string;
  label: string;
  category: string;
  shortcut?: string;
  icon?: string;
}

export interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onCommand: (commandId: string) => void;
  commands?: Command[];
}

const DEFAULT_COMMANDS: Command[] = [
  // Navigation commands
  { id: 'nav-dashboard', label: 'Go to Projects', category: 'Navigation', shortcut: '', icon: '▤' },
  { id: 'nav-create', label: 'Go to New Project', category: 'Navigation', icon: '＋' },
  { id: 'nav-agent', label: 'Go to Agent Workspace', category: 'Navigation', icon: '⌁' },
  { id: 'nav-run', label: 'Go to Build & Simulation', category: 'Navigation', icon: '▶' },
  { id: 'nav-analysis', label: 'Go to Failure Analysis', category: 'Navigation', icon: '◎' },
  { id: 'nav-patch', label: 'Go to Patch Review', category: 'Navigation', icon: '⇄' },
  { id: 'nav-success', label: 'Go to Success Report', category: 'Navigation', icon: '✓' },
  { id: 'nav-compare', label: 'Go to Run Comparison', category: 'Navigation', icon: '⇄' },
  { id: 'nav-history', label: 'Go to Run History', category: 'Navigation', icon: '⏱' },
  { id: 'nav-platforms', label: 'Go to Platform Library', category: 'Navigation', icon: '▰' },
  { id: 'nav-tests', label: 'Go to Tests', category: 'Navigation', icon: '✓' },
  { id: 'nav-reports', label: 'Go to Reports', category: 'Navigation', icon: '⎙' },

  // Action commands
  { id: 'action-new-project', label: 'New Project', category: 'Actions', icon: '＋' },
  { id: 'action-new-run', label: 'New Run', category: 'Actions', icon: '▶' },
  { id: 'action-submit', label: 'Submit', category: 'Actions', shortcut: '⌘↵', icon: '↑' },
  { id: 'action-cancel', label: 'Cancel', category: 'Actions', shortcut: '⎋', icon: '✕' },
  { id: 'action-approve-patch', label: 'Approve and Rerun', category: 'Actions', icon: '✓' },
  { id: 'action-reject-patch', label: 'Reject Patch', category: 'Actions', icon: '✕' },
  { id: 'action-generate-patch', label: 'Generate Patch', category: 'Actions', icon: '⚡' },
  { id: 'action-save-report', label: 'Save Report', category: 'Actions', icon: '⇩' },
];

/**
 * Simple fuzzy match — checks if all characters of query appear in order in target.
 * Returns a score (lower is better) or -1 if no match.
 */
function fuzzyMatch(query: string, target: string): number {
  const q = query.toLowerCase();
  const t = target.toLowerCase();

  if (q.length === 0) return 0;
  if (q.length > t.length) return -1;

  let qi = 0;
  let score = 0;
  let lastMatchIndex = -1;

  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      // Penalize gaps between matches
      if (lastMatchIndex >= 0) {
        score += ti - lastMatchIndex - 1;
      }
      // Bonus for matching at word boundaries
      if (ti === 0 || t[ti - 1] === ' ' || t[ti - 1] === '/') {
        score -= 2;
      }
      lastMatchIndex = ti;
      qi++;
    }
  }

  return qi === q.length ? score : -1;
}

/**
 * Command palette modal — triggered by Cmd+K.
 * Provides fuzzy-searchable navigation and action commands.
 */
export function CommandPalette({
  isOpen,
  onClose,
  onCommand,
  commands = DEFAULT_COMMANDS,
}: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const focusTrapRef = useFocusTrap<HTMLDivElement>();

  // Filter and sort commands by fuzzy match
  const filteredCommands = useMemo(() => {
    if (!query.trim()) return commands;

    const scored = commands
      .map((cmd) => ({
        cmd,
        score: fuzzyMatch(query, cmd.label),
      }))
      .filter((item) => item.score >= 0);

    scored.sort((a, b) => a.score - b.score);
    return scored.map((item) => item.cmd);
  }, [query, commands]);

  // Reset selection when query changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      // Delay focus to allow modal to render
      requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
    }
  }, [isOpen]);

  // Scroll selected item into view
  useEffect(() => {
    if (!listRef.current) return;
    const items = listRef.current.querySelectorAll('[role="option"]');
    const selected = items[selectedIndex];
    if (selected) {
      selected.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex((prev) => (prev + 1) % filteredCommands.length);
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex((prev) => (prev - 1 + filteredCommands.length) % filteredCommands.length);
          break;
        case 'Enter':
          e.preventDefault();
          if (filteredCommands[selectedIndex]) {
            onCommand(filteredCommands[selectedIndex].id);
            onClose();
          }
          break;
        case 'Escape':
          e.preventDefault();
          onClose();
          break;
      }
    },
    [filteredCommands, selectedIndex, onCommand, onClose]
  );

  const handleItemClick = useCallback(
    (commandId: string) => {
      onCommand(commandId);
      onClose();
    },
    [onCommand, onClose]
  );

  if (!isOpen) return null;

  // Group commands by category
  const groupedCommands = useMemo(() => {
    const groups = new Map<string, Command[]>();
    for (const cmd of filteredCommands) {
      const existing = groups.get(cmd.category) ?? [];
      existing.push(cmd);
      groups.set(cmd.category, existing);
    }
    return groups;
  }, [filteredCommands]);

  return (
    <div
      className="command-palette-backdrop"
      onClick={onClose}
      role="presentation"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10000,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: '15vh',
        background: 'rgba(0, 0, 0, 0.5)',
        backdropFilter: 'blur(4px)',
      }}
    >
      <div
        ref={focusTrapRef}
        className="command-palette-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '560px',
          maxHeight: '420px',
          background: '#1e293b',
          borderRadius: '12px',
          border: '1px solid #334155',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div className="command-palette-input-wrapper" style={{ padding: '12px 16px', borderBottom: '1px solid #334155' }}>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a command…"
            aria-label="Search commands"
            autoComplete="off"
            spellCheck={false}
            style={{
              width: '100%',
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: '#e2e8f0',
              fontSize: '15px',
              fontFamily: 'inherit',
            }}
          />
        </div>
        <div
          ref={listRef}
          className="command-palette-list"
          role="listbox"
          aria-label="Commands"
          style={{
            overflow: 'auto',
            flex: 1,
            padding: '4px 0',
          }}
        >
          {filteredCommands.length === 0 && (
            <div
              style={{
                padding: '16px',
                textAlign: 'center',
                color: '#64748b',
                fontSize: '13px',
              }}
            >
              No commands found
            </div>
          )}
          {Array.from(groupedCommands.entries()).map(([category, cmds]) => (
            <div key={category}>
              <div
                className="command-palette-category"
                style={{
                  padding: '6px 16px 4px',
                  fontSize: '11px',
                  fontWeight: 600,
                  color: '#64748b',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}
              >
                {category}
              </div>
              {cmds.map((cmd) => {
                const globalIndex = filteredCommands.indexOf(cmd);
                const isSelected = globalIndex === selectedIndex;
                return (
                  <button
                    key={cmd.id}
                    role="option"
                    aria-selected={isSelected}
                    aria-label={commandItemAriaLabel(cmd.label, cmd.shortcut)}
                    className={`command-palette-item ${isSelected ? 'selected' : ''}`}
                    onClick={() => handleItemClick(cmd.id)}
                    onMouseEnter={() => setSelectedIndex(globalIndex)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      width: '100%',
                      padding: '8px 16px',
                      border: 'none',
                      background: isSelected ? '#334155' : 'transparent',
                      color: '#e2e8f0',
                      fontSize: '14px',
                      cursor: 'pointer',
                      textAlign: 'left',
                      fontFamily: 'inherit',
                    }}
                  >
                    {cmd.icon && (
                      <span style={{ width: '20px', textAlign: 'center', opacity: 0.7 }}>
                        {cmd.icon}
                      </span>
                    )}
                    <span style={{ flex: 1 }}>{cmd.label}</span>
                    {cmd.shortcut && (
                      <span
                        style={{
                          fontSize: '12px',
                          color: '#64748b',
                          fontFamily: 'monospace',
                        }}
                      >
                        {cmd.shortcut}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
