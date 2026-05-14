alter table public.system_settings
add column if not exists digital_invoice_instagram_enabled boolean default false,
add column if not exists digital_invoice_instagram_link text,
add column if not exists digital_invoice_tiktok_enabled boolean default false,
add column if not exists digital_invoice_tiktok_link text;
