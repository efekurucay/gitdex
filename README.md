<div align="center">
  <img src="icons/icon128.png" alt="GitHub to NotebookLM Logo" width="96" height="96" />

# GitHub to NotebookLM

GitHub repolarini NotebookLM'e uygun, temiz ve tasinabilir `.txt` paketlerine ceviren Chrome extension.

![Open Source](https://img.shields.io/badge/Open%20Source-Yes-22c55e?style=for-the-badge)
![Manifest V3](https://img.shields.io/badge/Chrome%20Extension-MV3-4285F4?style=for-the-badge&logo=googlechrome&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-ES202x-f7df1e?style=for-the-badge&logo=javascript&logoColor=111)
![License MIT](https://img.shields.io/badge/License-MIT-a855f7?style=for-the-badge)
![PRs Welcome](https://img.shields.io/badge/PRs-Welcome-0ea5e9?style=for-the-badge)

</div>

---

## Nedir?

`GitHub to NotebookLM`, bir GitHub reposunu analiz ederek NotebookLM tarafinda kolay tuketilecek metin dosyalarina donusturur. Ciktiyi tek bir ZIP dosyasi olarak indirir ve istenirse NotebookLM'e otomatik yuklemeyi dener.

Ozellikle teknik dokumantasyon, kod analizi ve AI destekli proje inceleme akislari icin tasarlanmistir.

## One Cikan Ozellikler

- Public repo URL'sinden dosya agacini GitHub API ile ceker
- Her dosya blogunun basina relative dosya yolunu ekler
- Root dosyalarini ayri `.txt`, alt klasorleri top-level klasor bazinda birlesik `.txt` uretir
- Ciktilari tek bir `owner_repo.zip` icine paketler
- `git/trees?recursive=1` sonuclari truncated olursa otomatik `contents` API fallback'i yapar
- Binary dosyalari, `.git/` ve (opsiyonel) `node_modules/` klasorlerini atlar
- Token bilgisini `chrome.storage.session` icinde sadece aktif oturum sureince tutar
- Uzun surecen islerde ilerleme + tahmini kalan sure (ETA) gosterir
- NotebookLM sekmesine gecip `input[type=file]` uzerinden otomatik yukleme dener

## Kurulum

1. Repoyu klonla veya ZIP olarak indir
2. Chrome'da `chrome://extensions` sayfasini ac
3. **Developer mode** secenegini aktif et
4. **Load unpacked** butonuna tikla
5. Proje klasorunu sec

> Not: Ikon dosyalari proje icinde hazir gelir (`icons/icon16.png`, `icons/icon48.png`, `icons/icon128.png`).

## Hizli Kullanim

1. Extension popup'ini ac
2. GitHub repo URL'si gir (`https://github.com/owner/repo`)
3. Gerekirse GitHub tokeni ekle
4. Filtreleme seceneklerini ayarla
5. **Baslat** ile donusturme islemini calistir
6. Islem bitince:
   - **ZIP Olarak Indir** ile ciktiyi al, veya
   - **NotebookLM'e Aktar** ile otomatik yukleme dene
7. Otomatik yukleme olmazsa ZIP icindeki `.txt` dosyalarini manuel yukle

### NotebookLM entegrasyonu hakkinda

- Bir NotebookLM not defteri acik olmali
- Google arayuzu degisirse `input[type=file]` yakalama davranisi etkilenebilir
- Extension yuklendikten sonra NotebookLM sekmesini bir kez yenilemek iyi pratiktir

## Donusturme Mantigi

### Ornek girdi

```text
repo/
  README.md
  package.json
  src/
    index.ts
    utils/
      helper.ts
  agent/
    b.ts
```

### Ornek cikti

- `README.txt`
- `package.txt`
- `src.txt`
- `agent.txt`

`README.txt`

```text
README.md
# My Project
...
```

`src.txt`

```text
src/index.ts
import ...

---

src/utils/helper.ts
export function ...
```

## Teknik Detaylar

- **Manifest**: MV3
- **Rate limit**: Tokensiz 60 istek/saat, tokenli 5000 istek/saat
- **ZIP olusturma**: Ek kutuphane olmadan browser icinde
- **NotebookLM upload stratejisi**:
  - `notebooklm-content.js` Shadow DOM dahil `input[type=file]` arar
  - Add/Upload benzeri butonlari heuristik olarak tetikler
  - `HTMLInputElement.prototype.files` setter ile dosya listesi enjekte eder

## Proje Dosyalari

| Dosya | Gorev |
|-------|-------|
| `manifest.json` | Chrome Extension manifesti |
| `popup.html` | Popup arayuzu |
| `popup.css` | Popup stilleri |
| `popup.js` | GitHub API, dosya donusturme, storage, indirme akisi |
| `zip.js` | ZIP olusturma yardimcilari |
| `background.js` | NotebookLM sekmesini bulma/acma, mesajlasma |
| `notebooklm-content.js` | NotebookLM sayfasinda dosya inputuna aktarim |

## Katki

Katkilar acik. Issue acabilir, iyilestirme onerebilir veya PR gonderebilirsin.

Onerilen akis:

1. Fork al
2. Yeni branch ac (`feature/xxx`)
3. Degisikligini yap
4. Commit + push
5. Pull Request olustur

## Lisans

Bu proje **MIT** lisansi ile dagitilmaktadir.
