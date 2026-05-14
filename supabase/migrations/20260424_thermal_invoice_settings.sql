alter table public.system_settings
add column if not exists thermal_invoice_brand_name text,
add column if not exists thermal_invoice_branch_name text,
add column if not exists thermal_invoice_paper_width text default '80mm',
add column if not exists thermal_invoice_show_customer_phone boolean default true,
add column if not exists thermal_invoice_show_payment_method boolean default true,
add column if not exists thermal_invoice_show_note boolean default true,
add column if not exists thermal_invoice_note text,
add column if not exists thermal_invoice_footer_message text,
add column if not exists thermal_invoice_show_whatsapp boolean default true,
add column if not exists thermal_invoice_show_instagram boolean default false,
add column if not exists thermal_invoice_show_tiktok boolean default false,
add column if not exists thermal_invoice_show_google_review boolean default true,
add column if not exists thermal_invoice_show_map boolean default true;
