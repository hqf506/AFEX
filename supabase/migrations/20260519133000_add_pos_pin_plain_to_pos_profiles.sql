alter table public.pos_profiles
  add column if not exists pos_pin_plain text;

comment on column public.pos_profiles.pos_pin_plain is
  'Plain POS PIN retained for admin display. Less secure than hash-only storage; required by AFEX user management UX.';
