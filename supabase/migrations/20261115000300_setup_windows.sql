-- A class's first tap windows come from the setup wizard, dated the day setup was done.
-- If setup happened offline and syncs a day later, that date is already past; allow it for the
-- first batch only (every existing window has the same date), so past days still can't be rewritten.

create function private.only_windows_on(cid uuid, d date) returns boolean
language sql stable security definer set search_path = public as $$
  select not exists (select 1 from tap_windows where class_id = cid and effective_from <> d)
$$;
revoke execute on function private.only_windows_on(uuid, date) from public, anon;
grant execute on function private.only_windows_on(uuid, date) to authenticated;

drop policy windows_teacher_insert on tap_windows;
create policy windows_teacher_insert on tap_windows for insert to authenticated
  with check (private.is_class_teacher(class_id)
              and (effective_from >= private.manila_today() or private.only_windows_on(class_id, effective_from)));
