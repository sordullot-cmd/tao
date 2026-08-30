/*!
Applications installées sur le poste.

Composer une liste de blocage demandait jusqu'ici de TAPER le nom d'une
application — « Steam », « Discord » — et d'espérer. Rien à l'écran ne disait si
la chaîne saisie correspondait à quoi que ce soit sur la machine, et le silence
d'un blocage qui n'attrape rien ressemble exactement au silence d'un blocage qui
n'a rien eu à attraper. Une faute de frappe ne se découvrait donc jamais.

Cette commande rend la liste des applications réellement présentes, avec le nom
SOUS LEQUEL LE SYSTÈME LES RAPPORTE — c'est-à-dire celui que le garde comparera
plus tard (cf. `tracker.rs`, `blocker::close_app`). Ce n'est pas un détail de
présentation : choisir dans cette liste, c'est la garantie que le nom enregistré
est celui qui sera reconnu.

  • macOS  — les bundles `.app` des dossiers d'applications. C'est exactement ce
    que montre le Launchpad, et le nom du bundle sans son extension est celui que
    rend `lsappinfo`.
  • Windows — les exécutables des dossiers d'installation. Le relevé du poste
    rapporte le nom du fichier sans « .exe » : on énumère donc les `.exe`
    eux-mêmes, et non les raccourcis du menu Démarrer, dont le libellé
    (« Google Chrome ») n'est pas celui du processus (« chrome »).
  • Ailleurs — rien. Une liste vide est une réponse honnête ; l'interface
    retombe alors sur la saisie libre.

Le parcours est BORNÉ des deux côtés — profondeur et nombre d'entrées. Un
dossier d'installation peut contenir des milliers de fichiers, et cette commande
est appelée pendant qu'on tape : elle doit rendre la main tout de suite, quitte
à ne pas être exhaustive.
*/

use serde::Serialize;

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct InstalledApp {
  /// Nom tel que le système le rapportera au garde.
  pub name: String,
  /// Chemin complet — départage deux homonymes à l'écran, et rien d'autre.
  pub path: String,
  /// Fournie avec le système : on la propose en dernier, jamais en tête.
  pub system: bool,
}

/// Applications installées, triées par nom, dédoublonnées sur le nom.
///
/// Ne jette jamais : un dossier illisible (permissions, volume démonté) est
/// sauté. Rendre une liste partielle vaut mieux qu'une erreur, qui laisserait
/// l'interface sans rien à proposer alors que la moitié du disque a répondu.
#[tauri::command]
pub fn installed_apps() -> Vec<InstalledApp> {
  let mut found = imp::scan();
  found.sort_by(|a, b| {
    a.system
      .cmp(&b.system)
      .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
  });
  let mut seen = std::collections::HashSet::new();
  found.retain(|a| seen.insert(a.name.to_lowercase()));
  found
}

/* ─── macOS ──────────────────────────────────────────────────────────────── */

#[cfg(target_os = "macos")]
mod imp {
  use super::InstalledApp;
  use std::path::Path;

  /// Les quatre endroits où macOS range les applications. `/System/Applications`
  /// est marqué « système » : Safari et Mail y sont, on ne veut pas les voir
  /// remonter avant Discord quand on tape « di ».
  const ROOTS: [(&str, bool); 3] = [
    ("/Applications", false),
    ("/System/Applications", true),
    ("/System/Applications/Utilities", true),
  ];

  pub fn scan() -> Vec<InstalledApp> {
    let mut out = Vec::new();
    for (root, system) in ROOTS {
      walk(Path::new(root), system, 2, &mut out);
    }
    if let Some(home) = std::env::var_os("HOME") {
      walk(&Path::new(&home).join("Applications"), false, 2, &mut out);
    }
    out
  }

  /// Un `.app` est un DOSSIER : on ne descend donc pas dedans, sinon chaque
  /// application livrerait ses helpers internes (« Chrome Helper », un agent de
  /// mise à jour) qui ne sont pas des applications qu'on lance ni qu'on bloque.
  fn walk(dir: &Path, system: bool, depth: u8, out: &mut Vec<InstalledApp>) {
    if depth == 0 || out.len() >= super::MAX {
      return;
    }
    let Ok(entries) = std::fs::read_dir(dir) else {
      return;
    };
    for entry in entries.flatten() {
      if out.len() >= super::MAX {
        return;
      }
      let path = entry.path();
      let Some(name) = path.file_name().and_then(|n| n.to_str()) else {
        continue;
      };
      if let Some(stem) = name.strip_suffix(".app") {
        out.push(InstalledApp {
          name: stem.to_string(),
          path: path.to_string_lossy().to_string(),
          system,
        });
      } else if !name.starts_with('.') && path.is_dir() {
        // Un dossier d'éditeur (« Adobe », « Utilities ») : une marche de plus.
        walk(&path, system, depth - 1, out);
      }
    }
  }
}

/* ─── Windows ────────────────────────────────────────────────────────────── */

#[cfg(target_os = "windows")]
mod imp {
  use super::InstalledApp;
  use std::path::{Path, PathBuf};

  /// Ce qui porte l'extension d'un programme sans en être un.
  ///
  /// Les dossiers d'installation sont pleins d'exécutables qu'on ne lance
  /// jamais : désinstallateurs, rapporteurs de plantage, mises à jour, services.
  /// Les proposer noierait les vraies applications sous du bruit — et le nom
  /// d'un désinstallateur, mis dans une liste de blocage, n'attraperait rien.
  const NOISE: [&str; 12] = [
    "unins", "setup", "install", "update", "crashpad", "crashreport",
    "helper", "service", "daemon", "vcredist", "dxsetup", "notification",
  ];

  fn roots() -> Vec<(PathBuf, bool)> {
    let mut out = Vec::new();
    for var in ["ProgramFiles", "ProgramFiles(x86)", "LOCALAPPDATA"] {
      if let Some(v) = std::env::var_os(var) {
        let base = PathBuf::from(v);
        out.push((if var == "LOCALAPPDATA" { base.join("Programs") } else { base }, false));
      }
    }
    out
  }

  pub fn scan() -> Vec<InstalledApp> {
    let mut out = Vec::new();
    for (root, system) in roots() {
      walk(&root, system, 3, &mut out);
    }
    out
  }

  fn walk(dir: &Path, system: bool, depth: u8, out: &mut Vec<InstalledApp>) {
    if depth == 0 || out.len() >= super::MAX {
      return;
    }
    let Ok(entries) = std::fs::read_dir(dir) else {
      return;
    };
    for entry in entries.flatten() {
      if out.len() >= super::MAX {
        return;
      }
      let path = entry.path();
      let Some(name) = path.file_name().and_then(|n| n.to_str()) else {
        continue;
      };
      let is_dir = entry.file_type().map(|t| t.is_dir()).unwrap_or(false);
      if is_dir {
        walk(&path, system, depth - 1, out);
        continue;
      }
      let Some(stem) = name.strip_suffix(".exe").or_else(|| name.strip_suffix(".EXE")) else {
        continue;
      };
      let lower = stem.to_lowercase();
      if NOISE.iter().any(|n| lower.contains(n)) {
        continue;
      }
      out.push(InstalledApp {
        name: stem.to_string(),
        path: path.to_string_lossy().to_string(),
        system,
      });
    }
  }
}

/* ─── Ailleurs ───────────────────────────────────────────────────────────── */

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
mod imp {
  use super::InstalledApp;

  pub fn scan() -> Vec<InstalledApp> {
    Vec::new()
  }
}

/// Plafond du parcours. Au-delà, ce n'est plus une liste d'applications, c'est
/// un inventaire de disque — et il traverserait le pont vers la WebView.
const MAX: usize = 600;
