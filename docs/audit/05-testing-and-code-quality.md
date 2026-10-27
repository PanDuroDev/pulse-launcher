# 5. الاختبارات وجودة الكود (Testing & Code Quality)

---

## 1. لا يوجد `ErrorBoundary` 🔴

### المشكلة
البحث في `src` عن `ErrorBoundary` أو `componentDidCatch` أو
`getDerivedStateFromError` يعيد **صفر** نتائج.

`src/renderer/src/main.tsx`:
```tsx
createRoot(document.getElementById('root')!).render(
  <StrictMode>{isOverlay ? <MusicOverlay /> : <App />}</StrictMode>,
)
```

لا شيء يعترض استثناءً أثناء الرسم.

### الأثر
أي خطأ غير متوقع في أي مكوّن (بيانات API بشكل غير متوقع، `undefined` في مكان
مفترض، فشل `JSON.parse`، استثناء في `useMemo`) يجعل React يهدم الشجرة كاملة:
**شاشة سوداء/بيضاء بلا أي رسالة**. المستخدم لا يعرف ما حدث ولا يستطيع التعافي
إلا بإغلاق التطبيق من مدير المهام.

هذا خطر واقعي جداً هنا لأن التطبيق يستهلك بيانات من 3 شبكات خارجية
(YouTube API، خمسة كتالوجات، yt-dlp) لا يتحكم بشكلها.

### التوصية
حوّل الـ boundary إلى مكوّن صغير وأضفه مرتين (رئيسي + overlay):

```tsx
// src/renderer/src/components/ErrorBoundary.tsx
import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'

interface Props { children: ReactNode; fallbackLabel: string }
interface State { error: Error | null }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // لا يوجد console في المشروع؛ مرّر التقرير إلى main عبر IPC
    window.launcher.app.reportRendererError?.({
      message: error.message,
      stack: info.componentStack ?? '',
    })
  }

  render(): ReactNode {
    if (!this.state.error) return this.props.children
    return (
      <div className="grid h-full place-items-center p-8 text-center">
        <div>
          <p className="text-lg font-semibold text-white">{this.props.fallbackLabel}</p>
          <p className="mt-2 max-w-md text-sm text-white/55">{this.state.error.message}</p>
          <button
            type="button"
            onClick={() => this.setState({ error: null })}
            className="mt-4 rounded-full bg-white/10 px-4 py-2 text-sm text-white"
          >
            Try again
          </button>
        </div>
      </div>
    )
  }
}
```

ثم في `main.tsx`:
```tsx
<ErrorBoundary fallbackLabel={isOverlay ? 'Music overlay stopped' : 'Pulse hit an error'}>
  {isOverlay ? <MusicOverlay /> : <App />}
</ErrorBoundary>
```

أضف قناة `app:renderer-error` في `src/shared/ipc.ts` لتسجيل الخطأ في
`logs/main.log` عبر `electron-log`. هذا يحوّل "شاشة بيضاء غامضة" إلى تقرير
قابل للتشخيص.

---

## 2. تغطية الاختبارات: قوية في الأماكن الخطأ 🟠

### القياس
**36 ملف اختبار / 367 اختباراً / 4,479 سطراً** — رقم جيد جداً لمشروع بهذا الحجم.

لكن التوزيع يكشف نمطاً:

| مُختبَر ✅ | غير مُختبَر ❌ |
|---|---|
| `music/online/providers.ts` | `music/youtube/service.ts` (517) |
| `music/online/ranking.ts` | `music/youtube/tools.ts` (275) |
| `music/online/service.ts` | `music/youtube/command.ts` (143) |
| `music/youtube/api.ts` | `music/youtube/config.ts` (72) |
| `music/youtube/parse.ts` | `music/library.ts` (478) |
| `music/youtube/ytdlp.ts` | `music/config.ts`, `music/demo.ts`, `music/overlay.ts` |
| `renderer/src/lib/music-queue.ts` | `renderer/src/lib/music-engine.ts` (393) |
| | `hooks/use-music-engine.ts`, `store/music.ts` |
| | `MusicPage.tsx` (2,148), `MusicOverlay.tsx` |

### الأثر — الدليل من هذه الجلسة
كل الأخطاء الحقيقية الأربعة التي اكتُشفت أثناء التطوير كانت في الطبقات
**غير المُختبَرة**:

1. **صورة 502** — `youtube-art` جرّب عنواناً واحداً فقط، و`maxresdefault` غير
   موجود لكثير من الفيديوهات → أُصلح بقائمة مرشحين في `protocol.ts` + `service.ts`.
2. **لوحة Setup تُفرّغ المفتاح** — فتحها من تبويب All لم يحمّل القيم المحفوظة،
   فالضغط على Save كتب `''` فوق المفتاح → أُصلح بـ `draftSynced` + `toggleSetup`.
3. **بحث API ناجح بصفر نتائج** كان يُشغّل احتياط yt-dlp البطيء → المستخدم ينتظر
   ثوانٍ ليعرف أنه لا توجد نتائج → أُصلح بـ `apiFailed` flag.
4. **رسائل خطأ yt-dlp خام** — المرشّح كان يبحث عن `ERROR:` في بداية السطر،
   لكن yt-dlp يكتب `[youtube] <id>: ERROR:` → المستخدم يرى نصاً تقنياً → أُصلح
   بمرشّح `/(?:^|\s)ERROR:/i` واختبارات جديدة.

المشترك: كلها في كود يتعامل مع **شبكة، عمليات، أو قرص** — أي بالضبط ما لا
تختبره الاختبارات الحالية لأنها دوال نقية.

### التوصية — بترتيب الأولوية
1. **`youtube/service.ts`** — اختبر بـ `vi.mock` لـ `./api`, `./ytdlp`,
   `./tools`: مسار الكاش، مسار الاستخراج، تدهور API، دمج النتائج.
2. **`music/library.ts`** — اختبر `scanFolder` على شجرة مجلدات مؤقتة حقيقية
   (`mkdtemp`): الحدود (عمق، عدد، حجم)، تجاهل الامتدادات، التخزين المؤقت.
3. **`youtube/tools.ts`** — اختبر ترتيب الاكتشاف (configured → user bin → path)
   ورسائل الخطأ، مع `stat`/`runCommand` مُموَّهة.
4. **`lib/music-engine.ts`** — يحتاج بيئة DOM. إما `happy-dom` (إضافة اعتمادية
   اختبار) أو استخرج منطق الطابور إلى دوال نقية في `music-queue.ts` (الموجود
   بالفعل، والنمط الذي نجح).
5. **`MusicPage.tsx`** — لا تختبره كمكوّن؛ استخرج المنطق (البحث الموحّد،
   الفلترة، عدّ المصادر) إلى `lib/music-search.ts` واختبره.

**الهدف الواقعي:** رفع التغطية من 7 ملفات منطقية إلى 12–14، وليس 100%.

---

## 3. 11 `eslint-disable` — 10 منها مورَّثة ✅

### القياس
| الملف | العدد | النوع |
|---|---|---|
| `components/bloub/react/BloubBot.tsx` | 10 | `react-hooks/exhaustive-deps` |
| `components/launcher/BrandMark.tsx` | 1 | `react-hooks/exhaustive-deps` |

الأسطر في `BloubBot.tsx`: 318, 327, 336, 345, 363, 369, 375, 380, 396, 412.

### التقييم
- العشرة الأولى في **كود Bloub المضمَّن** (محرّك vendored بتعليقات فرنسية).
  حسب قواعد المشروع: لا تُعدَّل. ✅
- `BrandMark.tsx:125` هو الوحيد في كود المشروع. تعطيل `exhaustive-deps` مقبول
  لتأثير حركي يُشغَّل مرة واحدة، لكن أضف تعليقاً يشرح **لماذا** إن لم يكن موجوداً.

---

## 4. نقاط نظافة ممتازة ✅

| المقياس | النتيجة |
|---|---|
| `TODO` / `FIXME` / `HACK` / `XXX` | **0** |
| `@ts-ignore` / `@ts-expect-error` | **0** |
| `console.*` في `src` | **0** |
| `any` صريح | **0** |
| `npm audit --omit=dev` | **0 ثغرات** |
| `lint` | **4 تحذيرات / 0 أخطاء** (خط الأساس) |
| `typecheck` | نظيف (strict + `noUncheckedIndexedAccess` + `verbatimModuleSyntax` + `erasableSyntaxOnly`) |

هذه أرقام استثنائية. المشروع يستخدم TypeScript بأقصى صرامته، ولا يوجد أي
تسريب تشخيصي إلى السجل، ولا أي كبت للأنواع.

---

## 5. التصديرات الميتة 🟡

تفصيلها في [03-music-and-youtube.md §7](03-music-and-youtube.md#7-8-تصديرات-ميتة).
الملخص: 8 تصديرات بلا مستخدم، 7 منها في كود المشروع. التنظيف مجاني بلا مخاطر.

---

## 6. الأخطاء المبتلعة 🟠

تفصيلها في [02-security.md §3](02-security.md#3-أخطاء-مبتلعة-بلا-تسجيل).
الملخص: **45** في main + **19** في الريندرر = **64** حالة فشل صامتة.

---

## 7. تعليقات الكود: مراجعة إيجابية ✅

التعليقات في هذا المشروع تشرح **لماذا** لا **ماذا**، وهذا نادر. أمثلة حقيقية:

```ts
// tools.ts — لماذا لا نُحمّل ffmpeg تلقائياً
// (مقتبس) FFmpeg is never auto-downloaded; its missing error says to run
// `winget install Gyan.FFmpeg` and press Refresh.

// command.ts — لماذا نقتل الشجرة
// yt-dlp starts ffmpeg as a child. Killing only yt-dlp can leave ffmpeg
// holding the temp file and the download lock.

// online/service.ts — لماذا نتحقق من المضيف
// A remote URL is only proxied if it is HTTPS on a public hostname... a
// malicious catalog item must not be able to turn the token endpoint into an
// SSRF probe of localhost or a LAN address.

// music-engine.ts — لماذا الاستخراج غير متزامن
// Search rows intentionally carry no stream URL. The main process downloads
// and converts the MP3 once, then the resolved track joins the queue so
// next/previous do not extract it again.
```

هذا النمط هو السبب الرئيسي في أن الكود مفهوم رغم حجمه. حافظ عليه.

---

## 8. ملخص الملف

| # | العنصر | الخطورة | الحالة |
|---|---|---|---|
| 1 | لا `ErrorBoundary` | 🔴 | مفتوح |
| 2 | التغطية في الطبقات النقية فقط | 🟠 | مفتوح |
| 3 | 11 `eslint-disable` (10 مورَّثة) | ✅ | مقبول |
| 4 | نظافة الكود (0 TODO/any/console) | ✅ | ممتاز |
| 5 | 8 تصديرات ميتة | 🟡 | مفتوح |
| 6 | 64 `catch` صامت | 🟠 | مفتوح |
| 7 | جودة التعليقات | ✅ | ممتاز |
