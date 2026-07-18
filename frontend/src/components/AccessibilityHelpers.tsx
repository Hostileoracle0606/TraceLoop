import { useEffect, useRef, useState, useCallback, type ReactNode } from 'react';

/**
 * Generate an aria-label for a code editor panel.
 */
export function editorAriaLabel(filename: string, language: string, readOnly: boolean): string {
  return `${readOnly ? 'Read-only' : 'Editable'} ${language} code editor for ${filename}`;
}

/**
 * Generate an aria-label for a diff viewer panel.
 */
export function diffAriaLabel(filename: string, additions: number, deletions: number): string {
  return `Diff view for ${filename}: ${additions} addition${additions !== 1 ? 's' : ''}, ${deletions} deletion${deletions !== 1 ? 's' : ''}`;
}

/**
 * Generate an aria-label for a console terminal tab.
 */
export function consoleTabAriaLabel(tabName: string, isActive: boolean): string {
  return `${tabName} console tab${isActive ? ' (active)' : ''}`;
}

/**
 * Generate an aria-label for a command palette item.
 */
export function commandItemAriaLabel(label: string, shortcut?: string): string {
  return shortcut ? `${label}, shortcut ${shortcut}` : label;
}

/**
 * Focus trap hook for modals and overlays.
 * Traps Tab/Shift+Tab focus within the referenced container.
 */
export function useFocusTrap<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const previousFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    previousFocus.current = document.activeElement as HTMLElement | null;
    const el = ref.current;
    if (!el) return;

    const focusable = el.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (first) first.focus();

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Tab') return;
      const focusableEls = el!.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      const firstEl = focusableEls[0];
      const lastEl = focusableEls[focusableEls.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === firstEl) {
          e.preventDefault();
          lastEl?.focus();
        }
      } else {
        if (document.activeElement === lastEl) {
          e.preventDefault();
          firstEl?.focus();
        }
      }
    }

    el.addEventListener('keydown', handleKeyDown);
    return () => {
      el.removeEventListener('keydown', handleKeyDown);
      previousFocus.current?.focus();
    };
  }, []);

  return ref;
}

/**
 * Live region announcer component for screen readers.
 * Renders an aria-live region that announces messages.
 */
export function LiveRegion({ message }: { message: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      style={{
        position: 'absolute',
        width: '1px',
        height: '1px',
        padding: 0,
        margin: '-1px',
        overflow: 'hidden',
        clip: 'rect(0, 0, 0, 0)',
        whiteSpace: 'nowrap',
        border: 0,
      }}
    >
      {message}
    </div>
  );
}

/**
 * Hook that provides a live region announcement function.
 */
export function useAnnouncer() {
  const [message, setMessage] = useState('');

  const announce = useCallback((text: string) => {
    setMessage('');
    // Reset then set to ensure screen readers pick up repeated messages
    requestAnimationFrame(() => setMessage(text));
  }, []);

  const LiveRegionElement = useCallback(() => <LiveRegion message={message} />, [message]);

  return { announce, LiveRegion: LiveRegionElement };
}

/**
 * Skip navigation link component.
 * Renders a visually hidden link that becomes visible on focus,
 * allowing keyboard users to skip to main content.
 */
export function SkipNavLink({ targetId = 'main-content' }: { targetId?: string } = {}) {
  return (
    <a
      href={`#${targetId}`}
      className="skip-nav-link"
      style={{
        position: 'absolute',
        width: '1px',
        height: '1px',
        padding: 0,
        margin: '-1px',
        overflow: 'hidden',
        clip: 'rect(0, 0, 0, 0)',
        whiteSpace: 'nowrap',
        border: 0,
      }}
      onFocus={(e) => {
        Object.assign(e.currentTarget.style, {
          position: 'fixed',
          top: '8px',
          left: '8px',
          width: 'auto',
          height: 'auto',
          padding: '8px 16px',
          margin: 0,
          overflow: 'visible',
          clip: 'auto',
          whiteSpace: 'normal',
          zIndex: 9999,
          background: '#1e293b',
          color: '#e2e8f0',
          borderRadius: '4px',
          textDecoration: 'none',
          fontSize: '14px',
          fontWeight: 600,
        });
      }}
      onBlur={(e) => {
        Object.assign(e.currentTarget.style, {
          position: 'absolute',
          width: '1px',
          height: '1px',
          padding: 0,
          margin: '-1px',
          overflow: 'hidden',
          clip: 'rect(0, 0, 0, 0)',
          whiteSpace: 'nowrap',
          border: 0,
        });
      }}
    >
      Skip to main content
    </a>
  );
}

/**
 * Utility to build a descriptive aria-label for a trace event dot.
 */
export function traceEventAriaLabel(eventId: string, label: string, time: number): string {
  return `${label} at ${time} microseconds, event ${eventId}`;
}

/**
 * Utility to build a descriptive aria-label for a pipeline step.
 */
export function pipelineStepAriaLabel(stepName: string, status: 'done' | 'failed' | 'pending'): string {
  const statusText = status === 'done' ? 'completed' : status === 'failed' ? 'failed' : 'pending';
  return `Pipeline step: ${stepName}, ${statusText}`;
}

/**
 * Wraps children in a region with the given role and label.
 */
export function Region({ role, label, children }: { role: string; label: string; children: ReactNode }) {
  return (
    <div role={role} aria-label={label}>
      {children}
    </div>
  );
}
