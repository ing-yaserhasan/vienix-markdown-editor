# نظرة عامة على المنتج (Product Overview)

## ما هو Vienix Markdown Editor؟

**Vienix Markdown Editor** هو محرر ماركداون احترافي مفتوح المصدر يعمل بالكامل في المتصفح (Web Application)، صُمم خصيصاً لدعم اللغة العربية والكتابة من اليمين لليسار (RTL) بشكل أصيل وليس كإضافة لاحقة.

- **المطور:** Yaser Hasan (Vienix)
- **الترخيص:** MIT License
- **الموقع:** `vienixmarkdown.yaserhasan.at`
- **حقوق النشر:** © 2026

---

## الفكرة الأساسية

يهدف التطبيق إلى تقديم بيئة كتابة وتحرير ماركداون متكاملة للمستخدم العربي، تجمع بين:

1. **محرر نصي (Textarea)** يدعم RTL بشكل افتراضي مع Syntax Highlighting.
2. **معاينة مباشرة (Live Preview)** تعرض النص المنسّق لحظياً أثناء الكتابة.
3. **مخططات تفاعلية (Mermaid Diagrams)** تُرسم مباشرة داخل المعاينة.
4. **تصدير متعدد الصيغ** إلى PDF وDOCX وHTML وMarkdown وكتاب احترافي.
5. **نظام حجرات تخزينية (Chambers)** يسمح بالعمل على عدة مسودات وفصول بالتوازي.
6. **مستكشف ملفات شجري (Explorer)** بنمط Obsidian لتنظيم المحتوى في مجلدات وملفات.
7. **مزامنة سحابية مع Google Drive** بنقرة واحدة (1-Click Connect).

---

## المستخدم المستهدف

| الفئة | الاحتياج |
|-------|---------|
| **الكتّاب والمؤلفون العرب** | تحرير فصول كتاب بالعربية مع تصدير احترافي |
| **المطورون العرب** | توثيق تقني بالعربية مع دعم الأكواد والمخططات |
| **الطلاب والباحثون** | تدوين ملاحظات منظمة مع تصدير PDF |
| **متعلمو اللغات** | ميزة مساعد النطق الصوتي (Pronunciation Assistant) للتدرب على اللغات الأجنبية |
| **المدونون** | كتابة مقالات بالماركداون مع معاينة فورية وتصدير HTML |

---

## طريقة العمل

### البنية التقنية الحالية
- **تطبيق صفحة واحدة (SPA)** بدون أي Framework — HTML + CSS + Vanilla JavaScript خالص.
- **يعمل بدون إنترنت 100%** (Offline-First) باستثناء ميزتي Google Drive والخطوط الخارجية.
- **التخزين محلي بالكامل:** IndexedDB (أساسي) + localStorage (احتياطي) مع كاش فوري في الذاكرة (0ms).
- **لا يوجد خادم (Server) ولا قاعدة بيانات خارجية** — كل البيانات تبقى على جهاز المستخدم.

### دورة العمل الأساسية
```
المستخدم يكتب في المحرر (textarea)
        ↓
debounce 200ms → renderMarkdown()
        ↓
marked.js يحوّل الماركداون إلى HTML
        ↓
Mermaid.js يرسم المخططات
Prism.js يلوّن الأكواد البرمجية
        ↓
النتيجة تُعرض في لوحة المعاينة (Live Preview)
        ↓
الحفظ التلقائي → IndexedDB + localStorage
```

### واجهتان متوفرتان
1. **الواجهة الحديثة (Modern Mode):** التصميم الأساسي الحالي بشريط أدوات كامل وحجرات ومستكشف.
2. **الواجهة الكلاسيكية (Classic Mode - 2014):** واجهة بسيطة بقسمين متساويين (محرر + معاينة) بدون أدوات متقدمة.

---

## الملفات الرئيسية في المشروع

| الملف | الحجم | الوصف |
|-------|-------|-------|
| [`index.html`](file:///c:/Users/Yaser/Mobiles-Apps/vienix-markdown-editor/index.html) | 232 KB / 3159 سطر | الصفحة الوحيدة — تحتوي كامل هيكل الواجهة والنوافذ المنبثقة |
| [`app/js/rtlmd.js`](file:///c:/Users/Yaser/Mobiles-Apps/vienix-markdown-editor/app/js/rtlmd.js) | 625 KB / 14270 سطر | المنطق الأساسي الكامل للتطبيق |
| [`app/js/vienix-idb.js`](file:///c:/Users/Yaser/Mobiles-Apps/vienix-markdown-editor/app/js/vienix-idb.js) | 17 KB / 457 سطر | محول IndexedDB مع كاش فوري في الذاكرة |
| [`app/js/storage-backup.js`](file:///c:/Users/Yaser/Mobiles-Apps/vienix-markdown-editor/app/js/storage-backup.js) | 38 KB / 833 سطر | مراقب صحة التخزين والنسخ الاحتياطي الشامل |
| [`app/js/vienix-drive.js`](file:///c:/Users/Yaser/Mobiles-Apps/vienix-markdown-editor/app/js/vienix-drive.js) | 49 KB / 1038 سطر | محرك المزامنة السحابية مع Google Drive |
| [`app/js/autogrow.js`](file:///c:/Users/Yaser/Mobiles-Apps/vienix-markdown-editor/app/js/autogrow.js) | 1.3 KB | نمو تلقائي لحقل النص |
| [`app/css/style.css`](file:///c:/Users/Yaser/Mobiles-Apps/vienix-markdown-editor/app/css/style.css) | 260 KB / 10709 سطر | نظام التصميم الكامل (فاتح + داكن) |
| [`app/css/classic.css`](file:///c:/Users/Yaser/Mobiles-Apps/vienix-markdown-editor/app/css/classic.css) | 12 KB | تنسيقات الوضع الكلاسيكي |

### المكتبات الخارجية (Vendor)

| المكتبة | الملف | الغرض |
|---------|-------|-------|
| **Marked.js** | `assets/vendor/marked.min.js` | تحويل الماركداون إلى HTML |
| **Mermaid.js** | `assets/vendor/mermaid.min.js` (3.3 MB) | رسم المخططات التفاعلية |
| **Prism.js** | `assets/vendor/prism.min.js` | تلوين الأكواد البرمجية |
| **html2pdf** | `assets/vendor/html2pdf.bundle.min.js` | تصدير PDF |
| **html-docx** | `assets/vendor/html-docx.js` | تصدير DOCX |
| **Turndown** | `assets/vendor/turndown.js` + GFM plugin | تحويل HTML إلى Markdown (للـ WYSIWYG) |
| **jQuery** | `assets/jquery/` | مكتبة مساعدة (استخدام محدود) |

### الخطوط

| الخط | النوع | الاستخدام |
|------|-------|----------|
| **Tajawal** | محلي (TTF: 400, 500, 700) | الخط الأساسي للواجهة والمعاينة |
| **JetBrains Mono / Fira Code** | Google Fonts (بعيد) | خط المحرر والأكواد |
| **Cairo, Almarai, IBM Plex Sans Arabic, Noto Sans Arabic** | Google Fonts (بعيد) | خطوط بديلة اختيارية في المعاينة |

---

## الفلسفة المعمارية

يتبع التطبيق فلسفة **Local-First + Personal Cloud**:

1. **كل شيء يعمل محلياً أولاً** — لا اعتماد على خادم أو اتصال إنترنت.
2. **المزامنة السحابية اختيارية** — Google Drive فقط، بصلاحيات محدودة (`drive.file`).
3. **لا تسريب بيانات** — لا تُرسل أي بيانات لأي خادم خارجي.
4. **الكود بالكامل في المتصفح** — JavaScript خالص بدون Frameworks أو Build Tools.
