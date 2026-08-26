/*!
Suivi d'activité du poste — la source de vérité de la section « Activité ».

Le front ne peut pas savoir ce que fait l'utilisateur HORS de la fenêtre de
l'app : le navigateur ne voit que son propre onglet. Cette commande donne, à la
demande, l'état réel du poste :

  • `app`   — l'application au premier plan (nom lisible, sans « .exe ») ;
  • `title` — le titre de sa fenêtre active (souvent le document / l'onglet) ;
  • `idle_seconds` — le temps écoulé depuis la dernière frappe ou le dernier
    mouvement de souris, à l'échelle du SYSTÈME (c'est ce qui permet de couper
    une session quand on quitte le poste, au lieu de compter des heures de
    veille) ;
  • `ok` — faux quand la plateforme n'a rien pu lire (permission refusée,
    outil absent) : le front affiche alors la cause au lieu d'inventer une
    activité.

Le rythme d'échantillonnage est décidé par le front (`lib/activity/engine.ts`),
qui construit les sessions à partir de ces instantanés. Ici, aucun état : la
commande est un simple relevé, donc rien à perdre au redémarrage et rien à
purger.

Notes par plateforme :
  • macOS — `lsappinfo` donne le nom de l'app SANS autorisation particulière.
    Le titre de fenêtre passe par l'API d'accessibilité (AXUIElement), qui
    réclame l'autorisation « Accessibilité » : sans elle on garde l'app et le
    titre reste vide, ce qui suffit à mesurer le temps par application.
    Surtout, aucun `osascript` ici : lancer un processus et un Apple Event vers
    System Events coûtait de 350 ms à 1,9 s par relevé sur un poste ordinaire,
    plusieurs fois par minute — l'app passait son temps à interroger le système
    au lieu de le laisser travailler.
  • Windows — API Win32 directes (fenêtre de premier plan + `GetLastInputInfo`).
  • Linux — `xdotool` / `xprintidle` s'ils sont installés (X11).
*/

use serde::Serialize;

#[derive(Serialize, Clone, Debug, Default)]
pub struct ActivitySnapshot {
  pub app: String,
  pub title: String,
  pub idle_seconds: u64,
  pub ok: bool,
  pub platform: String,
  /// Cause de l'échec, telle quelle, pour l'afficher côté réglages.
  pub error: Option<String>,
}

#[tauri::command]
pub fn activity_snapshot() -> ActivitySnapshot {
  imp::snapshot()
}

/* ─── macOS ──────────────────────────────────────────────────────────────── */

#[cfg(target_os = "macos")]
mod imp {
  use super::ActivitySnapshot;
  use core_foundation::base::TCFType;
  use core_foundation::string::CFString;
  use core_foundation_sys::base::{CFGetTypeID, CFRelease, CFTypeRef};
  use core_foundation_sys::string::{CFStringGetTypeID, CFStringRef};
  use std::process::Command;

  /* L'API d'accessibilité, déclarée à la main : quatre symboles d'un framework
     système, contre une dépendance de plus à suivre pour rien. */
  #[link(name = "ApplicationServices", kind = "framework")]
  extern "C" {
    fn AXIsProcessTrusted() -> bool;
    fn AXUIElementCreateApplication(pid: i32) -> CFTypeRef;
    fn AXUIElementCopyAttributeValue(el: CFTypeRef, attr: CFStringRef, out: *mut CFTypeRef) -> i32;
    fn AXUIElementSetMessagingTimeout(el: CFTypeRef, seconds: f32) -> i32;
  }

  fn run(cmd: &str, args: &[&str]) -> Option<String> {
    let out = Command::new(cmd).args(args).output().ok()?;
    if !out.status.success() {
      return None;
    }
    Some(String::from_utf8_lossy(&out.stdout).trim().to_string())
  }

  /// Nom et pid de l'app au premier plan — `lsappinfo`, sans autorisation.
  ///
  /// Les deux en un seul appel : le pid sert ensuite à viser cette app-là avec
  /// l'API d'accessibilité, et le redemander laisserait la place à un changement
  /// d'application entre les deux lectures.
  fn front_app() -> Option<(String, i32)> {
    let front = run("lsappinfo", &["front"])?;
    let asn = front.split_whitespace().next()?;
    if asn.is_empty() {
      return None;
    }
    // Sortie type : "LSDisplayName"="Google Chrome" puis "pid"=1038
    let info = run("lsappinfo", &["info", "-only", "name", "-only", "pid", asn])?;
    let mut name = String::new();
    let mut pid = 0i32;
    for line in info.lines() {
      let Some((key, value)) = line.split_once('=') else { continue };
      let value = value.trim().trim_matches('"');
      match key.trim().trim_matches('"') {
        "LSDisplayName" => name = value.to_string(),
        "pid" => pid = value.parse().unwrap_or(0),
        _ => {}
      }
    }
    if name.is_empty() { None } else { Some((name, pid)) }
  }

  /// Valeur d'un attribut d'accessibilité, ou `None` si l'app ne le donne pas.
  ///
  /// L'appelant devient propriétaire de ce qui est rendu (règle « Copy » de
  /// Core Foundation) et doit le relâcher.
  fn ax_attr(el: CFTypeRef, attr: &str) -> Option<CFTypeRef> {
    let key = CFString::new(attr);
    let mut out: CFTypeRef = std::ptr::null();
    let err = unsafe { AXUIElementCopyAttributeValue(el, key.as_concrete_TypeRef(), &mut out) };
    if err != 0 || out.is_null() { None } else { Some(out) }
  }

  /// Titre de la fenêtre active d'un processus, par l'API d'accessibilité.
  ///
  /// Le chemin d'avant passait par `osascript` et System Events : mesuré sur ce
  /// poste, entre 350 ms et 1,9 s PAR relevé, pour une boucle qui échantillonne
  /// toutes les 2 à 5 secondes — de quoi faire tousser la machine à elle seule.
  /// Ici, aucun processus lancé, aucun Apple Event : un appel direct, de l'ordre
  /// de la milliseconde. L'autorisation reste la même (« Accessibilité »).
  fn window_title(pid: i32) -> Option<String> {
    if pid <= 0 {
      return None;
    }
    let app = unsafe { AXUIElementCreateApplication(pid) };
    if app.is_null() {
      return None;
    }
    // Une app figée ne doit pas figer le relevé avec elle : au-delà, on renonce
    // au titre plutôt que de bloquer la boucle d'échantillonnage.
    unsafe { AXUIElementSetMessagingTimeout(app, 0.25) };

    let title = ax_attr(app, "AXFocusedWindow").and_then(|win| {
      let t = ax_attr(win, "AXTitle");
      unsafe { CFRelease(win) };
      t
    });
    unsafe { CFRelease(app) };

    let raw = title?;
    // `AXTitle` est une chaîne, mais l'API rend un CFType quelconque : on vérifie
    // avant d'interpréter, sinon un attribut d'un autre type serait lu de travers.
    if unsafe { CFGetTypeID(raw) } != unsafe { CFStringGetTypeID() } {
      unsafe { CFRelease(raw) };
      return None;
    }
    let text = unsafe { CFString::wrap_under_create_rule(raw as CFStringRef) }.to_string();
    if text.trim().is_empty() { None } else { Some(text) }
  }

  /// Inactivité système : `HIDIdleTime` est en NANOsecondes dans ioreg.
  fn idle_seconds() -> u64 {
    let Some(out) = run("ioreg", &["-c", "IOHIDSystem", "-d", "4", "-r"]) else {
      return 0;
    };
    for line in out.lines() {
      if !line.contains("HIDIdleTime") {
        continue;
      }
      let Some(raw) = line.split('=').nth(1) else { continue };
      let digits: String = raw.chars().filter(|c| c.is_ascii_digit()).collect();
      if let Ok(ns) = digits.parse::<u128>() {
        return (ns / 1_000_000_000) as u64;
      }
    }
    0
  }

  pub fn snapshot() -> ActivitySnapshot {
    let idle = idle_seconds();
    let Some((app, pid)) = front_app() else {
      return ActivitySnapshot {
        platform: "macos".into(),
        idle_seconds: idle,
        error: Some("frontmost-app-unavailable".into()),
        ..Default::default()
      };
    };

    // Sans l'autorisation « Accessibilité », le titre est hors de portée mais le
    // temps par application reste juste : on le dit et on rend la mesure.
    let trusted = unsafe { AXIsProcessTrusted() };
    let title = if trusted { window_title(pid).unwrap_or_default() } else { String::new() };

    ActivitySnapshot {
      app,
      title,
      idle_seconds: idle,
      ok: true,
      platform: "macos".into(),
      error: if trusted { None } else { Some("accessibility-denied".into()) },
    }
  }
}

/* ─── Windows ────────────────────────────────────────────────────────────── */

#[cfg(target_os = "windows")]
mod imp {
  use super::ActivitySnapshot;
  use std::ffi::OsString;
  use std::os::windows::ffi::OsStringExt;
  use windows_sys::Win32::Foundation::CloseHandle;
  use windows_sys::Win32::System::SystemInformation::GetTickCount;
  use windows_sys::Win32::System::Threading::{
    OpenProcess, QueryFullProcessImageNameW, PROCESS_QUERY_LIMITED_INFORMATION,
  };
  use windows_sys::Win32::UI::Input::KeyboardAndMouse::{GetLastInputInfo, LASTINPUTINFO};
  use windows_sys::Win32::UI::WindowsAndMessaging::{
    GetForegroundWindow, GetWindowTextW, GetWindowThreadProcessId,
  };

  fn wide_to_string(buf: &[u16]) -> String {
    let len = buf.iter().position(|c| *c == 0).unwrap_or(buf.len());
    OsString::from_wide(&buf[..len]).to_string_lossy().to_string()
  }

  fn idle_seconds() -> u64 {
    let mut lii = LASTINPUTINFO {
      cbSize: std::mem::size_of::<LASTINPUTINFO>() as u32,
      dwTime: 0,
    };
    let ok = unsafe { GetLastInputInfo(&mut lii) };
    if ok == 0 {
      return 0;
    }
    let now = unsafe { GetTickCount() };
    // `GetTickCount` repasse à zéro tous les ~49 jours : l'arithmétique
    // enveloppante évite une inactivité absurde juste après le rebouclage.
    let elapsed_ms = now.wrapping_sub(lii.dwTime);
    (elapsed_ms / 1000) as u64
  }

  /// Nom lisible du processus propriétaire de la fenêtre (sans « .exe »).
  fn process_name(pid: u32) -> Option<String> {
    let handle = unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid) };
    if handle as usize == 0 {
      return None;
    }
    let mut buf = [0u16; 512];
    let mut size = buf.len() as u32;
    let ok = unsafe { QueryFullProcessImageNameW(handle, 0, buf.as_mut_ptr(), &mut size) };
    unsafe { CloseHandle(handle) };
    if ok == 0 {
      return None;
    }
    let path = wide_to_string(&buf[..size as usize]);
    let file = path.rsplit(['\\', '/']).next().unwrap_or(&path).to_string();
    let stem = file.strip_suffix(".exe").unwrap_or(&file).to_string();
    if stem.is_empty() { None } else { Some(stem) }
  }

  pub fn snapshot() -> ActivitySnapshot {
    let idle = idle_seconds();
    let hwnd = unsafe { GetForegroundWindow() };
    if hwnd as usize == 0 {
      return ActivitySnapshot {
        platform: "windows".into(),
        idle_seconds: idle,
        error: Some("no-foreground-window".into()),
        ..Default::default()
      };
    }

    let mut buf = [0u16; 1024];
    let len = unsafe { GetWindowTextW(hwnd, buf.as_mut_ptr(), buf.len() as i32) };
    let title = if len > 0 { wide_to_string(&buf[..len as usize]) } else { String::new() };

    let mut pid: u32 = 0;
    unsafe { GetWindowThreadProcessId(hwnd, &mut pid) };
    let app = process_name(pid).unwrap_or_default();

    let ok = !app.is_empty() || !title.is_empty();
    ActivitySnapshot {
      app,
      title,
      idle_seconds: idle,
      ok,
      platform: "windows".into(),
      error: if ok { None } else { Some("window-unreadable".into()) },
    }
  }
}

/* ─── Linux (X11) ────────────────────────────────────────────────────────── */

#[cfg(all(unix, not(target_os = "macos")))]
mod imp {
  use super::ActivitySnapshot;
  use std::process::Command;

  fn run(cmd: &str, args: &[&str]) -> Option<String> {
    let out = Command::new(cmd).args(args).output().ok()?;
    if !out.status.success() {
      return None;
    }
    let s = String::from_utf8_lossy(&out.stdout).trim().to_string();
    if s.is_empty() { None } else { Some(s) }
  }

  pub fn snapshot() -> ActivitySnapshot {
    let idle = run("xprintidle", &[])
      .and_then(|ms| ms.parse::<u64>().ok())
      .map(|ms| ms / 1000)
      .unwrap_or(0);

    let app = run("xdotool", &["getactivewindow", "getwindowclassname"]).unwrap_or_default();
    let title = run("xdotool", &["getactivewindow", "getwindowname"]).unwrap_or_default();
    let ok = !app.is_empty() || !title.is_empty();

    ActivitySnapshot {
      app,
      title,
      idle_seconds: idle,
      ok,
      platform: "linux".into(),
      // `xdotool` / `xprintidle` ne sont pas installés par défaut : on le dit
      // plutôt que de renvoyer une activité vide qui passerait pour une pause.
      error: if ok { None } else { Some("xdotool-missing".into()) },
    }
  }
}

/* ─── Autres plateformes ─────────────────────────────────────────────────── */

#[cfg(not(any(target_os = "macos", target_os = "windows", unix)))]
mod imp {
  use super::ActivitySnapshot;

  pub fn snapshot() -> ActivitySnapshot {
    ActivitySnapshot {
      platform: "unsupported".into(),
      error: Some("unsupported-platform".into()),
      ..Default::default()
    }
  }
}
