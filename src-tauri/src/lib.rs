use std::path::PathBuf;
use tauri::Manager;

// SQLite DB 파일의 절대 경로를 돌려준다. 프론트엔드가 이 경로로 tauri-plugin-sql 을 연다.
// - 개발 빌드(debug): 프로젝트 안 .dev-data/paperboard.db (개발 중 ~/Library 를 쓰지 않기 위해)
// - 릴리스 빌드: ~/Library/Application Support/PaperBoard/paperboard.db
// `cfg!(debug_assertions)` 는 C++ 의 `#ifndef NDEBUG` 와 비슷하다(컴파일 시점 상수).
#[tauri::command]
fn db_path(app: tauri::AppHandle) -> Result<String, String> {
    let dir: PathBuf = if cfg!(debug_assertions) {
        // 개발 자가 테스트는 PAPERBOARD_DEV_DB_DIR 로 별도 폴더를 써서 직접 테스트한 데이터를 건드리지 않는다.
        // env!("CARGO_MANIFEST_DIR") = 컴파일 시점의 src-tauri 폴더 절대 경로
        match std::env::var("PAPERBOARD_DEV_DB_DIR") {
            Ok(custom) if !custom.is_empty() => PathBuf::from(custom),
            _ => PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..").join(".dev-data"),
        }
    } else {
        app.path().data_dir().map_err(|e| e.to_string())?.join("PaperBoard")
    };
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    // `?` 는 Err 면 즉시 그 에러를 반환하는 연산자(예외 대신 Result 를 쓰는 Rust 방식).
    let dir = dir.canonicalize().map_err(|e| e.to_string())?;
    Ok(dir.join("paperboard.db").to_string_lossy().into_owned())
}

// Android 뷰어: 번들 파일 고르기(영구 읽기 권한 포함).
// 실제 동작은 Kotlin 클래스(gen/android/.../BundlePickerPlugin.kt)에 있고, 여기서는 그 클래스를
// 플러그인으로 등록한 뒤 앱 명령 pick_bundle 로 감싼다. 데스크톱에서는 쓰지 않는다.
#[derive(serde::Serialize, serde::Deserialize)]
struct PickedBundle {
    uri: Option<String>,
    persisted: bool,
}

#[cfg(target_os = "android")]
struct BundlePicker(tauri::plugin::PluginHandle<tauri::Wry>);

#[cfg(target_os = "android")]
fn bundle_picker_plugin() -> tauri::plugin::TauriPlugin<tauri::Wry> {
    tauri::plugin::Builder::new("bundle-picker")
        .setup(|app, api| {
            let handle = api.register_android_plugin("com.paperboard.app", "BundlePickerPlugin")?;
            app.manage(BundlePicker(handle));
            Ok(())
        })
        .build()
}

#[tauri::command]
async fn pick_bundle(app: tauri::AppHandle) -> Result<PickedBundle, String> {
    #[cfg(target_os = "android")]
    {
        let picker = app.state::<BundlePicker>();
        picker
            .0
            .run_mobile_plugin_async::<PickedBundle>("pick", ())
            .await
            .map_err(|e| e.to_string())
    }
    #[cfg(not(target_os = "android"))]
    {
        let _ = app;
        Err("pick_bundle 은 Android 전용입니다".into())
    }
}

#[derive(serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct FolderItem {
    document_id: String,
    name: String,
    mime: Option<String>,
    size: Option<i64>,
    uri: String,
}

#[derive(serde::Serialize, serde::Deserialize)]
struct FolderListing {
    items: Vec<FolderItem>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct ListFolderArgs {
    tree_uri: String,
    document_id: Option<String>,
}

// Android 뷰어: PaperBoard 폴더 고르기(영구 읽기 권한). Kotlin 의 pickFolder.
#[tauri::command]
async fn pick_folder(app: tauri::AppHandle) -> Result<PickedBundle, String> {
    #[cfg(target_os = "android")]
    {
        let picker = app.state::<BundlePicker>();
        picker.0.run_mobile_plugin_async::<PickedBundle>("pickFolder", ()).await.map_err(|e| e.to_string())
    }
    #[cfg(not(target_os = "android"))]
    {
        let _ = app;
        Err("pick_folder 는 Android 전용입니다".into())
    }
}

// Android 뷰어: 고른 폴더(또는 그 하위 폴더)의 항목 나열. Kotlin 의 listFolder.
#[tauri::command]
async fn list_folder(app: tauri::AppHandle, tree_uri: String, document_id: Option<String>) -> Result<FolderListing, String> {
    #[cfg(target_os = "android")]
    {
        let picker = app.state::<BundlePicker>();
        picker
            .0
            .run_mobile_plugin_async::<FolderListing>("listFolder", ListFolderArgs { tree_uri, document_id })
            .await
            .map_err(|e| e.to_string())
    }
    #[cfg(not(target_os = "android"))]
    {
        let _ = (app, ListFolderArgs { tree_uri, document_id });
        Err("list_folder 는 Android 전용입니다".into())
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // 플러그인 등록 + DB 경로 명령. 파일 열기·읽기·SQL 실행은 프론트엔드(TS)에서
    // @tauri-apps/plugin-dialog, plugin-fs, plugin-sql 로 호출한다.
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_sql::Builder::default().build());
    // `#[cfg(...)]` 는 C++ 의 #ifdef 처럼 컴파일 대상(여기선 Android)일 때만 이 줄을 넣는다.
    #[cfg(target_os = "android")]
    let builder = builder.plugin(bundle_picker_plugin());
    builder
        .invoke_handler(tauri::generate_handler![db_path, pick_bundle, pick_folder, list_folder])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
