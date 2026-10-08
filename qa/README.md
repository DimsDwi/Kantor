# Hasil QA RuangKita

Pemeriksaan terakhir: 8 Oktober 2026 (Asia/Singapore).

## Pengujian otomatis

- API: **47/47 lulus**, lihat `api-results.json`.
- Database: **29/29 lulus**, lihat `database-results.json`.
- Ekspor CSV: **5/5 lulus**, lihat `csv-results.json`.
- Total: **81 pengujian lulus**, tanpa kegagalan pada hasil terakhir.

API mencakup sesi autentikasi, batas peran, kepemilikan data, validasi jadwal dan kapasitas, persetujuan/penolakan, pembatalan, notifikasi, file R2, pengelolaan pengguna/ruangan/fasilitas, audit, CSRF, idempotensi, dan dua pengajuan bersamaan (tepat satu berhasil dan satu konflik).

Pengujian database menerapkan ketiga migrasi pada SQLite dan memeriksa constraint serta trigger secara langsung. Ini bukan pengujian PostgreSQL atau Supabase RLS. Pengujian CSV memeriksa BOM, CRLF, kutip, koma, baris baru, Unicode, nilai kosong, dan netralisasi formula spreadsheet.

## Pemeriksaan browser

- Desktop: login pegawai, dashboard, pencarian kosong, direktori dan detail ruangan.
- Pengajuan dua langkah: berhasil membuat jadwal 12 Oktober 2026 pukul 13.00–14.30, 4 peserta; konfirmasi dan daftar menampilkan tanggal, jam, serta durasi yang sama.
- Ponsel 390×844: menu, daftar pengajuan berupa kartu, kalender bulanan dan agenda harian.
- Tablet 820×1180: kalender mingguan dan laporan.
- Admin: login, cari pengajuan pegawai, setujui melalui konfirmasi; tolak pengajuan lain dengan alasan wajib; laporan mengikuti rentang tanggal dan menghitung durasi 1,5 jam dengan benar.
- Diperbaiki saat QA: input tanggal/jam pada browser tidak selalu memicu perubahan state. Handler input ditambahkan, lalu alur pengajuan diperiksa ulang hingga berhasil.

Tombol ekspor CSV telah diklik, tetapi mekanisme penangkapan unduhan browser mengalami timeout. Isi CSV diverifikasi melalui lima tes otomatis; penyimpanan berkas melalui browser belum dapat dikonfirmasi. Pembukaan ulang tab pratinjau kemudian ditolak kebijakan browser. Tidak ada klaim verifikasi browser produksi.

## Batas demo

Backend aktif adalah D1 SQLite + R2 + sesi email/kata sandi khusus. Otorisasi ditegakkan pada API dan trigger database; Supabase Auth/Storage/RLS belum terhubung. Direktori `supabase` berisi rancangan migrasi, bukan backend aktif atau migrasi yang telah diuji.

Permintaan lupa kata sandi masuk ke admin, tanpa SMTP. Pengingat dan penyelesaian otomatis diproses ketika data aplikasi diminta; belum ada scheduler latar belakang. Data QA lokal tidak dibawa ke basis data demo yang dipublikasikan.
