# البنية الهندسية المقترحة لتطبيق أندرويد (Android Architecture Proposal)

> هذا الملف يقترح هيكلية برمجية احترافية قابلة للتوسع مستندة إلى أفضل الممارسات الرسمية لـ Google Android (Modern Android Architecture - MVVM + Clean Architecture) باستخدام **Kotlin** و **Jetpack Compose**.
> ملاحظة: هذه الوثيقة تقدم مواصفات هندسية وتصميمية فقط دون إنشاء ملفات المشروع أو كتابة كود فعلي.

---

## 1. الهيكل العام للطبقات (Architectural Layers)

```
┌─────────────────────────────────────────────────────────────┐
│                    UI Layer (Presentation)                  │
│       Jetpack Compose Screens, ViewModels, UI States        │
└──────────────────────────────┬──────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────┐
│                      Domain Layer (Optional)                │
│             UseCases: SaveDocument, ExportBook, etc.        │
└──────────────────────────────┬──────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────┐
│                        Data Layer                           │
│     Repositories, Room Database, DataStore, Drive API       │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. تقسيم الحزم الموصى به (Package Structure)

```text
com.vienix.markdown/
├── core/
│   ├── designsystem/
│   │   ├── theme/            # Theme.kt, Color.kt, Type.kt, Shape.kt
│   │   └── components/       # AppToolbar, IconButton, Dialogs, FloatingDock
│   ├── database/
│   │   ├── AppDatabase.kt
│   │   ├── dao/              # DocumentDao.kt, ChamberDao.kt
│   │   └── model/            # DocumentEntity.kt, ChamberEntity.kt
│   ├── datastore/
│   │   └── AppPreferences.kt # DataStore manager for settings
│   └── common/
│       ├── result/           # Result wrappers, Dispatcher providers
│       └── markdown/         # Parser helpers, Regex rules, Syntax highlighter
│
├── feature/
│   ├── editor/
│   │   ├── EditorScreen.kt
│   │   ├── EditorViewModel.kt
│   │   ├── EditorUiState.kt
│   │   └── components/       # MarkdownEditorField, FormattingBar, ResizablePanes
│   ├── preview/
│   │   ├── PreviewScreen.kt
│   │   ├── PreviewViewModel.kt
│   │   └── components/       # MarkdownRenderer, MermaidViewer
│   ├── chambers/
│   │   ├── ChambersDrawer.kt
│   │   ├── ChambersViewModel.kt
│   │   └── ChamberDialogs.kt
│   ├── settings/
│   │   ├── SettingsScreen.kt
│   │   └── SettingsViewModel.kt
│   ├── bookexport/
│   │   ├── BookExportDialog.kt
│   │   └── BookExportViewModel.kt
│   └── sync/
│       ├── GoogleDriveSyncWorker.kt
│       └── SyncStatusBanner.kt
```

---

## 3. المكونات والطبقات بالتفصيل

### 3.1 طبقة البيانات (Data Layer)
- **`DocumentRepository`**:
  - `fun getDocumentsByChamber(chamberId: String): Flow<List<Document>>`
  - `fun getDocumentById(id: String): Flow<Document?>`
  - `suspend fun saveDocument(doc: Document)`
  - `suspend fun moveToTrash(id: String)`
- **`ChamberRepository`**:
  - `fun getAllChambers(): Flow<List<Chamber>>`
  - `suspend fun createChamber(name: String, color: String, icon: String)`
  - `suspend fun deleteChamber(id: String)`
- **`PreferencesRepository`**:
  - `val appSettings: Flow<AppSettings>`
  - `suspend fun updateTheme(isDark: Boolean)`
  - `suspend fun updateFont(fontFamily: String, size: Int)`

### 3.2 حالات الواجهة والـ ViewModels (UI State & ViewModels)

#### `EditorUiState`:
```kotlin
data class EditorUiState(
    val currentDocument: Document? = null,
    val content: String = "",
    val title: String = "",
    val viewMode: ViewMode = ViewMode.SPLIT, // EDITOR_ONLY, PREVIEW_ONLY, SPLIT
    val wordCount: Int = 0,
    val charCount: Int = 0,
    val readingTimeMinutes: Int = 0,
    val isAutoSaving: Boolean = false,
    val isComfortMode: Boolean = false,
    val isZenMode: Boolean = false,
    val activeChamber: Chamber? = null
)
```

#### `EditorViewModel`:
- يتولى استقبال أحداث المستخدم (`onContentChanged`, `onFormatAction`, `onToggleViewMode`, `onSwitchDocument`).
- يطبق آلية Debounce (400ms) قبل استدعاء `saveDocument`.
- يحسب إحصاءات النص بشكل غير متزامن على `Dispatchers.Default`.

---

## 4. حقن التبعيات وإدارة المهام في الخلفية (DI & Background Jobs)

- **Dependency Injection**: استخدام **Hilt** أو **Koin** لإدارة التبعيات وحقن Repositories وDatabase في الـ ViewModels.
- **WorkManager**:
  - استخدام `PeriodicWorkRequestBuilder` لتشغيل المزامنة الدورية مع Google Drive في الخلفية وفق قيود البطارية والشبكة.
  - مهام التنظيف التلقائي لسلة المهملات والنسخ الاحتياطي الدوري للملفات.
