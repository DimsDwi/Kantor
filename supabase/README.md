# Status integrasi Supabase

Pada 8 Oktober 2026, migrasi `migrations/202610080001_foundation.sql` berhasil diterapkan ke proyek Supabase yang disediakan pemilik. Aplikasi lokal **masih menggunakan D1/R2**. Pembuatan tabel bukan berarti adapter aplikasi sudah beralih ke Supabase.

## Sudah diterapkan dan diuji

- Delapan tabel aplikasi: profiles, rooms, facilities, room_facilities, bookings, notifications, activity_logs, documents; seluruhnya memakai RLS.
- Tiga peran: employee, admin, superadmin. Admin mengelola ruangan/persetujuan, hanya superadmin yang dapat mengubah peran/status melalui RPC `admin_set_access`.
- Profil tidak bisa menaikkan perannya sendiri; RPC menolak perubahan akses diri sendiri dan menjaga superadmin aktif terakhir.
- GiST exclusion constraint mencegah jadwal pending/approved saling bertabrakan.
- Validasi kapasitas/jam/transisi, notifikasi pemohon, audit booking, proyeksi kalender tanpa data pribadi, dan bucket dokumen privat maksimal 5 MB.
- `verify-foundation.sql` diuji pada PostgreSQL Supabase menggunakan role authenticated dan klaim identitas berbeda. Privasi profil/booking, penolakan eskalasi peran, pembatasan perubahan ruangan, bentrok interval, availability, persetujuan, audit, serta pemisahan admin/superadmin berhasil. Seluruh fixture dibatalkan melalui ROLLBACK.

Pengujian belum mencakup dua koneksi bersamaan, JWT Auth sungguhan, atau unggahan Storage melalui HTTP. Validasi trigger memakai SECURITY DEFINER dengan search_path kosong agar kunci FOR SHARE dapat memeriksa ruangan tanpa bergantung pada hak UPDATE pegawai. Identitas dan transisi tetap diperiksa; fungsi tidak dapat dipanggil langsung oleh pengguna.

## Akun superadmin pertama

Pemilik membuat akun di Authentication → Users → Add user → Create new user dan mengisi kata sandinya sendiri. Setelah akun terkonfirmasi, pemilik menjalankan `bootstrap-superadmin.sql` dengan email yang tepat. Skrip menolak akun belum terkonfirmasi dan tidak mengambil peran dari user_metadata. Jangan commit kata sandi atau service-role key.

## Pekerjaan tersisa

1. Akun superadmin pertama sudah diprovisikan dan diverifikasi aktif melalui SQL Editor. Integrasi login aplikasi tetap diperlukan.
2. Implementasikan adapter Auth/PostgREST/Storage dan sesi yang aman dengan kontrak API UI yang sama. Publishable key tidak memberi akses Auth Admin API.
3. Lengkapi audit administrasi, penjagaan perubahan ruangan terhadap booking aktif, provisioning pengguna, lampiran transaksional, dan scheduler reminder/completed.
4. Seed ruangan UUID, konfigurasi redirect pemulihan dan email; uji JWT dua pegawai/admin/superadmin, konkurensi, unggahan, dan login UI sebelum mengaktifkan backend baru.
5. Nonaktifkan akun demo saat backend nyata diaktifkan.

`reference-migration.sql` adalah rancangan historis, bukan migrasi untuk dijalankan. Jangan menerapkan ulang foundation pada proyek ini; perubahan selanjutnya berupa migrasi tambahan.

Rujukan: [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [Auth users](https://supabase.com/docs/guides/auth/users), [redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls).
