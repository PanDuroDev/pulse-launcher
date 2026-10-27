# 1. الإصدار والتغليف (Release & Packaging)

يغطّي هذا الملف كل ما يتعلق ببناء التطبيق وتوزيعه: التوقيع، التحديث، محتوى الحزمة،
والتكامل المستمر.

---

## 1. المُثبّت القديم لم يكن يحتوي الميزة الجديدة 🔴 (تم إصلاحه)

### المشكلة
في بداية الفحص كانت نسخة `release/Pulse-Launcher-0.1.0-x64.exe` بتاريخ **2:11 صباحاً**،
بينما مجلد `out/` كان بتاريخ **11:02 صباحاً** و`app.asar` بتاريخ **6:58 صباحاً**.
أي أن آخر مُثبّت تم بناؤه **قبل** إضافة يوتيوب، فمن يثبّت التطبيق لا يرى الميزة إطلاقاً
رغم أنها موجودة في الكود.

### الدليل
```
release/Pulse-Launcher-0.1.0-x64.exe   2:11 AM
release/win-unpacked/resources/app.asar  6:58 AM
out/                                    11:02 AM
```

### الأثر
أسوأ نوع من الأخطاء: "يعمل عندي، لا يعمل عند المستخدم". كل الاختبارات الحيّة كانت
تُجرى على `out/` أو `electron .`، وليس على الحزمة النهائية.

### الحالة
**أُعيد البناء** عبر `npm run dist`:

| العنصر | القيمة |
|---|---|
| الملف | `release/Pulse-Launcher-0.1.0-x64.exe` |
| الحجم | **119.27 MB** |
| الوقت | 26/10/2026 3:20:22 PM |
| SHA-256 | `4AC8A06A88AA414E51457A7F9BACFAD1277F9F629053FF8F0210439FAE625638` |
| `app.asar` | 49.64 MB |

تم التحقق من المحتوى بفكّ `app.asar`: يحتوي `\out\main\index.js` و`\out\preload\index.js`
و`\out\renderer\assets\*`، وكود يوتيوب حاضر (7 تطابقات لـ
`youtube-search|youtube-art|MusicYouTubeService|getArtworkUrls`، و3 لـ `resolveYouTubeArt`).

### التحقق الحيّ على الحزمة نفسها
شُغّل `release\win-unpacked\PulseLauncher.exe` على بروفايل نظيف
(`D:\Temp\User\opencode\pulse-build-test`)، وكل الفحوص نجحت:

```
OK unavailable video fails cleanly
OK unavailable video error is friendly — This video is unavailable on YouTube.
OK raw yt-dlp output is not shown
OK music page opened
OK unified search returned rows — 48
OK YouTube row is first — music-track-youtube:gaA7RAy5rYg
OK YouTube block leads the list — 25 leading rows
OK all four source chips render — ["All 48","Library 0","Online 23","YouTube 25"]
OK footer names the YouTube source — 0 local · 23 online · 25 YouTube (yt-dlp)
OK every YouTube row keeps its external link — 25/25
OK no renderer console errors — 0
PROBLEMS: none
```

لاحظ `(yt-dlp)`: البروفايل النظيف لا يحمل مفتاح API، فأثبت الاختبار أن **مسار الاحتياط**
يعمل داخل الحزمة أيضاً.

### التوصية
أضف خطوة تحقق آلية قبل كل إصدار: قارن زمن تعديل `out/main/index.js` مع
زمن `release/*.exe`، وافشل البناء إذا كان المُثبّت أقدم. الأفضل: ابنِ دائماً
بـ `npm run dist` في CI وليس يدوياً.

---

## 2. لا يوجد تكامل مستمر (CI) 🟡

### المشكلة
لا يوجد مجلد `.github/` إطلاقاً في المستودع. لا توجد أي بوابة آلية تمنع دمج كود
يكسر الاختبارات أو الأنواع.

### الأثر
بوابات الجودة الأربع (`test`, `typecheck`, `lint`, `build`) تعتمد كلياً على انضباط
المطوّر. أي تعديل سريع قد يمر دون تشغيلها.

### التوصية
سير عمل واحد على `push`/`pull_request`:

```yaml
# .github/workflows/ci.yml
name: ci
on: [push, pull_request]
jobs:
  verify:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm test
      - run: npm run typecheck
      - run: npm run lint
      - run: npm run build
```

أضف `npm run dist` على `tag` فقط، مع رفع المُثبّت كـ artifact.

---

## 3. التطبيق غير موقّع رقمياً 🔴

### المشكلة
`Get-AuthenticodeSignature release\Pulse-Launcher-0.1.0-x64.exe` يعيد:

```
Status: NotSigned
SignerCertificate: (none)
```

سجلات electron-builder تظهر `signing with signtool.exe`، لكن هذا **توقيع بنيوي**
(embedded asar integrity / metadata) وليس شهادة توقيع كود حقيقية.

### الأثر
- Windows SmartScreen يعرض **"Unknown publisher"** عند كل تثبيت.
- المتصفح وWindows Defender قد يحجبان التنزيل.
- لا يمكن التحقق من أن الملف لم يُعدَّل بعد النشر.
- أي مستخدم غير تقني سيتوقف عند التحذير.

### التوصية
1. اشترِ شهادة **OV** أو **EV code signing** (EV تتجاوز SmartScreen فوراً تقريباً).
2. مرّرها لـ electron-builder عبر متغيرات البيئة:
   ```
   CSC_LINK=<path-or-base64-to-.pfx>
   CSC_KEY_PASSWORD=<password>
   ```
3. أو استخدم Azure Trusted Signing / SignPath إذا كانت التكلفة عائقاً.
4. أضف التحقق من التوقيع إلى خطوة ما قبل النشر:
   ```powershell
   (Get-AuthenticodeSignature .\release\*.exe).Status -eq 'Valid'
   ```

### القرار (2026-10-26): الإصدار **غير موقّع** — قرار واعٍ لا إغفال

لا توجد شهادة توقيع كود على جهاز البناء، ولا ميزانية مخصّصة لشرائها الآن.
لذلك يُصدر `0.1.0` غير موقّع، مع توثيق الأثر بدل تركه بنداً مفتوحاً.

**ما تم فعله بدلاً من التوقيع:**

- ثُبِّتت **fuses** Electron على الملف التنفيذي (انظر `02-security.md` §1):
  `RunAsNode`, `EnableNodeOptionsEnvironmentVariable`,
  `EnableNodeCliInspectArguments` معطّلة، و`OnlyLoadAppFromAsar` +
  `EnableEmbeddedAsarIntegrityValidation` مفعّلة. هذا يمنع إعادة استخدام
  الملف التنفيذي كـ Node عام، ويمنع تحميل `app.asar` معدّل.
- أُضيف `ErrorBoundary` عام حتى لا يتحول أي عطل إلى شاشة بيضاء.
- أُضيفت ملاحظة SmartScreen صريحة في `README.md` قسم Packaging.

**الأثر المتبقّي، بصراحة:** SmartScreen سيعرض «Windows protected your PC»
و«Unknown publisher» عند أول تشغيل للمثبّت. المستخدم يحتاج **More info → Run
anyway**. لا يمكن التخلص من هذا بغير شهادة؛ لا توجد حيلة تقنية مشروعة بديلة.
كما أن المستخدم لا يستطيع التحقق من أن الملف لم يُعدَّل بعد النشر، وfuses
تحمي من العبث بالحزمة لكنها **لا** تثبت هوية الناشر.

**شرط الإغلاق النهائي:** قبل أي نشر عام واسع، يجب شراء شهادة **OV** على الأقل
(EV تتجاوز SmartScreen فوراً تقريباً)، ثم:

```powershell
$env:CSC_LINK = 'C:\keys\pulse.pfx'
$env:CSC_KEY_PASSWORD = '<password>'
npm run dist
(Get-AuthenticodeSignature .\release\Pulse-Launcher-0.1.0-x64.exe).Status  # Valid
```

`electron-builder.yml` لا يحتاج أي تعديل: هو يقرأ `CSC_LINK` و
`CSC_KEY_PASSWORD` من البيئة تلقائياً، وfuses تُقلب **قبل** التوقيع
(`platformPackager.js` سطر 258: «the fuses MUST be flipped right before
signing»)، لذلك إضافة الشهادة لاحقاً لا تكسر شيئاً.

---

## 4. لا يوجد تحديث تلقائي 🟡

### المشكلة
بحث في `src` و`package.json` عن `autoUpdater|electron-updater` أعاد **صفر** نتائج.

### الأثر
كل إصلاح — بما فيها إصلاحات الأمان — يتطلب من المستخدم إعادة تنزيل المُثبّت
يدوياً. مع تطبيق يعمل كواجهة ألعاب دائمة التشغيل، هذا يعني بقاء المستخدمين على
نسخ قديمة لأشهر.

### التوصية
`electron-updater` + `electron-builder` publish إلى GitHub Releases:

```yaml
# electron-builder.yml
publish:
  provider: github
  owner: <owner>
  repo: <repo>
```

ثم في `main/index.ts` بعد `app.whenReady()`:
```ts
autoUpdater.checkForUpdatesAndNotify()
```
أضف عنصر واجهة في Settings: "التحقق من التحديثات" + عرض الإصدار الحالي.

> ملاحظة: التحديث التلقائي يتطلب **توقيعاً رقمياً** على Windows، فاربطه بالمهمة 3.

---

## 5. الحزمة تحوي كوداً ميتاً محتملاً: `bin/` غير موجود 🟡

### المشكلة
`src/main/music/youtube/tools.ts` يفحص مسارين "مدمجين" داخل موارد التطبيق:

```ts
// tools.ts:156
{ filePath: resolveResourcePath('bin', YTDLP_FILE), source: 'bundled', versionArgs: ['--version'] },
// tools.ts:212
{ filePath: resolveResourcePath('bin', FFMPEG_FILE), source: 'bundled', versionArgs: ['-version'] },
```

لكن `resources/` يحتوي **ثلاثة ملفات PowerShell فقط**:
```
resources/game-window.ps1
resources/process-snapshot.ps1
resources/resolve-shortcuts.ps1
```
لا يوجد `resources/bin/` إطلاقاً.

### الأثر
- فرع `source: 'bundled'` **لا يمكن أن يتحقق أبداً** — كود ميت يستهلك فحص `stat` في كل تشغيل.
- المستخدم الذي لا يملك إنترنت عند أول استخدام ليوتيوب لا يمكنه الاستخراج أبداً،
  لأن yt-dlp يُنزَّل وقت الحاجة فقط إلى `music/bin/`.

### التوصية
اختر أحد الاتجاهين:
1. **إزالة الفرع** إذا كان التحميل عند الحاجة مقصوداً (أنظف).
2. **تعبئته فعلاً**: ضع `yt-dlp.exe` في `resources/bin/` (≈17 MB)، وأضف
   `ffmpeg.exe` (≈80 MB مضغوطاً) أو دعه اختيارياً. `electron-builder.yml` ينسخ
   `resources/` كاملة عبر `extraResources`، فسيعمل دون تعديل إعدادات.
   سيصبح التطبيق أكبر بـ ~20–100 MB لكنه سيعمل دون إنترنت.

---

## 6. استبعاد ملفات من الحزمة: مراجعة إيجابية ✅

`electron-builder.yml` يستبعد بشكل صحيح: `src`, `scripts`, `resources`, `build`,
`docs`, `release`, ملفات الإعداد، `README.md`/`PLAN.md`/`CHANGELOG.md`, `*.map`.
النتيجة: `app.asar` = 49.64 MB فقط، معظمها `node_modules` الضرورية.

**ملاحظة صغيرة:** `docs/` مستبعدة، وهذا يعني أن تقرير الفحص هذا **لا يُشحن** مع
التطبيق. إن أردت أن يراه المستخدم داخل التطبيق، يجب نسخه إلى `resources/` أو
عرضه عبر رابط خارجي.

---

## 7. إعدادات NSIS: مراجعة إيجابية ✅

```yaml
oneClick: false                       # مثبّت تقليدي، ليس صامتاً
perMachine: false                     # تثبيت لكل مستخدم، بلا UAC
allowElevation: true
allowToChangeInstallationDirectory: true
createDesktopShortcut: always
createStartMenuShortcut: true
deleteAppDataOnUninstall: false       # يحفظ مكتبة الموسيقى والإعدادات
requestedExecutionLevel: asInvoker    # لا يطلب صلاحيات إدارية
```

هذه اختيارات صحيحة لتطبيق واجهة: لا يحتاج مسؤولاً، ولا يمسح بيانات المستخدم عند
إلغاء التثبيت (مهم جداً لأن `music/youtube/` قد يحوي مئات الميغابايت من MP3
ومكتبة محلية مفهرسة).

**نقطة نقص واحدة:** لا توجد خيارات في المثبّت لاختيار مكوّنات (مثلاً "تضمين
yt-dlp وFFmpeg" أو "تنزيلهما عند أول استخدام"). إن عبّأت `resources/bin/`
فكّر في `nsis.include` لإظهار صفحة مكوّنات.

---

## 8. ملخص الملف

| # | العنصر | الخطورة | الحالة |
|---|---|---|---|
| 1 | مُثبّت قديم بلا الميزة | 🔴 | **مُغلق آلياً** — `npm run verify:release` يفشل إذا كان المثبّت أقدم من `out/` |
| 2 | لا يوجد CI | 🟡 | **أُضيف** — `.github/workflows/ci.yml`: مهمة `Verify` على كل push/PR، ومهمة `Installer` على وسوم `v*` |
| 3 | لا توقيع رقمي | 🔴 | مفتوح — قرار موثّق، يلزم شراء شهادة |
| 4 | لا تحديث تلقائي | 🟡 | مفتوح — محجوب بـ 3، و`latest.yml` يُنتَج بلا مستهلك |
| 5 | فرع `bundled` ميت | 🟡 | مفتوح — المرحلة 8.6 |
| 6 | استبعاد الملفات | ✅ | سليم |
| 7 | إعدادات NSIS | ✅ | سليمة |

---

## 9. قائمة تحقق الإصدار (Release checklist)

تُنفَّذ بالترتيب قبل كل إصدار. الجزء الأول منها آلي بالكامل عبر CI، والثاني
يدوي لأنه يعتمد على حكم بشري (التجربة الفعلية وحجم الملف).

### آلي — يمنعه CI أصلاً

1. `npm test` — كل الاختبارات ناجحة.
2. `npm run typecheck` — بلا أي مخرجات.
3. `npm run lint` — 4 تحذيرات معروفة و0 أخطاء (خط الأساس في `AGENTS.md` §2).
4. `npm run build` — ينجح.
5. `npm run dist` — ينتهي بـ `scripts/verify-installer.mjs`، فيفشل البناء إذا كان
   `app.asar` أقدم من `out/`. **لا يمكن نشر مثبّت قديم بعد اليوم.**
6. على وسم `v*` فقط: CI يبني المثبّت ويرفعه مع `.blockmap` و`latest.yml`.

### يدوي — قبل الضغط على «نشر»

1. `git status --short` نظيف، والوسم `vX.Y.Z` على الـ commit الذي بُني منه
   المثبّت بالضبط.
2. `CHANGELOG.md` فيه قسم `## [X.Y.Z] - YYYY-MM-DD` يصف ما تغيّر للمستخدم لا
   الملفات التي تغيّرت.
3. `npm run verify:release` يطبع `OK` بلا أي `FAIL`.
4. سجّل الحجم و`SHA-256`:
   ```powershell
   Get-Item release\Pulse-Launcher-X.Y.Z-x64.exe | Select-Object Name,Length,LastWriteTime
   Get-FileHash release\Pulse-Launcher-X.Y.Z-x64.exe -Algorithm SHA256
   ```
5. شغّل `release\win-unpacked\PulseLauncher.exe` على بروفايل نظيف
   (`LAUNCHER_USER_DATA` جديد، `--remote-debugging-port=9333`) وتأكد من الإقلاع
   والموسيقى ويوتيوب، ثم أغلق كل عملية.
6. اكتب في ملاحظات النشر أن المثبّت **غير موقّع**، وأن SmartScreen سيظهر تحذيراً
   أول مرة، مع خطوة **More info → Run anyway**.
7. لا تبنِ مثبّتاً جديداً بعد الوسم؛ أي تعديل لاحق يعني إصداراً جديداً لا استبدالاً
   صامتاً لملف منشور.
