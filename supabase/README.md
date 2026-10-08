# Status migrasi Supabase

File `reference-migration.sql` adalah rancangan terpisah untuk proyek Supabase baru. File ini **tidak dijalankan**, tidak menjadi bagian migrasi D1, dan belum diuji terhadap PostgreSQL/Supabase. Tidak cukup hanya memasukkan URL proyek agar demo beralih ke Supabase.

Rancangan mencakup delapan tabel aplikasi (termasuk documents), foreign keys, indeks, exclusion constraint GiST untuk interval booking [start,end), RLS, pembatasan kolom profile/notification, transisi booking, efek samping audit/notifikasi, proyeksi ketersediaan tanpa data pribadi, RPC perubahan akses admin, dan bucket dokumen privat.

Pekerjaan integrasi yang masih diperlukan:

1. Sediakan proyek Supabase beserta konfigurasi publik dan secret melalui penyimpanan secret; jangan menaruh service-role key di frontend.
2. Jalankan migrasi pada database pengujian dan uji RLS menggunakan dua JWT pegawai serta JWT admin; uji konkurensi database dengan dua koneksi.
3. Implementasikan adapter API Supabase Auth/PostgREST/Storage; ganti helper D1/session/password lokal, lalu pertahankan kontrak UI yang sama.
4. Buat akun menggunakan Supabase Auth Admin API server-side; isi profiles melalui jalur provisioning yang tidak mempercayai user_metadata.role. Bootstrap admin pertama dilakukan oleh pemilik proyek yang berwenang.
5. Lengkapi audit perubahan rooms/facilities/profiles, penjagaan perubahan jam/kapasitas/status rooms terhadap booking aktif, provisioning profile, reset password dengan SMTP, lampiran, dan scheduler completed/reminder sesuai aplikasi D1.
6. Migrasikan data, lakukan uji penerimaan, lalu nonaktifkan demo/password yang dipublikasikan di layar login.

Rujukan resmi:

- https://www.postgresql.org/docs/15/rangetypes.html — exclusion constraint untuk interval yang tidak boleh overlap.
- https://supabase.com/docs/guides/database/postgres/row-level-security — RLS dan identitas auth.uid().
- https://supabase.com/docs/guides/database/functions — hak akses fungsi dan SECURITY DEFINER.
- https://supabase.com/docs/guides/auth/managing-user-data — tabel profile yang mereferensikan auth.users.
