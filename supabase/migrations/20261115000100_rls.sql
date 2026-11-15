-- Row-level security for teacher, parent, student and owner (spec §2, §11).
-- The owner role gets no policies: it reads nothing learner-related.
-- Helpers live in schema `private`, which the API (PostgREST) does not expose, so they cannot be called as RPCs.

create schema private;
grant usage on schema private to authenticated;

create function private.manila_today() returns date
language sql stable as $$
  select (now() at time zone 'Asia/Manila')::date
$$;

create function private.is_class_teacher(cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from classes where id = cid and teacher_id = auth.uid())
$$;

create function private.teaches_learner(lid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from enrollments e join classes c on c.id = e.class_id
                 where e.learner_id = lid and c.teacher_id = auth.uid())
$$;

-- Blocks a teacher from enrolling (and so gaining access to) a learner who belongs to another teacher.
create function private.enrolled_with_other_teacher(lid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from enrollments e join classes c on c.id = e.class_id
                 where e.learner_id = lid and c.teacher_id <> auth.uid())
$$;

create function private.is_teacher() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'teacher')
$$;

create function private.is_consented_guardian(lid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from guardians
                 where user_id = auth.uid() and learner_id = lid and consent_at is not null)
$$;

create function private.is_consented_student(lid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from learners l where l.id = lid and l.user_id = auth.uid())
     and exists (select 1 from guardians g where g.learner_id = lid and g.consent_at is not null)
$$;

create function private.is_family(lid uuid) returns boolean
language sql stable security definer set search_path = public, private as $$
  select private.is_consented_guardian(lid) or private.is_consented_student(lid)
$$;

create function private.can_view_learner(lid uuid) returns boolean
language sql stable security definer set search_path = public, private as $$
  select private.teaches_learner(lid) or private.is_family(lid)
$$;

-- A family member sees their learner's advisory class settings (windows, calendar, seat layout).
create function private.family_sees_class(cid uuid) returns boolean
language sql stable security definer set search_path = public, private as $$
  select exists (select 1 from enrollments e join classes c on c.id = e.class_id
                 where e.class_id = cid and c.is_advisory and private.is_family(e.learner_id))
$$;

create function private.teaches_in_year(sy uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from classes where school_year_id = sy and teacher_id = auth.uid())
$$;

create function private.is_year_admin(sy uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from school_years where id = sy and admin_id = auth.uid())
$$;

create function private.family_in_year(sy uuid) returns boolean
language sql stable security definer set search_path = public, private as $$
  select exists (select 1 from classes c where c.school_year_id = sy and private.family_sees_class(c.id))
$$;

create function private.family_owns_card(card text) returns boolean
language sql stable security definer set search_path = public, private as $$
  select exists (select 1 from cards where uid = card and private.is_family(learner_id))
$$;

create function private.teaches_device(dev text) returns boolean
language sql stable security definer set search_path = public, private as $$
  select exists (select 1 from devices where id = dev and private.is_class_teacher(class_id))
$$;

create function private.teaches_plan(pid uuid) returns boolean
language sql stable security definer set search_path = public, private as $$
  select exists (select 1 from seat_plans where id = pid and private.is_class_teacher(class_id))
$$;

revoke execute on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated;

alter table schools enable row level security;
alter table school_years enable row level security;
alter table profiles enable row level security;
alter table classes enable row level security;
alter table learners enable row level security;
alter table enrollments enable row level security;
alter table guardians enable row level security;
alter table login_codes enable row level security;
alter table cards enable row level security;
alter table devices enable row level security;
alter table tap_windows enable row level security;
alter table taps enable row level security;
alter table attendance_corrections enable row level security;
alter table calendar_days enable row level security;
alter table seat_plans enable row level security;
alter table seats enable row level security;
alter table audit_log enable row level security;

-- Nothing here is ever readable without signing in.
revoke all on all tables in schema public from anon;

-- School names are not sensitive.
create policy read_schools on schools for select to authenticated using (true);
create policy read_years on school_years for select to authenticated using (true);

create policy own_profile_read on profiles for select to authenticated using (id = auth.uid());
create policy own_profile_update on profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
revoke update on profiles from authenticated;
grant update (display_name, language) on profiles to authenticated;

create policy class_read on classes for select to authenticated
  using (teacher_id = auth.uid() or private.family_sees_class(id));
create policy class_insert on classes for insert to authenticated
  with check (teacher_id = auth.uid() and private.is_teacher());
create policy class_update on classes for update to authenticated
  using (teacher_id = auth.uid()) with check (teacher_id = auth.uid());

create policy learner_read on learners for select to authenticated using (private.can_view_learner(id));
create policy learner_insert on learners for insert to authenticated with check (private.is_teacher());
create policy learner_update on learners for update to authenticated using (private.teaches_learner(id));
-- Account links (user_id) are set only by server functions.
revoke update on learners from authenticated;
grant update (last_name, first_name, middle_name, sex, lrn) on learners to authenticated;

create policy enrollment_teacher_read on enrollments for select to authenticated using (private.is_class_teacher(class_id));
create policy enrollment_teacher_insert on enrollments for insert to authenticated
  with check (private.is_class_teacher(class_id) and not private.enrolled_with_other_teacher(learner_id));
create policy enrollment_teacher_update on enrollments for update to authenticated
  using (private.is_class_teacher(class_id)) with check (private.is_class_teacher(class_id));
create policy enrollment_teacher_delete on enrollments for delete to authenticated using (private.is_class_teacher(class_id));
create policy enrollment_family on enrollments for select to authenticated using (private.is_family(learner_id));
revoke update on enrollments from authenticated;
grant update (joined_on, left_on, leave_reason) on enrollments to authenticated;

create policy guardian_own_read on guardians for select to authenticated using (user_id = auth.uid());
create policy guardian_own_consent on guardians for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy guardian_teacher_read on guardians for select to authenticated using (private.teaches_learner(learner_id));
create policy guardian_teacher_revoke on guardians for delete to authenticated using (private.teaches_learner(learner_id));
revoke insert, update on guardians from authenticated;
grant update (consent_at, consent_version) on guardians to authenticated;

-- Login codes are only handled by server functions (service role).
revoke all on login_codes from authenticated;

-- A card is never reassigned or deleted (taps are matched to cards); a lost card is deactivated.
create policy card_teacher_read on cards for select to authenticated using (private.teaches_learner(learner_id));
create policy card_teacher_insert on cards for insert to authenticated with check (private.teaches_learner(learner_id));
create policy card_teacher_update on cards for update to authenticated
  using (private.teaches_learner(learner_id)) with check (private.teaches_learner(learner_id));
revoke update, delete on cards from authenticated;
grant update (active, replaced_at) on cards to authenticated;

create policy device_teacher_read on devices for select to authenticated using (private.is_class_teacher(class_id));
revoke all on devices from authenticated;
grant select (id, class_id, firmware, last_seen_at) on devices to authenticated;

-- Window changes apply from today forward; past days keep the windows they had (spec §7.1).
create policy windows_teacher_read on tap_windows for select to authenticated using (private.is_class_teacher(class_id));
create policy windows_teacher_insert on tap_windows for insert to authenticated
  with check (private.is_class_teacher(class_id) and effective_from >= private.manila_today());
create policy windows_teacher_update on tap_windows for update to authenticated
  using (private.is_class_teacher(class_id) and effective_from >= private.manila_today())
  with check (private.is_class_teacher(class_id) and effective_from >= private.manila_today());
create policy windows_teacher_delete on tap_windows for delete to authenticated
  using (private.is_class_teacher(class_id) and effective_from >= private.manila_today());
create policy windows_family on tap_windows for select to authenticated using (private.family_sees_class(class_id));

-- Taps arrive only through the `tap` server function (service role).
create policy taps_teacher on taps for select to authenticated using (private.teaches_device(device_id));
create policy taps_family on taps for select to authenticated using (private.family_owns_card(card_uid));
revoke insert, update, delete on taps from authenticated;

create policy corrections_teacher_read on attendance_corrections for select to authenticated
  using (private.is_class_teacher(class_id));
create policy corrections_teacher_insert on attendance_corrections for insert to authenticated
  with check (private.is_class_teacher(class_id) and private.teaches_learner(learner_id) and created_by = auth.uid());
create policy corrections_family on attendance_corrections for select to authenticated using (private.is_family(learner_id));
revoke update, delete on attendance_corrections from authenticated;

create policy calendar_teacher_read on calendar_days for select to authenticated using (private.teaches_in_year(school_year_id));
create policy calendar_admin on calendar_days for all to authenticated
  using (private.is_year_admin(school_year_id)) with check (private.is_year_admin(school_year_id));
create policy calendar_family on calendar_days for select to authenticated using (private.family_in_year(school_year_id));

create policy plans_teacher on seat_plans for all to authenticated
  using (private.is_class_teacher(class_id)) with check (private.is_class_teacher(class_id));
create policy plans_family on seat_plans for select to authenticated using (private.family_sees_class(class_id));

-- Seat assignments name other children, so families do not get them.
create policy seats_teacher on seats for all to authenticated
  using (private.teaches_plan(plan_id)) with check (private.teaches_plan(plan_id));

create policy audit_teacher on audit_log for select to authenticated
  using (actor = auth.uid()
         or private.is_class_teacher((coalesce(new, old) ->> 'class_id')::uuid));
revoke insert, update, delete on audit_log from authenticated;
