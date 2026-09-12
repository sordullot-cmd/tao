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
//!
//! ── DEUX SURFACES, ET POURQUOI LES DEUX ───────────────────────────────────
//!
//! Un `NSMenu` ne se dessine pas : macOS n'y accepte ni couleur, ni graisse, ni
//! mise en page. La routine y tenait, mais en texte brut — aucune progression
//! lisible d'un coup d'œil, aucune des conventions visuelles du reste de l'app.
//! D'où un POPOVER : une webview sans décoration posée sous l'icône, qui charge
//! `/tray` et suit donc les mêmes tokens que les écrans (cf. app/tray/page.tsx).
//!
//! Le menu natif n'est pas supprimé pour autant, il passe au CLIC DROIT. C'est
//! le repli, et il compte : le popover charge une page Vercel, donc un poste
//! hors ligne dont le service worker n'a pas encore le `/tray` n'aurait, sans
//! menu, plus aucun moyen de cocher sa routine. Le coût de le garder est nul —
//! le code existait déjà.
//!
//! Le popover est une VUE, sans état ni session propres. Il n'écrit rien : un
//! clic y émet les mêmes événements que le menu (`tray-checklist-toggle`…), que
//! la fenêtre principale traite comme avant ; elle repousse ensuite la liste par
//! `tray_set_checklist`, ce qui reconstruit le menu ET rediffuse l'état au
//! popover. Une seule vérité, toujours dans la fenêtre principale — un popover
//! qui lirait `user_productivity` lui-même serait une deuxième session à
//! authentifier, et deux magasins à accorder.

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Runtime};
#[cfg(desktop)]
use tauri::{
  menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem, Submenu},
  Emitter, LogicalSize, Manager, PhysicalPosition, Rect, WebviewUrl, WebviewWindow,
  WebviewWindowBuilder,
};
#[cfg(desktop)]
use std::sync::Mutex;
#[cfg(desktop)]
use std::time::{Duration, Instant};

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

/// Bascule de l'enregistrement vidéo. Un seul item, dont le libellé dit l'état :
/// deux entrées « Démarrer » et « Arrêter » dont une toujours inerte se lisent
/// moins vite qu'une seule qui annonce ce qu'elle va faire.
#[cfg(desktop)]
const RECORD_ID: &str = "record_toggle";
#[cfg(desktop)]
const RECORD_EVENT: &str = "tray-record-toggle";

/// Étiquette de la fenêtre du popover. Elle apparaît telle quelle dans
/// `capabilities/default.json` — sans quoi la webview n'aurait le droit
/// d'appeler aucune commande, et le popover s'afficherait inerte.
#[cfg(desktop)]
pub const POPOVER_LABEL: &str = "tray_popover";

/* L'URL est celle du front déployé, comme `frontendDist` : le binaire
   n'embarque aucun JS (cf. CLAUDE.md), le popover se charge donc du même
   endroit que la fenêtre principale. Même origine, donc même `localStorage` et
   même session — ce qui n'est pas qu'un détail de confort : c'est ce qui rend
   la page `/tray` lisible sans second écran de connexion. */
#[cfg(desktop)]
const POPOVER_URL: &str = "https://tao-trade.vercel.app/tray";

/// Gabarit d'ouverture. La hauteur est PROVISOIRE : la page se mesure une fois
/// rendue et rappelle `tray_popover_resize`. Partir d'une valeur basse évite le
/// grand rectangle vide qu'on verrait sinon pendant le chargement.
///
/// La largeur tient du panneau de la barre de menus, pas de la carte : large,
/// il se distinguerait de ceux du système posés juste à côté, et c'est le seul
/// défaut qu'aucun dessin ne rattrape ensuite. 300 px laissent respirer une
/// règle de routine sans en faire une fenêtre.
#[cfg(desktop)]
const POPOVER_WIDTH: f64 = 300.0;
#[cfg(desktop)]
const POPOVER_MIN_HEIGHT: f64 = 130.0;
#[cfg(desktop)]
const POPOVER_MAX_HEIGHT: f64 = 560.0;

/// Écart entre le bas de l'icône et le haut du popover, et marge minimale au
/// bord de l'écran.
#[cfg(desktop)]
const POPOVER_GAP: f64 = 6.0;
#[cfg(desktop)]
const SCREEN_MARGIN: f64 = 8.0;

/// Événement portant l'état complet vers le popover.
#[cfg(desktop)]
const STATE_EVENT: &str = "tray-checklist-state";

/* Un clic sur l'icône alors que le popover a le focus produit DEUX signaux dans
   cet ordre : la perte de focus (qui masque) puis le clic (qui rouvrirait). Le
   popover paraîtrait alors impossible à refermer par où on l'a ouvert. On note
   donc l'instant du masquage et on ignore le clic qui suit de près — c'est la
   fenêtre pendant laquelle le clic « appartient » encore à la fermeture. */
#[cfg(desktop)]
const REOPEN_GUARD: Duration = Duration::from_millis(250);

/// Délai au-delà duquel on montre le popover même sans nouvelle de sa page.
/// Généreux à dessein : mieux vaut un panneau qui met une seconde de plus à
/// venir la toute première fois qu'un panneau blanc à chaque fois.
#[cfg(desktop)]
const FIRST_PAINT_GRACE: Duration = Duration::from_millis(1500);

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

/// Ce que le menu et le popover affichent, dans la forme exacte où le front l'a
/// poussé.
///
/// La structure entière est retenue, et plus seulement les règles : le popover
/// se monte à un moment que personne ne choisit — celui du premier clic — et
/// doit pouvoir se peindre AVANT la poussée suivante. Sans cet état, il
/// s'ouvrirait vide jusqu'à ce qu'une coche bouge quelque part.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct ChecklistState {
  pub title: String,
  pub items: Vec<ChecklistEntry>,
  pub lists: Vec<ChecklistList>,
  pub recording: bool,
}

/// Dernière charge poussée, relisible par `tray_get_checklist`.
#[cfg(desktop)]
#[derive(Default)]
pub struct TrayChecklist(Mutex<ChecklistState>);

#[cfg(desktop)]
impl TrayChecklist {
  fn set(&self, state: ChecklistState) {
    // `into_inner` sur verrou empoisonné : un panic ailleurs ne doit pas rendre
    // le menu définitivement impossible à mettre à jour.
    let mut guard = self.0.lock().unwrap_or_else(|e| e.into_inner());
    *guard = state;
  }

  fn get(&self) -> ChecklistState {
    self.0.lock().unwrap_or_else(|e| e.into_inner()).clone()
  }
}

/// Ce qu'il faut retenir entre deux clics : quand le popover a été masqué (voir
/// `REOPEN_GUARD`) et sous quelle icône le reposer.
///
/// Le rectangle est gardé parce que le PREMIER affichage n'a pas lieu au clic :
/// la fenêtre vient alors de naître et sa page n'est pas peinte. La montrer
/// tout de suite donnerait un rectangle blanc le temps du chargement — la
/// première impression exactement inverse de celle qu'on cherche. Elle attend
/// donc que la page se signale (`tray_popover_resize`), et il faut bien savoir,
/// à ce moment-là, où l'icône se trouvait.
#[cfg(desktop)]
#[derive(Default)]
pub struct PopoverGuard {
  hidden_at: Mutex<Option<Instant>>,
  anchor: Mutex<Option<Rect>>,
  /// Vrai tant que la page n'a pas donné signe de vie.
  pending: Mutex<bool>,
}

#[cfg(desktop)]
impl PopoverGuard {
  fn mark_hidden(&self) {
    *self.hidden_at.lock().unwrap_or_else(|e| e.into_inner()) = Some(Instant::now());
    *self.pending.lock().unwrap_or_else(|e| e.into_inner()) = false;
  }

  /// Vrai quand le clic en cours n'est que le contrecoup d'une fermeture.
  fn just_hidden(&self) -> bool {
    self
      .hidden_at
      .lock()
      .unwrap_or_else(|e| e.into_inner())
      .map(|t| t.elapsed() < REOPEN_GUARD)
      .unwrap_or(false)
  }

  fn arm(&self, icon: Rect) {
    *self.anchor.lock().unwrap_or_else(|e| e.into_inner()) = Some(icon);
    *self.pending.lock().unwrap_or_else(|e| e.into_inner()) = true;
  }

  /// Consomme l'attente : rend le point d'ancrage une seule fois.
  fn take_pending(&self) -> Option<Rect> {
    let mut pending = self.pending.lock().unwrap_or_else(|e| e.into_inner());
    if !*pending {
      return None;
    }
    *pending = false;
    *self.anchor.lock().unwrap_or_else(|e| e.into_inner())
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
  recording: bool,
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
  menu.append(&MenuItem::with_id(
    app,
    RECORD_ID,
    if recording { "Arrêter l'enregistrement" } else { "Enregistrer l'écran" },
    true,
    None::<&str>,
  )?)?;
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
  recording: bool,
) -> Result<(), String> {
  #[cfg(desktop)]
  {
    let menu = build_menu(&app, &title, &items, &lists, recording).map_err(|e| e.to_string())?;
    if let Some(tray) = app.tray_by_id(TRAY_ID) {
      tray.set_menu(Some(menu)).map_err(|e| e.to_string())?;
    }
    let state = ChecklistState { title, items, lists, recording };
    app.state::<TrayChecklist>().set(state.clone());
    /* Le popover est peint par cet événement et par rien d'autre. Émis même
       quand il est caché : il garde alors un état à jour et s'ouvre déjà juste,
       au lieu de montrer la veille le temps d'une aller-retour. */
    let _ = app.emit(STATE_EVENT, state);
  }
  #[cfg(not(desktop))]
  {
    let _ = (&app, &title, &items, &lists, recording); // pas de barre d'état sur mobile
  }
  Ok(())
}

/// L'état affiché, pour qui arrive après la poussée — c'est-à-dire le popover à
/// chaque montage.
#[tauri::command]
pub fn tray_get_checklist<R: Runtime>(app: AppHandle<R>) -> ChecklistState {
  #[cfg(desktop)]
  {
    app.state::<TrayChecklist>().get()
  }
  #[cfg(not(desktop))]
  {
    let _ = &app;
    ChecklistState::default()
  }
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
  if id == RECORD_ID {
    let _ = app.emit(RECORD_EVENT, ());
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

/* ─── Le popover ───────────────────────────────────────────────────────────── */

/// Rend la fenêtre du popover, en la créant au premier appel.
///
/// Créée PARESSEUSEMENT et non au démarrage : c'est une webview complète, donc
/// un processus de rendu et une page à charger, pour une surface que beaucoup
/// de journées n'ouvriront jamais. Une fois née elle est gardée — la recréer à
/// chaque clic rendrait le contenu clignotant et perdrait le défilement.
#[cfg(desktop)]
fn ensure_popover<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<WebviewWindow<R>> {
  if let Some(w) = app.get_webview_window(POPOVER_LABEL) {
    return Ok(w);
  }
  let url = POPOVER_URL.parse().expect("URL du popover invalide");
  let win = WebviewWindowBuilder::new(app, POPOVER_LABEL, WebviewUrl::External(url))
    .title("Routine du jour")
    .inner_size(POPOVER_WIDTH, POPOVER_MIN_HEIGHT)
    .decorations(false)
    .transparent(true)
    /* Une fenêtre sans décoration a des angles VIFS. Les coins arrondis et
       l'ombre viennent donc du CSS de la page, ce qui suppose deux choses : un
       fond transparent (d'où `macOSPrivateApi` dans tauri.conf.json) et pas
       d'ombre système, qui serait rectangulaire et dépasserait des angles. */
    .shadow(false)
    .always_on_top(true)
    .resizable(false)
    .minimizable(false)
    .maximizable(false)
    .skip_taskbar(true)
    /* Invisible à la création : elle n'a pas encore de position, et l'afficher
       ici la ferait apparaître au centre de l'écran avant de sauter sous
       l'icône. */
    .visible(false)
    .build()?;
  Ok(win)
}

/// Pose le popover sous l'icône, sans le laisser sortir de l'écran.
///
/// Le rectangle de l'icône est en pixels physiques ; la taille de la fenêtre
/// aussi. On reste donc en physique de bout en bout — mélanger les deux donne
/// un popover décalé de moitié sur un écran Retina, et juste sur les autres,
/// c'est-à-dire un bug qu'on ne voit pas sur sa propre machine.
#[cfg(desktop)]
fn place_under_icon<R: Runtime>(win: &WebviewWindow<R>, icon: &Rect) -> tauri::Result<()> {
  let scale = win.scale_factor().unwrap_or(1.0);
  let pos = icon.position.to_physical::<f64>(scale);
  let size = icon.size.to_physical::<f64>(scale);
  let win_size = win.outer_size()?;

  let mut x = pos.x + size.width / 2.0 - win_size.width as f64 / 2.0;
  let y = pos.y + size.height + POPOVER_GAP * scale;

  /* L'icône peut être tout au bord — sur un Mac, la barre d'état porte parfois
     vingt éléments et le dernier touche le coin droit. Centrer bêtement
     couperait le popover ; on le ramène dans l'écran qui porte l'icône. */
  if let Ok(Some(monitor)) = win.monitor_from_point(pos.x, pos.y) {
    let m_pos = monitor.position();
    let m_size = monitor.size();
    let min_x = m_pos.x as f64 + SCREEN_MARGIN * scale;
    let max_x = (m_pos.x + m_size.width as i32) as f64
      - win_size.width as f64
      - SCREEN_MARGIN * scale;
    if max_x > min_x {
      x = x.clamp(min_x, max_x);
    }
  }

  win.set_position(PhysicalPosition::new(x.round(), y.round()))?;
  Ok(())
}

/// Masque le popover et note l'instant — voir `REOPEN_GUARD`.
#[cfg(desktop)]
pub fn hide_popover<R: Runtime>(app: &AppHandle<R>) {
  if let Some(w) = app.get_webview_window(POPOVER_LABEL) {
    let _ = w.hide();
  }
  app.state::<PopoverGuard>().mark_hidden();
}

/// Ouvre ou referme le popover au clic sur l'icône.
#[cfg(desktop)]
pub fn toggle_popover<R: Runtime>(app: &AppHandle<R>, icon: Rect) {
  if let Some(w) = app.get_webview_window(POPOVER_LABEL) {
    if w.is_visible().unwrap_or(false) {
      hide_popover(app);
      return;
    }
  }
  // Le clic qui vient de fermer le popover ne doit pas le rouvrir.
  if app.state::<PopoverGuard>().just_hidden() {
    return;
  }

  /* La fenêtre existe déjà : sa page est peinte, on la montre à l'instant même.
     C'est le cas de tous les clics sauf le premier. */
  if let Some(win) = app.get_webview_window(POPOVER_LABEL) {
    reveal(&win, &icon);
    return;
  }

  if let Err(e) = ensure_popover(app) {
    log::warn!("[tray] popover impossible à ouvrir: {e}");
    return;
  }
  // Première ouverture : la page se montrera elle-même une fois prête.
  app.state::<PopoverGuard>().arm(icon);

  /* Filet. Si la page ne se signale pas — réseau coupé et rien en cache, erreur
     de chargement —, la fenêtre resterait invisible et le clic serait resté sans
     effet, ce qui est pire qu'un panneau vide : rien ne dirait qu'il faut passer
     par le menu du clic droit. */
  let handle = app.clone();
  std::thread::spawn(move || {
    std::thread::sleep(FIRST_PAINT_GRACE);
    let Some(icon) = handle.state::<PopoverGuard>().take_pending() else { return };
    let Some(win) = handle.get_webview_window(POPOVER_LABEL) else { return };
    /* Toucher à une fenêtre depuis un thread quelconque n'est pas permis sur
       macOS — AppKit n'accepte ses appels que sur le thread principal. Le
       chemin normal (`tray_popover_resize`) y est déjà ; celui-ci doit y
       revenir explicitement. */
    let _ = win.clone().run_on_main_thread(move || reveal(&win, &icon));
  });
}

/// Pose la fenêtre et la montre.
#[cfg(desktop)]
fn reveal<R: Runtime>(win: &WebviewWindow<R>, icon: &Rect) {
  let _ = place_under_icon(win, icon);
  let _ = win.show();
  /* Le focus n'est pas cosmétique : c'est SA PERTE qui referme le popover.
     Sans lui, la fenêtre resterait ouverte par-dessus tout le reste. */
  let _ = win.set_focus();
}

/// Ajuste la hauteur à ce que la page occupe réellement.
///
/// Le nombre de règles n'est connu que du front, et il change : une hauteur
/// fixe laisserait soit du vide sous une liste courte, soit une barre de
/// défilement sur une liste de douze. Le repositionnement suit, sinon la
/// fenêtre grandirait vers le bas depuis un coin qui, lui, ne bouge pas — ce
/// qui est juste ici, l'ancrage étant le haut.
#[tauri::command]
pub fn tray_popover_resize<R: Runtime>(app: AppHandle<R>, height: f64) -> Result<(), String> {
  #[cfg(desktop)]
  {
    if let Some(w) = app.get_webview_window(POPOVER_LABEL) {
      let h = height.clamp(POPOVER_MIN_HEIGHT, POPOVER_MAX_HEIGHT);
      w.set_size(LogicalSize::new(POPOVER_WIDTH, h)).map_err(|e| e.to_string())?;
      /* Cet appel est aussi le « je suis peinte » de la page : la première
         mesure ne peut pas précéder le premier rendu. C'est donc ici que la
         fenêtre nouvellement créée se montre — à la bonne taille du premier
         coup, sans le saut qu'aurait donné un affichage antérieur. */
      if let Some(icon) = app.state::<PopoverGuard>().take_pending() {
        reveal(&w, &icon);
      }
    }
  }
  #[cfg(not(desktop))]
  {
    let _ = (&app, height);
  }
  Ok(())
}

/// Referme le popover depuis la page — après « Ouvrir l'app » ou une capture,
/// où le laisser ouvert par-dessus ce qu'on vient de demander n'aurait pas de
/// sens.
#[tauri::command]
pub fn tray_popover_close<R: Runtime>(app: AppHandle<R>) {
  #[cfg(desktop)]
  hide_popover(&app);
  #[cfg(not(desktop))]
  let _ = &app;
}
