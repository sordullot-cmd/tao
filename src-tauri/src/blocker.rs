/*!
Reprise de la main sur l'appareil — le bras armé du blocage d'application.

Le front sait DÉJÀ quelle appli est au premier plan : `tracker::activity_snapshot`
la lui donne, et `lib/focus/model.ts` décide si elle est coupée. Ce qu'une page
web ne peut pas faire, en revanche, c'est reprendre le premier plan à une autre
application. C'est tout ce que ce module ajoute, et il n'ajoute rien d'autre :

  • pas de processus tué — on ne fait pas perdre un travail non enregistré pour
    punir un coup d'œil ;
  • pas de fenêtre d'autrui manipulée — cela réclame des autorisations
    d'automatisation par app sur macOS, et un blocage qui s'effondre parce que
    l'utilisateur a refusé une boîte de dialogue ne bloque rien.

Ce qui reste est la friction utile : l'appli distrayante passe DERRIÈRE, et
l'écran de blocage (BlockShield) prend sa place, avec la phrase à lire et le
temps qu'il reste. La tentative est notée au journal de la session.

Le maintien au premier plan est volontairement bref. Il sert à passer devant
l'appli qu'on vient de quitter, pas à coller la fenêtre au-dessus de tout le
poste : au-delà de quelques instants, une fenêtre qui refuse de passer derrière
gêne le travail au lieu de le protéger.
*/

use tauri::{AppHandle, Manager};

/// Combien de temps la fenêtre reste au-dessus des autres après une reprise.
const ON_TOP_MS: u64 = 1_200;

/// Ramène la fenêtre principale devant, quelle que soit l'appli qui l'occupait.
///
/// Renvoie `false` — et non une erreur — quand la fenêtre est simplement absente
/// (app en cours de fermeture) : le front n'a rien à en faire, et une erreur
/// remonterait une panne là où il n'y en a pas.
#[tauri::command]
pub fn focus_reclaim(app: AppHandle) -> Result<bool, String> {
  let Some(w) = app.get_webview_window("main") else {
    return Ok(false);
  };

  // La croix ✕ cache la fenêtre dans le tray (cf. lib.rs) : une session peut
  // donc tourner sans fenêtre visible, et il faut la rendre avant de la viser.
  let _ = w.unminimize();
  w.show().map_err(|e| e.to_string())?;
  let _ = w.set_always_on_top(true);
  w.set_focus().map_err(|e| e.to_string())?;

  let w2 = w.clone();
  std::thread::spawn(move || {
    std::thread::sleep(std::time::Duration::from_millis(ON_TOP_MS));
    let _ = w2.set_always_on_top(false);
  });

  Ok(true)
}

/// Le blocage natif est-il tenable sur cette plateforme ?
///
/// Ne dit rien des autorisations — sur macOS, la lecture de l'appli de premier
/// plan peut encore échouer faute d'accès « Accessibilité ». C'est
/// `activity_snapshot` qui le rapporte, et le front qui l'affiche : ici, on ne
/// répond qu'à « le code existe-t-il pour cet OS ».
#[tauri::command]
pub fn focus_blocking_supported() -> bool {
  cfg!(any(target_os = "macos", target_os = "windows"))
}
