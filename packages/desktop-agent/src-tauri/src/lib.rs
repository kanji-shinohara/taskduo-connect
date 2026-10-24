use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, TrayIconBuilder, TrayIconEvent},
    Manager,
};
use tiny_http::{Response, Server};
use std::io::Read;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri_plugin_shell::ShellExt;
use url::Url;

fn generate_csrf_state() -> String {
    let mut buf = [0u8; 16];
    if let Ok(mut f) = std::fs::File::open("/dev/urandom") {
        if f.read_exact(&mut buf).is_ok() {
            return buf.iter().map(|b| format!("{:02x}", b)).collect();
        }
    }
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    format!("state_{:032x}_{}", nanos, std::process::id())
}

#[tauri::command]
async fn login_via_browser(app: tauri::AppHandle, api_url: String) -> Result<String, String> {
    let mut port = 3100;
    let server = loop {
        match Server::http(format!("127.0.0.1:{}", port)) {
            Ok(s) => break s,
            Err(_) => {
                port += 1;
                if port > 3200 {
                    return Err("Failed to find open port".to_string());
                }
            }
        }
    };

    let state = generate_csrf_state();
    let login_url = format!("{}/cli-login?port={}&state={}", api_url.trim_end_matches('/'), port, state);

    if let Err(e) = app.shell().open(&login_url, None) {
        return Err(format!("Failed to open browser: {}", e));
    }

    let start_time = std::time::Instant::now();
    let timeout = Duration::from_secs(120);

    loop {
        if start_time.elapsed() > timeout {
            return Err("Login timed out".to_string());
        }

        if let Ok(Some(request)) = server.recv_timeout(Duration::from_secs(1)) {
            let url_str = format!("http://localhost:{}{}", port, request.url());
            if let Ok(parsed_url) = Url::parse(&url_str) {
                if parsed_url.path() == "/callback" {
                    let mut api_key = None;
                    let mut received_state = None;
                    for (k, v) in parsed_url.query_pairs() {
                        if k == "apiKey" {
                            api_key = Some(v.into_owned());
                        } else if k == "state" {
                            received_state = Some(v.into_owned());
                        }
                    }

                    if received_state.as_deref() != Some(state.as_str()) {
                        let response = Response::from_string("Error: Invalid or missing CSRF state").with_status_code(403);
                        let _ = request.respond(response);
                        continue;
                    }

                    if let Some(key) = api_key {
                        let html = r#"
                        <!DOCTYPE html>
                        <html>
                        <head>
                          <title>Login Successful</title>
                          <style>
                            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; text-align: center; padding: 50px; background-color: #f9fafb; color: #111827; }
                            .card { max-width: 500px; margin: 0 auto; background: white; padding: 40px; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); border: 1px solid #e5e7eb; }
                            h1 { color: #10b981; }
                            p { color: #4b5563; }
                          </style>
                        </head>
                        <body>
                          <div class="card">
                            <h1>ログインに成功しました！</h1>
                            <p>APIキーを取得しました。このタブを閉じて Agent に戻ってください。</p>
                          </div>
                        </body>
                        </html>
                        "#;
                        let response = Response::from_string(html)
                            .with_header(tiny_http::Header::from_bytes(&b"Content-Type"[..], &b"text/html; charset=utf-8"[..]).unwrap());
                        let _ = request.respond(response);
                        return Ok(key);
                    } else {
                        let response = Response::from_string("Error: Missing apiKey").with_status_code(400);
                        let _ = request.respond(response);
                    }
                } else {
                    let response = Response::from_string("Not Found").with_status_code(404);
                    let _ = request.respond(response);
                }
            }
        }
    }
}

#[tauri::command]
fn get_hostname() -> String {
    if let Ok(output) = std::process::Command::new("hostname").output() {
        if output.status.success() {
            let name = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if !name.is_empty() {
                return name;
            }
        }
    }
    std::env::var("HOSTNAME")
        .or_else(|_| std::env::var("COMPUTERNAME"))
        .unwrap_or_else(|_| "local-agent".to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![login_via_browser, get_hostname])
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_log::Builder::new().build())
        .on_window_event(|window, event| match event {
            tauri::WindowEvent::CloseRequested { api, .. } => {
                let _ = window.hide();
                api.prevent_close();
            }
            _ => {}
        })
        .setup(|app| {
            // macOS: hide dock icon
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            let settings_i = MenuItem::with_id(app, "settings", "Settings...", true, None::<&str>)?;
            let quit_i = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&settings_i, &quit_i])?;

            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "settings" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    "quit" => {
                        app.exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                })
                .build(app)?;

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
