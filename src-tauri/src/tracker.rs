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
    Le titre de fenêtre, lui, passe par System Events (AppleScript) et réclame
    l'autorisation « Accessibilité » : sans elle on garde l'app et le titre
    reste vide, ce qui suffit à mesurer le temps par application.
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
  use std::process::Command;

  fn run(cmd: &str, args: &[&str]) -> Option<String> {
    let out = Command::new(cmd).args(args).output().ok()?;
    if !out.status.success() {
      return None;
    }
    Some(String::from_utf8_lossy(&out.stdout).trim().to_string())
  }

  /// Nom de l'app au premier plan via `lsappinfo` — pas d'autorisation requise.
  fn front_app_lsappinfo() -> Option<String> {
    let front = run("lsappinfo", &["front"])?;
    let asn = front.split_whitespace().next()?.to_string();
    if asn.is_empty() {
      return None;
    }
    let info = run("lsappinfo", &["info", "-only", "name", &asn])?;
    // Sortie type : "LSDisplayName"="Google Chrome"
    let name = info.split('=').nth(1)?.trim().trim_matches('"').to_string();
    if name.is_empty() { None } else { Some(name) }
  }

  /// App + titre via System Events. Réclame l'autorisation « Accessibilité ».
  fn front_app_osascript() -> Option<(String, String)> {
    const SCRIPT: &str = r#"
      tell application "System Events"
        set procs to (every application process whose frontmost is true)
        if (count of procs) is 0 then return ""
        set p to item 1 of procs
        set appName to name of p
        set winTitle to ""
        try
          set winTitle to name of front window of p
        end try
        return appName & tab & winTitle
      end tell
    "#;
    let out = run("osascript", &["-e", SCRIPT])?;
    if out.is_empty() {
      return None;
    }
    let mut parts = out.splitn(2, '\t');
    let app = parts.next().unwrap_or("").trim().to_string();
    let title = parts.next().unwrap_or("").trim().to_string();
    if app.is_empty() { None } else { Some((app, title)) }
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
    // On tente d'abord System Events : c'est le seul chemin qui donne AUSSI le
    // titre de fenêtre. S'il est refusé, `lsappinfo` sauve la mesure par app.
    if let Some((app, title)) = front_app_osascript() {
      return ActivitySnapshot {
        app,
        title,
        idle_seconds: idle,
        ok: true,
        platform: "macos".into(),
        error: None,
      };
    }
    if let Some(app) = front_app_lsappinfo() {
      return ActivitySnapshot {
        app,
        title: String::new(),
        idle_seconds: idle,
        ok: true,
        platform: "macos".into(),
        error: Some("accessibility-denied".into()),
      };
    }
    ActivitySnapshot {
      platform: "macos".into(),
      idle_seconds: idle,
      error: Some("frontmost-app-unavailable".into()),
      ..Default::default()
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
