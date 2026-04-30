alter table public.profiles
add column if not exists onboarding_tour_completed_at timestamptz;
