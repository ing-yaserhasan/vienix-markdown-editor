# مواصفات البيانات والتخزين (Data and Storage Specification)

> هذا الملف يشرح بالتفصيل بنية البيانات المخزنة، مفاتيح التخزين، الجداول، المخططات (Schemas)، وما يقابلها في بنية Android Native الحديثة.
> الملفات المسؤولة عن التخزين في المشروع:
> - [`app/js/vienix-idb.js`](file:///c:/Users/Yaser/Mobiles-Apps/vienix-markdown-editor/app/js/vienix-idb.js)
> - [`app/js/storage-backup.js`](file:///c:/Users/Yaser/Mobiles-Apps/vienix-markdown-editor/app/js/storage-backup.js)
> - [`app/js/vienix-drive.js`](file:///c:/Users/Yaser/Mobiles-Apps/vienix-markdown-editor/app/js/vienix-drive.js)

---

## 1. آليات التخزين الحالية في الويب (Current Web Storage)

تعتمد النسخة الحالية على مستويين رئيسيين للتخزين:
1. **IndexedDB** (`rtlmd_db` أو `vienix_db`): لتخزين المستندات، الحجرات، والمسودات الكبيرة.
2. **LocalStorage**: لتخزين الإعدادات الخفيفة، تفضيلات العرض، الحالة المؤقتة للمحرر، ومفاتيح API المشفرة أو المحفوظة محلياً.

---

## 2. بنية البيانات الحالية (Data Entities & Schemas)

### 2.1 كائن المستند (Document / Note Entity)
مخزن في IndexedDB في Object Store باسم `documents` أو `notes`:
```json
{
  "id": "doc_1698234567890",
  "chamberId": "chamber_default",
  "title": "مقدمة إلى ماركداون",
  "content": "# نص الماركداون...",
  "tags": ["توثيق", "مشروع"],
  "wordCount": 120,
  "charCount": 650,
  "readingTimeMinutes": 1,
  "createdAt": 1698234567890,
  "updatedAt": 1698234900000,
  "isFavorite": false,
  "isPinned": false,
  "isTrash": false,
  "metadata": {
    "cursorPosition": 45,
    "scrollRatio": 0.25
  }
}
```

### 2.2 كائن الحجرة (Chamber / Workspace Entity)
مخزن في IndexedDB في Object Store باسم `chambers`:
```json
{
  "id": "chamber_default",
  "name": "الحجرة العامة",
  "icon": "folder",
  "color": "#3b82f6",
  "description": "الحجرة الافتراضية للمستندات والمسودات",
  "sortOrder": 1,
  "createdAt": 1698234000000,
  "updatedAt": 1698234000000
}
```

### 2.3 كائن الإعدادات (Settings)
مخزن في `localStorage` أو في جدول الإعدادات:
```json
{
  "theme": "dark", 
  "fontFamily": "Amiri",
  "editorFontSize": 16,
  "previewFontSize": 16,
  "lineHeight": 1.8,
  "autoSaveInterval": 500,
  "livePreview": true,
  "syncScroll": true,
  "lineNumbers": true,
  "wordWrap": true,
  "comfortMode": false,
  "zenMode": false,
  "direction": "rtl",
  "tabSize": 2,
  "googleDriveSyncEnabled": false,
  "aiApiKey": ""
}
```

---

## 3. ما يقابلها في بنية أندرويد (Android Target Architecture)

| مكوّن الويب (Web) | المكوّن المقابل في أندرويد (Android Native) | الحزمة / التقنية المقترحة |
|---|---|---|
| IndexedDB (`documents`) | قاعدة بيانات محلية العلائقية **Room Database** | `androidx.room:room-ktx` + `androidx.room:room-runtime` |
| IndexedDB (`chambers`) | كيان `ChamberEntity` داخل Room | جدول مرتبط بعلاقة One-to-Many مع `DocumentEntity` |
| `localStorage` (Settings) | مخزن التفضيلات غير المتزامن **DataStore Preferences** | `androidx.datastore:datastore-preferences` |
| استيراد / تصدير الملفات | واجهة الوصول للتخزين **Storage Access Framework (SAF)** | `ActivityResultContracts.CreateDocument` / `OpenDocument` |
| النسخ الاحتياطي (JSON) | تصدير / استيراد ملفات مضغوطة أو JSON في الـ Cache | `kotlinx.serialization` أو `Gson` |
| حفظ الحالات المؤقتة للمحرر | **SavedStateHandle** و **Compose rememberSaveable** | كجزء من بنية Jetpack Compose Lifecycle |

---

## 4. تصميم جداول Room Database المقترحة لأندرويد

### جدول الحجرات (`chambers_table`):
- `id: String` (Primary Key, UUID)
- `name: String`
- `icon_name: String`
- `color_hex: String`
- `sort_order: Int`
- `created_at: Long`
- `updated_at: Long`

### جدول المستندات (`documents_table`):
- `id: String` (Primary Key, UUID)
- `chamber_id: String` (Foreign Key referencing `chambers_table.id` on delete CASCADE)
- `title: String`
- `content: String`
- `tags_csv: String` أو جدول فرعي للوسوم
- `word_count: Int`
- `char_count: Int`
- `is_favorite: Boolean`
- `is_pinned: Boolean`
- `is_trash: Boolean`
- `created_at: Long`
- `updated_at: Long`
- **مؤشرات الفهرسة (Indices)**: فهرس على `chamber_id` وفهرس على `updated_at` لتسريع الترتيب والبحث.
