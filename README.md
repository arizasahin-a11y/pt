# Proje Faaliyeti Değerlendirme ve Raporlama Sistemi (PFDS)

Bu uygulama, okul projelerinin ve faaliyetlerinin raporlanmasını dijitalleştirmek için modern web teknolojileri ile geliştirilmiştir. Kullanıcılar faaliyet bilgilerini bir web formu aracılığıyla girer, yerel olarak saklar ve gerektiğinde orijinal PDF formatına sadık kalarak çıktı alabilirler.

## Öne Çıkan Özellikler

- **Modern ve Şık Arayüz:** Glassmorphism temalı, kullanıcı dostu ve hızlı veri girişi.
- **Yerel Veri Saklama:** IndexedDB teknolojisi ile verileriniz tarayıcınızda güvenle saklanır (çevrimdışı çalışabilir).
- **PDF Çıktısı:** `html2pdf.js` kütüphanesi kullanılarak, orijinal okul formunun mizanpajına %100 uyumlu PDF üretimi.
- **Dinamik Seçenekler:** "Diğer" seçeneği ile kullanıcı tarafından eklenebilen özel türler ve profiller.
- **GitHub Uyumlu:** Temiz kod yapısı ve kolay kurulum.

## Kurulum ve Çalıştırma

1.  Bu depoyu bilgisayarınıza klonlayın:
    ```bash
    git clone [REPO_URL]
    ```
2.  Klasörün içine girin ve `index.html` dosyasını herhangi bir modern tarayıcıda açın.
3.  Ek bir bağımlılık kurmanıza gerek yoktur; gerekli kütüphaneler CDN üzerinden yüklenir.

## GitHub'a Yükleme (Push)

Projeyi kendi GitHub deponuza göndermek için aşağıdaki komutları kullanabilirsiniz:

```bash
git remote add origin https://github.com/[KULLANICI_ADI]/[REPO_ADI].git
git branch -M main
git add .
git commit -m "İlk sürüm: Faaliyet raporlama sistemi hazır."
git push -u origin main
```

## Teknolojiler

- **Frontend:** Vanilla HTML5, CSS3 (Modern Flex/Grid, Glassmorphism).
- **Logic:** Vanilla JavaScript (ES6+).
- **Veri Tabanı:** Browser IndexedDB.
- **PDF Motoru:** html2pdf.js.

---
*Geliştiren: Antigravity AI Coding Assistant*
