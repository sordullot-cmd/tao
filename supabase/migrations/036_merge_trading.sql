-- Migration 036 : fusion de la partie trading d'un compte tao dans un autre.
--
-- Appelée par /api/user/merge-trading avec la clé service, après que l'appelant
-- a prouvé posséder les deux comptes (session sur la cible, code de transfert
-- signé émis depuis la source). Une fonction plutôt qu'une suite d'UPDATE
-- depuis la route : PostgREST n'offre pas de transaction, et une fusion
-- interrompue à mi-chemin laisserait des trades d'un côté et leurs comptes
-- de l'autre.
--
-- Seul le trading bouge. Agenda, sport, patrimoine, drive… restent sur la
-- source. Les tables absentes d'une base (migrations jamais appliquées) sont
-- sautées plutôt que de faire échouer l'ensemble.

-- Union de deux JSON où `a` (la cible) l'emporte : tableaux réunis sans
-- doublon dans l'ordre d'origine, objets fusionnés clé par clé à toute
-- profondeur, valeur simple de la cible conservée. Récursif parce que les
-- magasins sont emboîtés (`{ sessions: [...] }`) : une fusion au premier
-- niveau seulement garderait le tableau de la cible et jetterait l'autre.
create or replace function public._merge_jsonb_keep_first(a jsonb, b jsonb)
returns jsonb
language plpgsql
immutable
as $$
begin
  if a is null or a = 'null'::jsonb then return b; end if;
  if b is null or b = 'null'::jsonb then return a; end if;
  if jsonb_typeof(a) = 'array' and jsonb_typeof(b) = 'array' then
    return coalesce((
      select jsonb_agg(e order by i)
      from (
        select e, min(i) as i
        from jsonb_array_elements(a || b) with ordinality as u(e, i)
        group by e
      ) d
    ), '[]'::jsonb);
  end if;
  if jsonb_typeof(a) = 'object' and jsonb_typeof(b) = 'object' then
    return coalesce((
      select jsonb_object_agg(k, public._merge_jsonb_keep_first(a -> k, b -> k))
      from (select jsonb_object_keys(a) as k union select jsonb_object_keys(b)) ks
    ), '{}'::jsonb);
  end if;
  return a;
end;
$$;

create or replace function public.merge_trading_data(p_source uuid, p_target uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  moved jsonb := '{}'::jsonb;
  n int;
  t text;
  col record;
  -- Tables sans clé unique par utilisateur : on change le propriétaire, point.
  plain text[] := array[
    'trading_accounts', 'apex_trades', 'trades', 'strategies',
    'trading_journal', 'trading_rules', 'trade_emotion_tags', 'trade_error_tags'
  ];
  -- Tables à clé unique (user_id, …) : en cas de doublon la cible l'emporte.
  -- Les colonnes listées complètent user_id dans la contrainte.
  keyed jsonb := '{
    "trade_details":             ["trade_id"],
    "trade_strategies":          ["trade_id", "strategy_id"],
    "daily_discipline_tracking": ["date", "rule_id"],
    "custom_discipline_rules":   ["rule_id"]
  }'::jsonb;
  cond text;
  -- Clés de user_productivity qui relèvent du trading. Les préférences
  -- d'affichage (tri, colonnes, panneaux ouverts) restent à chacun.
  cloud_keys text[] := array[
    'account_plans', 'accounts_order', 'prop_firm_accounts', 'account_contracts',
    'backtest_journal',
    'discipline_active_days', 'discipline_rules_config',
    'scaling_sim', 'scaling_step',
    'trades_checked_rules', 'trades_checklist', 'trades_entry_tags'
  ];
begin
  if p_source is null or p_target is null or p_source = p_target then
    raise exception 'merge_trading_data: comptes source et cible invalides';
  end if;

  -- Firmes d'abord : (user_id, lower(name)) est unique. Une firme homonyme
  -- côté cible absorbe les comptes de la source au lieu de faire échouer
  -- le déplacement.
  if to_regclass('public.prop_firms') is not null then
    update trading_accounts ta set firm_id = tf.id
      from prop_firms sf
      join prop_firms tf on tf.user_id = p_target and lower(tf.name) = lower(sf.name)
      where sf.user_id = p_source and ta.firm_id = sf.id;
    delete from prop_firms sf
      where sf.user_id = p_source
        and exists (select 1 from prop_firms tf where tf.user_id = p_target and lower(tf.name) = lower(sf.name));
    update prop_firms set user_id = p_target where user_id = p_source;
    get diagnostics n = row_count;
    moved := moved || jsonb_build_object('prop_firms', n);
  end if;

  foreach t in array plain loop
    if to_regclass('public.' || t) is not null then
      execute format('update public.%I set user_id = $1 where user_id = $2', t) using p_target, p_source;
      get diagnostics n = row_count;
      moved := moved || jsonb_build_object(t, n);
    end if;
  end loop;

  for t in select jsonb_object_keys(keyed) loop
    if to_regclass('public.' || t) is not null then
      select string_agg(format('d.%1$I = s.%1$I', c), ' and ')
        into cond
        from jsonb_array_elements_text(keyed -> t) as c;
      execute format(
        'update public.%1$I s set user_id = $1 where s.user_id = $2
           and not exists (select 1 from public.%1$I d where d.user_id = $1 and %2$s)',
        t, cond) using p_target, p_source;
      get diagnostics n = row_count;
      moved := moved || jsonb_build_object(t, n);
      -- Ce qui reste est en doublon d'une ligne de la cible : rien à garder.
      execute format('delete from public.%I where user_id = $1', t) using p_source;
    end if;
  end loop;

  -- Notes de session : une par jour. Deux notes le même jour sont mises bout
  -- à bout plutôt que l'une écrase l'autre — c'est du texte écrit à la main.
  if to_regclass('public.daily_session_notes') is not null then
    update daily_session_notes d
      set notes = concat_ws(E'\n\n', nullif(d.notes, ''), nullif(s.notes, '')),
          updated_at = now()
      from daily_session_notes s
      where s.user_id = p_source and d.user_id = p_target and d.date = s.date;
    delete from daily_session_notes s
      where s.user_id = p_source
        and exists (select 1 from daily_session_notes d where d.user_id = p_target and d.date = s.date);
    update daily_session_notes set user_id = p_target where user_id = p_source;
    get diagnostics n = row_count;
    moved := moved || jsonb_build_object('daily_session_notes', n);
  end if;

  -- Listes de discipline et courtiers favoris : copiées, pas déplacées. La
  -- ligne mêle des réglages qui ne sont pas du trading (fuseau, devise) ;
  -- on réunit les colonnes de trading présentes dans CETTE base.
  if to_regclass('public.user_preferences') is not null
     and exists (select 1 from user_preferences where user_id = p_source) then
    insert into user_preferences (user_id) values (p_target) on conflict (user_id) do nothing;
    for col in
      select column_name, data_type from information_schema.columns
      where table_schema = 'public' and table_name = 'user_preferences'
        and column_name in ('bias_items', 'error_items', 'favorite_brokers', 'personal_rules', 'compliance_rules')
    loop
      if col.data_type = 'ARRAY' then
        execute format(
          'update public.user_preferences d set %1$I = array(
             select x from unnest(coalesce(d.%1$I, ''{}'') || coalesce(s.%1$I, ''{}'')) with ordinality as u(x, i)
             group by x order by min(i))
           from public.user_preferences s
           where d.user_id = $1 and s.user_id = $2', col.column_name) using p_target, p_source;
      else
        execute format(
          'update public.user_preferences d set %1$I = public._merge_jsonb_keep_first(d.%1$I::jsonb, s.%1$I::jsonb)
           from public.user_preferences s
           where d.user_id = $1 and s.user_id = $2', col.column_name) using p_target, p_source;
      end if;
    end loop;
  end if;

  if to_regclass('public.user_productivity') is not null then
    insert into user_productivity (user_id, key, value, updated_at)
      select p_target, s.key, s.value, now()
      from user_productivity s
      where s.user_id = p_source and s.key = any(cloud_keys)
    on conflict (user_id, key) do update
      set value = public._merge_jsonb_keep_first(user_productivity.value, excluded.value),
          updated_at = now();
  end if;

  return moved;
end;
$$;

-- Réservée à la clé service : sans ça n'importe quel utilisateur connecté
-- pourrait aspirer le trading d'un autre en passant son identifiant.
revoke all on function public.merge_trading_data(uuid, uuid) from public, anon, authenticated;
grant execute on function public.merge_trading_data(uuid, uuid) to service_role;
