# RuangKita — Sistem Peminjaman Ruangan Kantor

Aplikasi demo full-stack untuk peminjaman ruangan kantor, dengan antarmuka berbahasa Indonesia. Source aplikasi, migrasi database aktif, pengujian, dan rancangan migrasi Supabase tersedia dalam folder ini. Repository: https://github.com/DimsDwi/Kantor.

Pembaruan 8 Oktober 2026: upload foto ruangan, CSV dari server, reset email sekali pakai, dan endpoint scheduler sudah diimplementasikan. Aktivasi layanan serta kendala deployment dijelaskan di [docs/OPERATIONS.md](docs/OPERATIONS.md).

## Status implementasi

Demo menggunakan **React 19 + TypeScript + Tailwind CSS + komponen dialog shadcn/Radix + Lucide**, backend **Cloudflare Worker/Vinext**, database relasional **Cloudflare D1**, dan penyimpanan dokumen privat **R2**. Data aplikasi tidak disimpan di localStorage. Peran dan kepemilikan diperiksa oleh API pada setiap permintaan; trigger database menjaga konsistensi jadwal dan perubahan status.

**Supabase/PostgreSQL/Auth/Storage/RLS belum terhubung atau diuji secara live.** Tidak ada proyek atau kredensial Supabase yang diberikan. `supabase/reference-migration.sql` merupakan rancangan untuk migrasi, bukan backend yang sedang dipakai. D1 tidak memiliki PostgreSQL RLS; otorisasi server dan trigger D1 tidak disebut sebagai RLS.

## Coba demo

| Peran | Email | Kata sandi |
| --- | --- | --- |
| Pegawai | ayu@ruangkita.demo | RuangKita!2026 |
| Admin | raka@ruangkita.demo | RuangKita!2026 |

Tombol **Akun pegawai** dan **Akun admin** mengisi formulir login. Klik **Masuk ke RuangKita** untuk masuk. Semua identitas, nomor telepon, dan kegiatan merupakan data fiktif. Foto ruangan adalah ilustrasi.

1. Masuk sebagai pegawai, buka **Direktori Ruangan**, pilih ruangan, dan periksa ketersediaan.
2. Klik **Ajukan Peminjaman**. Pilih tanggal mendatang dan waktu di antara 08:00–18:00 SGT, isi peserta, tujuan, dan kontak. Dokumen PDF/JPG/PNG bersifat opsional (maksimal 5 MB).
3. Tinjau ringkasan, lalu kirim. Status menjadi **Menunggu** dan slot langsung ditahan.
4. Keluar, masuk sebagai admin, buka **Semua Pengajuan**, lalu setujui atau tolak. Penolakan memerlukan alasan.
5. Masuk kembali sebagai pegawai untuk melihat status dan notifikasi.
6. Coba kalender, pengelolaan ruangan/fasilitas/pengguna, laporan, ekspor CSV, dan log aktivitas.

## Fitur

- Login email/kata sandi, tampil/sembunyikan kata sandi, sesi yang dapat diingat, logout, penggantian kata sandi, akun aktif/nonaktif, pembatasan percobaan login.
- Pemulihan akses melalui tautan email sekali pakai, berlaku 30 menit, dengan token yang disimpan sebagai hash, pembatasan permintaan, dan pengakhiran semua sesi setelah reset. Resend perlu dikonfigurasi untuk pengiriman nyata. Jika belum dikonfigurasi atau pengiriman gagal, permintaan ditangani admin.
- Dashboard pegawai dan admin, katalog dengan pencarian/filter, detail ruangan, kalender ketersediaan, formulir dan konfirmasi dua langkah.
- Pending, approved, rejected, cancelled, completed; persetujuan/penolakan, pembatalan sebelum mulai, notifikasi dan audit atomik.
- Kalender bulan/minggu/hari. Jadwal bersama hanya berisi ruangan, tanggal, waktu, dan status; tujuan/kontak/pemilik tidak dibocorkan kepada pegawai lain.
- Dokumen pendukung disimpan di R2, metadata di D1. Unduhan memerlukan akun pemilik atau admin; tipe berkas dan signature dasar diperiksa.
- Kelola ruangan (tambah, lihat, ubah, nonaktifkan, perawatan), upload foto PNG/JPG maksimal 5 MB ke R2, fasilitas, pengguna/peran/status; profil pribadi dan penggantian kata sandi.
- Laporan dengan rentang tanggal, gedung, ruangan, departemen, status; CSV dari endpoint khusus admin dengan filter di server, header unduhan, dan mitigasi formula injection. Unduhan browser sudah diverifikasi.
- Layout desktop, tablet, ponsel; dialog keyboard-friendly, label formulir, skeleton, empty state, error state, konfirmasi, toast, dan tombol loading.

## Aturan bisnis

- Slot aktif menggunakan interval setengah terbuka **[mulai, selesai)**: 09:00–11:00 boleh dilanjutkan 11:00–13:00, tetapi tidak boleh bertabrakan 10:00–12:00.
- Pending dan approved sama-sama menahan slot. Rejected/cancelled/completed tidak menahannya.
- SQLite/D1 menserialisasi penulisan. Trigger memeriksa konflik di dalam transaksi penulisan yang sama, sehingga dua permintaan bersamaan tidak dapat sama-sama memenangkan slot.
- Database memeriksa kapasitas, jam operasional, status ruangan, peserta bilangan bulat, tanggal/waktu, transisi status, dan aktor persetujuan/pembatalan. API tetap wajib menjadi satu-satunya jalur akses aplikasi ke D1.
- Ruangan tidak dapat dinonaktifkan atau diubah kapasitas/jamnya apabila perubahan mengganggu pengajuan aktif.
- Minimal satu administrator aktif dipertahankan. Admin tidak dapat mengubah peran/status akunnya sendiri melalui menu Pengguna.
- Zona waktu kantor: **Asia/Singapore / UTC+8 (SGT)**. Semua perhitungan jadwal menggunakan zona ini secara eksplisit.

## Notifikasi berbasis waktu

Saat aplikasi terbuka, data diperbarui setiap 30 detik. Permintaan state menjalankan pemrosesan booking selesai dan pengingat untuk booking yang mulai dalam 30 menit. Notifikasi dideduplikasi dan tersimpan di database.

Endpoint `POST /api/jobs/reminders` memproses pengingat tanpa sesi browser dan dilindungi `CRON_SECRET`. Workflow GitHub Actions setiap lima menit telah tersedia, tetapi **belum diaktifkan** karena URL produksi belum berhasil terbit dan secrets belum diisi. Lihat panduan operasi. Tanpa konfigurasi tersebut, pemrosesan tetap bergantung pada permintaan aplikasi.

## Menjalankan secara lokal

Dibutuhkan Node.js >=22.13 dengan dukungan `node:sqlite`; CI memakai Node 22 terbaru. Instal dependensi menggunakan lockfile:

```powershell
npm ci
npm run build
```

Terapkan setiap migrasi **sekali**, berurutan, pada database lokal baru:

```powershell
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_plain_purple_man.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0001_booking_guards.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0002_validation_guards.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0003_password_recovery.sql
npm run dev
```

Buka alamat lokal yang tercetak (normalnya `http://127.0.0.1:5173`). Data demo diisi sekali saat aplikasi dibuka. Database lokal berada di `.wrangler/state`, terpisah dari database situs yang diterbitkan. Jangan menjalankan ulang file migrasi yang sudah diterapkan.

Jika shim npm Windows bermasalah, jalankan entrypoint npm melalui Node dari instalasi Node Anda, atau `node scripts/run-framework.mjs dev` untuk preview. Perubahan CSS tertentu dapat memerlukan restart preview pada versi Vinext yang digunakan.

## Pengujian

```powershell
node node_modules/typescript/bin/tsc --noEmit
node tests/database.mjs
node --experimental-strip-types tests/csv.mjs
node --experimental-strip-types tests/recovery.mjs
node tests/api.mjs
node tests/features.mjs
```

`tests/api.mjs` dan `tests/features.mjs` hanya menerima localhost/127.0.0.1, memerlukan server berjalan (tes fitur juga memerlukan `CRON_SECRET` lokal, lihat panduan operasi), dan menambahkan data QA ke database lokal. Jangan arahkan ke data kantor. Bukti hasil ada di `qa/api-results.json` dan `qa/database-results.json`; catatan browser ada di `qa/README.md`.

## Struktur

- `app/`: halaman, form, kalender, laporan, CSS, komponen antarmuka.
- `app/api/[...path]/route.ts`: API dengan pemeriksaan sesi, peran, kepemilikan, validasi, dan pemetaan kesalahan.
- `lib/server.ts`: helper database, hash kata sandi, sesi, seed, notifikasi waktu.
- `db/schema.ts`, `drizzle/`: skema aktif D1 dan migrasi terurut. Migrasi produksi yang sudah diterapkan tidak boleh ditulis ulang.
- `tests/`, `qa/`: pengujian dan bukti hasil.
- `supabase/`: rancangan migrasi PostgreSQL/RLS dan catatan integrasi yang belum diaktifkan.

## Batas demo dan kesiapan operasional

Situs dipertahankan privat untuk pemilik. Akun dan kata sandi demo memang ditampilkan agar alur dua peran mudah dicoba; hapus akses demo serta bootstrap dan ganti kredensial sebelum menyimpan data kantor sungguhan. Demo belum boleh disebut implementasi Supabase/RLS yang selesai.

Penggunaan operasional juga memerlukan SMTP/SSO sesuai kebijakan kantor, scheduler mandiri, kebijakan retensi/audit, pemindaian malware dokumen (signature dasar bukan antivirus), backup, pagination untuk volume data besar, dan uji penerimaan dengan akun/ruangan kantor.

## Sumber foto

- Aleksandrs Karevs: https://unsplash.com/photos/a-conference-room-with-a-large-table-and-chairs-ZCDA1-cih6o
- Danielle Cerullo: https://unsplash.com/photos/white-and-gray-office-rolling-chairs-bIZJRVBLfOM
- Adrian Sulyok: https://unsplash.com/photos/a-conference-room-with-a-long-table-and-chairs-oTZXX7BUV4w
- Lisensi: https://unsplash.com/license
