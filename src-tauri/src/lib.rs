#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // 플러그인 등록만 한다. 실제 파일 열기·읽기는 프론트엔드(TS)에서
    // @tauri-apps/plugin-dialog, @tauri-apps/plugin-fs 로 호출한다.
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
