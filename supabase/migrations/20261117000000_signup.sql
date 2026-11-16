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

-- One adviser per section in a school year.
create unique index one_adviser_per_section on classes (school_year_id, grade, lower(section)) where is_advisory;

create or replace function public.setup_class(
  p_school_id uuid, p_school_name text, p_year_id uuid, p_year_label text, p_starts date, p_ends date,
  p_class_id uuid, p_grade int, p_section text
) returns uuid
language plpgsql security definer set search_path = public, private as $$
begin
  if not private.is_teacher() then
    raise exception 'teachers only';
  end if;
  insert into schools (id, name) values (p_school_id, p_school_name) on conflict (id) do nothing;
  insert into school_years (id, school_id, label, starts_on, ends_on, admin_id)
    values (p_year_id, p_school_id, p_year_label, p_starts, p_ends, auth.uid()) on conflict (id) do nothing;
  insert into classes (id, school_year_id, teacher_id, subject, grade, section, is_advisory)
    values (p_class_id, p_year_id, auth.uid(), 'Advisory', p_grade, p_section, true) on conflict (id) do nothing;
  return p_class_id;
exception when unique_violation then
  -- the whole call rolls back: no school, year or class is left half-created
  raise exception 'Gr. % % already has an adviser', p_grade, p_section;
end $$;
