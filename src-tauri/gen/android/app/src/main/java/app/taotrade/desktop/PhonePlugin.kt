package app.taotrade.desktop

import android.app.AppOpsManager
import android.app.usage.UsageEvents
import android.app.usage.UsageStatsManager
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.PowerManager
import android.os.Process
import android.provider.Settings
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSArray
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin

/**
 * Suivi d'activité du téléphone.
 *
 * Le poste de travail et le téléphone se mesurent de deux façons opposées, et
 * c'est ce qui commande tout ce fichier.
 *
 * Sur un poste, l'app est allumée et ÉCHANTILLONNE : elle demande toutes les
 * quelques secondes quelle fenêtre est devant (cf. src/tracker.rs). Sur Android
 * ce serait inutilisable — dès que tao passe en arrière-plan, le système gèle
 * son WebView, donc la boucle s'arrête précisément quand il y aurait quelque
 * chose à voir. Une app qui ne mesurerait que le temps où on la regarde ne
 * mesurerait rien.
 *
 * Android tient heureusement le journal à notre place : `UsageStatsManager`
 * garde la suite des passages au premier plan. On ne mesure donc pas, on
 * RECONSTRUIT — à l'ouverture de la page, on relit les événements du système et
 * on en déduit la journée. Rien à faire tourner en fond, rien à consommer, et
 * aucun trou : le temps passé pendant que tao était fermé est là aussi.
 *
 * Ce qu'Android ne donne pas, et qu'aucune permission n'ouvre : le TITRE de la
 * fenêtre. On sait « Chrome pendant 2 h 10 », jamais quel site. Le temps par
 * site, sur téléphone, demanderait un service d'accessibilité — un tout autre
 * niveau d'intrusion, et un refus quasi certain sur le Play Store. La page
 * Activité doit donc dire « par application » et ne rien promettre de plus.
 */
@InvokeArg
internal class RangeArgs {
  var from: Long = 0
  var to: Long = 0
}

@TauriPlugin
class PhonePlugin(private val activity: android.app.Activity) : Plugin(activity) {

  private val usage: UsageStatsManager?
    get() = activity.getSystemService(Context.USAGE_STATS_SERVICE) as? UsageStatsManager

  /**
   * L'autorisation « accès à l'utilisation » est-elle accordée ?
   *
   * Elle ne se demande pas par une boîte de dialogue : c'est une permission
   * spéciale, que l'utilisateur accorde écran par écran dans les Réglages. On
   * la LIT donc, et l'interface renvoie vers le bon écran (`openUsageSettings`)
   * au lieu de faire semblant de la demander.
   */
  /* Les deux formes de la vérification sont marquées obsolètes par le SDK 36,
     sans remplacement : lire un app-op reste la seule façon de savoir si une
     permission spéciale a été accordée. */
  @Suppress("DEPRECATION")
  private fun granted(): Boolean {
    val ops = activity.getSystemService(Context.APP_OPS_SERVICE) as? AppOpsManager ?: return false
    val mode = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      ops.unsafeCheckOpNoThrow(
        AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), activity.packageName
      )
    } else {
      @Suppress("DEPRECATION")
      ops.checkOpNoThrow(
        AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), activity.packageName
      )
    }
    return mode == AppOpsManager.MODE_ALLOWED
  }

  /** Nom lisible d'un paquet — « com.google.android.youtube » → « YouTube ». */
  private fun labelOf(pkg: String): String {
    return try {
      val pm = activity.packageManager
      pm.getApplicationLabel(pm.getApplicationInfo(pkg, 0)).toString()
    } catch (_: Exception) {
      /* Paquet désinstallé depuis, ou masqué par les règles de visibilité
         d'Android 11 : le nom technique vaut mieux que rien — il reste
         reconnaissable et surtout classable par une règle. */
      pkg
    }
  }

  @Command
  fun usageAccess(invoke: Invoke) {
    val res = JSObject()
    res.put("granted", granted())
    invoke.resolve(res)
  }

  @Command
  fun openUsageSettings(invoke: Invoke) {
    val intent = Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS)
    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    activity.startActivity(intent)
    invoke.resolve()
  }

  /**
   * L'application au premier plan, à l'instant.
   *
   * Sert la ligne « en direct » de la page Activité, pas la mesure : celle-ci
   * vient de `segments`. On regarde les dix dernières minutes d'événements et
   * on garde le dernier passage au premier plan — le système ne donne aucun
   * appel du genre « quelle app est devant », c'est le journal qui le dit.
   *
   * `idleSeconds` n'a pas le même sens que sur un poste : il n'y a ni clavier ni
   * souris à surveiller. On rapporte donc l'état de l'ÉCRAN — éteint, c'est le
   * seul « absent » que le téléphone connaisse.
   */
  @Command
  fun snapshot(invoke: Invoke) {
    val res = JSObject()
    val ok = granted()
    res.put("granted", ok)

    val power = activity.getSystemService(Context.POWER_SERVICE) as? PowerManager
    val screenOn = power?.isInteractive ?: true
    res.put("screenOn", screenOn)

    var pkg = ""
    if (ok) {
      val now = System.currentTimeMillis()
      val events = usage?.queryEvents(now - 10 * 60_000L, now)
      val e = UsageEvents.Event()
      while (events != null && events.hasNextEvent()) {
        events.getNextEvent(e)
        if (e.eventType == UsageEvents.Event.ACTIVITY_RESUMED) pkg = e.packageName
      }
    }
    res.put("packageName", pkg)
    res.put("app", if (pkg.isEmpty()) "" else labelOf(pkg))
    invoke.resolve(res)
  }

  /**
   * La journée reconstruite : un segment par passage au premier plan.
   *
   * On apparie les événements « au premier plan » / « en arrière-plan ». Deux
   * cas tordus, et ils arrivent tous les jours :
   *
   *  • une app passée devant sans jamais repasser derrière dans la fenêtre
   *    demandée — c'est celle qui est ouverte MAINTENANT. Son segment se ferme
   *    à la fin de la fenêtre, pas à l'infini.
   *  • une app qui passe derrière sans qu'on ait vu son entrée (la fenêtre
   *    commence au milieu de son usage). L'événement est ignoré : inventer un
   *    début reviendrait à compter du temps qu'on n'a pas vu.
   *
   * Les segments de moins d'une seconde sont écartés : une bascule d'écran en
   * traverse trois ou quatre, et elles ne disent rien de la journée.
   */
  @Command
  fun segments(invoke: Invoke) {
    val args = invoke.parseArgs(RangeArgs::class.java)
    val res = JSObject()
    val ok = granted()
    res.put("granted", ok)

    val out = JSArray()
    val from = args.from
    val to = if (args.to > 0) args.to else System.currentTimeMillis()

    if (ok && to > from) {
      val events = usage?.queryEvents(from, to)
      val e = UsageEvents.Event()
      // Début du passage courant, par paquet : plusieurs apps peuvent avoir une
      // entrée ouverte, seule la dernière est réellement devant.
      val open = HashMap<String, Long>()
      while (events != null && events.hasNextEvent()) {
        events.getNextEvent(e)
        when (e.eventType) {
          UsageEvents.Event.ACTIVITY_RESUMED -> open[e.packageName] = e.timeStamp
          UsageEvents.Event.ACTIVITY_PAUSED -> {
            val start = open.remove(e.packageName) ?: continue
            emit(out, e.packageName, start, e.timeStamp)
          }
        }
      }
      // Ce qui est encore devant à la fin de la fenêtre.
      for ((p, start) in open) emit(out, p, start, to)
    }

    res.put("segments", out)
    invoke.resolve(res)
  }

  private fun emit(out: JSArray, pkg: String, start: Long, end: Long) {
    if (end - start < 1_000L) return
    val seg = JSObject()
    seg.put("packageName", pkg)
    seg.put("app", labelOf(pkg))
    seg.put("s", start)
    seg.put("e", end)
    out.put(seg)
  }
}
