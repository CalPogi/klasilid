-- Admin section for the owner (plan 7, docs/2026-11-19-admin-design.md). Only the admin Edge Function (service
-- role, after checking two-step sign-in and role = 'owner') calls these; nothing here is reachable by a teacher.

-- A retired reader keeps its row (its taps reference it) but its key and pairing code no longer match anything.
alter table devices add column retired_at timestamptz;

-- The purge switch lets admin_delete_teacher remove taps and corrections, inside its own transaction. This trigger
-- runs as the role doing the delete, so an API role that sets the variable itself still gets 'append-only'; only the
-- definer of admin_delete_teacher passes.
create or replace function reject_change() returns trigger language plpgsql as $$
begin
  if current_setting('klasilid.purge', true) = 'on' and current_user not in ('anon', 'authenticated', 'service_role') then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  raise exception 'append-only';
end $$;

-- Everything the admin lists show, with no learner data: schools, teachers (username = the login before
-- '@login.klasilid.app') with their classes, and readers.
create function public.admin_overview() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'schools', coalesce((
      select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'codeMadeAt', c.created_at,
        'advisers', (select count(*) from profiles p where p.school_id = s.id and p.role = 'teacher')) order by s.name)
      from schools s left join school_signup_codes c on c.school_id = s.id), '[]'::jsonb),
    'teachers', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'displayName', p.display_name, 'username', split_part(u.email, '@', 1),
        'schoolId', p.school_id, 'schoolName', s.name,
        'classes', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'grade', c.grade, 'section', c.section, 'subject', c.subject)
                             order by c.grade, c.section) from classes c where c.teacher_id = p.id), '[]'::jsonb))
        order by p.display_name)
      from profiles p join auth.users u on u.id = p.id left join schools s on s.id = p.school_id
      where p.role = 'teacher'), '[]'::jsonb),
    'readers', coalesce((
      select jsonb_agg(jsonb_build_object('id', d.id, 'classId', d.class_id, 'className', 'Gr. ' || c.grade || ' ' || c.section,
        'teacherName', p.display_name, 'schoolName', s.name, 'lastSeenAt', d.last_seen_at, 'firmware', d.firmware,
        'retiredAt', d.retired_at) order by d.retired_at nulls first, d.id)
      from devices d join classes c on c.id = d.class_id join profiles p on p.id = c.teacher_id
      join school_years y on y.id = c.school_year_id join schools s on s.id = y.school_id), '[]'::jsonb)
  )
$$;

-- Retire: both secrets become hashes of values nobody knows, so the reader is refused at once; its taps stay.
create function public.admin_retire_reader(p_id text, p_actor uuid) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  update devices set key_hash = encode(sha256(convert_to(gen_random_uuid()::text, 'utf8')), 'hex'),
                     pairing_token_hash = encode(sha256(convert_to(gen_random_uuid()::text, 'utf8')), 'hex'),
                     retired_at = now()
    where id = p_id and retired_at is null;
  if not found then return false; end if;
  insert into audit_log (table_name, row_id, action, actor) values ('admin', p_id, 'retire_reader', p_actor);
  return true;
end $$;

-- Delete a teacher and everything under her, in this one transaction (design §5). Learners ever enrolled with
-- another teacher stay; family accounts linked only to deleted learners go. The change-log rows of the deleted rows
-- go too (the older ones and the DELETE rows written during this call), so no learner data survives there; one
-- summary row records the delete. Excuse-letter photos are removed
-- by the Edge Function afterwards, using the returned class ids.
create function public.admin_delete_teacher(p_teacher uuid, p_actor uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_user text;
  v_classes uuid[];
  v_learners uuid[];
  v_family uuid[];
  v_ids text[];
  v_taps int;
  v_corrections int;
  v_counts jsonb;
begin
  if not exists (select 1 from profiles where id = p_teacher and role = 'teacher') then
    raise exception 'not a teacher';
  end if;
  select split_part(email, '@', 1) into v_user from auth.users where id = p_teacher;
  perform set_config('klasilid.purge', 'on', true);

  select coalesce(array_agg(id), '{}') into v_classes from classes where teacher_id = p_teacher;
  select coalesce(array_agg(distinct e.learner_id), '{}') into v_learners from enrollments e
    where e.class_id = any(v_classes)
      and not exists (select 1 from enrollments o where o.learner_id = e.learner_id and o.class_id <> all(v_classes));
  select coalesce(array_agg(distinct x.uid), '{}') into v_family from (
      select user_id as uid from guardians where learner_id = any(v_learners)
      union select user_id from learners where id = any(v_learners) and user_id is not null) x
    where not exists (select 1 from guardians g where g.user_id = x.uid and g.learner_id <> all(v_learners))
      and not exists (select 1 from learners l where l.user_id = x.uid and l.id <> all(v_learners));
  select coalesce(array_agg(i), '{}') into v_ids from (
      select id::text as i from enrollments where class_id = any(v_classes)
      union all select uid from cards where learner_id = any(v_learners)
      union all select id::text from attendance_corrections where class_id = any(v_classes)
      union all select id::text from tap_windows where class_id = any(v_classes)
      union all select id::text from seat_plans where class_id = any(v_classes)
      union all select s.id::text from seats s join seat_plans p on p.id = s.plan_id where p.class_id = any(v_classes)) t;

  delete from seats where plan_id in (select id from seat_plans where class_id = any(v_classes));
  delete from seat_plans where class_id = any(v_classes);
  delete from attendance_corrections where class_id = any(v_classes);
  get diagnostics v_corrections = row_count;
  delete from taps where device_id in (select id from devices where class_id = any(v_classes));
  get diagnostics v_taps = row_count;
  delete from devices where class_id = any(v_classes);
  delete from tap_windows where class_id = any(v_classes);
  delete from enrollments where class_id = any(v_classes);
  delete from cards where learner_id = any(v_learners);
  delete from login_codes where learner_id = any(v_learners);
  delete from guardians where learner_id = any(v_learners);
  delete from learners where id = any(v_learners);
  update school_years set admin_id = null where admin_id = p_teacher;
  delete from classes where id = any(v_classes);
  delete from audit_log
    where table_name in ('enrollments', 'cards', 'attendance_corrections', 'tap_windows', 'seat_plans', 'seats')
      and row_id = any(v_ids);
  delete from auth.users where id = p_teacher or id = any(v_family);  -- profiles go with them (on delete cascade)

  v_counts := jsonb_build_object('classes', cardinality(v_classes), 'learners', cardinality(v_learners),
                                 'taps', v_taps, 'corrections', v_corrections);
  insert into audit_log (table_name, row_id, action, new, actor)
    values ('admin', p_teacher::text, 'delete_teacher', jsonb_build_object('username', v_user) || v_counts, p_actor);
  return jsonb_build_object('classIds', to_jsonb(v_classes), 'counts', v_counts);
end $$;

revoke execute on function public.admin_overview(), public.admin_retire_reader(text, uuid),
  public.admin_delete_teacher(uuid, uuid) from public, anon, authenticated;
grant execute on function public.admin_overview(), public.admin_retire_reader(text, uuid),
  public.admin_delete_teacher(uuid, uuid) to service_role;
