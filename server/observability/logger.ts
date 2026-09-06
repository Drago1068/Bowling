/** Minimal structured logger. Emits single-line JSON to stdout/stderr. */
export interface Logger {
  info(event: string, fields?: Record<string, unknown>): void;
  warn(event: string, fields?: Record<string, unknown>): void;
  error(event: string, fields?: Record<string, unknown>): void;
}

function emit(level: string, event: string, fields?: Record<string, unknown>): void {
  const line = JSON.stringify({ level, event, ts: new Date().toISOString(), ...(fields ?? {}) });
  if (level === "error") process.stderr.write(line + "\n");
  else process.stdout.write(line + "\n");
}

export const consoleLogger: Logger = {
  info: (event, fields) => emit("info", event, fields),
  warn: (event, fields) => emit("warn", event, fields),
  error: (event, fields) => emit("error", event, fields),
};

export const nullLogger: Logger = {
  info: () => {},
  warn: () => {},
  error: () => {},
};