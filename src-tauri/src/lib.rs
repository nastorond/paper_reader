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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // 플러그인 등록 + DB 경로 명령. 파일 열기·읽기·SQL 실행은 프론트엔드(TS)에서
    // @tauri-apps/plugin-dialog, plugin-fs, plugin-sql 로 호출한다.
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .invoke_handler(tauri::generate_handler![db_path])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
