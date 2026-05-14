alter table public.system_settings
add column if not exists digital_invoice_brand_background_color text,
add column if not exists digital_invoice_brand_text_color text;
