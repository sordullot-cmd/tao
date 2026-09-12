mod apps;
mod blocker;
mod capture;
#[cfg(target_os = "macos")]
mod liquid_glass;
#[cfg(target_os = "macos")]
mod panel;
mod recorder;
mod phone;
mod tracker;
mod tray;

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
use tauri::{tray::TrayIconBuilder, WindowEvent};
/* Le clic gauche est lu sur macOS (il ouvre le popover) et sur Windows (il
   ouvre la fenêtre). Linux reste sur le menu natif : son plateau est un
   AppIndicator, qui ne remonte pas les clics — un popover y serait du code
   qu'aucun événement n'atteindrait jamais. */
#[cfg(all(desktop, any(target_os = "windows", target_os = "macos")))]
use tauri::tray::{MouseButton, MouseButtonState, TrayIconEvent};
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

/// Ramène la fenêtre principale au premier plan. Servie au popover, qui n'a pas
/// le droit de manipuler une fenêtre qui n'est pas la sienne.
#[tauri::command]
fn tray_open_main(app: tauri::AppHandle) {
  #[cfg(desktop)]
  {
    tray::hide_popover(&app);
    if let Some(w) = app.get_webview_window("main") {
      let _ = w.show();
      let _ = w.set_focus();
    }
  }
  #[cfg(not(desktop))]
  let _ = &app;
}

/// Quitte l'app depuis le popover. Le même arrêt d'enregistrement que l'entrée
/// « Quitter » du menu : la commande vit ici, et non dans `tray.rs`, parce que
/// c'est ce module qui connaît `recorder`.
#[tauri::command]
fn tray_quit(app: tauri::AppHandle) {
  #[cfg(desktop)]
  recorder::stop_on_exit(&app);
  app.exit(0);
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
    // État de l'enregistrement : un seul pour toute l'app, créé avant la
    // première commande plutôt que dans `setup`, qui ne tourne pas sur mobile.
    .manage(recorder::Recorder::default())
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
      blocker::close_app,
      apps::installed_apps,
      tray::tray_set_checklist,
      tray::tray_get_checklist,
      tray::tray_popover_resize,
      tray::tray_popover_close,
      tray_open_main,
      tray_quit,
      capture::capture_support,
      capture::capture_request_access,
      capture::capture_screen,
      recorder::record_status,
      recorder::record_start,
      recorder::record_stop,
      recorder::record_audio_devices
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

      /* Icône dans la barre d'état. Son menu porte la routine du jour : la
         liste part vide et c'est le front qui la remplit dès qu'il a lu les
         règles (cf. components/TrayBridge.jsx), parce qu'elles vivent
         dans `user_productivity` et non dans le binaire. */
      app.manage(tray::TrayChecklist::default());
      app.manage(tray::PopoverGuard::default());
      let menu = tray::build_menu(app.handle(), "", &[], &[], false)?;

      #[allow(unused_mut)]
      let mut tray_builder = TrayIconBuilder::with_id(tray::TRAY_ID)
        .icon(app.default_window_icon().unwrap().clone())
        .tooltip("tao")
        .menu(&menu)
        .on_menu_event(|app, event| {
          let id = event.id.as_ref();
          // Une règle cochée : le front tranche, on n'écrit rien ici.
          if tray::handle_menu_event(app, id) {
            return;
          }
          match id {
            "open" => {
              if let Some(w) = app.get_webview_window("main") {
                let _ = w.show();
                let _ = w.set_focus();
              }
            }
            "quit" => {
              // Un enregistrement en cours survivrait à l'app : `screencapture`
              // est un processus à part, que rien ne rattache à son parent.
              recorder::stop_on_exit(app);
              app.exit(0)
            }
            _ => {}
          }
        });

      /* Trois systèmes, trois conventions.

         macOS : gauche = popover, droit = menu natif. Le popover est la surface
         soignée (cf. tray.rs) ; le menu reste dessous comme repli hors ligne.
         Le `rect` du clic est ce qui permet de poser la fenêtre SOUS l'icône —
         il n'est connu qu'ici, d'où le passage à `toggle_popover`.

         Windows : gauche = ouvrir la fenêtre, droit = menu. C'est ce qu'on y
         attend d'une icône de zone de notification, et le popover n'y a pas
         d'équivalent visuel installé.

         Linux : rien à câbler. Un AppIndicator ne remonte pas les clics, le
         menu s'y déroule seul — c'est le comportement d'origine, conservé. */
      #[cfg(target_os = "macos")]
      {
        tray_builder = tray_builder
          .show_menu_on_left_click(false)
          .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
              button: MouseButton::Left,
              button_state: MouseButtonState::Up,
              rect,
              ..
            } = event
            {
              tray::toggle_popover(tray.app_handle(), rect);
            }
          });
      }

      #[cfg(target_os = "windows")]
      {
        tray_builder = tray_builder
          .show_menu_on_left_click(false)
          .on_tray_icon_event(|tray, event| {
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
          });
      }

      tray_builder.build(app)?;
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
      /* Un popover se referme quand on regarde ailleurs — c'est ce qui le
         distingue d'une fenêtre, et ce que fait tout menu de la barre d'état.
         Le masquage est noté au passage : sans ça, le clic qui ferme (sur
         l'icône elle-même) rouvrirait aussitôt, le popover ayant déjà perdu le
         focus au moment où l'événement de clic arrive. */
      #[cfg(desktop)]
      if let WindowEvent::Focused(false) = event {
        if window.label() == tray::POPOVER_LABEL {
          tray::hide_popover(window.app_handle());
        }
      }
      #[cfg(mobile)]
      {
        // Sur mobile, c'est le système qui décide de la vie de la fenêtre.
        let _ = (window, event);
      }
    })
    .build(tauri::generate_context!())
    .expect("error while building tauri application")
    /* `run` avec fermeture et non `run(context)` : c'est le SEUL endroit qui voie
       l'app s'éteindre quelle qu'en soit la cause — menu « Quitter », ⌘Q, ou
       arrêt de la session. Un enregistrement laissé ouvert continuerait sinon de
       remplir le disque après la disparition de la fenêtre, sans rien pour le
       montrer ni l'arrêter. */
    .run(|app, event| {
      if let tauri::RunEvent::Exit = event {
        recorder::stop_on_exit(app);
      }
    });
}
