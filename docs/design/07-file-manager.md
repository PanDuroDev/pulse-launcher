# مدير الملفات الموحّد — خطة

| | |
|---|---|
| **التاريخ** | 2026-10-27 |
| **النوع** | خطة فقط — **لم يُعدَّل أي ملف مصدري** |
| **الفرع** | `design/file-manager-plan` (مبني فوق `design/simplification-review`) |
| **يعتمد على** | `05-screen-simplification.md` §0 (الإطار والألواح) و§5 (الإضافة) |

---

## 1. المشكلة بجملة واحدة

التطبيق يملك **مدير ملفات داخلياً**، لكنه مربوط بلعبتين فقط (`game` و`image`)،
وكل مسار آخر يفتح نافذة ويندوز الأصلية — فيتجاور أسلوبان مختلفان في نفس الشاشة،
والثاني يخرج بالمستخدم من واجهة الأريكة إلى سطح المكتب.

### الحالة الآن بالأرقام

| المسار | ما يُفتح | الموضع |
|---|---|---|
| إضافة لعبة (`.exe`/`.lnk`) | مدير ملفات داخلي | `AddGamePage.tsx` → `library.list(path, 'game')` |
| اختيار غلاف مخصّص | مدير ملفات داخلي | `AddGamePage.tsx` بوضع `'image'` |
| **إضافة مجلد موسيقى** | **نافذة ويندوز الأصلية** | `src/main/index.ts:929-950` → `dialog.showOpenDialog` |
| إزالة مجلد موسيقى | بلا واجهة ملفات (قائمة داخل الإعدادات) | `MusicPage.tsx` |

`dialog.showOpenDialog` هو **آخر استخدام** لـ`dialog` في المشروع كله (سطرا 933
و938 في `src/main/index.ts`). أي أن إزالة هذا الاستخدام تُخرج `dialog` من
الملف نهائياً.

### لماذا هذا خطأ أكبر من «شكل»

1. **كسر التركيز**: النافذة الأصلية نافذة نظام، لا تخضع لتنقّل اليد ولا لمفاتيح
   التركيز ولا لـEsc، وتُخرج مؤشر الفأرة للظهور.
2. **تناقض العقد**: تعليق الواجهة في `src/shared/types.ts:582` يقول «In-app
   browsing … No native dialog» بينما `:596` يقول `addFolder` «Opens the native
   folder picker». نفس الملف يعِد بشيئين.
3. **لا تخصيص**: المدير الحالي لا يعرف إلا نوعين. أي حاجة جديدة (مجلد موسيقى،
   مجلد ألعاب، ملف صوتي واحد، عدة مجلدات معاً) تعني إمّا تعديل الـenum أو فتح
   نافذة نظام.
4. **لا اختيار متعدد**: المدير الداخلي يختار عنصراً واحداً؛ الموسيقى تحتاج
   عدة مجلدات، لكنها اليوم تحصل عليها من النافذة الأصلية فقط.

---

## 2. الهدف

> مدير ملفات واحد، داخلي، يعمل في كل التطبيق، ويُخصَّص **من المُتصل** لا من الكود
> المشترك.

القاعدة الحاكمة: **مُتصل واحد يطلب، ومدير واحد ينفّذ**. لا نكتب مديراً ثانياً،
ولا نضيف فرعاً جديداً في `listDirectory` لكل ميزة.

---

## 3. الشكل المقترح

لوح واحد فوق الوجهة الحالية (نفس عقد §0 في `05-screen-simplification.md`)،
بعرض `min(960px, 92vw)` وارتفاع `min(80vh, 640px)`:

```
┌──────────────────────────────────────────────────────────────────┐
│  Add a music folder                                        ✕     │
│  ┌──────────────┬────────────────────────────────┬─────────────┐ │
│  │ 🔍 Find…     │  C: › Users › me › Music       │  Selected   │ │
│  │              │  ┌───────────────────────────┐ │  ┌───────┐  │ │
│  │ PLACES       │  │ 📁 Albums                 │ │  │ cover │  │ │
│  │  Home        │  │ 📁 Playlists              │ │  │ name  │  │ │
│  │  Desktop     │  │ 🎵 track-01.mp3           │ │  │ 12 MB │  │ │
│  │  Downloads   │  │ 🎵 track-02.flac          │ │  └───────┘  │ │
│  │ DRIVES       │  │ …                         │ │  3 folders  │ │
│  │  Local (C:)  │  └───────────────────────────┘ │  [ Add 3 ]  │ │
│  │  Local (D:)  │  400 entries · truncated       │             │ │
│  └──────────────┴────────────────────────────────┴─────────────┘ │
└──────────────────────────────────────────────────────────────────┘
```

أربع مناطق فقط، كل واحدة لها سبب:

| المنطقة | لماذا لا تُحذف |
|---|---|
| الأماكن/الأقراص (يمين في RTL) | بدونها يبدأ المستخدم من `C:\` في كل مرة |
| المسار (breadcrumbs) + البحث | بدونها لا يمكن العودة درجة واحدة أو الوصول لمجلد عميق |
| القائمة | المحتوى نفسه |
| لوح الاختيار | يُظهر ما سيُضاف **قبل** الإضافة، ويمنع إضافة مجلد خاطئ |

ما **لا** يدخل هذه النسخة (وسيُذكر في §9): تبويبات، إعادة تسمية، حذف، نقل،
سحب وإفلات، قائمة سياق من النظام، معاينة داخلية للملفات.

---

## 4. العقد: من `PickerKind` إلى `PickerFilter`

### الآن

```ts
export type PickerKind = 'game' | 'image'          // types.ts:174
list: (directory: string, kind?: PickerKind) => Promise<DirectoryListing>  // :585
```

### المقترح

```ts
/** What one caller is allowed to pick. Every field is a restriction, never a hint. */
export interface PickerFilter {
  /** Folders are always listed so the user can navigate; this decides what is selectable. */
  select: 'file' | 'folder' | 'both'
  /** Lower-case extensions without the dot. Empty = any extension. */
  extensions?: string[]
  /** False for "pick a folder"; true for "pick these files". */
  multiple?: boolean
  /** Optional start location; falls back to the first place. */
  startPath?: string
}

list: (directory: string, filter: PickerFilter) => Promise<DirectoryListing>
roots: (filter: PickerFilter) => Promise<PickerRoots>
```

الفرق الجوهري: `PickerKind` كان **نوعاً مغلقاً** يُترجم داخل
`library-browser.ts` إلى مجموعة امتدادات ثابتة (`GAME_EXTENSIONS`,
`IMAGE_EXTENSIONS`). `PickerFilter` يصف **ما هو قابل للاختيار** مباشرةً، فيصبح
المدير عاماً دون أن يعرف شيئاً عن الألعاب أو الصور أو الموسيقى.

التبديل في `library-browser.ts` يصير سطراً واحداً بدل فرع:

```ts
const allowed = filter.extensions?.length
  ? new Set(filter.extensions.map((ext) => `.${ext.toLowerCase()}`))
  : null
const selectable = (ext: string): boolean => !allowed || allowed.has(ext)
```

التحقق من الصلاحية يبقى في **الخادم**: `extensions` تُفحص بـ`/^[a-z0-9]{1,8}$/`
قبل الاستخدام (منع `*` أو أنماط glob)، والحد الأقصى 32 امتداداً. أي فلتر غير
صالح = رفض الطلب، لا تجاهله.

### الدوال الموجودة التي تبقى كما هي

- `isBrowsablePath` — لا تغيير (يرفض UNC/device/relative، سقف 1024).
- `pathCrumbs`, `listingError`, `compareEntries`, `MAX_DIRECTORY_ENTRIES = 400`,
  `IGNORED_NAMES`, `listDrives`, `resolvePlaces`, `driveLocations` — لا تغيير.
- `assertTrustedSender` على قناة `library.*` — لا تغيير.

---

## 5. إغلاق النافذة الأصلية

هذا هو التغيير الذي يلمس عقد IPC، ولذلك يُنفَّذ في خطوة مستقلة قابلة للتراجع:

| الآن | المقترح |
|---|---|
| `music.addFolder()` بلا وسيط، يفتح نافذة ويندوز | `music.addFolders(paths: string[])` بمصفوفة مسارات |
| الإضافة تتم داخل نفس القناة بعد اختيار النظام | الإضافة في الخادم بعد تحقق، والاختيار مسؤولية الواجهة |
| `dialog.showOpenDialog` في `index.ts:929-950` | يُحذف، ومع آخر استخدام يُحذف `dialog` من الاستيراد |

```ts
const MusicFoldersSchema = z
  .object({ paths: z.array(z.string().min(1).max(1024)).min(1).max(32) })
  .strict()

ipcMain.handle(IPC.musicAddFolders, async (event, payload): Promise<MusicLibrarySnapshot> => {
  assertMusicSender(event)
  const { paths } = MusicFoldersSchema.parse(payload)
  let snapshot = music.snapshot
  for (const folder of paths) {
    if (!isBrowsablePath(folder)) throw new Error('Choose folders on a local drive.')
    snapshot = await music.addFolder(folder)
  }
  return snapshot
})
```

سقف 32 مجلداً في الطلب الواحد ليس تحكّماً اعتباطياً: `addFolder` يستدعي
`rescan()` كاملاً، و32 مسحاً متتالياً في طلب واحد أسوأ من رفض الطلب.

**التحقق المزدوج مقصود**: الواجهة تفلتر، والخادم يتحقق مرة أخرى. الفلترة في
الواجهة تجربة استخدام، والتحقق في الخادم أمن.

---

## 6. المكوّنات التي تُنشأ (ثلاثة فقط)

| المكوّن | المسؤولية | يُستبدل به |
|---|---|---|
| `FileManager` (`components/file-manager/FileManager.tsx`) | اللوح كاملاً: الأماكن، المسار، القائمة، الاختيار، الأزرار | جسم `AddGamePage.tsx` (سطور ~160-900 من نسخة الملف الحالية) |
| `use-file-manager.ts` | الحالة: `listing`, `places`, `selected[]`, `query`, `requestRef`، `openPath` | منطق `AddGamePage.tsx:274-520` |
| `file-manager-config.ts` (`lib/`) | الفلاتر الجاهزة: `PICK_GAME`, `PICK_IMAGE`, `PICK_MUSIC_FOLDERS` | ثوابت مبعثرة في الشاشات |

لا `Provider`، لا `Context`، لا `store`. كل استدعاء يمرّر فلتره كخاصية، لأن
اللوح واحد في كل مرة (لا يوجد لاحقاً أكثر من مدير ملفات مفتوح).

### واجهة الخاصية

```ts
interface FileManagerProps {
  open: boolean
  title: string
  filter: PickerFilter
  confirmLabel: (count: number) => string
  onClose: () => void
  onConfirm: (paths: string[]) => void | Promise<void>
  busy?: boolean
}
```

`onConfirm` يستقبل **مسارات** فقط؛ لا يعرف المدير ماذا سيفعل بها. هذا ما يجعله
عاماً: الإضافة تضيف ألعاباً، الموسيقى تضيف مجلدات، والغلاف يقرأ صورة.

---

## 7. مصفوفة الاستخدام بعد التغيير

| الموضع | الفلتر | الاختيار | النتيجة |
|---|---|---|---|
| إضافة لعبة | `{ select: 'file', extensions: ['exe','lnk'] }` | واحد | `library.add(path)` |
| تغيير الغلاف | `{ select: 'file', extensions: ['png','jpg','jpeg','webp','avif'] }` | واحد | `library.update({ artwork })` |
| إضافة مجلد موسيقى | `{ select: 'folder', multiple: true }` | متعدد | `music.addFolders(paths)` |
| إزالة مجلد موسيقى | لا يحتاج مديراً (قائمة موجودة) | — | كما هو |
| مجلد ألعاب إضافي (مستقبلاً) | `{ select: 'folder', multiple: true }` | متعدد | `library.roots` موجود |

الحالة الثالثة هي سبب هذا الـPR كله.

---

## 8. التركيز والتحكم

يُعاد استخدام نفس عقد §0 في `05-screen-simplification.md` حرفياً:

- فتح اللوح → التركيز على أول مكان.
- `↓/↑` داخل الأماكن، `→` (في RTL: `←`) إلى القائمة، `Enter` على مجلد يدخل،
  `Enter` على ملف/مجلد قابل للاختيار يضيفه إلى لوح الاختيار.
- `Backspace` أو `↑` عند أول عنصر = درجة أعلى (نفس سلوك `listing.parent`).
- `Tab` ينتقل بين: البحث ← الأماكن ← القائمة ← لوح الاختيار ← زر التأكيد.
- `Esc` يمسح الاختيار أولاً، ثم يغلق اللوح ويعيد التركيز إلى الزر الذي فتحه.
- المفاتيح تبقى مشتقة من الهوية: `fm-place-<id>`, `fm-entry-<index>`,
  `fm-crumb-<index>`, `fm-confirm`, `fm-close` — كلها جديدة ولا تتعارض مع
  `add-*` الحالية لأن `AddGamePage` سيُعاد بناؤه فوق `FileManager`.

عدد الأهداف الظاهرة في اللوح ≤ 12 ثابتاً + عنصر لكل صف، مطابقاً لسقف الموسيقى
في `05` §2 (M4).

---

## 9. ما لا يدخل هذه النسخة (وسبب الرفض)

| الفكرة | لماذا لا |
|---|---|
| تبويبات متعددة | تحتاج حالة معقدة لكل تبويب، والفائدة صفر عند اختيار مجلد واحد |
| إعادة تسمية/حذف/نقل | عمليات مدمّرة على نظام ملفات المستخدم؛ تحتاج تأكيداً وسلة محذوفات، وهذا مشروع آخر |
| سحب وإفلات | لا معنى له على جهاز تحكم، ويحتاج مساراً بديلاً بالفأرة |
| قائمة سياق من ويندوز | تعيد الاعتماد على `shell` وتفتح تنفيذاً عشوائياً |
| معاينة داخلية للصور/الصوت | تكلفة فك ترميز كاملة مقابل معلومة موجودة في الاسم والحجم |
| مجلدات شبكة (UNC) | مرفوضة أصلاً في `isBrowsablePath` لأسباب أمنية؛ إدخالها قرار أمني منفصل |
| مفضّلة/الأخيرة | تُؤجَّل حتى يوجد استخدام حقيقي؛ الأماكن الثمانية الحالية تكفي |

هذه القائمة جزء من الخطة: كل بند فيها يُذكر صراحةً كي لا يُعاد اقتراحه لاحقاً
بوصفه «نسياناً».

---

## 10. الخطة التنفيذية (6 PRs صغيرة)

| # | العمل | الملفات | الحجم | البوابة |
|---|---|---|---|---|
| FM1 | `PickerFilter` + `listDirectory`/`roots` يقبلانه، مع الإبقاء على `PickerKind` مُترجَماً داخلياً | `types.ts`, `library-browser.ts`, `index.ts`, `preload` | M | كل اختبارات `library-browser` تمر + اختبارات فلترة جديدة |
| FM2 | `use-file-manager.ts` + `FileManager.tsx` بلا استبدال أي شاشة بعد | 2 ملفان جديدان | L | لا تغيير سلوكي؛ يُختبر بـstory/صفحة مؤقتة أو لا يُدمج قبل FM3 |
| FM3 | `AddGamePage` يُعاد بناؤه فوق `FileManager` (وضع اللعبة + الغلاف) | `AddGamePage.tsx` | M | نفس مسارات التركيز والاختبارات اليدوية؛ 0 قدرات مفقودة |
| FM4 | `music.addFolders(paths)` + حذف `dialog.showOpenDialog` | `index.ts`, `preload`, `types.ts`, `store/music.ts` | S | لا يبقى أي `dialog.` في `src/main` |
| FM5 | زر «Add folder» في الموسيقى يفتح `FileManager` بفلتر المجلدات | `MusicPage.tsx`, `MusicControls.tsx` | S | إضافة مجلدين في طلب واحد تعمل، و«إلغاء» لا يغيّر شيئاً |
| FM6 | حذف `PickerKind` و`GAME_EXTENSIONS`/`IMAGE_EXTENSIONS` الثابتة | 3 ملفات | S | `grep PickerKind` = 0 |

الترتيب مقصود: FM1 وFM4 لا يمسّان الواجهة، فيمكن دمجهما قبل أي تغيير بصري،
وFM2 لا يُدمج قبل FM3 حتى لا يبقى مكوّن ميت في الشجرة.

---

## 11. الأمان — ما يجب أن يبقى حرفياً

هذه ليست تحسينات، بل شروط بقاء:

1. **`assertTrustedSender` على كل قناة `library.*` و`music.addFolders`** — لا
   استثناء، ولا إضافة قناة «للتجربة».
2. **`isBrowsablePath` قبل أي `stat`** — الرفض يسبق لمس نظام الملفات.
3. **لا محتوى ملفات عبر IPC** — أسماء ومسارات وأحجام فقط. الغلاف الحالي يُقرأ
   في الخادم ويُعاد كـ`app://`، وهذا لا يتغيّر.
4. **لا تنفيذ ولا `shell.openPath`** من المدير — الاختيار لا يشغّل شيئاً.
5. **سقف 400 عنصر** لكل قراءة، و`truncated` يُعرض للمستخدم لا يُخفى.
6. **`extensions` تُتحقق بنمط**، لا تُمرَّر إلى `readdir` كفلتر نظام.
7. **Symlinks**: تُقرأ كملفات/مجلدات كما يفعل `stat` الآن. لا `realpath` جديد في
   هذه النسخة، لكن **لا يُتبع** رابط خارج المسارات المسموحة عند الإضافة — وهذا
   سلوك `isBrowsablePath` الحالي، ويُثبَّت باختبار.

---

## 12. الاختبارات المطلوبة

| المستوى | الاختبار |
|---|---|
| وحدة (`library-browser.test.ts`) | فلتر امتدادات واحد، فلتر فارغ = الكل، فلتر غير صالح يُرفض، `select: 'folder'` يجعل الملفات غير قابلة للاختيار لكن مرئية |
| وحدة | `pathCrumbs` على `C:\` ومسار عميق ومسار بمسافات |
| وحدة | `isBrowsablePath` يرفض `\\server\share`، `\\.\pipe\x`، `relative\path`، نصاً أطول من 1024 |
| وحدة | `resolvePlaces` يُسقط المسارات غير الموجودة |
| IPC | `music.addFolders` يرفض مصفوفة فارغة، أكثر من 32، ومساراً غير محلي |
| واجهة | فتح اللوح ثم Esc يعيد التركيز إلى الزر الفاتح |
| واجهة | اختيار مجلدين ثم «Add 2» يستدعي `addFolders` بمصفوفتين |
| واجهة | مجلد بلا ملفات مطابقة يعرض حالة فراغ لا قائمة فارغة صامتة |

البوابة الحالية تبقى كما هي: `npm test` 37 ملفاً / 379 اختباراً **لا تنقص**،
`typecheck` صامت، `lint` 4 تحذيرات، `build` ناجح. الاختبارات الجديدة **تُضاف**
إلى 379، ولا تُستبدل.

---

## 13. المخاطر

| الخطر | التخفيف |
|---|---|
| إعادة بناء `AddGamePage` تكسر مسارات التركيز الحالية | FM3 بوابة صريحة: نفس المفاتيح `add-*` أو بديل موثّق، واختبار يدوي على يد التحكم |
| `addFolders` مع 32 مجلداً = 32 مسحاً | السقف 32، والمسح متسلسل، وزر الإلغاء موجود أصلاً (`music.cancelScan`) |
| نافذة النظام كانت تعرض شبكة/OneDrive | المدير الداخلي لا يعرضها؛ يجب ذكر ذلك في ملاحظات الإصدار كقيد معروف |
| المستخدمون اعتادوا حوار ويندوز | لوح داخلي أكبر وأوضح، ويحفظ آخر مجلد (اختياري، مؤجّل) |

---

## 14. معايير القبول

- [ ] لا يوجد أي `dialog.` في `src/main` بعد FM4.
- [ ] `PickerKind` لم يبقَ له أثر في الشجرة بعد FM6.
- [ ] كل موضع يختار ملفات أو مجلدات يمرّ عبر `FileManager` واحد.
- [ ] `library.list` لا يعرف شيئاً عن «لعبة» أو «صورة» أو «موسيقى».
- [ ] `assertTrustedSender` و`isBrowsablePath` و`MAX_DIRECTORY_ENTRIES` وحد
      الامتدادات المفحوصة موجودة قبل أي `stat`.
- [ ] إضافة مجلدَي موسيقى في طلب واحد تعمل، و«إلغاء» لا يعدّل المكتبة.
- [ ] `npm test` لا يقل عن 379 اختباراً، و`lint` يبقى 4 تحذيرات.
