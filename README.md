# GitHub to NotebookLM

Bir public GitHub reposunu tek tikla NotebookLM'e hazir hale getiren Chrome extension.

## Ozellikler

- Herhangi bir public GitHub reposunu GitHub API uzerinden okur (klonlamaya gerek yok)
- Tum dosyalarin uzantisini `.txt` olarak degistirir
- Her dosyanin en ustune **relative dosya yolunu** header olarak ekler
- Alt klasorlerdeki tum dosyalari **tek bir .txt dosyasinda** birlestirir (klasor ismiyle)
- Root'taki dosyalar bireysel `.txt` olarak kalir
- Tek tikla tum dosyalari indirir
- Opsiyonel olarak NotebookLM'i otomatik acar

## Kurulum

1. Bu repoyu klonla veya ZIP olarak indir
2. Chrome'da `chrome://extensions` adresine git
3. **Developer mode**'u ac (sag ust)
4. **Load unpacked** tikla
5. Extension klasorunu sec
6. Extension hazir!

> **Not:** `icons/` klasorune 16x16, 48x48 ve 128x128 boyutlarinda PNG ikonlari eklemen gerekiyor.  
> Yoksa uzantinin yuklenmesinde sorun yasanmaz ama ikon gorsel olmaz.

## Kullanim

1. Herhangi bir public GitHub repo sayfasindayken extension ikonuna tikla
2. Repo URL'ini gir (ornek: `https://github.com/facebook/react`)
3. Secenekleri ayarla (node_modules, binary dosyalar vs.)
4. **Basla** butonuna tikla
5. Islem tamamlaninca **Dosyalari Indir** butonuyla txt dosyalarini indir
6. Indirilen klasordeki `.txt` dosyalarini NotebookLM'e yukle

## Dosya Yapisi Mantigi

### Ornek Repo Yapisi
```
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

### Olusturulan .txt Dosyalari

**README.txt** (root dosya - bireysel):
```
README.md
# My Project
...
```

**package.txt** (root dosya - bireysel):
```
package.json
{
  "name": "my-project"
  ...
}
```

**src.txt** (klasor - birlestirilmis):
```
src/index.ts
import ...

---

src/utils/helper.ts
export function ...
```

**agent.txt** (klasor - birlestirilmis):
```
agent/b.ts
export class ...
```

## Notlar

- GitHub API rate limit: Tokensiz 60 istek/saat, tokenli 5000 istek/saat
- Buyuk repolar icin GitHub Personal Access Token kullanmaniz onerilir
- Binary dosyalar (resimler, fontlar, zip vs.) otomatik atlanir
- `node_modules` ve `.git` klasorleri varsayilan olarak atlanir

## Dosyalar

| Dosya | Aciklama |
|-------|----------|
| `manifest.json` | Chrome Extension Manifest V3 |
| `popup.html` | Extension popup arayuzu |
| `popup.css` | Dark mode stiller |
| `popup.js` | GitHub API entegrasyonu + dosya isleme mantigi |
| `background.js` | Service worker - download yonetimi |

## Lisans

MIT
