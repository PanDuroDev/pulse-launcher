# 2. الأمان (Security)

هذا الملف يوثّق نموذج الأمان المطبّق (وهو قوي)، ثم الفجوات الحقيقية المتبقية.

---

## 1. `@electron/fuses` مثبّت ولا يُستخدم 🔴

### المشكلة
`@electron/fuses` موجود في `package.json` (الإصدار 2.1.3)، لكن البحث في `src/`
و`scripts/` عن `electron/fuses` أو `flipFuses` يعيد **صفر** نتائج. التطابقات
الوحيدة في المستودع هي في `package.json` و`package-lock.json`.

### الأثر
Electron يأتي افتراضياً بقدرات تشخيصية وتنفيذية لا يحتاجها تطبيق واجهة نهائي:

| الـ fuse | الافتراضي | الخطر |
|---|---|---|
| `RunAsNode` | مُمكّن | يمكن تشغيل `PulseLauncher.exe` كـ Node لتنفيذ سكربتات عشوائية |
| `EnableNodeOptionsEnvironmentVariable` | مُمكّن | `NODE_OPTIONS` يمكنه تحميل كود في عملية main |
| `EnableNodeCliInspectArguments` | مُمكّن | `--inspect` يفتح منفذ تصحيح على عملية main |
| `OnlyLoadAppFromAsar` | معطّل | يمكن حقن `app/` خارج الـ asar |
| `EnableEmbeddedAsarIntegrityValidation` | معطّل | لا تحقق من سلامة `app.asar` |

معنى ذلك: برنامج آخر على الجهاز (أو مستخدم محدود الصلاحيات) يمكنه استغلال
`RunAsNode` لتشغيل كود بصلاحيات التطبيق، أو حقن كود عبر `NODE_OPTIONS`.

### الدليل
```powershell
Select-String -Path package.json -Pattern 'fuses'   # → 1 (المفتاح فقط)
Select-String -Path src -Pattern 'flipFuses'        # → 0
```

### التوصية
أضف سكربت `scripts/fuses.mjs` وشغّله بعد `electron-builder`:

```js
import { flipFuses, FuseVersion, FuseV1Options } from '@electron/fuses'

await flipFuses('release/win-unpacked/PulseLauncher.exe', {
  version: FuseVersion.V1,
  [FuseV1Options.RunAsNode]: false,
  [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
  [FuseV1Options.EnableNodeCliInspectArguments]: false,
  [FuseV1Options.EnableCookieEncryption]: true,
  [FuseV1Options.OnlyLoadAppFromAsar]: true,
  [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
})
```

واربطه في `package.json`:
```json
"dist": "npm run build && electron-builder --win nsis && node scripts/fuses.mjs"
```

> ⚠️ تحقّق أولاً من أن `LAUNCHER_USER_DATA` / `LAUNCHER_WINDOWED` / `LAUNCHER_DEMO`
> تعمل بعد تفعيل `EnableNodeOptionsEnvironmentVariable: false` — متغيرات البيئة
> العادية لا تتأثر، لكن `NODE_OPTIONS` ستتوقف عن العمل (وهذا هو المطلوب).

---

## 2. نموذج الأمان المطبّق: مراجعة إيجابية ✅

هذا القسم توثيق لما هو **صحيح**، ليُحافظ عليه في أي تعديل مستقبلي.

### 2.1 إعدادات النوافذ
`src/main/index.ts:358-362`:
```ts
sandbox: true,
contextIsolation: true,
nodeIntegration: false,
webSecurity: true,
allowRunningInsecureContent: false,
```

نافذة الـ overlay مستقلة وتطبّق نفس القيود — `src/main/music/overlay.ts:168-170`:
```ts
sandbox: true,
contextIsolation: true,
nodeIntegration: false,
```

### 2.2 منع التنقل والفتح
`main/index.ts:369-375`:
```ts
window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
window.webContents.on('will-navigate', (event, url) => { /* رفض */ })
```
و`music/overlay.ts:183-184`:
```ts
window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
window.webContents.on('will-navigate', (event) => event.preventDefault())
```

### 2.3 منع الأذونات
`main/index.ts:376` و`:1013` — `setPermissionRequestHandler` يرفض كل الأذونات
(كاميرا، ميكروفون، إشعارات، موقع…). تطبيق موسيقى لا يحتاج أياً منها.

### 2.4 عزل الشبكة عبر `app://`
CSP في `main/protocol.ts`:
```
default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline';
img-src 'self' data:; font-src 'self'; connect-src 'self'; media-src 'self';
object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'
```

كل وسائط بعيدة تُمرَّر عبر بروتوكول داخلي:

| المسار | المصدر |
|---|---|
| `/media/<trackId>` | ملف محلي (مع دعم Range) |
| `/music-art/<file>` | غلاف مستخرج محلياً |
| `/online-media/<token>` | بث بعيد عبر توكن عشوائي |
| `/online-art/<token>` | غلاف بعيد عبر توكن |
| `/youtube-art/<videoId>` | غلاف يوتيوب عبر قائمة مرشحين |

**لا يستطيع الريندرر تحميل أي URL بعيد مباشرة.**

### 2.5 التحقق من الروابط البعيدة
- `music/online/service.ts` — `isPublicHttpsUrl`: HTTPS فقط، يرفض `localhost`
  والعناوين الخاصة و`::1` و`169.254.169.254`.
- `music/youtube/parse.ts` — `youtubeThumbnailUrlFromApi`: HTTPS فقط، وقائمة
  مضيفين مسموح بها حصراً (`i.ytimg.com`, `img.youtube.com`, `i9.ytimg.com`)،
  وطول ≤ 2048. هذا يمنع SSRF عبر صورة يوتيوب مزوّرة.
- `music/youtube/parse.ts` — `isYouTubeVideoId`: `/^[A-Za-z0-9_-]{11}$/` قبل
  أي استدعاء IPC أو yt-dlp.

### 2.6 تنفيذ أوامر بلا shell
`music/youtube/command.ts` — `spawn(file, args, { windowsHide: true })` بلا
`shell: true`. نص البحث والمجلدات لا يمكن أن يُفسَّرا كأوامر.
عند المهلة يُقتل شجرة العمليات كاملة عبر `taskkill /pid <pid> /t /f`، لأن
yt-dlp يشغّل ffmpeg كطفل.

### 2.7 كتابة ذرّية
كل ملفات الحالة تُكتب إلى ملف مؤقت ثم `rename`:
`fs-utils.ts` (`writeJsonFileAtomic`), `youtube/service.ts` (تحميل الأغلفة),
`youtube/command.ts` (`downloadFile`). لا يمكن أن يُخدَم ملف نصف مكتوب.

### 2.8 إخفاء الأسرار
- مفتاح YouTube يُحفظ في `music/youtube.json` محلياً، ويُعرض في الواجهة
  بـ `type="password"`.
- `parse.ts` — `redactSecrets` يحذف `AIza…` ومعامل `key=` من أي رسالة خطأ.
- `safeErrorMessage` يزيل رموز ANSI ومحارف التحكم ويقصّ إلى 240 حرفاً.
- **صفر** `console.*` في `src` — لا تسريب غير مقصود إلى السجل.

### 2.9 نسخة واحدة
`main/index.ts:1072` — `app.requestSingleInstanceLock()`. يمنع تشغيل نسختين
تتزاحم على نفس ملفات الكاش والمكتبة.

---

## 3. أخطاء مبتلعة بلا تسجيل 🟠

### المشكلة
- **45** `catch {` عارية في `src/main` بلا أي تسجيل.
- **19** `catch {}` / `catch(() => undefined)` في الريندرر.

### الأثر
عند فشل غير متوقع (ملف مقفل، صلاحية، قرص ممتلئ) لا يبقى أي أثر. المستخدم يرى
"لا شيء حدث" والمطوّر لا يجد ما يصلحه. أثناء الفحص الحيّ ظهر مثال حقيقي:
`[protocol] request failed app://launcher/online-art/... TypeError: fetch failed`
(توكن صورة منتهي) — لكن الحالات المشابهة في الموسيقى صامتة تماماً.

### أمثلة من الكود
```ts
// youtube/service.ts — كتابة الفهرس
} catch {
  // Playback should still work if the cache index cannot be written.
}
// youtube/service.ts — إحصاء الكاش
} catch {
  return { tracks: 0, bytes: 0 }
}
```

التعليقات تشرح **لماذا** نتجاهل، وهذا جيد، لكن لا شيء يُسجَّل.

### التوصية
استخدم `log.warn` الموجود أصلاً (`src/main/logger.ts` — electron-log) للحالات
التي تعني "حدث خطأ لكن التطبيق استمر":

```ts
} catch (error) {
  log.warn('[youtube] could not write cache index', error)
}
```

قاعدة عملية: **كل `catch` يجب أن يفعل واحداً من ثلاثة** — يعيد محاولة، أو يسجّل،
أو يعيد قيمة افتراضية مع تعليق يشرح لماذا هذا آمن. لا `catch {}` صامت.

---

## 4. `npm audit`: مراجعة إيجابية ✅

```
npm audit --omit=dev → found 0 vulnerabilities
```

لا توجد ثغرات معروفة في اعتماديات وقت التشغيل. هذا استثنائي لمشروع بهذا الحجم.

**تحذير للمستقبل:** هذه النتيجة صالحة اليوم فقط. أضف `npm audit` إلى CI (المهمة
2 في [01](01-release-and-packaging.md)) لتبقى صحيحة.

---

## 5. ملاحظات أمنية منخفضة الأولوية 🔵

### 5.1 `LAUNCHER_USER_DATA` يتجاوز مجلد البيانات
`main/index.ts` يقرأ `LAUNCHER_USER_DATA` لتعيين `userData`. هذا **مقصود**
(يُستخدم في الاختبار الآلي على بروفايل معزول)، لكنه يعني أن أي عملية تستطيع
تشغيل التطبيق بمتغير بيئة تستطيع توجيهه إلى مجلد آخر. الخطر ضئيل (التطبيق
يقرأ ويكتب في المجلد المحدد فقط)، لكن وثّقه في `README` كخيار اختبار لا كميزة
للمستخدم.

### 5.2 `will-navigate` في main لا يسجّل المحاولة
`main/index.ts:370` يرفض التنقل لكن بلا `log.warn`. محاولة تنقل مرفوضة مؤشر
أمان يستحق التسجيل.

### 5.3 `resources/*.ps1` تُنفَّذ بلا تحقق
`game-window.ps1`, `process-snapshot.ps1`, `resolve-shortcuts.ps1` تُشغَّل عبر
PowerShell. هي ملفات داخل الحزمة وليست قابلة للكتابة من المستخدم بعد التثبيت
(داخل `app.asar`/`resources`)، لكن تأكد من أن أي مسار يُمرَّر إليها (اسم نافذة،
مسار لعبة) لا يُدرَج في سلسلة أوامر بلا اقتباس. راجع `quote`/`-ArgumentList`
في `src/main/game-window.ts`.

---

## 6. ملخص الملف

| # | العنصر | الخطورة | الحالة |
|---|---|---|---|
| 1 | `@electron/fuses` غير مستخدم | 🔴 | مفتوح |
| 2 | نموذج الأمان الأساسي | ✅ | قوي |
| 3 | 64 `catch` صامت | 🟠 | مفتوح |
| 4 | `npm audit` نظيف | ✅ | سليم اليوم |
| 5 | ملاحظات صغيرة (بيئة، تسجيل تنقل، سكربتات PS) | 🔵 | مفتوح |
