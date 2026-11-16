-- School-code sign-up (plan 6c). Only the signup Edge Function (service role) touches these tables.

-- The code is stored only as sha256(code without dashes or spaces, uppercase); see scripts/school-code.mjs.
create table school_signup_codes (
  school_id uuid primary key references schools(id) on delete cascade,
  code_hash text not null unique,
  created_at timestamptz not null default now()
);

-- Every sign-up attempt, for the lockout (10 failures from one address in 10 minutes).
create table signup_attempts (
  id bigint generated always as identity primary key,
  ip text not null,
  at timestamptz not null default now(),
  ok boolean not null
);
create index signup_attempts_ip_at on signup_attempts (ip, at);

alter table school_signup_codes enable row level security;
alter table signup_attempts enable row level security;
revoke all on school_signup_codes, signup_attempts from anon, authenticated;

-- Records an attempt as a wrong code first (the function clears it if it wasn't one), then counts this address's
-- earlier wrong codes in the last 10 minutes. One lock per address, so a burst of parallel tries can't all count 0.
create function public.begin_signup_attempt(p_ip text) returns table (attempt_id bigint, failures int)
language plpgsql security definer set search_path = public as $$
begin
  perform pg_advisory_xact_lock(hashtext('signup:' || p_ip));
  delete from signup_attempts where at < now() - interval '1 day';
  insert into signup_attempts (ip, ok) values (p_ip, false) returning id into attempt_id;
  select count(*)::int into failures from signup_attempts
    where ip = p_ip and not ok and at >= now() - interval '10 minutes' and id <> attempt_id;
  return next;
end $$;
revoke execute on function public.begin_signup_attempt(text) from public, anon, authenticated;
grant execute on function public.begin_signup_attempt(text) to service_role;

-- The school an adviser signed up into, so any device can reopen her setup for the right school.
alter table profiles add column school_id uuid references schools(id);

-- One adviser per section in a school year, and one year per school and label (advisers who sign up before
-- the year exists still end up in the same one).
create unique index one_adviser_per_section on classes (school_year_id, grade, lower(section)) where is_advisory;
create unique index one_year_per_label on school_years (school_id, label);

create or replace function public.setup_class(
  p_school_id uuid, p_school_name text, p_year_id uuid, p_year_label text, p_starts date, p_ends date,
  p_class_id uuid, p_grade int, p_section text
) returns uuid
language plpgsql security definer set search_path = public, private as $$
declare
  v_year uuid;
  v_constraint text;
begin
  if not private.is_teacher() then
    raise exception 'teachers only';
  end if;
  insert into schools (id, name) values (p_school_id, p_school_name) on conflict (id) do nothing;
  -- The given year if it exists, else the school's year with this label, else a new one with the given id.
  select id into v_year from school_years where id = p_year_id;
  if v_year is null then
    insert into school_years (id, school_id, label, starts_on, ends_on, admin_id)
      values (p_year_id, p_school_id, p_year_label, p_starts, p_ends, auth.uid()) on conflict do nothing;
    select id into v_year from school_years where school_id = p_school_id and label = p_year_label;
  end if;
  insert into classes (id, school_year_id, teacher_id, subject, grade, section, is_advisory)
    values (p_class_id, v_year, auth.uid(), 'Advisory', p_grade, p_section, true) on conflict (id) do nothing;
  return p_class_id;
exception when unique_violation then
  get stacked diagnostics v_constraint = constraint_name;
  if v_constraint <> 'one_adviser_per_section' then raise; end if;
  -- the whole call rolls back: no school, year or class is left half-created
  raise exception 'Gr. % % already has an adviser', p_grade, p_section;
end $$;
