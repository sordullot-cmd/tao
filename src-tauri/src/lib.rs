mod blocker;
mod phone;
mod tracker;

/* `Manager` n'apporte `get_webview_window` que là où il y a des fenêtres à
   aller chercher : le tray et le relais de deep link, tous deux de bureau. */
#[cfg(desktop)]
use tauri::Manager;
/* Le plateau système, les menus, le démarrage au login et la fenêtre qui se
   cache dans le tray n'ont pas d'équivalent sur Android : ces symboles
   n'existent tout simplement pas dans la build mobile de Tauri. D'où les
   `#[cfg(desktop)]` qui suivent — ce ne sont pas des précautions, c'est ce qui
   fait que la caisse compile pour les deux mondes. */
#[cfg(desktop)]
use tauri::{
  menu::{Menu, MenuItem},
  tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
  WindowEvent,
};
#[cfg(desktop)]
use tauri_plugin_autostart::{MacosLauncher, ManagerExt};
use tauri_plugin_fs::FsExt;

/// Autorise la lecture/écriture dans le dossier de vault Obsidian choisi par
/// l'utilisateur.
///
/// Le plugin `fs` n'accepte que les chemins déclarés dans les capabilities, or un
/// vault vit n'importe où sur le disque : son chemin n'est connu qu'au moment du
/// choix. On étend donc le scope au runtime. L'ajout ne survit pas au
/// redémarrage de l'app, d'où l'appel systématique côté front à la reprise du
/// dossier mémorisé (cf. lib/notes/vaultFsTauri.ts).
#[tauri::command]
fn allow_vault_dir(app: tauri::AppHandle, path: String) -> Result<(), String> {
  app
    .fs_scope()
    .allow_directory(std::path::Path::new(&path), true)
    .map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  #[allow(unused_mut)]
  let mut builder = tauri::Builder::default();

  // single-instance DOIT être enregistré en premier. Sur Windows/Linux, le deep
  // link OAuth (taotrade://...) relance l'exécutable : single-instance ramène la
  // fenêtre au premier plan et le plugin deep-link route l'URL vers l'instance
  // déjà ouverte (feature "deep-link" activée côté Cargo).
  #[cfg(any(target_os = "windows", target_os = "linux"))]
  {
    builder = builder.plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
      if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.set_focus();
      }
    }));
  }

  // Démarrage automatique au login : une notion de bureau. Sur Android, une app
  // ne se lance pas au démarrage, elle est réveillée par le système.
  #[cfg(desktop)]
  {
    builder = builder.plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, None));
  }

  builder
    // OAuth : ouverture du navigateur système + capture du retour deep link.
    .plugin(tauri_plugin_opener::init())
    .plugin(tauri_plugin_deep_link::init())
    // Notifications natives (relayées depuis la Web Notification API du site).
    .plugin(tauri_plugin_notification::init())
    // Notes en .md dans un vault Obsidian : sélection du dossier + accès disque.
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_fs::init())
    // Suivi d'activité du téléphone (Android). Inerte ailleurs — cf. src/phone.rs.
    .plugin(phone::init())
    .invoke_handler(tauri::generate_handler![
      allow_vault_dir,
      tracker::activity_snapshot,
      phone::phone_usage_access,
      phone::phone_open_usage_settings,
      phone::phone_snapshot,
      phone::phone_segments,
      blocker::focus_reclaim,
      blocker::focus_blocking_supported,
      blocker::front_tab,
      blocker::redirect_tab,
      blocker::close_app
    ])
    .setup(|app| {
      // Sur Windows/Linux, enregistre les schemes deep link au runtime
      // (nécessaire notamment en dev où l'OS ne connaît pas encore l'app).
      #[cfg(any(target_os = "windows", target_os = "linux"))]
      {
        use tauri_plugin_deep_link::DeepLinkExt;
        let _ = app.deep_link().register_all();
      }

      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }

      #[cfg(desktop)]
      {
      // Active le démarrage auto de Windows au premier lancement.
      let _ = app.autolaunch().enable();

      // Icône dans la zone de notification (system tray) + menu clic-droit.
      let open_i = MenuItem::with_id(app, "open", "Ouvrir", true, None::<&str>)?;
      let quit_i = MenuItem::with_id(app, "quit", "Quitter", true, None::<&str>)?;
      let menu = Menu::with_items(app, &[&open_i, &quit_i])?;

      TrayIconBuilder::new()
        .icon(app.default_window_icon().unwrap().clone())
        .tooltip("tao")
        .menu(&menu)
        .on_menu_event(|app, event| match event.id.as_ref() {
          "open" => {
            if let Some(w) = app.get_webview_window("main") {
              let _ = w.show();
              let _ = w.set_focus();
            }
          }
          "quit" => app.exit(0),
          _ => {}
        })
        .on_tray_icon_event(|tray, event| {
          // Clic gauche sur l'icône = rouvrir la fenêtre.
          if let TrayIconEvent::Click {
            button: MouseButton::Left,
            button_state: MouseButtonState::Up,
            ..
          } = event
          {
            if let Some(w) = tray.app_handle().get_webview_window("main") {
              let _ = w.show();
              let _ = w.set_focus();
            }
          }
        })
        .build(app)?;
      }

      Ok(())
    })
    .on_window_event(|window, event| {
      // La croix ✕ cache la fenêtre dans le tray au lieu de quitter l'app.
      #[cfg(desktop)]
      if let WindowEvent::CloseRequested { api, .. } = event {
        let _ = window.hide();
        api.prevent_close();
      }
      #[cfg(mobile)]
      {
        // Sur mobile, c'est le système qui décide de la vie de la fenêtre.
        let _ = (window, event);
      }
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
