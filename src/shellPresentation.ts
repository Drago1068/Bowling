/** Presentation-only shell state. Not persisted. */

export type ShellDisclosures = {
  historyOpen: boolean;
  diagnosticsOpen: boolean;
};

export const INITIAL_SHELL_DISCLOSURES: ShellDisclosures = {
  historyOpen: false,
  diagnosticsOpen: false,
};

export function toggleDisclosure(
  state: ShellDisclosures,
  key: keyof ShellDisclosures,
): ShellDisclosures {
  return { ...state, [key]: !state[key] };
}

/** Disclosure toggles must not rewrite the in-session game selection. */
export function selectionAfterDisclosure(
  selectedGameId: string | null,
  _next: ShellDisclosures,
): string | null {
  return selectedGameId;
}
