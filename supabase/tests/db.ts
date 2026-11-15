import { PGlite } from '@electric-sql/pglite';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const here = import.meta.dirname;
const migrations = join(here, '..', 'migrations');

/** A fresh in-memory Postgres with the Supabase shim and every migration applied, in name order. */
export async function freshDb(): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(readFileSync(join(here, 'shim.sql'), 'utf8'));
  for (const f of readdirSync(migrations).filter(f => f.endsWith('.sql')).sort()) {
    await db.exec(readFileSync(join(migrations, f), 'utf8'));
  }
  return db;
}

/** Run `fn` as an API user (role authenticated, auth.uid() = userId) inside a rolled-back transaction. */
export async function as<T>(db: PGlite, userId: string | null, fn: () => Promise<T>): Promise<T> {
  await db.exec('begin');
  try {
    if (userId === null) await db.exec('set local role anon');
    else await db.exec(`set local role authenticated; set local request.jwt.claim.sub = '${userId}'`);
    return await fn();
  } finally {
    await db.exec('rollback');
  }
}

export const one = async (db: PGlite, sql: string, params: unknown[] = []) =>
  (await db.query<Record<string, unknown>>(sql, params)).rows[0];
