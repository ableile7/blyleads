-- Upload dedup probes leads by source_lead_id and primary_phone in .in()
-- batches. Without indexes those are full-table scans — noticeable now that
-- inventory is past 250k rows and growing with every upload.
create index if not exists leads_source_lead_id_idx on leads (source_lead_id);
create index if not exists leads_primary_phone_idx on leads (primary_phone);
