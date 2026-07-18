import { useState, useCallback, useEffect } from 'react';
import { useHotkeys } from 'react-hotkeys-hook';

export interface KeyboardShortcutState {
  isCommandPaletteOpen: boolean;
  setIsCommandPaletteOpen: (open: boolean) => void;
  submitTrigger: number;
  cancelTrigger: number;
}

/**
 * Global keyboard shortcut hook.
 *
 * - Cmd/Ctrl+K → toggle command palette
 * - Cmd/Ctrl+Enter → submit (increments submitTrigger counter)
 * - Escape → cancel/close (increments cancelTrigger counter)
 */
export function useKeyboardShortcuts(): KeyboardShortcutState {
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [submitTrigger, setSubmitTrigger] = useState(0);
  const [cancelTrigger, setCancelTrigger] = useState(0);

  // Cmd/Ctrl+K — toggle command palette
  useHotkeys(
    'mod+k',
    (e) => {
      e.preventDefault();
      setIsCommandPaletteOpen((prev) => !prev);
    },
    { enableOnFormTags: false, enableOnContentEditable: false }
  );

  // Cmd/Ctrl+Enter — submit
  useHotkeys(
    'mod+enter',
    (e) => {
      e.preventDefault();
      setSubmitTrigger((prev) => prev + 1);
    },
    { enableOnFormTags: true, enableOnContentEditable: true }
  );

  // Escape — cancel/close
  useHotkeys(
    'escape',
    (e) => {
      // Only increment if command palette is open (to close it)
      // or if no other handler has consumed the event
      if (isCommandPaletteOpen) {
        e.preventDefault();
        setIsCommandPaletteOpen(false);
      }
      setCancelTrigger((prev) => prev + 1);
    },
    { enableOnFormTags: false, enableOnContentEditable: false }
  );

  return {
    isCommandPaletteOpen,
    setIsCommandPaletteOpen,
    submitTrigger,
    cancelTrigger,
  };
}

/**
 * Hook to subscribe to submit triggers.
 * Calls the provided callback each time submitTrigger increments.
 */
export function useSubmitEffect(callback: () => void, submitTrigger: number) {
  useEffect(() => {
    if (submitTrigger > 0) {
      callback();
    }
  }, [submitTrigger, callback]);
}

/**
 * Hook to subscribe to cancel triggers.
 * Calls the provided callback each time cancelTrigger increments.
 */
export function useCancelEffect(callback: () => void, cancelTrigger: number) {
  useEffect(() => {
    if (cancelTrigger > 0) {
      callback();
    }
  }, [cancelTrigger, callback]);
}
