// Pure logic of POST /functions/v1/signup: an adviser creates her account with her school's code.
// Same rules and messages as the app's checkSignup (apps/web/src/lib/signup.ts); a test keeps them equal.
import { sha256Hex } from '../tap/handler.ts';

export interface SignupDeps {
  schoolForCodeHash(hash: string): Promise<{ schoolId: string; schoolName: string } | null>;
  currentYear(schoolId: string, today: string): Promise<string | null>;
  failuresSince(ip: string, since: Date): Promise<number>;
  recordAttempt(ip: string, ok: boolean): Promise<void>;
  createTeacher(u: { email: string; password: string; displayName: string }): Promise<{ userId: string } | { taken: true }>;
  now(): Date;
}
type Field = 'code' | 'displayName' | 'username' | 'password';
type Result = { status: number; body: unknown };

const RESERVED = ['admin', 'administrator', 'klasilid', 'support', 'help', 'root', 'owner', 'teacher'];
const WINDOW_MS = 10 * 60_000;
const MAX_FAILURES = 10;
const normalCode =(c: string) => c.toUpperCase().replace(/[\s-]/g, '');
const manilaToday = (d: Date) => new Date(d.getTime() + 8 * 3600_000).toISOString().slice(0, 10);

function problem(code: string, displayName: string, user: string, password: string): [Field, string] | null {
  const c = normalCode(code);
  if (!c) return ['code', 'Enter the school code'];
  if (!/^[A-Z0-9]{8}$/.test(c)) return ['code', 'The school code looks like XXXX-XXXX'];
  if (!displayName.trim()) return ['displayName', 'Enter your name'];
  if (!/^[a-z0-9][a-z0-9._-]{2,29}$/.test(user)) return ['username', 'Use 3–30 small letters, numbers, dots, dashes or underscores'];
  if (RESERVED.includes(user)) return ['username', 'That username can’t be used'];
  if (password.length < 8) return ['password', 'Use at least 8 characters'];
  return null;
}

/** The year whose dates contain today, else the one that starts last, else null. */
export function pickYear(years: { id: string; startsOn: string; endsOn: string }[], today: string): string | null {
  const now = years.find(y => y.startsOn <= today && today <= y.endsOn);
  return (now ?? [...years].sort((a, b) => b.startsOn.localeCompare(a.startsOn))[0])?.id ?? null;
}

export async function handleSignup(body: unknown, ip: string, deps: SignupDeps): Promise<Result> {
  if ((await deps.failuresSince(ip, new Date(deps.now().getTime() - WINDOW_MS))) >= MAX_FAILURES)
    return { status: 429, body: { message: 'Too many tries. Wait 10 minutes and try again.' } };

  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const str = (k: string) => (typeof b[k] === 'string' ? (b[k] as string) : '');
  const user = str('username').trim().toLowerCase();
  const bad = problem(str('code'), str('displayName'), user, str('password'));
  if (bad) return { status: 400, body: { field: bad[0], message: bad[1] } };

  // The hash is looked up, not compared here: equality on a sha256 leaks nothing usable about the code.
  const school = await deps.schoolForCodeHash(await sha256Hex(normalCode(str('code'))));
  await deps.recordAttempt(ip, !!school);
  if (!school) return { status: 400, body: { field: 'code', message: 'That school code isn’t right. Check it with the Klasilid admin.' } };

  const made = await deps.createTeacher({ email: `${user}@login.klasilid.app`, password: str('password'), displayName: str('displayName').trim() });
  if ('taken' in made) return { status: 409, body: { field: 'username', message: 'That username is taken' } };

  return { status: 200, body: { ...school, yearId: await deps.currentYear(school.schoolId, manilaToday(deps.now())) } };
}
