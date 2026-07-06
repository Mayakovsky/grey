// Layer 1 — three-mode passphrase-generation UX state machine.

export type DicewareMode = 'auto' | 'dice' | 'interactive';

export interface ModeFlags {
  auto?: boolean;
  dice?: boolean;
  /** Whether stdin is an interactive terminal. */
  isTty: boolean;
}

/**
 * Resolve the effective generation mode from CLI flags + TTY status.
 *
 * - --auto + --dice together  → hard error.
 * - --auto                    → non-interactive CSPRNG.
 * - --dice                    → force interactive manual dice entry.
 * - no flags, non-TTY stdin   → behave as --auto (caller should warn on stderr).
 * - no flags, TTY stdin       → interactive chooser (CSPRNG or manual dice).
 */
export function resolveMode(flags: ModeFlags): DicewareMode {
  if (flags.auto && flags.dice) {
    throw new Error('--auto and --dice are mutually exclusive');
  }
  if (flags.auto) return 'auto';
  if (flags.dice) return 'dice';
  if (!flags.isTty) return 'auto';
  return 'interactive';
}

/** True when a non-TTY default fell through to auto (caller warns on stderr). */
export function isNonTtyAutoFallback(flags: ModeFlags): boolean {
  return !flags.auto && !flags.dice && !flags.isTty;
}
