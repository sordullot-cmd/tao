/**
 * Reprise des clés de stockage d'avant le renommage tr4de → tao.
 *
 * Toutes les clés locales s'appelaient `tr4de_*`, `tr4de.*`, `tr4de:*`. Les
 * renommer dans le code sans rien faire d'autre aurait vidé l'app de tout ce
 * qui ne vit qu'en local (fast path des trades, jetons Google, file
 * `<clé>:pending` de `useCloudState` pas encore remontée) — et pire, une clé
 * vide au démarrage serait poussée vers Supabase par-dessus la bonne valeur.
 *
 * D'où un script brut, posé dans le <head> AVANT tout le reste : il doit avoir
 * tourné quand le premier composant lit le storage. Un effet React arriverait
 * trop tard.
 *
 * Déplacement et non copie : le cache des trades peut peser plusieurs Mo, et
 * le doubler suffirait à crever le quota. On retire l'ancienne clé d'abord pour
 * libérer la place, on la remet si l'écriture échoue quand même. Une clé `tao`
 * déjà présente gagne : c'est qu'elle a été écrite après le renommage.
 *
 * Sans drapeau « déjà fait » : une fois les clés déplacées, le balayage ne
 * trouve plus rien, et il coûte moins qu'un drapeau à garder cohérent.
 */
export const LEGACY_PREFIX = "tr4de";
export const STORAGE_PREFIX = "tao";

/** Corps du script, autonome : il part tel quel dans le HTML. */
export const LEGACY_STORAGE_SCRIPT =
  `(function(o,n){[\"localStorage\",\"sessionStorage\"].forEach(function(w){try{var s=window[w],ks=[];`
  + `for(var i=0;i<s.length;i++){var k=s.key(i);if(k&&k.indexOf(o)===0)ks.push(k);}`
  + `ks.forEach(function(k){var v=s.getItem(k),t=n+k.slice(o.length);s.removeItem(k);`
  + `if(s.getItem(t)!==null)return;try{s.setItem(t,v);}catch(e){try{s.setItem(k,v);}catch(e2){}}});`
  + `}catch(e){}});})(${JSON.stringify(LEGACY_PREFIX)},${JSON.stringify(STORAGE_PREFIX)});`;
