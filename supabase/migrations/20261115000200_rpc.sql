-- Server functions for what row-level security cannot do safely in one step (plan 2a).
-- Both are idempotent by their client-supplied ids, so the app's outbox can retry them.

create function public.setup_class(
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
end $$;

create function public.add_learner(
  p_learner_id uuid, p_class_id uuid, p_last text, p_first text, p_middle text, p_sex text, p_joined date
) returns uuid
language plpgsql security definer set search_path = public, private as $$
begin
  if not private.is_class_teacher(p_class_id) then
    raise exception 'not your class';
  end if;
  if private.enrolled_with_other_teacher(p_learner_id) then
    raise exception 'learner belongs to another teacher';
  end if;
  insert into learners (id, last_name, first_name, middle_name, sex)
    values (p_learner_id, p_last, p_first, p_middle, p_sex) on conflict (id) do nothing;
  insert into enrollments (class_id, learner_id, joined_on)
    values (p_class_id, p_learner_id, coalesce(p_joined, private.manila_today())) on conflict (class_id, learner_id) do nothing;
  return p_learner_id;
end $$;

revoke execute on function public.setup_class(uuid, text, uuid, text, date, date, uuid, int, text) from public, anon;
revoke execute on function public.add_learner(uuid, uuid, text, text, text, text, date) from public, anon;
grant execute on function public.setup_class(uuid, text, uuid, text, date, date, uuid, int, text) to authenticated;
grant execute on function public.add_learner(uuid, uuid, text, text, text, text, date) to authenticated;
