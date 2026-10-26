# 4. الأداء وحجم الحزمة (Performance & Bundle)

كل الأرقام هنا مأخوذة من مخرجات البناء الفعلية أو من قراءة الكود، لا من تخمين.

---

## 1. حزمة ريندرر واحدة بحجم 1,785.80 kB 🟡

### المشكلة
مخرجات البناء:

```
out/renderer/assets/index-DmmWhEJn.js    1,785.80 kB
out/renderer/assets/index-DCoxSwfM.css     119.49 kB
```

ملف JavaScript **واحد** يحتوي التطبيق كله. البحث عن `React.lazy` أو `lazy(`
أو `Suspense` في `src` يعيد **صفر**. و`electron.vite.config.ts` يملك
`rollupOptions` (سطر 40) لكن **بلا** `manualChunks` ولا `chunkSizeWarningLimit`.

### الأثر
- وقت بدء أطول: يجب تحليل وتنفيذ 1.79 MB قبل ظهور أول شاشة. على جهاز متوسط
  هذا يقارب 100–200 ms إضافية بعد قراءة الملف من القرص.
- لا يمكن تحميل أي شاشة قبل تحميل شاشات لا تُستخدم: `BootScreen`, `Bloub`
  (المساعد)، `MusicPage`, `SettingsPage`, `AddGamePage`, `GameDetailsPage`.
- Bloub وحده كبير: `bloub/bot/states.ts` 591 سطراً، `engine.ts` 518،
  `BloubBot.tsx` 468، `eyefit.ts` 426.

### التوصية
قسّم الحزمة إلى قطع منطقية:

```ts
// electron.vite.config.ts → renderer.build.rollupOptions.output
manualChunks: {
  react: ['react', 'react-dom'],
  bloub: ['./src/renderer/src/components/bloub/index.ts'],
  music: ['./src/renderer/src/components/launcher/MusicPage.tsx'],
  settings: ['./src/renderer/src/components/launcher/SettingsPage.tsx'],
}
```

وأضف تحميلاً كسولاً للشاشات الثقيلة:

```ts
const MusicPage = lazy(() => import('./components/launcher/MusicPage'))
const SettingsPage = lazy(() => import('./components/launcher/SettingsPage'))
```

`App.tsx` بالفعل يبدّل بين شاشات بحالة، فالتغليف بـ `<Suspense>` حول الشاشة
النشطة فقط لن يغيّر السلوك. **الهدف الواقعي:** 1,785 kB → ~600 kB للقطعة
الأساسية + قطع تُحمَّل عند الحاجة.

> ملاحظة: القطعة الحالية 1.79 MB **ليست** كارثية لتطبيق سطح مكتب محلي (لا
> شبكة)، لكنها تعني أن أي تعديل صغير في أي شاشة يُبطل كاش الحزمة كاملة.

---

## 2. إعادة رسم كل 500 ms في الـ overlay 🟡

### المشكلة
`src/renderer/src/components/launcher/MusicOverlay.tsx:148`:
```ts
const timer = window.setInterval(() => { /* تحديث الموضع */ }, 500)
```

هذا يعمل **طالما الموسيقى تُشغَّل**، ويُعيد رسم مكوّن الـ overlay مرتين في الثانية
دائماً — حتى عندما لا تتغير أي بيانات (شريط التقدم يتحرك ببطء، والحالة ثابتة).

### الأثر
- استهلاك CPU مستمر أثناء التشغيل (منخفض لكنه دائم).
- إعادة رسم نافذة شفافة فوق الألعاب قد تسبب تقطيعاً بسيطاً في ألعاب ثقيلة.
- ميزة "always on top" تُعاد تأكيدها كل `TOP_REASSERT_MS = 1_500` أيضاً
  (`music/overlay.ts`), أي نشاط إضافي.

### التوصية
1. استخدم `requestAnimationFrame` مع تعليق عند عدم الحاجة، أو
2. حدّث فقط عند تغيّر `positionMs` بمقدار ≥ 500 ms **وكانت النافذة مرئية**
   (تحقق من `document.visibilityState`), أو
3. استخدم `CSS transition` على شريط التقدم بدل حساب الموضع في JS:
   ```css
   transition: width 500ms linear;
   ```
   ثم لا حاجة لأي مؤقّت إطلاقاً — المتصفح يتولى الأمر بكفاءة أعلى بكثير.

### ملاحظة مشابهة
`src/renderer/src/hooks/use-clock.ts:7` — `setInterval(..., 15_000)` لتحديث
الساعة. مقبول (مرة كل 15 ثانية)، لكنه يعمل دائماً بلا شرط. اربطه بـ
`visibilitychange` إن كان يظهر في شريط علوي فقط.

---

## 3. أكبر الملفات: مؤشر على كثافة عالية 🟡

### القياس
| الملف | الأسطر |
|---|---|
| `components/launcher/MusicPage.tsx` | **2,148** |
| `App.tsx` | **1,451** |
| `main/index.ts` | **1,105** |
| `components/launcher/SettingsPage.tsx` | 956 |
| `components/launcher/AddGamePage.tsx` | 733 |
| `components/launcher/GameDetailsPage.tsx` | 680 |
| `bloub/bot/states.ts` | 591 |
| `main/catalog/index.ts` | 557 |
| `shared/types.ts` | 555 |
| `bloub/bot/engine.ts` | 518 |
| `music/youtube/service.ts` | 517 |
| `music/library.ts` | 478 |

### الأثر
ملف 2,148 سطراً يعني:
- تصفحاً صعباً (تحتاج `grep` للتنقل).
- تعارضات دمج متكررة.
- إعادة بناء المكوّن كاملة عند أي تعديل (لا علاقة مباشرة بالأداء وقت التشغيل،
  لكنه يؤثر على سرعة تطوير الميزة).
- صعوبة تحديد ما يُختبر.

### التوصية (تدريجية، بلا كسر)
`MusicPage.tsx` تحديداً: استخرج المكوّنات الفرعية إلى
`components/music/`:

```
components/music/
  MusicPage.tsx          (~400 سطر: الحالة والربط فقط)
  ModeTabs.tsx
  SearchBar.tsx
  SourceChips.tsx
  TrackRow.tsx           (Local + Online + YouTube موحّدة)
  NowPlaying.tsx
  Transport.tsx
  SeekBar.tsx
  VolumeControl.tsx
  YouTubeSetup.tsx
  OverlaySwitch.tsx
```

نفس المنطق لـ `App.tsx`: الشاشات موجودة كمكوّنات بالفعل، فالمتبقي هو منطق
التنقل والاختصارات — استخرجه إلى `hooks/use-launcher-navigation.ts`.

**لا تفعل هذا كإعادة كتابة شاملة.** انقل مكوّناً واحداً في كل تغيير، مع بقاء
البوابات خضراء.

---

## 4. نقاط أداء إيجابية ✅

هذه اختيارات صحيحة تستحق الحفاظ عليها:

| الميزة | الموضع | لماذا مهمة |
|---|---|---|
| كاش الأغلفة على القرص | `music/artwork/` | لا إعادة تنزيل بعد أول مرة |
| `preload='metadata'` على `<audio>` | `music-engine.ts` | لا تحميل كامل قبل الضغط على تشغيل |
| مدة البحث 450 ms | `SEARCH_DELAY_MS` في MusicPage | لا طلب لكل ضغطة مفتاح |
| بحث متوازٍ للمصادر | `searchAll` + `Promise.allSettled` | مصدر بطيء لا يعطّل الباقي |
| حد 25 نتيجة يوتيوب | `MAX_RESULTS` | لا قوائم ضخمة |
| حد 40 نتيجة أونلاين | `online/service.ts` | نفس السبب |
| إخلاء توكنات FIFO | `MAX_TOKEN_ENTRIES=4_000` | ذاكرة محدودة |
| فحص مكتبة متزامن محدود | `PARSE_CONCURRENCY=4` | لا يفتح 8000 ملف مرة واحدة |
| كتابة ذرّية | `writeJsonFileAtomic` | لا ملفات تالفة |
| استخراج واحد لكل فيديو | `extractions` Map | لا تحميلات مكررة |

---

## 5. ملاحظة عن زمن الاختبارات 🟡

### المشكلة
`npm test` يستغرق **2.67 s** لـ **36 ملفاً / 367 اختباراً**. Vite يُظهر أن
تشغيل 36 عاملاً (worker) يستغرق ~920 ms لكل عامل في الإقلاع، ويقترح
`isolate: false` لتوفير ~307 ms.

### الأثر
غير مؤثر عملياً (كل شيء أقل من 3 ثوان). لكن مع CI على كل push، كل ثانية تتكرر.

### التوصية
في `vitest.config.mts`:
```ts
test: {
  environment: 'node',
  include: ['src/**/*.test.ts'],
  restoreMocks: true,
  pool: 'threads',
  isolate: false,   // الاختبارات هنا نقية بلا حالة مشتركة
}
```
**تحقّق أولاً** أن لا اختبار يعتمد على حالة مشتركة (كل الاختبارات الحالية دوال
نقية تقريباً، فالاحتمال منخفض).

---

## 6. ملخص الملف

| # | العنصر | الخطورة | الحالة |
|---|---|---|---|
| 1 | حزمة واحدة 1.79 MB، بلا lazy | 🟡 | مفتوح |
| 2 | مؤقّت 500 ms دائم في الـ overlay | 🟡 | مفتوح |
| 3 | ملفات ضخمة (2,148 / 1,451 / 1,105) | 🟡 | مفتوح |
| 4 | خيارات أداء سليمة | ✅ | حافظ عليها |
| 5 | زمن إقلاع الاختبارات | 🔵 | اختياري |
