# Lessons

Rules learned from corrections. Review at session start.

- (2026-11-15) Never commit real credentials to `.env.example` (it shipped a live Gmail app password). Placeholders only.
- (2026-11-15) On this Windows box, Python reading a script from a Bash heredoc mangles non-ASCII (em dashes) and `\U` sequences. For edits to docs with Unicode, use the Edit/Write tools, not `python - <<EOF`.
- (2026-11-15) The guard-bash hook scans the whole command text, including heredoc bodies: never write blocked flag names literally in docs created via Bash. Use the Write tool for doc files.
