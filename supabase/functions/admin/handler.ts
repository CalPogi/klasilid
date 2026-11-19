// Pure logic of POST /functions/v1/admin: the owner's admin section (docs/2026-11-19-admin-design.md §5).
// Every request needs a two-step (aal2) session of an account whose profile role is 'owner'. Codes and keys are
// returned once and only their hashes are stored.
import { makeReaderSecrets, makeSchoolCode, randomReaderId } from './secrets.ts';

export type Caller = { userId: string; aal: string };

export interface Overview {
  schools: { id: string; name: string; codeMadeAt: string | null; advisers: number }[];
  teachers: {
    id: string; displayName: string; username: string; schoolId: string | null; schoolName: string | null;
    classes: { id: string; grade: number; section: string; subject: string }[];
  }[];
  readers: {
    id: string; classId: string; className: string; teacherName: string; schoolName: string;
    lastSeenAt: string | null; firmware: string | null; retiredAt: string | null;
  }[];
}

export interface AdminDeps {
  roleOf(userId: string): Promise<string | null>;
  overview(): Promise<Overview>;
  addSchool(name: string): Promise<string>;
  schoolExists(id: string): Promise<boolean>;
  setSchoolCode(schoolId: string, hash: string): Promise<void>;
  classExists(id: string): Promise<boolean>;
  readerExists(id: string): Promise<boolean>;
  insertReader(r: { id: string; classId: string; keyHash: string; tokenHash: string }): Promise<void>;
  /** False when the reader is missing or retired. */
  setReaderSecrets(id: string, keyHash: string, tokenHash: string): Promise<boolean>;
  /** False when the reader is missing or already retired. Logs itself (SQL). */
  retireReader(id: string, actor: string): Promise<boolean>;
  /** The login name of a teacher account, or null when it isn't one. */
  usernameOf(teacherId: string): Promise<string | null>;
  /** Logs itself (SQL). */
  deleteTeacher(teacherId: string, actor: string): Promise<{ classIds: string[] }>;
  /** The class ids whose excuse-letter photos could not all be removed. */
  removeClassPhotos(classIds: string[]): Promise<string[]>;
  audit(action: string, rowId: string, actor: string): Promise<void>;
}

type Result = { status: number; body: unknown };
const say = (status: number, message: string): Result => ({ status, body: { message } });
const notFound = say(404, 'Not found');

export async function handleAdmin(caller: Caller | null, body: unknown, deps: AdminDeps): Promise<Result> {
  if (!caller) return say(401, 'Sign in first');
  if (caller.aal !== 'aal2') return say(403, 'Two-step sign-in needed');
  if ((await deps.roleOf(caller.userId)) !== 'owner') return say(403, 'Owner only');

  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const str = (k: string) => (typeof b[k] === 'string' ? (b[k] as string) : '');
  const me = caller.userId;

  switch (b.action) {
    case 'overview':
      return { status: 200, body: await deps.overview() };

    case 'addSchool': {
      const name = str('name').trim();
      if (!name) return say(400, 'Enter the school name');
      const schoolId = await deps.addSchool(name);
      const { code, hash } = await makeSchoolCode();
      await deps.setSchoolCode(schoolId, hash);
      await deps.audit('add_school', schoolId, me);
      return { status: 200, body: { schoolId, code } };
    }

    case 'newSchoolCode': {
      const schoolId = str('schoolId');
      if (!schoolId || !(await deps.schoolExists(schoolId))) return notFound;
      const { code, hash } = await makeSchoolCode();
      await deps.setSchoolCode(schoolId, hash);
      await deps.audit('new_school_code', schoolId, me);
      return { status: 200, body: { code } };
    }

    case 'addReader': {
      const classId = str('classId');
      if (!classId) return say(400, 'Choose a class');
      if (!(await deps.classExists(classId))) return notFound;
      let id = '';
      for (let i = 0; i < 20 && !id; i++) {
        const candidate = randomReaderId();
        if (!(await deps.readerExists(candidate))) id = candidate;
      }
      if (!id) return say(500, 'Could not pick a reader ID. Try again.');
      const s = await makeReaderSecrets();
      await deps.insertReader({ id, classId, keyHash: s.keyHash, tokenHash: s.tokenHash });
      await deps.audit('add_reader', id, me);
      return { status: 200, body: { id, key: s.key, pairingCode: s.pairingCode } };
    }

    case 'newReaderKey': {
      const readerId = str('readerId');
      const s = await makeReaderSecrets();
      if (!readerId || !(await deps.setReaderSecrets(readerId, s.keyHash, s.tokenHash))) return notFound;
      await deps.audit('new_reader_key', readerId, me);
      return { status: 200, body: { key: s.key, pairingCode: s.pairingCode } };
    }

    case 'retireReader': {
      const readerId = str('readerId');
      if (!readerId) return notFound;
      if (str('confirm') !== readerId) return say(400, `Type ${readerId} exactly to confirm`);
      return (await deps.retireReader(readerId, me)) ? { status: 200, body: { ok: true } } : notFound;
    }

    case 'deleteTeacher': {
      const teacherId = str('teacherId');
      const username = teacherId ? await deps.usernameOf(teacherId) : null;
      if (!username) return notFound;
      if (str('confirm') !== username) return say(400, `Type ${username} exactly to confirm`);
      const { classIds } = await deps.deleteTeacher(teacherId, me);
      return { status: 200, body: { ok: true, photosLeft: await deps.removeClassPhotos(classIds) } };
    }

    case 'removeClassPhotos': {
      const classIds = Array.isArray(b.classIds) ? b.classIds.filter((c): c is string => typeof c === 'string') : [];
      return { status: 200, body: { photosLeft: await deps.removeClassPhotos(classIds) } };
    }

    default:
      return say(400, 'Unknown action');
  }
}
