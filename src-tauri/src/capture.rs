//! Capture d'écran — l'image du poste au moment où elle a du sens.
//!
//! POURQUOI PAS DE VIDÉO. `screencapture -v` sait filmer, et c'est précisément
//! ce qu'on ne veut pas : trois heures de session pèsent des gigaoctets, et on
//! ne revoit jamais un film — on revient sur un INSTANT (« à quoi ressemblait
//! le graphe quand je suis entré ? »). Des images datées répondent à la vraie
//! question pour deux ordres de grandeur de moins, et se rattachent à un trade,
//! ce qu'un fichier vidéo ne sait pas faire.
//!
//! POURQUOI `screencapture` ET PAS UNE CAISSE. Le binaire fait partie de macOS,
//! il n'a jamais besoin d'être suivi, mis à jour ni audité — c'est le même
//! raisonnement que les quatre symboles d'accessibilité déclarés à la main dans
//! `tracker.rs`. Le coût est un processus lancé (de l'ordre de 200-400 ms) : sans
//! effet pour une capture demandée à la main, et acceptable pour un rythme
//! d'échantillonnage qui se compte en dizaines de secondes.
//!
//! ⚠️ L'autorisation « Enregistrement de l'écran » est DISTINCTE de
//! « Accessibilité », que `tracker.rs` et `blocker.rs` utilisent déjà : en
//! accorder une n'accorde pas l'autre. Et sans elle, `screencapture` ne jette
//! pas — il rend une image du FOND D'ÉCRAN, sans aucune fenêtre. Un journal
//! rempli d'images vides serait pire qu'un journal vide, d'où le contrôle
//! préalable (`CGPreflightScreenCaptureAccess`) avant toute écriture.
//!
//! Les autres plateformes annoncent leur incapacité plutôt que de l'inventer,
//! comme le fait déjà `tracker.rs`.

use serde::Serialize;
use tauri::{AppHandle, Manager, Runtime};

/// Ce que le poste sait faire, tel quel, pour que l'interface l'annonce au lieu
/// de le promettre.
#[derive(Serialize, Clone, Debug, Default)]
pub struct CaptureSupport {
  /// La plateforme sait capturer (indépendamment de l'autorisation).
  pub supported: bool,
  /// L'autorisation « Enregistrement de l'écran » est accordée.
  pub granted: bool,
  pub platform: String,
  /// Dossier où atterrissent les images, à montrer dans les réglages.
  pub dir: Option<String>,
  pub error: Option<String>,
}

#[derive(Serialize, Clone, Debug, Default)]
pub struct CaptureResult {
  pub ok: bool,
  /// Chemin absolu du fichier écrit.
  pub path: Option<String>,
  /// Poids en octets — de quoi afficher ce que le journal coûte sur le disque.
  pub bytes: u64,
  pub error: Option<String>,
}

fn fail(msg: impl Into<String>) -> CaptureResult {
  CaptureResult { ok: false, error: Some(msg.into()), ..Default::default() }
}

/* Le front tourne sur une URL DISTANTE (cf. frontendDist) : ses chaînes sont des
   entrées, pas des constantes de confiance. Un `..` dans le jour ou dans
   l'identifiant écrirait hors du dossier de captures. */
fn safe_token(value: &str) -> bool {
  !value.is_empty()
    && value.len() <= 64
    && value.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
}

/// `<données de l'app>/captures/<jour>` — créé à la demande.
///
/// Le jour vient du FRONT et non d'une horloge locale : lui seul connaît le
/// fuseau de l'utilisateur et la date qu'affiche le reste du site. Deux
/// définitions du « jour » rangeraient la capture de 00 h 30 dans un dossier que
/// le journal ne lirait jamais.
fn day_dir<R: Runtime>(app: &AppHandle<R>, day: &str) -> Result<std::path::PathBuf, String> {
  let base = app
    .path()
    .app_data_dir()
    .map_err(|e| format!("dossier de données introuvable : {e}"))?;
  let dir = base.join("captures").join(day);
  std::fs::create_dir_all(&dir).map_err(|e| format!("création du dossier impossible : {e}"))?;
  Ok(dir)
}

#[tauri::command]
pub fn capture_support<R: Runtime>(app: AppHandle<R>) -> CaptureSupport {
  let dir = app
    .path()
    .app_data_dir()
    .ok()
    .map(|p| p.join("captures").to_string_lossy().to_string());
  CaptureSupport { dir, ..imp::support() }
}

/// Déclenche la demande d'autorisation du système. Rend l'état APRÈS la demande.
///
/// macOS ne montre sa fenêtre qu'une fois par app : une fois refusée, seul un
/// passage par Réglages Système la rétablit. L'interface doit donc savoir dire
/// « va dans les réglages » et pas seulement « redemande ».
#[tauri::command]
pub fn capture_request_access() -> bool {
  imp::request_access()
}

/// Capture l'écran `display` (1 = principal) dans le dossier du jour.
#[tauri::command]
pub fn capture_screen<R: Runtime>(
  app: AppHandle<R>,
  day: String,
  id: String,
  display: Option<u8>,
) -> CaptureResult {
  if !safe_token(&day) || !safe_token(&id) {
    return fail("nom de fichier refusé");
  }
  let support = imp::support();
  if !support.supported {
    return fail(support.error.unwrap_or_else(|| "capture non disponible sur cette plateforme".into()));
  }
  if !support.granted {
    /* Refus NET plutôt qu'une image de fond d'écran : mieux vaut un journal qui
       dit ce qui manque qu'un journal plein d'images muettes. */
    return fail("autorisation « Enregistrement de l'écran » manquante");
  }

  let dir = match day_dir(&app, &day) {
    Ok(d) => d,
    Err(e) => return fail(e),
  };
  let path = dir.join(format!("{id}.jpg"));

  if let Err(e) = imp::grab(&path, display.unwrap_or(1)) {
    return fail(e);
  }

  match std::fs::metadata(&path) {
    Ok(m) if m.len() > 0 => CaptureResult {
      ok: true,
      path: Some(path.to_string_lossy().to_string()),
      bytes: m.len(),
      error: None,
    },
    // Fichier absent ou vide : l'outil a rendu 0 sans rien écrire. Le dire.
    _ => fail("capture vide — autorisation probablement révoquée"),
  }
}

/* ─── macOS ──────────────────────────────────────────────────────────────── */

#[cfg(target_os = "macos")]
mod imp {
  use super::CaptureSupport;
  use std::path::Path;
  use std::process::Command;

  /* Deux symboles de CoreGraphics, déclarés sur place — même arbitrage que
     l'API d'accessibilité dans `tracker.rs`. `Preflight` ne demande RIEN à
     l'utilisateur : il se contente de lire l'état, ce qui permet de l'appeler à
     chaque capture sans faire clignoter une fenêtre système. */
  #[link(name = "CoreGraphics", kind = "framework")]
  extern "C" {
    fn CGPreflightScreenCaptureAccess() -> bool;
    fn CGRequestScreenCaptureAccess() -> bool;
  }

  pub fn support() -> CaptureSupport {
    CaptureSupport {
      supported: true,
      granted: unsafe { CGPreflightScreenCaptureAccess() },
      platform: "macos".into(),
      dir: None,
      error: None,
    }
  }

  pub fn request_access() -> bool {
    unsafe { CGRequestScreenCaptureAccess() }
  }

  pub fn grab(path: &Path, display: u8) -> Result<(), String> {
    /* `-x` : pas de bruit d'obturateur. Une capture toutes les trente secondes
       qui claque est intenable. `-D` vise un écran précis : sur un poste à deux
       moniteurs, le graphe n'est pas forcément sur le principal.
       Pas de `-T` : l'option impose un délai de cinq secondes par défaut dès
       qu'elle est passée, et on veut l'instant présent. */
    let out = Command::new("/usr/sbin/screencapture")
      .args(["-x", "-t", "jpg", "-D", &display.to_string()])
      .arg(path)
      .output()
      .map_err(|e| format!("screencapture injoignable : {e}"))?;
    if out.status.success() {
      return Ok(());
    }
    let err = String::from_utf8_lossy(&out.stderr).trim().to_string();
    Err(if err.is_empty() { "screencapture a échoué".into() } else { err })
  }
}

/* ─── Autres plateformes ─────────────────────────────────────────────────── */

#[cfg(not(target_os = "macos"))]
mod imp {
  use super::CaptureSupport;
  use std::path::Path;

  pub fn support() -> CaptureSupport {
    CaptureSupport {
      supported: false,
      granted: false,
      platform: std::env::consts::OS.into(),
      dir: None,
      error: Some("capture d'écran disponible seulement sur macOS pour l'instant".into()),
    }
  }

  pub fn request_access() -> bool {
    false
  }

  pub fn grab(_path: &Path, _display: u8) -> Result<(), String> {
    Err("capture d'écran non disponible sur cette plateforme".into())
  }
}
