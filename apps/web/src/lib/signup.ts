// School-code sign-up (design: docs/2026-11-16-brand-and-signup-design.md). The server
// (supabase/functions/signup/handler.ts) checks the same rules with the same messages.

export interface SignupInput { code: string; displayName: string; username: string; password: string }
export type SignupField = 'code' | 'displayName' | 'username' | 'password';
export type SignupResult =
  | { ok: true; schoolId: string; schoolName: string; yearId: string | null }
  | { ok: false; field?: SignupField; message: string };

export const RESERVED = ['admin', 'administrator', 'klasilid', 'support', 'help', 'root', 'owner', 'teacher'];
export const OFFLINE = 'You need internet to create an account.';
/** The code comes from the adviser's invite link; any problem with it means the link is old or broken. */
export const OLD_LINK = 'This sign-up link doesn’t work anymore. Ask the Klasilid admin for a new one.';
export const normalCode = (c: string) => c.toUpperCase().replace(/[\s-]/g, '');
export const normalUser = (u: string) => u.trim().toLowerCase();

export function checkSignup(i: SignupInput): Partial<Record<SignupField, string>> {
  const e: Partial<Record<SignupField, string>> = {};
  const code = normalCode(i.code);
  const user = normalUser(i.username);
  if (!code) e.code = 'Enter the school code';
  else if (!/^[A-Z0-9]{8}$/.test(code)) e.code = 'The school code looks like XXXX-XXXX';
  if (!i.displayName.trim()) e.displayName = 'Enter your name';
  if (!/^[a-z0-9][a-z0-9._-]{2,29}$/.test(user)) e.username = 'Use 3–30 small letters, numbers, dots, dashes or underscores';
  else if (RESERVED.includes(user)) e.username = 'That username can’t be used';
  if (i.password.length < 8) e.password = 'Use at least 8 characters';
  return e;
}

export async function signUpRemote(fetchFn: typeof fetch, baseUrl: string, i: SignupInput): Promise<SignupResult> {
  let res: Response;
  try {
    res = await fetchFn(`${baseUrl}/functions/v1/signup`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: i.code, displayName: i.displayName.trim(), username: normalUser(i.username), password: i.password }),
    });
  } catch {
    return { ok: false, message: OFFLINE };
  }
  const body = await res.json().catch(() => ({}));
  if (res.ok) return { ok: true, schoolId: body.schoolId, schoolName: body.schoolName, yearId: body.yearId ?? null };
  return { ok: false, ...(body.field ? { field: body.field } : {}), message: body.message ?? 'Something went wrong. Try again.' };
}
