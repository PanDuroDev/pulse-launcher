# 7. الصيانة والمستودع (Maintenance & Repository)

---

## 1. لا شيء مُودَع في git — 15 ملفاً معدّلاً و17 ملفاً جديداً 🟠

### المشكلة
حالة المستودع عند الفحص:

**ملفات معدّلة (15):**
```
README.md
docs/MUSIC.md
src/main/index.ts
src/main/music/overlay.ts
src/main/paths.ts
src/main/protocol.ts
src/preload/index.ts
src/renderer/src/components/launcher/MusicOverlay.tsx
src/renderer/src/components/launcher/MusicPage.tsx
src/renderer/src/hooks/use-music-engine.ts
src/renderer/src/lib/music-engine.ts
src/renderer/src/lib/music-queue.test.ts
src/renderer/src/lib/music-queue.ts
src/shared/ipc.ts
src/shared/types.ts
```

**ملفات/مجلدات جديدة (17):**
```
src/main/music/youtube/    (11 ملفاً)
src/main/music/online/     (6 ملفات)
```

### الأثر
- **لا يوجد أي نقطة رجوع.** أي خطأ في تحرير لاحق لا يمكن التراجع عنه بدقة.
- العمل مبعثر على 32 مساراً بلا تاريخ يشرح السبب.
- `git diff` وحده يظهر **+2,709 / −288 سطراً** — مراجعة هذا دفعة واحدة مستحيلة.

### التوصية
أنشئ سلسلة commits منطقية بدل واحد عملاق. اقتراح:

```
feat(music): add legal online catalog search
feat(music): add YouTube search, MP3 extraction, and cache
feat(music): unify library, online, and YouTube search with source chips
feat(music): show API thumbnails, channel, video title, and duration
fix(music): name the YouTube source in the unified footer
fix(music): keep the stored API key when Setup opens from All
fix(music): skip the yt-dlp fallback after a successful empty API search
fix(music): map yt-dlp errors from prefixed extractor lines
fix(protocol): try every thumbnail candidate before failing
test(music): cover source filtering, merge order, and yt-dlp errors
docs(music): document the four tabs and YouTube setup
docs(audit): add the categorized audit report
```

**مهم:** لا تستخدم `git restore`/`git clean` للتراجع — العمل الحالي كله نتاج
جلسات متعددة ولا يوجد نسخة أخرى منه.

---

## 2. ملفات الفحص القديمة في جذر المستودع 🔵

### المشكلة
جذر `D:\Projects\ps5-launcher` يحتوي مجلدين من عمليات فحص سابقة:
```
ps5-launcher-inspection-codex/
ps5-launcher-inspection-inkling-small/
```

### الأثر
- تشويش بصري عند فتح المشروع.
- `.gitignore` يستثنيهما (`ps5-launcher-inspection-*/`) فلا خطر من إيداعهما،
  لكنهما يستهلكان مساحة ويزيدان زمن أي بحث شامل في المجلد.

### التوصية
انقلهما إلى `D:\Temp\User\opencode\` أو احذفهما إن لم تعُد بحاجة لمحتواهما.
هذا التقرير الجديد في `docs/audit/` يغطي ما فيهما.

---

## 3. `AGENTS.md` و`docs/design-review.md` غير مُتتبَّعين 🟡

### المشكلة
`.gitignore` (السطر 37 وما بعده) يستثني:
```
AGENTS.md
PLAN.md
docs/design-review.md
```

### الأثر
- **`AGENTS.md` هو دليل المشروع الفعلي** (55,211 بايت): يوثّق الملفات، القنوات،
  الاختبارات، القواعد، وبوابات الجودة. لكنه **لن يُشحن مع المستودع** — أي
  مساهم جديد لا يراه، وأي استنساخ على جهاز آخر يفقده.
- `docs/design-review.md` (31,635 بايت) يحتوي قياسات تصميم قيّمة ستضيع.
- `PLAN.md` (14,075 بايت، عربي) يحتوي معايير القبول.

### التوصية
- **`AGENTS.md` يجب أن يكون مُتتبَّعاً.** هو أهم وثيقة في المستودع. أزل السطر
  من `.gitignore` وأودعه.
- `PLAN.md`: قرارك — إن كان خطة داخلية مؤقتة فأبقِه مستثنى؛ إن كان مرجع
  المتطلبات فأودعه.
- `docs/design-review.md`: انقله إلى `docs/audit/` (حيث هذا التقرير) وأودعه،
  أو أبقِه محلياً واعتبر `docs/audit/06-ux-and-accessibility.md` بديلاً مُودَعاً.

---

## 4. انحراف أعداد الاختبارات في المستندات 🟡

### المشكلة
أعداد الاختبارات في المستندات تتأخر عن الواقع باستمرار لأنها أرقام يدوية:

| المستند | المذكور | الفعلي |
|---|---|---|
| `README.md` (قسم Testing) | 36 ملف / 367 اختبار | 36 / 367 ✅ |
| `AGENTS.md` (عدة مواضع) | 36 / 367 ✅ | 36 / 367 ✅ |
| `docs/MUSIC.md` | لا يذكر أرقاماً | — |

تطابق الآن بعد تحديثات متكررة، لكن **السبب** باقٍ: الرقم مكتوب يدوياً في
ثلاثة أماكن على الأقل (`README.md:238`, `AGENTS.md:398`, `:439`, `:857`)،
وكل إضافة اختبار تتطلب تحديثها جميعاً.

### الأثر
سبق أن حدث انحراف فعلي في هذه الجلسة: كانت المستندات تقول 347 ثم 354 ثم 358
ثم 360 ثم 367 بينما الكود تغيّر أسرع. أرقام غير صحيحة تُضعف الثقة بالمستند.

### التوصية
- استبدل الأرقام بعبارة ثابتة: "The suite covers …" بلا عدد.
- أو أضف سكربت `npm run docs:count` يولّد الرقم من `vitest list` ويحدّث
  المواضع الثلاثة، وشغّله في CI.

**الخيار الأول أبسط وأكثر متانة.** الأرقام تتقادم، والقدرات لا.

---

## 5. اعتماديات متأخرة عن أحدث إصدار 🟡

### المشكلة
`npm outdated`:

| الحزمة | الحالي | الأحدث | ملاحظة |
|---|---|---|---|
| `@noriginmedia/norigin-spatial-navigation-core` | 4.1.2 | **4.2.0** | ترقية ثانوية |
| `electron-builder` | 26.15.3 | **26.18.0** | ترقية ثانوية |
| `@types/node` | 24.19.2 | 26.6.5 | `wanted` ما زال 24.19.2 (مثبّت) |
| `typescript` | 6.0.3 | 7.0.2 | `wanted` ما زال 6.0.3 (مثبّت) |

### الأثر
- `norigin` هو قلب التنقل بالذراع — إصدار أحدث قد يحتوي إصلاحات تركيز.
- `electron-builder` الأحدث قد يحسّن التوقيع والتغليف.
- `@types/node` و`typescript` مثبّتان عند major أقدم بقرار (وهذا مشروع:
  TypeScript 7 إعادة كتابة كبرى، ولا يجب الترقية بلا اختبار شامل).

### التوصية
1. **رقِّ `norigin` إلى 4.2.0** واختبر التنقل بالذراع/المفاتيح في كل الشاشات
   (هو الأنسب والأقل خطراً).
2. **رقِّ `electron-builder`** — تحسينات تغليف بلا تغيير في كود التطبيق.
3. **أجّل `typescript` 7** حتى تصدر نسخة مستقرة وتُختبر الأخطاء الجديدة.
4. **أجّل `@types/node` 26** إلا إذا رقّيت Electron (النسخة 45 تتوافق مع Node 22).

---

## 6. `docs/` تحوي ملفين فقط قبل هذا التقرير 🔵

### الوضع السابق
```
docs/MUSIC.md          17,486 B   (موثّق، مُتتبَّع)
docs/design-review.md  31,635 B   (عربي، غير مُتتبَّع)
```

### الوضع الآن
```
docs/MUSIC.md
docs/design-review.md
docs/audit/README.md
docs/audit/01-release-and-packaging.md
docs/audit/02-security.md
docs/audit/03-music-and-youtube.md
docs/audit/04-performance-and-bundle.md
docs/audit/05-testing-and-code-quality.md
docs/audit/06-ux-and-accessibility.md
docs/audit/07-maintenance-and-repository.md
docs/audit/08-missing-features.md
```

### توصية
أضف رابطاً من `README.md` إلى `docs/audit/README.md` حتى يجده المساهم.
وأضف `docs/audit/` إلى قائمة "ما لا يُشحن" في ذهنك: `electron-builder.yml`
يستبعد `docs/` كاملة، وهذا مقصود (لا نريد تقرير الفحص داخل الحزمة).

---

## 7. إعدادات `electron-builder.yml`: مراجعة إيجابية ✅

```yaml
appId: com.pulse.launcher
productName: Pulse Launcher
asar: true
compression: maximum
directories:
  buildResources: build
  output: release
extraResources:
  - from: resources
    to: resources
win:
  target: nsis (x64)
  icon: build/icon.ico
  executableName: PulseLauncher
  requestedExecutionLevel: asInvoker
  artifactName: Pulse-Launcher-${version}-${arch}.${ext}
```

كل الاختيارات صحيحة: `compression: maximum` يقلل الحجم، `asInvoker` لا يطلب
صلاحيات، `extraResources` ينسخ سكربتات PowerShell، والاسم والـ appId متسقان
مع `app.setAppUserModelId('com.pulse.launcher')` في `main/index.ts:963`
(وهذا مهم لإشعارات Windows وربط الاختصارات).

---

## 8. هيكل `scripts/` 🔵

### الوضع
```
scripts/generate-icon.ps1   4.7 KB
```

### التوصية
أضف السكربتات التي يحتاجها هذا التقرير:
```
scripts/fuses.mjs         # تفعيل Electron fuses (المهمة 1 في 02)
scripts/verify-build.mjs  # التحقق من حداثة المُثبّت (المهمة 1 في 01)
scripts/docs-count.mjs    # تحديث أعداد الاختبارات (اختياري، §4)
```

---

## 9. ملخص الملف

| # | العنصر | الخطورة | الحالة |
|---|---|---|---|
| 1 | 32 مساراً بلا commit | 🟠 | مفتوح |
| 2 | مجلدات فحص في الجذر | 🔵 | مفتوح |
| 3 | `AGENTS.md` غير مُتتبَّع | 🟡 | مفتوح |
| 4 | أعداد اختبارات يدوية تتقادم | 🟡 | مفتوح |
| 5 | 4 اعتماديات متأخرة | 🟡 | مفتوح |
| 6 | `docs/` نمت بشكل صحيح | ✅ | تم |
| 7 | `electron-builder.yml` | ✅ | سليم |
| 8 | `scripts/` ناقص | 🔵 | مفتوح |
