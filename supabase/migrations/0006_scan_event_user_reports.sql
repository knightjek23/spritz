-- =====================================================================
-- 0006_scan_event_user_reports.sql
--
-- Lets users tell us "you missed this fragrance" after a no-match scan.
-- Existing scan_events rows already capture OCR-detected brand + name,
-- but that data is noisy by definition (the row is unmatched because OCR
-- didn't yield a confident lookup). User-typed corrections are the
-- highest-signal input we have for catalog expansion.
--
-- We extend scan_events in place rather than spinning up a separate
-- reports table — the data is naturally 1:1 with a scan attempt, and
-- the existing unmatched_scans_summary view becomes more powerful once
-- it can show "users said this is actually X" beside "OCR read Y".
-- =====================================================================

alter table public.scan_events
  add column if not exists user_reported_brand text,
  add column if not exists user_reported_name  text,
  add column if not exists user_reported_at    timestamptz;

-- Index for the operations dashboard query: "show me the most-frequently
-- requested fragrances from the last 30 days that we still don't have."
create index if not exists scan_events_user_reported_idx
  on public.scan_events (user_reported_at desc)
  where user_reported_at is not null;

-- Replace the summary view to surface user corrections alongside OCR output.
-- Same name, same primary keys — downstream readers keep working.
create or replace view public.unmatched_scans_summary as
select
  detected_brand,
  detected_name,
  -- User-typed corrections (most recent per detected pair), if any
  max(user_reported_brand) filter (where user_reported_brand is not null) as last_user_brand,
  max(user_reported_name)  filter (where user_reported_name  is not null) as last_user_name,
  count(*) as miss_count,
  count(user_reported_at)  as report_count,
  max(created_at) as last_miss_at
from public.scan_events
where matched_fragrance_id is null
  and (detected_name is not null or user_reported_name is not null)
group by detected_brand, detected_name
order by report_count desc, miss_count desc;
