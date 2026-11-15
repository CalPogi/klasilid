-- Klasilid phase 1 schema (spec §10). Times are timestamptz (UTC); dates are Manila calendar dates.

create table schools (
  id uuid primary key default gen_random_uuid(),
  name text not null
);

create table school_years (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools(id),
  label text not null,
  starts_on date not null,
  ends_on date not null,
  admin_id uuid                              -- the teacher who manages this year's calendar
);

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('teacher', 'parent', 'student', 'owner')),
  display_name text not null,
  language text not null default 'en' check (language in ('en', 'fil'))
);

alter table school_years add foreign key (admin_id) references profiles(id);

create table classes (
  id uuid primary key default gen_random_uuid(),
  school_year_id uuid not null references school_years(id),
  teacher_id uuid not null references profiles(id),
  subject text not null,
  grade int not null,
  section text not null,
  is_advisory boolean not null default false,
  ignore_repeat_minutes int not null default 3 check (ignore_repeat_minutes in (1, 3, 5, 10))
);

create table learners (
  id uuid primary key default gen_random_uuid(),
  last_name text not null,
  first_name text not null,
  middle_name text,
  sex text not null check (sex in ('M', 'F')),
  lrn text,
  user_id uuid unique references profiles(id)
);

create table enrollments (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references classes(id),
  learner_id uuid not null references learners(id),
  joined_on date not null default current_date,
  left_on date,
  leave_reason text,
  unique (class_id, learner_id)
);

create table guardians (
  user_id uuid not null references profiles(id),
  learner_id uuid not null references learners(id),
  consent_at timestamptz,
  consent_version text,
  primary key (user_id, learner_id)
);

create table login_codes (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null references learners(id),
  for_role text not null check (for_role in ('parent', 'student')),
  username text not null unique,
  code_hash text not null,
  used_at timestamptz,
  voided_at timestamptz,
  created_at timestamptz not null default now()
);

create table cards (
  uid text primary key check (uid ~ '^[0-9A-F]{8}([0-9A-F]{6}([0-9A-F]{6})?)?$'),  -- 4, 7 or 10-byte UIDs
  learner_id uuid not null references learners(id),
  active boolean not null default true,
  issued_at timestamptz not null default now(),
  replaced_at timestamptz
);

create table devices (
  id text primary key,
  class_id uuid not null references classes(id),
  key_hash text not null,
  pairing_token_hash text not null,
  firmware text,
  last_seen_at timestamptz
);

create table tap_windows (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references classes(id),
  session text not null check (session in ('am', 'pm')),
  kind text not null check (kind in ('in', 'out')),
  opens int not null check (opens between 0 and 1439),
  late_after int check (late_after between 0 and 1439),
  closes int not null check (closes between 0 and 1439),
  effective_from date not null,
  unique (class_id, session, kind, effective_from)
);

create table taps (
  id text primary key,                       -- deviceId-sequence
  device_id text not null references devices(id),
  card_uid text not null,                    -- not a FK: unknown cards are kept for registration
  tapped_at timestamptz not null,
  clock_synced_at timestamptz,
  clock_suspect boolean not null default false,
  received_at timestamptz not null default now()
);
create index taps_card_time on taps (card_uid, tapped_at);

create table attendance_corrections (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null references learners(id),
  class_id uuid not null references classes(id),
  date date not null,
  session text not null check (session in ('am', 'pm')),
  status text not null check (status in ('on_time', 'late', 'absent', 'excused')),
  reason text not null check (reason in ('forgot_card', 'card_not_working', 'tapped_by_classmate',
    'sick', 'school_activity', 'arrived_no_tap', 'other')),
  reason_text text,
  photo_path text,
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now(),
  check (reason <> 'other' or length(trim(coalesce(reason_text, ''))) > 0)
);
create index corrections_learner_date on attendance_corrections (learner_id, date);

create table calendar_days (
  id uuid primary key default gen_random_uuid(),
  school_year_id uuid not null references school_years(id),
  date date not null,
  type text not null check (type in ('holiday', 'half', 'suspension', 'event')),
  name text not null,
  unique (school_year_id, date)
);

create table seat_plans (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references classes(id),
  rows int not null check (rows between 1 and 10),
  cols int not null check (cols between 1 and 10),
  effective_from date not null
);

create table seats (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references seat_plans(id) on delete cascade,
  row int not null,
  col int not null,
  learner_id uuid not null references learners(id),
  unique (plan_id, row, col),
  unique (plan_id, learner_id)
);

create table audit_log (
  id bigserial primary key,
  table_name text not null,
  row_id text,
  action text not null,
  old jsonb,
  new jsonb,
  actor uuid,
  at timestamptz not null default now()
);

-- Taps and corrections are never edited or deleted (spec §7.1).
create function reject_change() returns trigger language plpgsql as $$
begin
  raise exception 'append-only';
end $$;
create trigger taps_append_only before update or delete on taps
  for each row execute function reject_change();
create trigger corrections_append_only before update or delete on attendance_corrections
  for each row execute function reject_change();

create function audit_row() returns trigger language plpgsql security definer set search_path = public as $$
declare
  r jsonb := to_jsonb(coalesce(new, old));
begin
  insert into audit_log (table_name, row_id, action, old, new, actor)
  values (tg_table_name, coalesce(r ->> 'id', r ->> 'uid'), tg_op,
          case when tg_op <> 'INSERT' then to_jsonb(old) end,
          case when tg_op <> 'DELETE' then to_jsonb(new) end,
          auth.uid());
  return coalesce(new, old);
end $$;

create trigger audit after insert or update or delete on attendance_corrections for each row execute function audit_row();
create trigger audit after insert or update or delete on enrollments for each row execute function audit_row();
create trigger audit after insert or update or delete on cards for each row execute function audit_row();
create trigger audit after insert or update or delete on tap_windows for each row execute function audit_row();
create trigger audit after insert or update or delete on seat_plans for each row execute function audit_row();
create trigger audit after insert or update or delete on seats for each row execute function audit_row();
