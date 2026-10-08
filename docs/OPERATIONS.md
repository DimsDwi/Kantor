# Operasional dan aktivasi layanan

Repository: https://github.com/DimsDwi/Kantor

## Status 8 Oktober 2026

Kode berjalan lokal dengan D1/R2. Upload foto ruangan, laporan CSV melalui server, pemulihan kata sandi sekali pakai, dan endpoint pengingat sudah dibuat dan diuji. **Email nyata, jadwal cloud, Supabase, dan deployment online belum aktif.** Tidak ada proyek Supabase dari pengguna saat implementasi ini.

## Email reset password

Implementasi menggunakan API Resend. Konfigurasikan nilai berikut sebagai runtime secret/environment pada hosting, bukan di Git:

| Nama | Isi |
| --- | --- |
| `RESEND_API_KEY` | API key pengiriman email milik kantor |
| `MAIL_FROM` | Alamat pengirim dari domain yang sudah diverifikasi di Resend |
| `APP_ORIGIN` | Origin HTTPS aplikasi yang sudah terbit, tanpa path |

Aplikasi tidak menerima origin reset dari browser. Tautan memakai fragment `#token=...` agar token tidak ikut dikirim sebagai URL HTTP ke server. Halaman reset menghapus fragment dari bilah alamat setelah membaca token. Token acak disimpan sebagai hash SHA-256, berlaku 30 menit, hanya satu token aktif per pengguna. Permintaan dibatasi tiga per pasangan email/IP selama 15 menit. Reset atomik mengganti kata sandi, menghapus sesi, menyelesaikan permintaan, mencatat audit, dan mengonsumsi token. Perubahan kata sandi/akses oleh admin juga menghapus token lama.

Jika konfigurasi tidak lengkap atau pengiriman gagal, permintaan tetap masuk ke admin. Respons publik tidak membedakan email terdaftar dan tidak terdaftar. Tidak ada email sungguhan yang dikirim selama pengujian; pengujian recovery memakai transport simulasi dan database SQLite nyata.

Referensi implementasi: [API resmi Resend](https://github.com/resend/resend-openapi/blob/main/resend.yaml).

## Pengingat tanpa browser

Endpoint `POST /api/jobs/reminders` berjalan tanpa sesi pengguna. Header `Authorization: Bearer <CRON_SECRET>` wajib, dan rahasia minimal 32 karakter. Endpoint memproses pengingat yang mulai dalam 30 menit dan menandai peminjaman berakhir sebagai selesai. Deduplication key mencegah notifikasi berulang.

Workflow `.github/workflows/reminders.yml` sudah memiliki jadwal setiap lima menit, tetapi job hanya berjalan jika repository variable `REMINDERS_ENABLED` bernilai `true`. Urutan aktivasi:

1. Selesaikan deployment hingga ada origin HTTPS yang terverifikasi.
2. Simpan rahasia acak kuat yang sama sebagai runtime `CRON_SECRET` dan GitHub Actions secret `CRON_SECRET`.
3. Tetapkan GitHub Actions variable `APP_URL` ke origin tersebut.
4. Untuk Sites privat, scheduler juga membutuhkan token akses Sites yang masih berlaku pada GitHub Actions secret `SITES_ACCESS_TOKEN`. Rahasia ini hanya dikirim ke origin `APP_URL`; pengalihan HTTP ditolak. Kelola masa berlaku/rotasinya sesuai layanan hosting.
5. Baru aktifkan `REMINDERS_ENABLED=true`, jalankan workflow manual, dan periksa status berhasil serta notifikasi tersimpan.

GitHub Actions terjadwal dapat terlambat; ini bukan jaminan eksekusi tepat menit. Untuk kebutuhan operasional dengan jaminan waktu, gunakan scheduler server yang dikelola kantor dan panggil endpoint yang sama. Lihat [jadwal GitHub Actions](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax) dan [secrets](https://docs.github.com/en/actions/concepts/security/secrets).

## Pengujian lokal fitur scheduler

Buat `.dev.vars` pada root project dengan `CRON_SECRET` acak minimal 32 karakter, lalu restart dev server. Berkas ini diabaikan Git. `tests/features.mjs` membaca hanya secret lokal tersebut untuk memeriksa endpoint; jangan gunakan secret produksi pada pengujian lokal.

Terapkan `drizzle/0003_password_recovery.sql` sekali pada database lokal yang sudah memakai migrasi 0000–0002. Untuk database baru, ikuti seluruh urutan pada README. Jangan menerapkan ulang migrasi yang telah berhasil.

## Kendala deployment Sites

Percobaan versi pertama gagal dengan `incomplete input: SQLITE_ERROR`. Panggilan ringkasan database tidak menampilkan binding, dan layanan belum mengungkap migrasi gagal atau batas migrasi yang sudah diterapkan.

- Project: `appgprj_6ac5efcd084c8191a3578d6ce6fe5e2d`
- Versi gagal: `appgprj_6ac5efcd084c8191a3578d6ce6fe5e2d~appgver_c94fae15bef88191b5f0a0295b2af197`
- Deployment gagal: `appgdep_6ac6e83d6e808191ae5f8391543ec2b3`

Migrasi lama dan metadata 0000–0002 tidak diubah. Migrasi 0003 hanya menambah token recovery dan belum dikirim ke database cloud. Jangan mengulang arsip gagal atau mereset database untuk menebak perbaikannya. Diperlukan rincian kegagalan serta status migrasi dari hosting; setelah migrasi yang belum diterapkan dipastikan, perbaiki hanya bagian tersebut dan terbitkan versi baru. Belum ada URL produksi yang dapat dinyatakan berhasil.

## Supabase

Tidak ada proyek atau kredensial Supabase. `supabase/reference-migration.sql` tetap sebuah rancangan, belum dijalankan. Mengisi URL/key saja tidak mengganti backend D1: masih diperlukan adapter data/auth/storage, provisioning pengguna, penerapan migrasi, dan pengujian RLS lintas peran. Jangan menyebut otorisasi D1/API sebagai Supabase RLS.
