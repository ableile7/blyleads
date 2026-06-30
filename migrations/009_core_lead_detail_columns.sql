-- Core (mortgage protection) leads carry extra qualifying info that agents
-- need: borrower age, smoker/tobacco status, co-borrower, and health
-- conditions. These were being thrown away at upload (they were in the
-- uploader's DROP_KEYWORDS list) and there were no columns to hold them.
--
-- Add the columns. They're populated for any tier whose source file has them,
-- but only OUTPUT on downloads for the Core tiers (see leadExport.ts).

alter table leads add column if not exists age               text;
alter table leads add column if not exists smoker            text;
alter table leads add column if not exists co_borrower       text;
alter table leads add column if not exists health_conditions text;
