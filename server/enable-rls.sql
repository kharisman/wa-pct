-- Aktifkan Row Level Security (RLS) di SEMUA tabel skema public.
-- Aman untuk app ini: server konek pakai connection string user `postgres`
-- (lihat server/db.js), dan `postgres` otomatis BYPASS RLS — jadi aplikasi
-- tetap jalan normal. Yang tertutup hanya akses lewat anon/public key.
--
-- Cara pakai: buka Supabase Dashboard > SQL Editor > tempel semua ini > Run.
-- Bisa dijalankan berkali-kali (idempotent).

do $$
declare r record;
begin
  for r in
    select tablename
    from pg_tables
    where schemaname = 'public'
  loop
    execute format('alter table public.%I enable row level security;', r.tablename);
  end loop;
end $$;

-- Cek hasil: semua harus rowsecurity = true
select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
order by tablename;
