# Backend

Supabase: the Postgres schema with row-level security on every table and no client policies, one locked `security definer` function per state change, the Deno edge functions, private storage buckets and the scheduled jobs (spec sections 17, 18 and Appendix B to D).

Clients reach data only through the edge functions. Starts in M3.
