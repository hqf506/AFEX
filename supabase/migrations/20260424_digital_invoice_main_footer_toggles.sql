alter table public.system_settings
add column if not exists digital_invoice_whatsapp_enabled boolean default true,
add column if not exists digital_invoice_google_review_enabled boolean default true,
add column if not exists digital_invoice_map_enabled boolean default true;
