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

LES SITES, eux, demandent autre chose. Reprendre le premier plan sur un
navigateur ne bloque rien : l'onglet est toujours là, un clic derrière. D'où les
deux commandes suivantes, et le choix qu'elles portent :

  • `front_tab` lit l'URL de l'onglet actif — l'URL, pas le titre de la fenêtre.
    La différence n'est pas cosmétique : sur un titre, « youtube » se devine ;
    sur une URL, `matchesDomain` tranche pour de bon, sous-domaines compris, et
    le mode « seuls autorisés » redevient jugeable.
  • `redirect_tab` renvoie cet onglet vers une page vide. Renvoyer plutôt que
    fermer : un onglet fermé emporte ce qu'on y avait tapé, et une page de
    blocage qui coûte un panier ou un formulaire se fait désinstaller. Ici, un
    retour arrière suffit à retrouver la page — ce qu'on vise est la friction,
    pas la punition.

Le prix à payer est une autorisation « Automatisation » par navigateur, demandée
par macOS au premier pilotage. Refusée, la lecture d'URL échoue proprement et le
garde retombe sur le titre de fenêtre (cf. lib/focus/guard.ts) : moins précis,
mais jamais silencieux.
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

/* ─── Onglet du navigateur ───────────────────────────────────────────────── */

/// Ce que le navigateur au premier plan a réellement sous les yeux.
#[derive(serde::Serialize, Clone, Debug, Default)]
pub struct TabSnapshot {
  /// Navigateur interrogé, tel qu'il a été demandé.
  pub app: String,
  /// URL de l'onglet actif. Vide quand elle n'a pas pu être lue.
  pub url: String,
  pub ok: bool,
  /// Cause de l'échec, pour que l'interface dise laquelle : navigateur non
  /// pilotable, autorisation refusée, ou aucune fenêtre ouverte.
  pub error: Option<String>,
}

/// URL de l'onglet actif du navigateur nommé.
///
/// Le nom vient du front, qui vient de le relever (`activity_snapshot`) : on ne
/// redemande pas au système ce qu'il vient de dire. Il est confronté à une liste
/// fermée avant de toucher à AppleScript — c'est ce qui interdit qu'un nom
/// d'application serve à faire exécuter autre chose que ce qui est prévu ici.
#[tauri::command]
pub fn front_tab(app: String) -> TabSnapshot {
  imp::front_tab(&app)
}

/// Renvoie l'onglet actif vers une page vide. Rien n'est fermé.
#[tauri::command]
pub fn redirect_tab(app: String) -> Result<bool, String> {
  imp::redirect_tab(&app)
}

/* ─── macOS : pilotage des navigateurs par AppleScript ───────────────────── */

#[cfg(target_os = "macos")]
mod imp {
  use super::TabSnapshot;
  use std::process::Command;

  /// La page où atterrit un onglet coupé.
  ///
  /// Une page vide, et non une page de blocage à nous : un navigateur refuse
  /// une navigation de premier niveau vers une `data:` URL, et l'envoyer sur
  /// notre site le ferait charger une deuxième fois hors de l'app. Le vide est
  /// sans ambiguïté, et l'explication est de toute façon à l'écran, dans
  /// l'app, qui vient de reprendre le premier plan.
  const BLANK: &str = "about:blank";

  /// Navigateurs pilotables, et dialecte de chacun.
  ///
  /// `true` : famille Chromium, qui parle en onglets (`active tab of front
  /// window`). `false` : Safari, qui parle en documents (`front document`).
  /// Tout ce qui n'est pas dans cette liste n'est pas piloté — Firefox, entre
  /// autres, n'expose pas ses URLs à AppleScript.
  fn dialect(app: &str) -> Option<bool> {
    match app {
      "Google Chrome" | "Google Chrome Canary" | "Google Chrome Beta" | "Chromium"
      | "Brave Browser" | "Brave Browser Beta" | "Brave Browser Nightly"
      | "Microsoft Edge" | "Microsoft Edge Beta" | "Vivaldi" | "Opera" | "Opera GX"
      | "Arc" => Some(true),
      "Safari" | "Safari Technology Preview" => Some(false),
      _ => None,
    }
  }

  fn osascript(script: &str) -> Result<String, String> {
    let out = Command::new("osascript")
      .arg("-e")
      .arg(script)
      .output()
      .map_err(|e| e.to_string())?;
    if out.status.success() {
      return Ok(String::from_utf8_lossy(&out.stdout).trim().to_string());
    }
    let err = String::from_utf8_lossy(&out.stderr);
    // -1743 : l'utilisateur a refusé l'autorisation « Automatisation ». C'est
    // le seul échec qui se répare, et il mérite donc son propre nom.
    Err(if err.contains("-1743") {
      "automation-denied".into()
    } else if err.trim().is_empty() {
      "osascript-failed".into()
    } else {
      err.trim().to_string()
    })
  }

  pub fn front_tab(app: &str) -> TabSnapshot {
    let Some(chromium) = dialect(app) else {
      return TabSnapshot {
        app: app.into(),
        error: Some("not-scriptable".into()),
        ..Default::default()
      };
    };
    let script = if chromium {
      format!(r#"tell application "{app}" to get URL of active tab of front window"#)
    } else {
      format!(r#"tell application "{app}" to get URL of front document"#)
    };
    match osascript(&script) {
      Ok(url) if !url.is_empty() && url != "missing value" => TabSnapshot {
        app: app.into(),
        url,
        ok: true,
        error: None,
      },
      Ok(_) => TabSnapshot {
        app: app.into(),
        error: Some("no-open-tab".into()),
        ..Default::default()
      },
      Err(e) => TabSnapshot {
        app: app.into(),
        error: Some(e),
        ..Default::default()
      },
    }
  }

  pub fn redirect_tab(app: &str) -> Result<bool, String> {
    let Some(chromium) = dialect(app) else {
      return Ok(false);
    };
    let script = if chromium {
      format!(r#"tell application "{app}" to set URL of active tab of front window to "{BLANK}""#)
    } else {
      format!(r#"tell application "{app}" to set URL of front document to "{BLANK}""#)
    };
    osascript(&script)?;
    Ok(true)
  }
}

/* ─── Autres plateformes ─────────────────────────────────────────────────── */

/* Windows n'a pas d'équivalent d'AppleScript : lire la barre d'adresse passerait
   par l'API d'accessibilité (UI Automation), c'est-à-dire du COM et un arbre à
   parcourir par navigateur. Tant que ce n'est pas écrit, on le DIT — le garde
   retombe sur le titre de fenêtre, et l'interface annonce la précision qu'elle a
   vraiment. */
#[cfg(not(target_os = "macos"))]
mod imp {
  use super::TabSnapshot;

  pub fn front_tab(app: &str) -> TabSnapshot {
    TabSnapshot {
      app: app.into(),
      error: Some("unsupported-platform".into()),
      ..Default::default()
    }
  }

  pub fn redirect_tab(_app: &str) -> Result<bool, String> {
    Ok(false)
  }
}
