alter table public.announcements
  drop constraint if exists announcements_status_check;

alter table public.announcements
  add constraint announcements_status_check
  check (status in ('draft', 'ready', 'sent', 'archived'));

alter table public.announcements
  add column if not exists sent_at timestamptz null;

alter table public.announcement_recipients
  add column if not exists sent_at timestamptz null,
  add column if not exists error_message text null;

notify pgrst, 'reload schema';
