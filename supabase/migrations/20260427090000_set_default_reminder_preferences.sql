alter table public.reminder_preferences
  alter column das_monthly_enabled set default true,
  alter column dasn_annual_enabled set default true,
  alter column monthly_review_enabled set default false,
  alter column receipts_enabled set default false;
