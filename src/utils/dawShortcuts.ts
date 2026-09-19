export type DawShortcut =
  | "play"
  | "record"
  | "restart"
  | "delete"
  | "duplicate"
  | "mute"
  | "solo"
  | "previous-track"
  | "next-track"
  | "seek-back"
  | "seek-forward"
  | "nudge-back"
  | "nudge-forward"
  | "zoom-in"
  | "zoom-out"
  | "help"
  | "escape";

interface KeyPress {
  key: string;
  code?: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  repeat: boolean;
  isComposing?: boolean;
}

/** Shared by the DAW's scoped handler and tests; text editing always wins. */
export function dawShortcut(
  event: KeyPress,
  editing: boolean,
): DawShortcut | null {
  if (editing || event.isComposing) return null;
  const key = event.key.toLowerCase();
  if (event.metaKey || event.ctrlKey) {
    return !event.altKey && !event.shiftKey && key === "d" && !event.repeat
      ? "duplicate"
      : null;
  }
  if (event.altKey) {
    if (key === "arrowleft") return "nudge-back";
    if (key === "arrowright") return "nudge-forward";
    return null;
  }
  const repeatable: Record<string, DawShortcut> = {
    arrowup: "previous-track",
    arrowdown: "next-track",
    arrowleft: "seek-back",
    arrowright: "seek-forward",
    "+": "zoom-in",
    "=": "zoom-in",
    "-": "zoom-out",
  };
  if (repeatable[key]) return repeatable[key];
  if (event.repeat) return null;
  const actions: Record<string, DawShortcut> = {
    " ": "play",
    r: "record",
    enter: "restart",
    delete: "delete",
    backspace: "delete",
    m: "mute",
    s: "solo",
    "?": "help",
    escape: "escape",
  };
  return actions[key] ?? (event.code === "Space" ? "play" : null);
}
