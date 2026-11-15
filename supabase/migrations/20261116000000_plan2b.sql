-- Plan 2b: seat plan ordering, guardian contact, review setting, excuse-letter storage.

alter table seat_plans add column created_at timestamptz not null default now();

alter table learners add column guardian_name text, add column guardian_phone text;
grant update (guardian_name, guardian_phone) on learners to authenticated;

alter table classes add column review_outside boolean not null default true;

drop function public.add_learner(uuid, uuid, text, text, text, text, date);
create function public.add_learner(
  p_learner_id uuid, p_class_id uuid, p_last text, p_first text, p_middle text, p_sex text, p_joined date,
  p_lrn text default null, p_guardian_name text default null, p_guardian_phone text default null
) returns uuid
language plpgsql security definer set search_path = public, private as $$
begin
  if not private.is_class_teacher(p_class_id) then
    raise exception 'not your class';
  end if;
  if private.enrolled_with_other_teacher(p_learner_id) then
    raise exception 'learner belongs to another teacher';
  end if;
  insert into learners (id, last_name, first_name, middle_name, sex, lrn, guardian_name, guardian_phone)
    values (p_learner_id, p_last, p_first, p_middle, p_sex, p_lrn, p_guardian_name, p_guardian_phone) on conflict (id) do nothing;
  insert into enrollments (class_id, learner_id, joined_on)
    values (p_class_id, p_learner_id, coalesce(p_joined, private.manila_today())) on conflict (class_id, learner_id) do nothing;
  return p_learner_id;
end $$;
revoke execute on function public.add_learner(uuid, uuid, text, text, text, text, date, text, text, text) from public, anon;
grant execute on function public.add_learner(uuid, uuid, text, text, text, text, date, text, text, text) to authenticated;

-- Excuse-letter photos: private bucket, path '<class id>/<correction id>.jpg'. Only that class's teacher can add or read them;
-- no update or delete policy, so stored letters can't be changed.
insert into storage.buckets (id, name, public) values ('excuse-letters', 'excuse-letters', false) on conflict (id) do nothing;
-- CASE guards the uuid cast: AND isn't guaranteed to short-circuit, and other buckets may use non-uuid folder names.
create policy excuse_letters_insert on storage.objects for insert to authenticated
  with check (case when bucket_id = 'excuse-letters' then private.is_class_teacher(((storage.foldername(name))[1])::uuid) else false end);
create policy excuse_letters_select on storage.objects for select to authenticated
  using (case when bucket_id = 'excuse-letters' then private.is_class_teacher(((storage.foldername(name))[1])::uuid) else false end);

-- Where a learner transferred in from (Add student form).
alter table enrollments add column joined_from text;
grant update (joined_from) on enrollments to authenticated;

-- Cards are keyed by uid. Registering goes through this function so a card already on file (even another teacher's learner's)
-- is refused out loud instead of silently ignored; a retry for the same learner is a no-op.
create function public.register_card(p_uid text, p_learner_id uuid) returns void
language plpgsql security definer set search_path = public, private as $$
begin
  if not private.teaches_learner(p_learner_id) then
    raise exception 'not your learner';
  end if;
  if exists (select 1 from cards where uid = p_uid and learner_id <> p_learner_id) then
    raise exception 'card already registered';
  end if;
  insert into cards (uid, learner_id) values (p_uid, p_learner_id) on conflict (uid) do nothing;
end $$;
revoke execute on function public.register_card(text, uuid) from public, anon;
grant execute on function public.register_card(text, uuid) to authenticated;
