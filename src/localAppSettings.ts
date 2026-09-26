/**
 * Local app settings — not a domain entity, never synced, never in the outbox.
 * Lives in an app-owned key/value table created on demand so the domain
 * migration set stays untouched (governance: B1 schema is frozen).
 */
import type { SqliteDriver } from "./portable.ts";
import type { HandicapSettings } from "./shellPresentation.ts";

const DDL =
  "CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)";
const BASIS_KEY = "handicap_basis_score";
const PERCENT_KEY = "handicap_percentage";
const UPSERT =
  "INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value";

function parseNumber(raw: unknown): number | null {
  if (typeof raw !== "string") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export function loadHandicapSettings(
  driver: SqliteDriver,
): HandicapSettings | null {
  driver.exec(DDL);
  const basis = parseNumber(
    driver.prepare("SELECT value FROM app_settings WHERE key = ?").get(BASIS_KEY)
      ?.value,
  );
  const percentage = parseNumber(
    driver.prepare("SELECT value FROM app_settings WHERE key = ?").get(
      PERCENT_KEY,
    )?.value,
  );
  if (basis == null || percentage == null || basis <= 0 || percentage < 0) {
    return null;
  }
  return { basisScore: basis, percentage };
}

export function saveHandicapSettings(
  driver: SqliteDriver,
  settings: HandicapSettings,
): void {
  driver.exec(DDL);
  driver.prepare(UPSERT).run(BASIS_KEY, String(settings.basisScore));
  driver.prepare(UPSERT).run(PERCENT_KEY, String(settings.percentage));
}
