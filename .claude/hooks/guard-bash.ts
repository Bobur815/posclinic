// PreToolUse (Bash | PowerShell): hard-blocks commands that must never run from an agent session.
// Fails closed if the hook input cannot be parsed. Merged from posgro + SavdoChef guards.
import { block, readHookInput } from './_lib.ts';

interface Input {
  tool_input?: { command?: string };
}

const input = readHookInput<Input>();
if (!input) block('guard-bash: could not parse hook input; blocking to be safe.');

const cmd = input?.tool_input?.command ?? '';

interface Rule {
  re: RegExp;
  why: string;
}

const rules: Rule[] = [
  // Destructive SQL
  { re: /\b(DROP|TRUNCATE)\s+(TABLE|DATABASE|SCHEMA|COLUMN)\b/i, why: 'destructive SQL (DROP/TRUNCATE)' },
  { re: /\bALTER\s+TABLE\b[^;]*\bDROP\s+COLUMN\b/i, why: 'ALTER TABLE ... DROP COLUMN' },
  { re: /\bDELETE\s+FROM\s+["\w.]+\s*(;|"|'|$)/i, why: 'DELETE FROM without WHERE' },

  // Prisma data-loss tooling
  { re: /\bprisma\s+migrate\s+reset\b/i, why: 'prisma migrate reset' },
  { re: /(--force-reset|--accept-data-loss)/, why: 'Prisma data-loss flag' },
  { re: /\bprisma\s+db\s+push\b(?![^\n]*schema\.sqlite\.prisma)/i, why: 'prisma db push on the PostgreSQL schema' },
  { re: /\bprisma(?::|\s+)migrate(?::|\s+)deploy\b/i, why: 'production migrations are run by the user' },

  // The till's own data (patients!) lives in userData: never wipe it from a session.
  {
    re: /\b(rm|del|mv|move|Remove-Item|sqlite3)\b[^\n]*(AppData[\\/]Roaming[\\/]posclinic|\.config\/posclinic|clinic-[\w-]+\.db)/i,
    why: "touching the till's patient database in userData",
  },

  // Git
  { re: /\bgit\s+push\b[^\n]*(--force|\s-f\b)/i, why: 'force push' },
  { re: /\bgit\s+reset\s+--hard\b/i, why: 'git reset --hard' },
  { re: /\bgit\s+clean\s+-[a-z]*f/i, why: 'git clean -f' },
  { re: /\bgit\s+add\b[^\n]*\.env(?!\.example)\b/i, why: 'staging an .env file' },

  // Filesystem wipes (bash + Windows)
  { re: /\brm\s+-[a-z]*(rf|fr)[a-z]*\b/i, why: 'rm -rf' },
  { re: /Remove-Item\b[^\n]*-Recurse/i, why: 'Remove-Item -Recurse' },
  { re: /\b(rd|rmdir)\s+\/s\b/i, why: 'rd /s' },
  { re: /\bdel\s+\/[sq]\b/i, why: 'del /s or /q' },
];

for (const { re, why } of rules) {
  if (re.test(cmd)) {
    block(
      `BLOCKED by .claude/hooks/guard-bash.ts: ${why}.\n` +
        'Ask the user and let them run it manually if it is truly intended.',
    );
  }
}
