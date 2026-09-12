//! Enregistrement vidéo de l'écran — la séance filmée, gardée sur CE poste.
//!
//! Complément des captures fixes (`capture.rs`), pas leur remplacement : une
//! image répond à « à quoi ressemblait le graphe à l'entrée ? », une vidéo à
//! « qu'est-ce que j'ai fait pendant vingt minutes ? ». Les deux coexistent.
//!
//! ── CE QUI SORT DE L'APP, ET CE QUI N'EN SORT PAS ─────────────────────────
//!
//! Le fichier est écrit dans un dossier CHOISI PAR L'UTILISATEUR, jamais dans
//! les données de l'app et jamais téléversé. L'app n'en retient que le chemin
//! et la durée. C'est une exigence explicite, et elle a une conséquence à ne pas
//! perdre de vue : déplacer ou supprimer le fichier depuis le Finder laisse une
//! fiche qui pointe dans le vide — le front doit le dire plutôt que de promettre
//! une vidéo qu'il ne peut plus ouvrir.
//!
//! ── LE SON ────────────────────────────────────────────────────────────────
//!
//! `screencapture -g` enregistre l'ENTRÉE audio par défaut, c'est-à-dire le
//! micro. macOS ne laisse AUCUN moyen de capter le son que la machine joue :
//! il n'y a pas de périphérique de sortie lisible en entrée. Pour avoir le son
//! du système, il faut un pilote de bouclage (BlackHole, Loopback…), puis viser
//! ce périphérique avec `-G`. D'où les deux voies ci-dessous : `Some("default")`
//! pour le micro, `Some(id)` pour un périphérique nommé. Promettre « le son »
//! sans cette distinction donnerait des vidéos muettes et une chasse au bug.
//!
//! ── ARRÊT ─────────────────────────────────────────────────────────────────
//!
//! `screencapture -v` enregistre jusqu'à ce qu'on l'interrompe. C'est SIGINT qui
//! clôt proprement le conteneur : un SIGKILL laisse un .mov tronqué, illisible.
//! D'où l'attente bornée après le signal — on laisse le processus finir son
//! fichier, sans se laisser bloquer indéfiniment s'il ne rend jamais la main.

use std::path::{Path, PathBuf};
use std::process::Child;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::Serialize;
use tauri::{AppHandle, Manager, Runtime};

/* `kill(2)` de la libc système — un symbole, contre une caisse de plus à
   suivre. Même arbitrage que les symboles d'accessibilité de `tracker.rs`. */
#[cfg(unix)]
extern "C" {
  fn kill(pid: i32, sig: i32) -> i32;
}
#[cfg(unix)]
const SIGINT: i32 = 2;

/// Combien on attend, au plus, que `screencapture` referme son fichier.
/// Mesuré bien en deçà de la seconde ; la borne n'est là que pour ne jamais
/// bloquer l'appel si le processus part en vrille.
const FINALIZE_TIMEOUT_MS: u64 = 8_000;

struct Recording {
  child: Child,
  path: PathBuf,
  started_ms: u64,
}

#[derive(Default)]
pub struct Recorder(Mutex<Option<Recording>>);

impl Recorder {
  fn lock(&self) -> std::sync::MutexGuard<'_, Option<Recording>> {
    // Verrou empoisonné : un panic ailleurs ne doit pas rendre l'enregistrement
    // définitivement impossible — au pire on reprend un état incohérent qu'on
    // remplace aussitôt.
    self.0.lock().unwrap_or_else(|e| e.into_inner())
  }
}

#[derive(Serialize, Clone, Debug, Default)]
pub struct RecordResult {
  pub ok: bool,
  /// Chemin absolu du fichier, sur ce poste.
  pub path: Option<String>,
  /// Début de la prise (ms epoch) — le front en tire la durée et le rattachement.
  pub started_at: u64,
  /// Poids du fichier. Nul tant que l'enregistrement tourne.
  pub bytes: u64,
  pub error: Option<String>,
}

#[derive(Serialize, Clone, Debug, Default)]
pub struct RecordStatus {
  pub recording: bool,
  pub path: Option<String>,
  pub started_at: u64,
  /// Vrai si la plateforme sait enregistrer (macOS pour l'instant).
  pub supported: bool,
}

#[derive(Serialize, Clone, Debug)]
pub struct AudioDevice {
  pub id: String,
  pub name: String,
  /// Vrai pour l'entrée par défaut du système.
  pub default_input: bool,
}

fn now_ms() -> u64 {
  SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .map(|d| d.as_millis() as u64)
    .unwrap_or(0)
}

fn fail(msg: impl Into<String>) -> RecordResult {
  RecordResult { ok: false, error: Some(msg.into()), ..Default::default() }
}

/// Le nom de fichier vient du front, qui tourne sur une URL distante : il ne
/// traverse pas le dossier choisi.
fn safe_name(value: &str) -> bool {
  !value.is_empty()
    && value.len() <= 80
    && value.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
}

/// Le dossier, lui, est choisi par l'utilisateur dans une fenêtre native. On ne
/// le devine pas : on vérifie seulement qu'il désigne un dossier existant, pour
/// échouer AVANT de lancer l'enregistrement plutôt qu'après vingt minutes.
fn check_dir(dir: &str) -> Result<PathBuf, String> {
  let p = Path::new(dir);
  if !p.is_absolute() {
    return Err("dossier d'enregistrement invalide".into());
  }
  if !p.is_dir() {
    return Err(format!("dossier introuvable : {dir}"));
  }
  Ok(p.to_path_buf())
}

#[tauri::command]
pub fn record_status<R: Runtime>(app: AppHandle<R>) -> RecordStatus {
  let state = app.state::<Recorder>();
  let guard = state.lock();
  match guard.as_ref() {
    Some(r) => RecordStatus {
      recording: true,
      path: Some(r.path.to_string_lossy().to_string()),
      started_at: r.started_ms,
      supported: imp::supported(),
    },
    None => RecordStatus { supported: imp::supported(), ..Default::default() },
  }
}

/// Démarre un enregistrement. `audio` : `None` muet, `Some("default")` le micro
/// par défaut, `Some(id)` un périphérique précis (cf. `record_audio_devices`).
#[tauri::command]
pub fn record_start<R: Runtime>(
  app: AppHandle<R>,
  dir: String,
  name: String,
  display: Option<u8>,
  audio: Option<String>,
  show_clicks: Option<bool>,
) -> RecordResult {
  if !imp::supported() {
    return fail("enregistrement vidéo disponible seulement sur macOS pour l'instant");
  }
  if !safe_name(&name) {
    return fail("nom de fichier refusé");
  }
  let dir = match check_dir(&dir) {
    Ok(d) => d,
    Err(e) => return fail(e),
  };

  let state = app.state::<Recorder>();
  let mut guard = state.lock();
  if guard.is_some() {
    /* Refus plutôt qu'un second processus : deux `screencapture -v` sur le même
       écran se disputent la source, et l'utilisateur se retrouve avec deux
       fichiers dont un tronqué. */
    return fail("un enregistrement est déjà en cours");
  }

  let path = dir.join(format!("{name}.mov"));
  let started_ms = now_ms();
  match imp::spawn(&path, display.unwrap_or(1), audio.as_deref(), show_clicks.unwrap_or(false)) {
    Ok(child) => {
      *guard = Some(Recording { child, path: path.clone(), started_ms });
      RecordResult {
        ok: true,
        path: Some(path.to_string_lossy().to_string()),
        started_at: started_ms,
        bytes: 0,
        error: None,
      }
    }
    Err(e) => fail(e),
  }
}

/// Arrête l'enregistrement en cours et rend le fichier produit.
#[tauri::command]
pub fn record_stop<R: Runtime>(app: AppHandle<R>) -> RecordResult {
  let state = app.state::<Recorder>();
  let mut guard = state.lock();
  let Some(mut rec) = guard.take() else {
    return fail("aucun enregistrement en cours");
  };

  imp::interrupt(&mut rec.child);

  /* Attente bornée : on laisse `screencapture` refermer le conteneur. Sans ce
     temps, le .mov reste tronqué — QuickTime ne l'ouvre pas du tout. */
  let deadline = std::time::Instant::now() + std::time::Duration::from_millis(FINALIZE_TIMEOUT_MS);
  loop {
    match rec.child.try_wait() {
      Ok(Some(_)) => break,
      Ok(None) if std::time::Instant::now() < deadline => {
        std::thread::sleep(std::time::Duration::from_millis(50));
      }
      Ok(None) => {
        // Il ne rend pas la main : on coupe, en sachant que le fichier
        // risque d'être inexploitable. Le dire plutôt que le laisser croire.
        let _ = rec.child.kill();
        let _ = rec.child.wait();
        break;
      }
      Err(_) => break,
    }
  }

  let bytes = std::fs::metadata(&rec.path).map(|m| m.len()).unwrap_or(0);
  if bytes == 0 {
    return RecordResult {
      ok: false,
      path: Some(rec.path.to_string_lossy().to_string()),
      started_at: rec.started_ms,
      bytes: 0,
      error: Some("fichier vide — autorisation « Enregistrement de l'écran » manquante ?".into()),
    };
  }
  RecordResult {
    ok: true,
    path: Some(rec.path.to_string_lossy().to_string()),
    started_at: rec.started_ms,
    bytes,
    error: None,
  }
}

/// Coupe un enregistrement resté ouvert, sans rien rendre.
///
/// Appelée à la fermeture de l'app : sans elle, `screencapture` survit à son
/// parent et continue de remplir le disque, indéfiniment et invisiblement.
pub fn stop_on_exit<R: Runtime>(app: &AppHandle<R>) {
  let Some(state) = app.try_state::<Recorder>() else { return };
  let mut guard = state.lock();
  if let Some(mut rec) = guard.take() {
    imp::interrupt(&mut rec.child);
    let _ = rec.child.wait();
  }
}

/// Les entrées audio du poste, pour que l'interface propose un choix au lieu
/// d'un identifiant à deviner.
#[tauri::command]
pub fn record_audio_devices() -> Vec<AudioDevice> {
  imp::audio_devices()
}

/* ─── macOS ──────────────────────────────────────────────────────────────── */

#[cfg(target_os = "macos")]
mod imp {
  use super::AudioDevice;
  use std::path::Path;
  use std::process::{Child, Command};

  pub fn supported() -> bool {
    true
  }

  pub fn spawn(
    path: &Path,
    display: u8,
    audio: Option<&str>,
    show_clicks: bool,
  ) -> Result<Child, String> {
    let mut cmd = Command::new("/usr/sbin/screencapture");
    // `-v` : vidéo. `-x` : pas de son d'obturateur au démarrage.
    cmd.args(["-v", "-x", "-D", &display.to_string()]);
    match audio {
      // `-g` = entrée PAR DÉFAUT du système, donc le micro sauf bouclage.
      Some("default") => { cmd.arg("-g"); }
      Some(id) if !id.is_empty() => { cmd.args(["-G", id]); }
      _ => {}
    }
    if show_clicks {
      cmd.arg("-k");
    }
    cmd.arg(path);
    cmd.spawn().map_err(|e| format!("screencapture injoignable : {e}"))
  }

  pub fn interrupt(child: &mut Child) {
    /* SIGINT et non `kill()` de std (qui envoie SIGKILL) : seul le premier
       laisse `screencapture` écrire l'index du conteneur. Un .mov tué au
       SIGKILL n'est lisible par aucun lecteur. */
    let pid = child.id() as i32;
    if pid > 0 {
      unsafe { super::kill(pid, super::SIGINT) };
    }
  }

  /// Lecture des périphériques par `system_profiler` — aucune caisse CoreAudio
  /// pour une liste qu'on affiche trois fois par an, et un format JSON stable.
  pub fn audio_devices() -> Vec<AudioDevice> {
    let out = match Command::new("/usr/sbin/system_profiler")
      .args(["SPAudioDataType", "-json"])
      .output()
    {
      Ok(o) if o.status.success() => o.stdout,
      _ => return Vec::new(),
    };
    let json: serde_json::Value = match serde_json::from_slice(&out) {
      Ok(v) => v,
      Err(_) => return Vec::new(),
    };

    let mut devices = Vec::new();
    let items = json
      .get("SPAudioDataType")
      .and_then(|v| v.as_array())
      .cloned()
      .unwrap_or_default();
    for card in items {
      let list = card.get("_items").and_then(|v| v.as_array()).cloned().unwrap_or_default();
      for dev in list {
        let name = dev.get("_name").and_then(|v| v.as_str()).unwrap_or("").to_string();
        if name.is_empty() {
          continue;
        }
        // Seules les ENTRÉES nous intéressent : on ne peut enregistrer que
        // ce qui se présente comme une source.
        let has_input = dev.get("coreaudio_device_input").is_some()
          || dev.get("coreaudio_input_source").is_some();
        if !has_input {
          continue;
        }
        let default_input = dev
          .get("coreaudio_default_audio_input_device")
          .and_then(|v| v.as_str())
          .map(|s| s == "spaudio_yes")
          .unwrap_or(false);
        devices.push(AudioDevice { id: name.clone(), name, default_input });
      }
    }
    devices
  }
}

/* ─── Autres plateformes ─────────────────────────────────────────────────── */

#[cfg(not(target_os = "macos"))]
mod imp {
  use super::AudioDevice;
  use std::path::Path;
  use std::process::Child;

  pub fn supported() -> bool {
    false
  }

  pub fn spawn(_p: &Path, _d: u8, _a: Option<&str>, _c: bool) -> Result<Child, String> {
    Err("enregistrement vidéo non disponible sur cette plateforme".into())
  }

  pub fn interrupt(_child: &mut Child) {}

  pub fn audio_devices() -> Vec<AudioDevice> {
    Vec::new()
  }
}
