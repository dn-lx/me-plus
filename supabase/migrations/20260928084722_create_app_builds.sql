
create table if not exists public.app_builds (
  id uuid primary key default gen_random_uuid(),
  app_key text not null default 'me-plus',
  platform text not null check (platform in ('android', 'ios', 'web')),
  version text not null,
  display_version text not null,
  channel text not null default 'dev',
  filename text not null,
  download_url text not null,
  git_sha text not null,
  source_branch text not null,
  build_status text not null default 'pending'
    check (build_status in ('pending', 'published', 'failed', 'superseded')),
  artifact_sha256 text,
  built_at timestamptz,
  published_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (app_key, platform, channel, version)
);

create index if not exists app_builds_platform_channel_published_idx
  on public.app_builds (platform, channel, published_at desc);

alter table public.app_builds enable row level security;

revoke all on table public.app_builds from anon, authenticated;
grant select on table public.app_builds to anon, authenticated;

drop policy if exists "published app builds are readable" on public.app_builds;
create policy "published app builds are readable"
  on public.app_builds
  for select
  to anon, authenticated
  using (build_status = 'published');
