---
title: "Checklist SEO & GEO yang Saya Pakai Saat Membangun Website"
description: "Checklist SEO teknis fase-per-fase yang ditulis dari sudut pandang developer — mencakup Core Web Vitals, GEO, schema markup, dan langkah-langkah pasca-launch."
pubDate: 2026-07-11
tags: ["seo", "geo", "web-development", "performance", "core-web-vitals"]
---

SEO punya reputasi misterius — seolah ada formula rahasia yang hanya dipahami orang marketing. Padahal, sebagian besar isinya cuma soal membangun situs dengan benar sejak awal dan memastikan Google bisa membaca apa yang kamu buat. Sesederhana itu.

Checklist ini adalah yang saya jalani setiap kali mau rilis sebuah situs. Dibagi jadi empat tahap: keputusan sebelum menulis satu baris kode pun, hal-hal yang ditangani saat development, hal baru seputar hasil pencarian berbasis AI, dan terakhir apa yang dilakukan setelah launch. Lewati satu tahap dan mungkin baik-baik saja jangka pendek, tapi nanti pasti ada harganya.

---

## Sebelum Menulis Kode

Keputusan di sini yang paling menyakitkan kalau salah. Keliru di sini dan kamu akan berurusan dengan redirect, refactor, dan migrasi URL enam bulan ke depan.

**HTTPS tidak bisa ditawar.** Google sudah memakai HTTPS sebagai sinyal ranking selama bertahun-tahun, dan browser sekarang aktif memperingatkan pengguna di situs HTTP biasa. Ambil sertifikat dari Let's Encrypt (gratis), dan setelah dapat, tambahkan header HSTS supaya browser berhenti mencoba HTTP sama sekali:

```
Strict-Transport-Security: max-age=31536000; includeSubDomains
```

Lalu cek browser console kamu untuk peringatan mixed-content — itu yang biasanya jadi masalah belakangan.

**Desain untuk mobile sejak awal, bukan belakangan.** Google merayapi versi mobile situsmu dan menggunakannya untuk ranking. Ini bukan soal "buat saja responsif." Maksudnya viewport terkecil harus jadi target desain utama kamu. Layout yang bekerja di lebar 375px lalu naik skala ke atas akan jauh lebih menguntungkan dibanding desain desktop yang dipaksa mengecil. Pakai Chrome DevTools device mode selama development, bukan cuma di akhir.

**Jaga URL tetap bersih.** Kedengarannya sudah jelas, tapi mengejutkan seberapa sering diabaikan. Singkat, huruf kecil, tanda hubung antar kata, tanpa parameter query untuk halaman konten permanen. Bandingkan `/blog/panduan-core-web-vitals` dengan `/page?id=482&category=seo-teknis` — satu memberitahu pengguna dan Google sesuatu yang berguna, yang satunya tidak. Setelah memilih struktur URL, pegang terus. Mengubah URL belakangan berarti pasang redirect, yang berarti kehilangan ekuitas tautan, yang berarti penurunan ranking.

**Setiap halaman penting harus bisa dicapai dalam tiga klik dari homepage.** Ini bukan aturan keras dari Google, ini cuma logis: kalau halaman terkubur enam level ke bawah, crawler jarang mengunjunginya dan pengguna hampir tidak pernah menemukannya. Sketsa dulu struktur situs sebelum membangun. Tambahkan breadcrumb juga — membantu crawler maupun manusia nyata memahami di mana mereka berada.

---

## SEO Teknis Saat Development

Di sinilah sebagian besar developer entah membangun fondasi yang kokoh, atau tanpa sadar membuat berantakan yang baru ketahuan berbulan-bulan kemudian.

**Satu `<h1>` per halaman.** Satu. Itu judul halaman. Tag `<h2>` mencakup topik-topik utama, `<h3>` mencakup sub-topik di bawahnya, dan seterusnya. Jangan lompat dari `<h1>` langsung ke `<h3>` — screen reader dan mesin pencari memakai struktur heading sama seperti pembaca yang memindai dokumen. Kalau hierarki heading kamu rusak, konten jadi lebih sulit dipahami oleh keduanya.

**Meta tag yang benar-benar bekerja.** Setiap halaman butuh `<title>` yang unik (di bawah 60 karakter, atau akan terpotong di hasil pencarian) dan `<meta description>` (di bawah 155 karakter). Deskripsi tidak langsung mempengaruhi ranking, tapi itulah yang dilihat orang di hasil pencarian sebelum mengklik. Tulis seperti harus mendapatkan klik, bukan sekadar merangkum halaman.

```html
<title>Panduan Core Web Vitals untuk Developer (2026) | Kodingus</title>
<meta name="description" content="LCP, INP, dan CLS dijelaskan dengan penyebab nyata dan solusinya — hal-hal yang benar-benar ditandai PageSpeed Insights di situs production." />
```

**Canonical tag di setiap halaman.** Kalau situsmu bisa diakses di `https://example.com/blog/post` dan `https://example.com/blog/post/`, atau dengan dan tanpa `www`, mesin pencari mungkin memperlakukan keduanya sebagai halaman berbeda dan membagi sinyal ranking. Canonical tag memberi tahu Google mana versi yang asli:

```html
<link rel="canonical" href="https://example.com/blog/post" />
```

Taruh ini di `<head>` di setiap halaman. Otomatis — jangan mikirin per-halaman.

**Gambar biasanya masalah performa terbesar di halaman manapun.** Default-nya buruk. Ini yang benar-benar berpengaruh:

- Pakai WebP atau AVIF, bukan JPEG/PNG. WebP sekitar 30% lebih kecil untuk kualitas yang sama dan berjalan di semua browser yang layak dipedulikan.
- Kompres sebelum upload. Tools seperti Squoosh atau Sharp melakukan ini dengan baik. Target di bawah 100 KB untuk sebagian besar gambar.
- Selalu sertakan `alt` text yang deskriptif. Bukan cuma untuk aksesibilitas (meski itu penting juga) — mesin pencari menggunakannya untuk memahami isi gambar.
- Tambahkan `loading="lazy"` ke setiap gambar yang tidak berada di layar pertama. Satu atribut yang secara nyata mempercepat loading awal.

**Core Web Vitals adalah sinyal ranking nyata, bukan saran.** Google mengukur tiga hal:

| Metrik | Yang sebenarnya diukur | Target |
|---|---|---|
| LCP (Largest Contentful Paint) | Seberapa cepat konten utama loading | Di bawah 2,5 detik |
| INP (Interaction to Next Paint) | Seberapa cepat halaman merespons input pengguna | Di bawah 200ms |
| CLS (Cumulative Layout Shift) | Apakah konten melompat-lompat saat loading | Di bawah 0,1 |

Penyebab paling umum: LCP lambat biasanya gambar hero besar yang tidak dioptimalkan atau respons server yang lambat. INP tinggi biasanya terlalu banyak JavaScript berjalan di main thread. CLS hampir selalu gambar tanpa atribut width/height yang eksplisit, atau konten yang loading terlambat dan mendorong hal lain ke bawah.

Ukur dengan PageSpeed Insights sebelum launch, dan cek laporan Core Web Vitals di Google Search Console untuk data pengguna nyata setelahnya.

---

## Membuat Konten Bekerja dengan Pencarian AI (GEO)

Ini wilayah yang lebih baru. Selain hanya ranking di sepuluh link biru, konten sekarang perlu cukup mudah dipahami oleh sistem AI — Google AI Overviews, Perplexity, ChatGPT — untuk ditarik secara akurat. Istilah "GEO" (Generative Engine Optimization) mulai populer untuk ini. Ide dasarnya cukup sederhana: tulis dengan jelas, susun data kamu, dan buktikan bahwa kamu tahu yang kamu bicarakan.

**Schema markup memberitahu AI apa konten kamu, bukan hanya apa yang dikatakannya.** Tambahkan data terstruktur JSON-LD dalam tag script di head halaman. Untuk posting blog, schema Article adalah dasarnya:

```json
{
  "@context": "https://schema.org",
  "@type": "Article",
  "headline": "Judul Postingan Kamu",
  "author": { "@type": "Person", "name": "Namamu" },
  "datePublished": "2026-07-11",
  "publisher": {
    "@type": "Organization",
    "name": "Kodingus",
    "url": "https://kodingus.com"
  }
}
```

Untuk konten bergaya FAQ, schema FAQPage secara signifikan meningkatkan peluang muncul di AI Overviews:

```json
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [{
    "@type": "Question",
    "name": "Apa itu GEO dalam SEO?",
    "acceptedAnswer": {
      "@type": "Answer",
      "text": "GEO adalah singkatan dari Generative Engine Optimization, yaitu praktik menulis dan menyusun konten agar sistem AI dapat mengekstrak dan mengutipnya secara akurat."
    }
  }]
}
```

**Susun konten seperti kamu sedang menjawab pertanyaan.** AI Overviews dan featured snippet hampir selalu menarik dari halaman di mana sebuah heading membingkai pertanyaan dan paragraf pertama langsung menjawabnya. Kalau `<h2>` kamu adalah "Apa itu Core Web Vitals?" dan dua kalimat berikutnya memberikan jawaban lengkap, itulah yang diekstrak. Kalau heading kamu adalah "Performa" dan paragraf berikutnya adalah intro yang samar, tidak ada yang berguna yang akan ditarik.

**E-E-A-T semakin penting.** Experience, Expertise, Authoritativeness, Trustworthiness — Google memakai kerangka ini untuk mengevaluasi kualitas konten, terutama untuk hal-hal yang menyentuh kesehatan, uang, atau keputusan penting. Dalam praktiknya: tulis bio penulis, tautkan ke sumber-sumbermu, punya halaman kontak dan kebijakan privasi, dan jangan buat klaim yang tidak bisa kamu dukung. Terdengar basic, tapi banyak blog developer yang melewati ini sepenuhnya.

**Pakai struktur HTML yang sesungguhnya untuk konten penting.** List, tabel, langkah-langkah bernomor — ini harus jadi elemen `<ul>`, `<ol>`, dan `<table>` yang asli, bukan div yang distyling agar terlihat seperti itu. Crawler mesin pencari maupun sistem AI mengurai HTML terstruktur jauh lebih andal daripada dinding teks. Hindari menaruh informasi kritis di dalam konten yang dirender JavaScript; banyak crawler tidak akan mengeksekusi script kamu.

---

## Setelah Launch: Proses Pengindeksan

Kamu bisa melakukan semua hal lain dengan benar dan tetap punya situs yang tidak bisa ditemukan atau tidak mau diindeks Google. Tahap terakhir ini tentang memastikan itu tidak terjadi.

**Periksa `robots.txt` sebelum hal lain apapun.** File ini berada di `https://domainmu.com/robots.txt` dan memberi tahu crawler apa yang bisa mereka akses. Kesalahan paling umum yang saya lihat adalah `robots.txt` lingkungan staging yang tidak sengaja ter-deploy ke production dengan `Disallow: /` — yang memblokir Google dari seluruh situsmu. Buka, baca, pastikan di production terlihat seperti ini:

```
User-agent: *
Disallow:

Sitemap: https://domainmu.com/sitemap.xml
```

**Buat XML sitemap yang bersih.** Sertakan hanya halaman yang mengembalikan HTTP 200 dan benar-benar berisi konten berguna. Tidak ada 404, tidak ada redirect, tidak ada halaman admin. Kalau pakai Astro, integrasi `@astrojs/sitemap` menangani ini secara otomatis. Submit URL sitemap di Google Search Console di bagian Sitemaps.

**Internal linking lebih penting dari yang kebanyakan orang sadari.** Begitulah cara Google menemukan halaman baru dan bagaimana "otoritas tautan" mengalir melalui situsmu. Teks anchor juga penting — "baca panduan Core Web Vitals" lebih berguna bagi Google daripada "klik di sini." Setiap halaman yang kamu publikasikan harus ditautkan dari setidaknya satu halaman lain, idealnya dari sesuatu yang mendapat traffic nyata.

**Google Search Console adalah home base pasca-launch.** Setelah memverifikasi kepemilikan domain (metode DNS TXT record yang paling andal), submit sitemap dan mulai pakai URL Inspection tool. Untuk halaman apapun yang kamu publikasikan atau diperbarui secara signifikan, minta pengindeksan secara manual — jangan menunggu crawl terjadwal berikutnya, yang bisa memakan waktu berhari-hari atau berminggu-minggu. Periksa laporan Coverage secara rutin untuk halaman yang dikecualikan atau error, dan pantau laporan Core Web Vitals untuk data performa pengguna nyata yang tidak bisa ditunjukkan Lighthouse.

---

## Checklist Cepat

Untuk di-copy ke project tracker:

**Sebelum dev**
- [ ] SSL terpasang, HSTS header aktif
- [ ] Layout mobile-first dicek di 375px
- [ ] Struktur URL diputuskan: huruf kecil, tanda hubung, tanpa param yang tidak perlu
- [ ] Hierarki situs dipetakan, maks 3 klik dari homepage, breadcrumb direncanakan

**Saat dev**
- [ ] Satu `<h1>` per halaman, hierarki heading berurutan
- [ ] Title unik (≤60 karakter) dan meta description (≤155 karakter) di setiap halaman
- [ ] Canonical tag di `<head>` setiap halaman
- [ ] Gambar: WebP/AVIF, dikompres di bawah 100 KB, alt text deskriptif, lazy loading
- [ ] LCP di bawah 2,5 detik, INP di bawah 200ms, CLS di bawah 0,1

**GEO**
- [ ] JSON-LD schema (Article, FAQPage sesuai kebutuhan)
- [ ] Heading diframing sebagai pertanyaan di mana konten menjawabnya
- [ ] Bio penulis ada, halaman kontak dan kebijakan privasi tersedia
- [ ] Data penting dalam HTML yang tepat: `<ul>`, `<ol>`, `<table>`

**Pasca-launch**
- [ ] `robots.txt` mengizinkan semua crawler di production
- [ ] Sitemap berisi URL HTTP 200 saja, sudah disubmit di GSC
- [ ] Internal link menggunakan anchor text yang deskriptif
- [ ] Domain terverifikasi di GSC, pengindeksan diminta untuk halaman baru

---

Tidak ada yang ajaib di sini. Ini cuma soal disiplin dalam cara kamu membangun. Situs yang secara konsisten mengungguli kompetitor tidak melakukan sesuatu yang eksotis — mereka melakukan hal-hal fundamental ini dengan baik, konsisten, dan terus-menerus.
