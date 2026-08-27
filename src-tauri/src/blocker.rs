/*!
Reprise de la main sur l'appareil — le bras armé du blocage d'application.

Le front sait DÉJÀ quelle appli est au premier plan : `tracker::activity_snapshot`
la lui donne, et `lib/focus/model.ts` décide si elle est coupée. Ce qu'une page
web ne peut pas faire, en revanche, c'est reprendre le premier plan à une autre
application. C'est tout ce que ce module ajoute, et il n'ajoute rien d'autre :

  • pas de processus TUÉ. `close_app` demande à l'application de QUITTER, ce
    qui n'est pas la même chose : l'app reçoit la demande, enregistre ce qu'elle
    a à enregistrer, ferme ses fichiers. Un `SIGKILL` ferait perdre le travail
    en cours, et une page de blocage qui coûte un document se fait
    désinstaller ;
  • pas de fenêtre d'autrui manipulée — cela réclame des autorisations
    d'automatisation par app sur macOS, et un blocage qui s'effondre parce que
    l'utilisateur a refusé une boîte de dialogue ne bloque rien.

Le reste de la friction : l'appli distrayante est fermée, la fenêtre de tao
trade reprend le premier plan, et l'écran de blocage (BlockShield) explique
pourquoi elle vient de disparaître — sans quoi on cherche un plantage. La
tentative est notée au journal de la session.

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
  • `redirect_tab` renvoie cet onglet vers la page de blocage de l'app
    (`/blocked`), ou vers une page vide à défaut. Renvoyer plutôt que fermer :
    un onglet fermé emporte ce qu'on y avait tapé, et une page de blocage qui
    coûte un panier ou un formulaire se fait désinstaller. Ici, un retour
    arrière suffit à retrouver la page — ce qu'on vise est la friction, pas la
    punition.

L'adresse de destination vient du front, donc de la page web : elle est filtrée
ici avant d'entrer dans un script. Le filtre est volontairement borné à ce qui
peut EXISTER dans une URL bien formée — `https:`, pas de guillemet, pas
d'antislash, pas de caractère de contrôle — ce qui rend l'échappement inutile
plutôt que délicat. Un refus retombe sur la page vide : l'onglet quitte le site
dans tous les cas, c'est la seule chose qui ne doit jamais dépendre d'un
paramètre.

Le prix à payer est une autorisation « Automatisation » par navigateur, demandée
par macOS au premier pilotage. Refusée, la lecture d'URL échoue proprement et le
garde retombe sur le titre de fenêtre (cf. lib/focus/guard.ts) : moins précis,
mais jamais silencieux.
*/

use tauri::{AppHandle, Manager};

/// Combien de temps la fenêtre reste au-dessus des autres après une reprise.
/// Notion de bureau : sur mobile, rien ne se superpose (cf. `focus_reclaim`).
#[cfg(desktop)]
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
  w.show().map_err(|e| e.to_string())?;
  w.set_focus().map_err(|e| e.to_string())?;

  /* Le maintien au-dessus des autres fenêtres est une notion de BUREAU : sur
     Android il n'y a pas de fenêtres empilées, c'est l'activité au premier plan
     qui occupe l'écran, et la ramener devant se fait côté natif. `show` et
     `set_focus` suffisent donc là-bas, et les trois appels qui suivent
     n'existent même pas dans la build mobile. */
  #[cfg(desktop)]
  {
    let _ = w.unminimize();
    let _ = w.set_always_on_top(true);
    let w2 = w.clone();
    std::thread::spawn(move || {
      std::thread::sleep(std::time::Duration::from_millis(ON_TOP_MS));
      let _ = w2.set_always_on_top(false);
    });
  }

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

/// Renvoie l'onglet actif vers `url`, ou vers une page vide si elle est refusée.
/// Rien n'est fermé.
#[tauri::command]
pub fn redirect_tab(app: String, url: Option<String>) -> Result<bool, String> {
  imp::redirect_tab(&app, url.as_deref().unwrap_or(""))
}

/* ─── macOS : pilotage des navigateurs par AppleScript ───────────────────── */

#[cfg(target_os = "macos")]
mod imp {
  use super::TabSnapshot;
  use std::process::Command;

  /// Où atterrit un onglet coupé quand rien de mieux n'est fourni.
  ///
  /// Le vide est sans ambiguïté et ne dépend d'aucun réseau : c'est ce qui en
  /// fait le bon repli, y compris quand le site est injoignable et que la page
  /// de blocage ne chargerait pas.
  const BLANK: &str = "about:blank";

  /// Adresse acceptable dans un script — et le filtre tient lieu d'échappement.
  ///
  /// Une URL construite par `URLSearchParams` est déjà encodée : ni guillemet,
  /// ni antislash, ni saut de ligne ne peuvent s'y trouver. Les refuser purement
  /// et simplement est donc sans effet de bord, et laisse une règle qui se
  /// vérifie à l'œil au lieu d'un échappement à faire confiance.
  fn safe_url(url: &str) -> Option<&str> {
    let u = url.trim();
    if !u.starts_with("https://") || u.len() > 2048 {
      return None;
    }
    if u.chars().any(|c| c.is_control() || c == '"' || c == '\\') {
      return None;
    }
    Some(u)
  }

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

  pub fn redirect_tab(app: &str, url: &str) -> Result<bool, String> {
    let Some(chromium) = dialect(app) else {
      return Ok(false);
    };
    let dest = safe_url(url).unwrap_or(BLANK);
    let script = if chromium {
      format!(r#"tell application "{app}" to set URL of active tab of front window to "{dest}""#)
    } else {
      format!(r#"tell application "{app}" to set URL of front document to "{dest}""#)
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

  pub fn redirect_tab(_app: &str, _url: &str) -> Result<bool, String> {
    Ok(false)
  }
}

/* ─── Fermeture d'une application ────────────────────────────────────────── */

/// Demande à une application de quitter.
///
/// QUITTER, et non tuer : l'app reçoit la demande par les voies normales du
/// système et fait ce qu'elle fait toujours en fermant — enregistrer, poser sa
/// question « voulez-vous enregistrer ? », relâcher ses fichiers. Un blocage
/// qui fait perdre une heure de travail ne protège de rien, il se fait
/// désinstaller.
///
/// Conséquence à assumer : une app qui pose une question au moment de quitter
/// reste ouverte tant qu'on n'y répond pas. C'est le prix de la propreté, et le
/// front le sait — il reprend le premier plan de toute façon, si bien qu'un
/// refus de fermeture retombe sur le comportement d'avant plutôt que sur rien.
///
/// Rend `false` quand rien n'a été tenté (nom refusé), une erreur quand la
/// tentative a échoué.
#[tauri::command]
pub fn close_app(app: String) -> Result<bool, String> {
  let name = app.trim();
  if !closable(name) {
    return Ok(false);
  }
  imp_close::close(name)
}

/// Ce qu'on ne ferme JAMAIS, quoi qu'en dise l'appelant.
///
/// Le front filtre déjà (cf. `SYSTEM_APPS` dans lib/focus/model.ts), et cette
/// liste ne fait pas confiance à ce filtre : fermer le Finder, l'explorateur ou
/// tao trade lui-même rendrait le poste inutilisable ou couperait la seule
/// interface qui permet de desserrer le blocage. Une commande destructrice se
/// vérifie des deux côtés.
fn closable(name: &str) -> bool {
  if name.is_empty() || name.len() > 128 {
    return false;
  }
  // Rien qui puisse s'échapper d'une chaîne de script ou d'un argument.
  if name.chars().any(|c| c.is_control() || c == '"' || c == '\\') {
    return false;
  }
  const NEVER: [&str; 10] = [
    "finder", "dock", "systemuiserver", "windowserver", "loginwindow",
    "explorer", "tao trade", "taotrade", "app", "systemsettings",
  ];
  let lower = name.to_lowercase();
  let lower = lower.strip_suffix(".exe").unwrap_or(&lower);
  !NEVER.contains(&lower)
}

#[cfg(target_os = "macos")]
mod imp_close {
  use std::process::Command;

  pub fn close(name: &str) -> Result<bool, String> {
    /* AppleScript d'abord : c'est la fermeture que l'application elle-même
       comprend, celle qui lui laisse enregistrer. Elle réclame l'autorisation
       « Automatisation » pour cette app-là. */
    let script = format!(r#"tell application "{name}" to quit"#);
    let out = Command::new("osascript")
      .arg("-e")
      .arg(&script)
      .output()
      .map_err(|e| e.to_string())?;
    if out.status.success() {
      return Ok(true);
    }

    /* Refusée ou non scriptable, on retombe sur un SIGTERM — le même signal
       qu'un « quitter » du système, pas un SIGKILL : l'app garde la main sur sa
       propre fermeture. `-x` exige le nom EXACT, sans quoi « Notes » emporterait
       tout ce qui contient « notes ». */
    let killed = Command::new("pkill")
      .args(["-x", "-TERM", name])
      .status()
      .map_err(|e| e.to_string())?;
    if killed.success() {
      return Ok(true);
    }

    let err = String::from_utf8_lossy(&out.stderr);
    Err(if err.contains("-1743") {
      "automation-denied".into()
    } else if err.trim().is_empty() {
      "quit-refused".into()
    } else {
      err.trim().to_string()
    })
  }
}

#[cfg(target_os = "windows")]
mod imp_close {
  use std::process::Command;

  pub fn close(name: &str) -> Result<bool, String> {
    /* `taskkill` SANS `/F` : la demande de fermeture passe par la file de
       messages de la fenêtre, exactement comme un clic sur la croix. Avec `/F`,
       le processus est terminé sur place et tout ce qui n'était pas enregistré
       part avec lui. */
    let image = if name.to_lowercase().ends_with(".exe") {
      name.to_string()
    } else {
      format!("{name}.exe")
    };
    let out = Command::new("taskkill")
      .args(["/IM", &image])
      .output()
      .map_err(|e| e.to_string())?;
    if out.status.success() {
      return Ok(true);
    }
    let err = String::from_utf8_lossy(&out.stderr);
    Err(if err.trim().is_empty() { "close-refused".into() } else { err.trim().to_string() })
  }
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
mod imp_close {
  pub fn close(_name: &str) -> Result<bool, String> {
    Ok(false)
  }
}
