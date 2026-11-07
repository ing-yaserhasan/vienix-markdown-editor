# رموز ومواصفات التصميم (Design Tokens)

> هذا الملف يستخرج بدقة جميع رموز التصميم (Design Tokens) من الكود المصدري الرسمي للتطبيق في [`app/css/style.css`](file:///c:/Users/Yaser/Mobiles-Apps/vienix-markdown-editor/app/css/style.css) لتمكين مطور أندرويد من إعادة إنشائها كـ Compose Theme متطابق.

---

## 1. لوحة الألوان (Color Palette)

### 1.1 النمط الفاتح (Light Theme)
```kotlin
val LightBgApp = Color(0xFFF4F6F9)
val LightBgSurface = Color(0xFFFFFFFF)
val LightBgSurfaceElevated = Color(0xFFFFFFFF)
val LightBgHeader = Color(0xFFFFFFFF)
val LightBgToolbar = Color(0xFFF8FAFC)
val LightBgHover = Color(0xFFF1F5F9)
val LightBgActive = Color(0xFFE2E8F0)

val LightBorderColor = Color(0xFFE2E8F0)
val LightBorderLight = Color(0xFFEDF2F7)

val LightTextPrimary = Color(0xFF0F172A)
val LightTextSecondary = Color(0xFF334155)
val LightTextMuted = Color(0xFF64748B)
val LightTextFaint = Color(0xFF94A3B8)

val LightAccentColor = Color(0xFF3B82F6)
val LightAccentHover = Color(0xFF2563EB)
val LightAccentLight = Color(0xFFEFF6FF)
val LightAccentGlow = Color(0x263B82F6)

val StatusSuccess = Color(0xFF10B981)
val StatusSuccessBg = Color(0xFFECFDF5)
val StatusWarning = Color(0xFFF59E0B)
val StatusDanger = Color(0xFFEF4444)
```

### 1.2 النمط الداكن (Dark Theme) - `[data-theme="dark"]`
```kotlin
val DarkBgApp = Color(0xFF0B0F17)
val DarkBgSurface = Color(0xFF131B26)
val DarkBgSurfaceElevated = Color(0xFF1A2434)
val DarkBgHeader = Color(0xFF101722)
val DarkBgToolbar = Color(0xFF131B26)
val DarkBgHover = Color(0xFF1F2B3E)
val DarkBgActive = Color(0xFF28374F)

val DarkBorderColor = Color(0xFF1E293B)
val DarkBorderLight = Color(0xFF182232)

val DarkTextPrimary = Color(0xFFF8FAFC)
val DarkTextSecondary = Color(0xFFCBD5E1)
val DarkTextMuted = Color(0xFF94A3B8)
val DarkTextFaint = Color(0xFF64748B)

val DarkAccentColor = Color(0xFF3B82F6)
val DarkAccentHover = Color(0xFF60A5FA)
val DarkAccentLight = Color(0x263B82F6)
val DarkAccentGlow = Color(0x403B82F6)

val DarkStatusSuccess = Color(0xFF34D399)
val DarkStatusSuccessBg = Color(0x2610B981)
val DarkStatusWarning = Color(0xFFFBBF24)
val DarkStatusDanger = Color(0xFFF87171)
```

---

## 2. الخطوط والطباعة (Typography)

### 2.1 عائلات الخطوط (Font Families)
- **الخط العربي الأساسي**: `Tajawal` مع خطوط بديلة (`-apple-system`, `Segoe UI`, `Roboto`, `sans-serif`).
- **الخط البرمجي (Monospace)**: `'JetBrains Mono', 'Fira Code', 'Cascadia Code', 'Consolas', monospace`.
- **خطوط عربية مدعومة في الإعدادات**:
  - Amiri (خط نسخي تقليدي للقراءة والكتب)
  - Cairo (خط عصري هندسي)
  - Scheherazade New (خط عربي كلاسيكي)
  - Almarai / Readex Pro / IBM Plex Sans Arabic.

### 2.2 مقاييس النصوص (Font Sizes & Line Heights)
- **محرر النصوص الافتراضي**: `16sp` (قابل للزيادة والنقصان في الإعدادات من 12sp إلى 28sp).
- **ارتفاع السطر الافتراضي**: `1.8` (لتوفير راحة بصرية فائقة للنصوص والتشكيل العربي).
- **العناوين (Headings)**:
  - H1: `2.0rem` (~`32sp`)، وزن غامق 700.
  - H2: `1.5rem` (~`24sp`)، وزن غامق 700.
  - H3: `1.25rem` (~`20sp`)، وزن 600.
  - H4: `1.1rem` (~`18sp`)، وزن 600.
  - H5 / H6: `1.0rem` (~`16sp`)، وزن 600.
- **شريط الحالة والمعلومات**: `12sp` / `13sp`، لون `--text-muted`.

---

## 3. نصف أقطار الحواف (Border Radii)

- **`radius-sm`**: `6dp` (للأزرار الصغيرة ومربعات الإدخال الخفيفة).
- **`radius-md`**: `10dp` (للبطاقات والأزرار الرئيسية وأشرطة الأدوات).
- **`radius-lg`**: `14dp` (للنوافذ المنبثقة والقوائم المعلقة).
- **`radius-full`**: `9999dp` (للشارات الدائرية Pill Badges وأزرار الأيقونات الدائرية).

---

## 4. الظلال والإسقاطات (Elevation & Shadows)

- **`shadow-sm`**: ارتفاع `1dp` إلى `2dp`.
- **`shadow-md`**: ارتفاع `4dp` (لشريط الأدوات والبطاقات العائمة).
- **`shadow-lg`**: ارتفاع `8dp` (للقوائم المنسدلة).
- **`shadow-dropdown / modal`**: ارتفاع `16dp` إلى `24dp` (للنوافذ المنبثقة).

---

## 5. قواعد اتجاه الواجهة (RTL Specifications)

- **الاتجاه العام**: الواجهة بالكامل مبنية أصلاً لدعم `LayoutDirection.Rtl`.
- **محاذاة النصوص**:
  - النصوص العربية تبدأ من اليمين `TextAlign.Right` أو `TextAlign.Start`.
  - الأكواد البرمجية داخل كتل `pre` و `code` تبقى دائماً `ltr` من اليسار لليمين.
- **انعكاس الأيقونات**:
  - الأسهم الموجهة (التنقل، التالي، السابق، التراجع، الإعادة) تعكس اتجاهها تلقائياً عند تفعيل RTL.
  - الأيقونات الرمزية المحايدة (حفظ، نسخ، إعدادات، صورة) لا تتغير.
- **حماية تشابك الحروف العربية**: عدم استخدام `letterSpacing` سالب أو موجب مع الحروف العربية للحفاظ على ترابط الخط العربي الأصيل.
