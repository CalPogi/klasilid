-- Row-level security for teacher, parent, student and owner (spec §2, §11).
-- The owner role gets no policies: it reads nothing learner-related.

create function is_class_teacher(cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from classes where id = cid and teacher_id = auth.uid())
$$;

create function teaches_learner(lid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from enrollments e join classes c on c.id = e.class_id
                 where e.learner_id = lid and c.teacher_id = auth.uid())
$$;

create function is_teacher() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'teacher')
$$;

create function is_consented_guardian(lid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from guardians
                 where user_id = auth.uid() and learner_id = lid and consent_at is not null)
$$;

create function is_consented_student(lid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from learners l where l.id = lid and l.user_id = auth.uid())
     and exists (select 1 from guardians g where g.learner_id = lid and g.consent_at is not null)
$$;

create function is_family(lid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_consented_guardian(lid) or is_consented_student(lid)
$$;

create function can_view_learner(lid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select teaches_learner(lid) or is_family(lid)
$$;

-- A family member sees their learner's advisory class settings (windows, calendar, seat layout).
create function family_sees_class(cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from enrollments e join classes c on c.id = e.class_id
                 where e.class_id = cid and c.is_advisory and is_family(e.learner_id))
$$;

create function teaches_in_year(sy uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from classes where school_year_id = sy and teacher_id = auth.uid())
$$;

create function family_in_year(sy uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from classes c where c.school_year_id = sy and family_sees_class(c.id))
$$;

create function learner_of_card(card text) returns uuid
language sql stable security definer set search_path = public as $$
  select learner_id from cards where uid = card
$$;

create function class_of_device(dev text) returns uuid
language sql stable security definer set search_path = public as $$
  select class_id from devices where id = dev
$$;

create function class_of_plan(pid uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select class_id from seat_plans where id = pid
$$;

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
  using (teacher_id = auth.uid() or family_sees_class(id));
create policy class_insert on classes for insert to authenticated
  with check (teacher_id = auth.uid() and is_teacher());
create policy class_update on classes for update to authenticated
  using (teacher_id = auth.uid()) with check (teacher_id = auth.uid());

create policy learner_read on learners for select to authenticated using (can_view_learner(id));
create policy learner_insert on learners for insert to authenticated with check (is_teacher());
create policy learner_update on learners for update to authenticated using (teaches_learner(id));

create policy enrollment_teacher on enrollments for all to authenticated
  using (is_class_teacher(class_id)) with check (is_class_teacher(class_id));
create policy enrollment_family on enrollments for select to authenticated using (is_family(learner_id));

create policy guardian_own_read on guardians for select to authenticated using (user_id = auth.uid());
create policy guardian_own_consent on guardians for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy guardian_teacher_read on guardians for select to authenticated using (teaches_learner(learner_id));
create policy guardian_teacher_revoke on guardians for delete to authenticated using (teaches_learner(learner_id));
revoke insert, update on guardians from authenticated;
grant update (consent_at, consent_version) on guardians to authenticated;

-- Login codes are only handled by server functions (service role).
revoke all on login_codes from authenticated;

create policy card_teacher on cards for all to authenticated
  using (teaches_learner(learner_id)) with check (teaches_learner(learner_id));

create policy device_teacher_read on devices for select to authenticated using (is_class_teacher(class_id));
revoke all on devices from authenticated;
grant select (id, class_id, firmware, last_seen_at) on devices to authenticated;

create policy windows_teacher on tap_windows for all to authenticated
  using (is_class_teacher(class_id)) with check (is_class_teacher(class_id));
create policy windows_family on tap_windows for select to authenticated using (family_sees_class(class_id));

-- Taps arrive only through the `tap` server function (service role).
create policy taps_teacher on taps for select to authenticated using (is_class_teacher(class_of_device(device_id)));
create policy taps_family on taps for select to authenticated using (is_family(learner_of_card(card_uid)));
revoke insert, update, delete on taps from authenticated;

create policy corrections_teacher_read on attendance_corrections for select to authenticated
  using (is_class_teacher(class_id));
create policy corrections_teacher_insert on attendance_corrections for insert to authenticated
  with check (is_class_teacher(class_id) and teaches_learner(learner_id) and created_by = auth.uid());
create policy corrections_family on attendance_corrections for select to authenticated using (is_family(learner_id));
revoke update, delete on attendance_corrections from authenticated;

create policy calendar_teacher on calendar_days for all to authenticated
  using (teaches_in_year(school_year_id)) with check (teaches_in_year(school_year_id));
create policy calendar_family on calendar_days for select to authenticated using (family_in_year(school_year_id));

create policy plans_teacher on seat_plans for all to authenticated
  using (is_class_teacher(class_id)) with check (is_class_teacher(class_id));
create policy plans_family on seat_plans for select to authenticated using (family_sees_class(class_id));

-- Seat assignments name other children, so families do not get them.
create policy seats_teacher on seats for all to authenticated
  using (is_class_teacher(class_of_plan(plan_id))) with check (is_class_teacher(class_of_plan(plan_id)));

create policy audit_teacher on audit_log for select to authenticated
  using (actor = auth.uid()
         or is_class_teacher((coalesce(new, old) ->> 'class_id')::uuid));
revoke insert, update, delete on audit_log from authenticated;
