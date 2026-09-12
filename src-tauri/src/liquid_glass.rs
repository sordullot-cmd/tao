//! Liquid Glass — le matériau des panneaux de macOS 26.
//!
//! ── POURQUOI CE MODULE EXISTE ─────────────────────────────────────────────
//!
//! Le popover de la barre d'état voisine les panneaux du système (Wi-Fi, son,
//! Centre de contrôle). Depuis macOS 26, ceux-ci ne sont plus faits d'un
//! `NSVisualEffectView` mais de LIQUID GLASS, un matériau différent : moins
//! flou, avec une réfraction et un reflet de bord, à travers lequel les formes
//! du fond se devinent encore.
//!
//! C'est un écart qu'aucun réglage ne rattrape. Le rayon de flou d'un
//! `NSVisualEffectView` n'est pas exposé par AppKit ; changer de matériau
//! (`Menu`, `Popover`, `Sidebar`) ne change que l'épaisseur de la teinte, pas
//! le flou. Côté vibrancy classique, le panneau restait donc visiblement plus
//! laiteux que ses voisins, quoi qu'on fasse.
//!
//! ── POURQUOI PAR LE RUNTIME OBJECTIVE-C ───────────────────────────────────
//!
//! `NSGlassEffectView` n'est exposée ni par Tauri, ni par `tauri-utils`, ni par
//! `objc2-app-kit`. On la joint donc par son NOM, à l'exécution. Ce n'est pas
//! un contournement : c'est la façon normale d'employer une API plus récente
//! que le socle qu'on cible. `AnyClass::get` rend `None` sur macOS 25 et
//! antérieurs, et l'appelant retombe alors sur la vibrancy classique — la seule
//! branche qu'un poste plus ancien empruntera.
//!
//! ⚠️ Tout ce fichier touche à AppKit : il ne doit être appelé QUE depuis le
//! thread principal. Les deux appelants (`ensure_popover` et `reveal`, dans
//! tray.rs) y sont déjà, l'un par la création de fenêtre, l'autre par
//! `run_on_main_thread`.

use objc2::msg_send;
use objc2::runtime::{AnyClass, AnyObject};
use objc2_foundation::NSRect;

/// Nom de la classe, joint à l'exécution. Absent avant macOS 26.
const GLASS_CLASS: &std::ffi::CStr = c"NSGlassEffectView";

/* `NSViewWidthSizable | NSViewHeightSizable` : la plaque suit la fenêtre quand
   elle change de taille, ce qu'elle fait à chaque fois que la page se mesure
   (cf. `tray_popover_resize`). Sans ça, le verre garderait la hauteur qu'il
   avait à l'ouverture et laisserait le bas du panneau transparent. */
const RESIZE_WITH_WINDOW: usize = 2 | 16;

/// `NSWindowBelow` : la plaque va SOUS tout le reste, webview comprise.
const BELOW: isize = -1;

/// Vrai si le système sait faire du Liquid Glass (macOS 26+).
pub fn supported() -> bool {
  AnyClass::get(GLASS_CLASS).is_some()
}

/// Pose une plaque de Liquid Glass au fond de la fenêtre.
///
/// Rend `false` quand le système ne connaît pas le matériau : l'appelant doit
/// alors poser la vibrancy classique, faute de quoi la fenêtre resterait
/// transparente — la page, elle, ne peint aucun fond.
///
/// `ns_window` est le pointeur rendu par `WebviewWindow::ns_window()`.
pub fn install(ns_window: *mut std::ffi::c_void, radius: f64) -> bool {
  if ns_window.is_null() {
    return false;
  }
  let Some(class) = AnyClass::get(GLASS_CLASS) else {
    return false;
  };

  unsafe {
    let window = ns_window as *mut AnyObject;
    let content: *mut AnyObject = msg_send![window, contentView];
    if content.is_null() {
      return false;
    }

    /* La plaque naît aux dimensions de la vue de contenu plutôt qu'à zéro :
       entre sa création et le premier redimensionnement, une plaque vide
       laisserait voir le bureau au travers le temps d'une image. */
    let bounds: NSRect = msg_send![content, bounds];

    let allocated: *mut AnyObject = msg_send![class, alloc];
    let glass: *mut AnyObject = msg_send![allocated, initWithFrame: bounds];
    if glass.is_null() {
      return false;
    }

    /* Le rayon est posé sur la PLAQUE et non sur la fenêtre : c'est lui qui
       découpe le matériau, et c'est aussi lui que l'ombre portée du système
       suivra, l'ombre se calculant d'après les pixels opaques. */
    let _: () = msg_send![glass, setCornerRadius: radius];
    let _: () = msg_send![glass, setAutoresizingMask: RESIZE_WITH_WINDOW];

    let _: () = msg_send![
      content,
      addSubview: glass,
      positioned: BELOW,
      relativeTo: std::ptr::null_mut::<AnyObject>()
    ];
  }
  true
}
