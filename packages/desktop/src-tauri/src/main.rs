// The desktop app: the web game (packages/client) in its own window. Saves, settings and the
// online host all work as in the browser (IndexedDB, local storage, WebRTC).
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("Civius Maximus could not start");
}
