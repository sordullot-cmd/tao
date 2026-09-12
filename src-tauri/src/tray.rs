//! Menu de la barre d'état — la routine du jour, cochable sans ouvrir l'app.
//!
//! La routine n'est plus une liste unique : il y en a une par stratégie (cf.
//! lib/routineChecklist.ts). Le menu ne montre QUE la liste active — un menu qui
//! déroulerait quatre listes de cinq règles serait illisible, et on ne prépare
//! pas deux stratégies à la fois. Les autres vivent dans un sous-menu « Liste »,
//! qui n'apparaît que s'il y a effectivement de quoi choisir.
//!
//! Le menu est RECONSTRUIT à chaque poussée du front plutôt que modifié en
//! place : les règles peuvent être ajoutées, renommées ou supprimées depuis la
//! page Discipline, donc ce n'est pas seulement l'état coché qui bouge, c'est
//! la liste elle-même. Garder des poignées sur les items pour les mettre à jour
//! un par un obligerait à diffuser aussi les créations et les suppressions —
//! pour un menu de cinq lignes que le système ne redessine qu'à l'ouverture.
//!
//! ⚠️ La vérité est côté front, pas ici. Un clic n'écrit rien : il émet
//! `tray-checklist-toggle`, le front bascule la coche dans localStorage (la
//! même clé datée que la page Discipline) et repousse la liste. D'où la
//! condition à ne pas perdre de vue : la fenêtre principale doit être VIVANTE,
//! ne serait-ce que cachée. C'est le cas — la croix ✕ masque au lieu de quitter
//! (cf. lib.rs) — mais une fenêtre réellement fermée rendrait le menu inerte.
//!
//! Android n'a pas de barre d'état à peupler : tout ce qui touche au menu est
//! `#[cfg(desktop)]`, et la commande y devient un no-op plutôt que d'obliger le
//! front à savoir sur quoi il tourne.

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Runtime};
#[cfg(desktop)]
use tauri::{
  menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem, Submenu},
  Emitter, Manager,
};
#[cfg(desktop)]
use std::sync::Mutex;

/// Identifiant du plateau, pour le retrouver quand le front pousse une liste.
#[cfg(desktop)]
pub const TRAY_ID: &str = "main";

/// Préfixe des items cochables. Il sépare la routine des entrées fixes du menu
/// (« Ouvrir », « Quitter ») sans avoir à tenir une liste de ce qui est quoi.
#[cfg(desktop)]
const CHECK_PREFIX: &str = "chk:";

/// Événement émis vers le front au clic sur une règle. La charge utile est
/// l'identifiant de la règle.
#[cfg(desktop)]
const TOGGLE_EVENT: &str = "tray-checklist-toggle";

/// Item et événement de la capture à la demande. Le menu ne capture pas
/// lui-même : c'est le front qui connaît la date du jour, la session en cours
/// et l'écran à viser — le Rust ne saurait que prendre une image sans savoir où
/// la ranger.
#[cfg(desktop)]
const CAPTURE_ID: &str = "capture_now";
#[cfg(desktop)]
const CAPTURE_EVENT: &str = "tray-capture-request";

/// Préfixe des entrées du sous-menu de listes, et événement du changement.
#[cfg(desktop)]
const LIST_PREFIX: &str = "lst:";
#[cfg(desktop)]
const SELECT_EVENT: &str = "tray-routine-select";

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ChecklistEntry {
  pub id: String,
  pub label: String,
  pub done: bool,
}

/// Une liste de routine telle que le menu a besoin de la connaître : de quoi
/// l'afficher et savoir laquelle est cochée. Ses règles ne montent pas ici —
/// seules celles de la liste active sont déroulées.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ChecklistList {
  pub id: String,
  pub name: String,
  pub active: bool,
}

/// Dernière liste poussée, gardée pour qui voudrait relire l'état affiché sans
/// interroger le menu lui-même.
#[cfg(desktop)]
#[derive(Default)]
pub struct TrayChecklist(Mutex<Vec<ChecklistEntry>>);

#[cfg(desktop)]
impl TrayChecklist {
  fn set(&self, items: Vec<ChecklistEntry>) {
    // `into_inner` sur verrou empoisonné : un panic ailleurs ne doit pas rendre
    // le menu définitivement impossible à mettre à jour.
    let mut guard = self.0.lock().unwrap_or_else(|e| e.into_inner());
    *guard = items;
  }
}

/// Construit le menu complet : entête, routine, sous-menu de listes, puis les
/// entrées fixes.
#[cfg(desktop)]
pub fn build_menu<R: Runtime>(
  app: &AppHandle<R>,
  title: &str,
  items: &[ChecklistEntry],
  lists: &[ChecklistList],
) -> tauri::Result<Menu<R>> {
  let menu = Menu::new(app)?;

  if items.is_empty() {
    /* Item DÉSACTIVÉ plutôt que menu sans routine : un menu qui ne montre que
       « Ouvrir » ne dit pas si la checklist est vide ou si le front n'a pas
       encore poussé. */
    let empty = MenuItem::with_id(
      app,
      "checklist_empty",
      if title.is_empty() { "Aucune règle de routine".to_string() } else { format!("{title} — aucune règle") },
      false,
      None::<&str>,
    )?;
    menu.append(&empty)?;
  } else {
    let done = items.iter().filter(|i| i.done).count();
    let header = MenuItem::with_id(
      app,
      "checklist_header",
      format!("{} — {}/{}", if title.is_empty() { "Routine du jour" } else { title }, done, items.len()),
      false,
      None::<&str>,
    )?;
    menu.append(&header)?;
    menu.append(&PredefinedMenuItem::separator(app)?)?;
    for it in items {
      let entry = CheckMenuItem::with_id(
        app,
        format!("{CHECK_PREFIX}{}", it.id),
        &it.label,
        true,
        it.done,
        None::<&str>,
      )?;
      menu.append(&entry)?;
    }
  }

  /* Le sous-menu n'apparaît qu'à partir de deux listes : avec une seule, il
     n'offrirait qu'un choix déjà fait. */
  if lists.len() > 1 {
    let sub = Submenu::new(app, "Liste", true)?;
    for l in lists {
      sub.append(&CheckMenuItem::with_id(
        app,
        format!("{LIST_PREFIX}{}", l.id),
        &l.name,
        true,
        l.active,
        None::<&str>,
      )?)?;
    }
    menu.append(&PredefinedMenuItem::separator(app)?)?;
    menu.append(&sub)?;
  }

  menu.append(&PredefinedMenuItem::separator(app)?)?;
  menu.append(&MenuItem::with_id(app, CAPTURE_ID, "Capturer l'écran", true, None::<&str>)?)?;
  menu.append(&MenuItem::with_id(app, "open", "Ouvrir", true, None::<&str>)?)?;
  menu.append(&MenuItem::with_id(app, "quit", "Quitter", true, None::<&str>)?)?;
  Ok(menu)
}

/// Remplace la routine affichée dans le menu. Appelée par le front à chaque
/// changement de règle ou de coche.
#[tauri::command]
pub fn tray_set_checklist<R: Runtime>(
  app: AppHandle<R>,
  title: String,
  items: Vec<ChecklistEntry>,
  lists: Vec<ChecklistList>,
) -> Result<(), String> {
  #[cfg(desktop)]
  {
    let menu = build_menu(&app, &title, &items, &lists).map_err(|e| e.to_string())?;
    if let Some(tray) = app.tray_by_id(TRAY_ID) {
      tray.set_menu(Some(menu)).map_err(|e| e.to_string())?;
    }
    app.state::<TrayChecklist>().set(items);
  }
  #[cfg(not(desktop))]
  {
    let _ = (&app, &title, &items, &lists); // pas de barre d'état sur mobile
  }
  Ok(())
}

/// Traite un clic de menu si le front est concerné. Rend `true` quand c'était le
/// cas, pour que l'appelant n'aille pas chercher plus loin.
///
/// Les deux entrées traitées ici ne font QU'ÉMETTRE : cocher une règle et
/// capturer l'écran demandent l'un et l'autre de savoir quel jour on est et
/// quelle session tourne, ce que seul le front sait.
#[cfg(desktop)]
pub fn handle_menu_event<R: Runtime>(app: &AppHandle<R>, id: &str) -> bool {
  /* Diffusion à toutes les vues : la fenêtre principale est la seule à écouter,
     mais viser une étiquette de fenêtre ferait échouer l'émission en silence le
     jour où elle change de nom. */
  if id == CAPTURE_ID {
    let _ = app.emit(CAPTURE_EVENT, ());
    return true;
  }
  if let Some(list) = id.strip_prefix(LIST_PREFIX) {
    let _ = app.emit(SELECT_EVENT, list.to_string());
    return true;
  }
  let Some(rule) = id.strip_prefix(CHECK_PREFIX) else {
    return false;
  };
  let _ = app.emit(TOGGLE_EVENT, rule.to_string());
  true
}
