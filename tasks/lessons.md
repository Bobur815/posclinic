# Lessons

Rules learned from corrections. Review at session start.

- (2026-11-15) Never commit real credentials to `.env.example` (it shipped a live Gmail app password). Placeholders only.
- (2026-11-15) Unit tests on each side passed while the real till→server first pull failed (`since=` empty vs `@IsOptional`). Always run one end-to-end pass across a contract boundary before calling it done.
- (2026-11-15) Renderer pages typed their own `isActive` while DB/handlers/sync use `active`: everything rendered "inactive" and edits were ignored, with no error anywhere. When a page shows a DB row, take the field names from `prisma/schema.sqlite.prisma`, not from a hand-written interface.
- (2026-11-15) To tamper a base64url signature in a test, change a middle character or the payload: the last character of a 64-byte signature only holds padding bits, so flipping it can leave the bytes unchanged.
- (2026-11-15) On this Windows box, Python reading a script from a Bash heredoc mangles non-ASCII (em dashes) and `\U` sequences. For edits to docs with Unicode, use the Edit/Write tools, not `python - <<EOF`.
- (2026-11-15) The guard-bash hook scans the whole command text, including heredoc bodies: never write blocked flag names literally in docs created via Bash. Use the Write tool for doc files.
