-- Obi-Chess initial schema
-- Run this in your Supabase SQL editor or via the CLI

-- Profiles table (extends auth.users)
create table if not exists profiles (
  id uuid references auth.users primary key,
  email text,
  display_name text,
  rating integer,
  created_at timestamptz default now()
);

-- Enable RLS
alter table profiles enable row level security;

-- Policies
create policy "Users can view own profile" on profiles
  for select using (auth.uid() = id);

create policy "Users can update own profile" on profiles
  for update using (auth.uid() = id);

create policy "Users can insert own profile" on profiles
  for insert with check (auth.uid() = id);

-- Games table
create table if not exists games (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade,
  pgn text not null,
  title text,
  analysis jsonb,
  created_at timestamptz default now()
);

alter table games enable row level security;

create policy "Users can view own games" on games
  for select using (auth.uid() = user_id);

create policy "Users can insert own games" on games
  for insert with check (auth.uid() = user_id);

create policy "Users can update own games" on games
  for update using (auth.uid() = user_id);

create policy "Users can delete own games" on games
  for delete using (auth.uid() = user_id);

-- Coach transcripts table
create table if not exists coach_transcripts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade,
  content text not null,
  focus_areas jsonb,
  created_at timestamptz default now()
);

alter table coach_transcripts enable row level security;

create policy "Users can view own transcripts" on coach_transcripts
  for select using (auth.uid() = user_id);

create policy "Users can insert own transcripts" on coach_transcripts
  for insert with check (auth.uid() = user_id);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email, '@', 1))
  );
  return new;
end;
$$ language plpgsql security definer;

-- Drop existing trigger if it exists
drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
