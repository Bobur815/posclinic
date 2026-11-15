// SessionStart: print branch/status and surface tasks/lessons.md (CLAUDE.md: "review lessons at session start").
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { projectDir } from './_lib.ts';

const cwd = projectDir();
const git = (...args: string[]): string =>
  (spawnSync('git', args, { cwd, encoding: 'utf8' }).stdout ?? '').trim();

console.log(`Branch: ${git('branch', '--show-current') || '(detached HEAD)'}`);
console.log(git('status', '-sb').split('\n').slice(0, 15).join('\n'));
console.log(git('log', '--oneline', '-5'));

if (!existsSync(join(cwd, 'src', 'generated', 'prisma-sqlite'))) {
  console.log(
    'NOTE: SQLite Prisma client not generated. Run `npm run prisma:generate:sqlite` before dev:pos.',
  );
}

const lessons = join(cwd, 'tasks', 'lessons.md');
if (existsSync(lessons)) {
  const text = readFileSync(lessons, 'utf8');
  const cap = 4000;
  console.log('\n--- tasks/lessons.md (review before starting) ---');
  console.log(text.slice(0, cap));
  if (text.length > cap) console.log('... (truncated; read the file for the rest)');
}
process.exit(0);
