alter table public.announcements
  add column if not exists cta_label text null,
  add column if not exists cta_url text null;

notify pgrst, 'reload schema';
