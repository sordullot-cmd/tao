//! Le popover en PANNEAU, pour qu'un clic sur l'icône n'active pas l'app.
//!
//! ── LE DÉFAUT QU'ON CORRIGE ───────────────────────────────────────────────
//!
//! Montrer une fenêtre et lui donner le focus, sur macOS, ce n'est pas une
//! opération sur la fenêtre : `set_focus` de tao fait `makeKeyAndOrderFront`
//! PUIS `activateIgnoringOtherApps:`. Le second réveille l'APPLICATION entière,
//! donc remonte aussi la fenêtre principale au premier plan. Ouvrir le popover
//! revenait ainsi à ouvrir l'app par-dessus ce qu'on regardait — l'inverse de
//! ce qu'on attend d'une icône de barre d'état, dont tout l'intérêt est de
//! cocher une règle sans quitter des yeux ce qu'on fait.
//!
//! Et le focus n'est pas négociable : c'est SA PERTE qui referme le popover
//! (cf. `WindowEvent::Focused(false)` dans lib.rs), et c'est lui qui porte la
//! frappe dans la note rapide. Il fallait donc le focus SANS l'activation.
//!
//! ── POURQUOI UN NSPanel, ET PAS UN RÉGLAGE ────────────────────────────────
//!
//! AppKit n'a qu'une façon de rendre une fenêtre « key » sans activer l'app :
//! `NSWindowStyleMaskNonactivatingPanel`. Le bit existe pour ça — c'est ce qui
//! fait que les palettes et le Centre de contrôle prennent le clavier sans
//! passer devant. Mais il n'est honoré que par un `NSPanel` : posé sur une
//! `NSWindow`, il est ignoré en silence.
//!
//! Tauri ne crée que des `NSWindow`. On change donc la CLASSE de l'objet après
//! coup (`object_setClass`), pour une sous-classe de `NSPanel` — la méthode du
//! greffon `tauri-nspanel`, et la seule qui existe sans forker le runtime.
//!
//! Ce que ça coûte, et pourquoi c'est acceptable ici :
//!
//! — on perd les surcharges de `TaoWindow`. `canBecomeKeyWindow` et
//!   `canBecomeMainWindow` sont réécrites ci-dessous (la panel doit prendre le
//!   clavier, jamais être la fenêtre principale) ; `sendEvent:` ne servait qu'au
//!   déplacement par le fond, qu'un popover ancré sous son icône n'a pas ;
//! — `TaoWindow` ajoute un ivar (`focusable`) que notre classe n'a pas. Le sens
//!   du changement compte : la nouvelle classe est PLUS PETITE que l'ancienne,
//!   donc l'objet déjà alloué reste plus grand qu'il ne faut. L'inverse — une
//!   classe plus grande sur une allocation plus petite — serait une écriture
//!   hors limites. C'est aussi pourquoi on passe par `ffi::object_setClass` :
//!   l'enveloppe d'objc2 affirme l'égalité des tailles en debug.
//!
//! ⚠️ AppKit : à n'appeler que depuis le thread principal, et AVANT le premier
//! affichage de la fenêtre.

use objc2::runtime::{AnyClass, AnyObject, Bool, ClassBuilder, Sel};
use objc2::{msg_send, sel};

/// `NSWindowStyleMaskNonactivatingPanel` — le bit qui fait tout le module.
const NONACTIVATING_PANEL: usize = 1 << 7;

/// Nom de notre sous-classe. Enregistré une fois pour tout le processus : le
/// runtime Objective-C refuse deux classes de même nom, d'où la relecture par
/// `AnyClass::get` avant de la construire.
const PANEL_CLASS: &std::ffi::CStr = c"TaoTrayPanel";

/* Un panneau non-activant ne prend le clavier que s'il s'y déclare apte : le
   comportement par défaut d'un `NSPanel` sans barre de titre est de le refuser,
   et le popover resterait alors sourd — et surtout ne perdrait jamais un focus
   qu'il n'aurait pas eu, donc ne se refermerait plus. */
extern "C" fn can_become_key(_: &AnyObject, _: Sel) -> Bool {
  Bool::YES
}

/* Fenêtre PRINCIPALE, en revanche, jamais : c'est le statut de la vraie fenêtre
   de l'app. Le laisser à un panneau de barre d'état brouillerait le menu de
   l'application et les raccourcis qui s'y rattachent. */
extern "C" fn can_become_main(_: &AnyObject, _: Sel) -> Bool {
  Bool::NO
}

fn panel_class() -> Option<&'static AnyClass> {
  if let Some(existing) = AnyClass::get(PANEL_CLASS) {
    return Some(existing);
  }
  let superclass = AnyClass::get(c"NSPanel")?;
  let mut decl = ClassBuilder::new(PANEL_CLASS, superclass)?;
  unsafe {
    decl.add_method(
      sel!(canBecomeKeyWindow),
      can_become_key as extern "C" fn(_, _) -> _,
    );
    decl.add_method(
      sel!(canBecomeMainWindow),
      can_become_main as extern "C" fn(_, _) -> _,
    );
  }
  Some(decl.register())
}

/// Convertit la fenêtre en panneau qui prend le focus sans activer l'app.
///
/// Rend `false` si le runtime n'a rien voulu savoir : l'appelant garde alors
/// une fenêtre ordinaire, c'est-à-dire le comportement d'avant — le popover
/// s'ouvre, mais en ramenant l'app devant.
///
/// `ns_window` est le pointeur rendu par `WebviewWindow::ns_window()`.
pub fn make_nonactivating(ns_window: *mut std::ffi::c_void) -> bool {
  if ns_window.is_null() {
    return false;
  }
  let Some(class) = panel_class() else {
    return false;
  };

  unsafe {
    let window = ns_window as *mut AnyObject;
    objc2::ffi::object_setClass(window, class);

    /* Le masque se COMPLÈTE, il ne se remplace pas : la fenêtre est déjà sans
       décoration, et réécrire le masque en entier lui rendrait une barre de
       titre sous le verre. */
    let mask: usize = msg_send![window, styleMask];
    let _: () = msg_send![window, setStyleMask: mask | NONACTIVATING_PANEL];

    /* Un `NSPanel` se cache par défaut quand l'app passe en arrière-plan. Ici
       c'est le contraire du besoin : l'app est en arrière-plan la plupart du
       temps (elle est `LSUIElement`), et c'est notre propre chemin de fermeture
       — la perte de focus — qui doit masquer le popover, parce que lui seul
       arme le garde-fou qui empêche le clic suivant de le rouvrir aussitôt. */
    let _: () = msg_send![window, setHidesOnDeactivate: Bool::NO];
  }
  true
}
