/*!
Pont vers le suivi d'activité du téléphone.

Le côté Kotlin est dans `gen/android/app/src/main/java/app/taotrade/desktop/
PhonePlugin.kt`, et son en-tête explique le point essentiel : sur Android on ne
mesure pas, on RECONSTRUIT. `UsageStatsManager` tient déjà le journal des
passages au premier plan ; l'app le relit et en déduit la journée. Aucune boucle
en fond, aucun trou pendant que l'app est fermée.

Ce module ne fait que porter quatre appels d'un monde à l'autre. Il existe sur
TOUTES les plateformes, et c'est voulu : le front interroge la même API partout
et reçoit `supported: false` là où il n'y a pas de téléphone à mesurer, plutôt
que de devoir savoir sur quoi il tourne avant d'appeler.
*/

use serde::{Deserialize, Serialize};
use tauri::{
  plugin::{Builder, TauriPlugin},
  Runtime,
};

/* ─── Ce qui traverse ────────────────────────────────────────────────────── */

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct UsageAccess {
  /// Vrai si « accès aux données d'utilisation » est accordé.
  pub granted: bool,
  /// Faux hors Android : il n'y a alors rien à autoriser.
  #[serde(default)]
  pub supported: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct PhoneSnapshot {
  /// Nom lisible de l'app au premier plan, vide si inconnu.
  pub app: String,
  pub package_name: String,
  /// Écran allumé — le seul « présent » qu'un téléphone connaisse.
  pub screen_on: bool,
  pub granted: bool,
  #[serde(default)]
  pub supported: bool,
}

/// Un passage au premier plan, tel que le système l'a enregistré.
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct PhoneSegment {
  pub package_name: String,
  pub app: String,
  /// Début (ms epoch).
  pub s: i64,
  /// Fin (ms epoch).
  pub e: i64,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct PhoneSegments {
  pub segments: Vec<PhoneSegment>,
  pub granted: bool,
  #[serde(default)]
  pub supported: bool,
}

/* La fenêtre demandée à Kotlin. Construite uniquement sur Android — ailleurs,
   `phone_segments` répond sans traverser. */
#[cfg_attr(not(target_os = "android"), allow(dead_code))]
#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
struct Range {
  from: i64,
  to: i64,
}

/* ─── Android ────────────────────────────────────────────────────────────── */

#[cfg(target_os = "android")]
mod imp {
  use super::*;
  use tauri::plugin::PluginHandle;

  /// Poignée vers la classe Kotlin, posée dans l'état de l'app au démarrage.
  pub struct Phone<R: Runtime>(pub PluginHandle<R>);

  pub fn access<R: Runtime>(p: &Phone<R>) -> Result<UsageAccess, String> {
    p.0
      .run_mobile_plugin::<UsageAccess>("usageAccess", ())
      .map(|mut a| { a.supported = true; a })
      .map_err(|e| e.to_string())
  }

  pub fn open_settings<R: Runtime>(p: &Phone<R>) -> Result<(), String> {
    p.0
      .run_mobile_plugin::<()>("openUsageSettings", ())
      .map_err(|e| e.to_string())
  }

  pub fn snapshot<R: Runtime>(p: &Phone<R>) -> Result<PhoneSnapshot, String> {
    p.0
      .run_mobile_plugin::<PhoneSnapshot>("snapshot", ())
      .map(|mut s| { s.supported = true; s })
      .map_err(|e| e.to_string())
  }

  pub fn segments<R: Runtime>(p: &Phone<R>, from: i64, to: i64) -> Result<PhoneSegments, String> {
    p.0
      .run_mobile_plugin::<PhoneSegments>("segments", Range { from, to })
      .map(|mut s| { s.supported = true; s })
      .map_err(|e| e.to_string())
  }
}

/* ─── Commandes ──────────────────────────────────────────────────────────── */

/* Hors Android, les quatre commandes répondent « non pris en charge » au lieu de
   ne pas exister : une commande absente lève côté front, et le front devrait
   alors deviner la plateforme avant d'appeler. */

#[tauri::command]
pub async fn phone_usage_access<R: Runtime>(app: tauri::AppHandle<R>) -> Result<UsageAccess, String> {
  #[cfg(target_os = "android")]
  {
    use tauri::Manager;
    return imp::access(&*app.state::<imp::Phone<R>>());
  }
  #[cfg(not(target_os = "android"))]
  {
    let _ = app;
    Ok(UsageAccess::default())
  }
}

#[tauri::command]
pub async fn phone_open_usage_settings<R: Runtime>(app: tauri::AppHandle<R>) -> Result<(), String> {
  #[cfg(target_os = "android")]
  {
    use tauri::Manager;
    return imp::open_settings(&*app.state::<imp::Phone<R>>());
  }
  #[cfg(not(target_os = "android"))]
  {
    let _ = app;
    Ok(())
  }
}

#[tauri::command]
pub async fn phone_snapshot<R: Runtime>(app: tauri::AppHandle<R>) -> Result<PhoneSnapshot, String> {
  #[cfg(target_os = "android")]
  {
    use tauri::Manager;
    return imp::snapshot(&*app.state::<imp::Phone<R>>());
  }
  #[cfg(not(target_os = "android"))]
  {
    let _ = app;
    Ok(PhoneSnapshot::default())
  }
}

#[tauri::command]
pub async fn phone_segments<R: Runtime>(
  app: tauri::AppHandle<R>,
  from: i64,
  to: i64,
) -> Result<PhoneSegments, String> {
  #[cfg(target_os = "android")]
  {
    use tauri::Manager;
    return imp::segments(&*app.state::<imp::Phone<R>>(), from, to);
  }
  #[cfg(not(target_os = "android"))]
  {
    let _ = (app, from, to);
    Ok(PhoneSegments::default())
  }
}

/// Branche la classe Kotlin. Sur les autres plateformes, le greffon ne fait rien.
pub fn init<R: Runtime>() -> TauriPlugin<R> {
  Builder::new("phone")
    .setup(|_app, _api| {
      #[cfg(target_os = "android")]
      {
        use tauri::Manager;
        let handle = _api.register_android_plugin("app.taotrade.desktop", "PhonePlugin")?;
        _app.manage(imp::Phone(handle));
      }
      Ok(())
    })
    .build()
}
