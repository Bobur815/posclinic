# Lessons

Rules learned from corrections. Review at session start.

- (2026-11-15) Never commit real credentials to `.env.example` (it shipped a live Gmail app password). Placeholders only.
- (2026-11-15) Unit tests on each side passed while the real till→server first pull failed (`since=` empty vs `@IsOptional`). Always run one end-to-end pass across a contract boundary before calling it done.
- (2026-11-15) Renderer pages typed their own `isActive` while DB/handlers/sync use `active`: everything rendered "inactive" and edits were ignored, with no error anywhere. When a page shows a DB row, take the field names from `prisma/schema.sqlite.prisma`, not from a hand-written interface.
- (2026-11-15) To tamper a base64url signature in a test, change a middle character or the payload: the last character of a 64-byte signature only holds padding bits, so flipping it can leave the bytes unchanged.
- (2026-11-15) On this Windows box, Python reading a script from a Bash heredoc mangles non-ASCII (em dashes) and `\U` sequences. For edits to docs with Unicode, use the Edit/Write tools, not `python - <<EOF`.
- (2026-11-15) The guard-bash hook scans the whole command text, including heredoc bodies: never write blocked flag names literally in docs created via Bash. Use the Write tool for doc files.
- (2026-11-15) `JSON.stringify` turns a Prisma Decimal into a string (`"150000"`) and `$queryRaw` returns snake_case columns with `active: 1`: both reached pages typed as camelCase numbers. Handlers that feed pages use Prisma queries (not raw SQL), and `ipcSafe()` converts Decimal to number; type page reads from `src/shared/clinic.ts`.
- (2026-11-15) Backticks inside a `node -e "…"` string in Bash are command substitution: template literals and Markdown code spans silently vanished from edited code. For edits containing backticks, use the Edit tool or a script file written with the Write tool.
- (2026-11-15) This repo's files are CRLF: a Node splice that searched for `\n}\n` found nothing and appended a second copy of the schema. Normalise `\r\n` to `\n` before searching, and check the result (`prisma validate`, model count).
- (2026-11-16) A controlled input whose onChange value differs from what it displays (PhoneInput stores "+9989", shows "9") must be tested as a round trip, keystroke by keystroke: format(store(display + key)). Testing the helpers one by one missed that one typed digit came back as "99 89".
