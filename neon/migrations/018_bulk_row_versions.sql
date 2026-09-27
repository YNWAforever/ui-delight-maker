alter table tasks add column if not exists row_version integer not null default 0;
alter table leads add column if not exists row_version integer not null default 0;

create or replace function bump_bulk_row_version()
returns trigger language plpgsql as $$
begin
  new.row_version := old.row_version + 1;
  return new;
end;
$$;

drop trigger if exists tasks_bulk_row_version on tasks;
create trigger tasks_bulk_row_version
before update on tasks for each row execute function bump_bulk_row_version();

drop trigger if exists leads_bulk_row_version on leads;
create trigger leads_bulk_row_version
before update on leads for each row execute function bump_bulk_row_version();
