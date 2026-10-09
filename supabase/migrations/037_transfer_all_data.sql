-- Migration 037 : transfert de TOUTES les données d'un compte tao vers un autre.
--
-- Pendant de merge_trading_data (036), qu'elle appelle d'abord : banques,
-- habitudes, objectifs, agenda, sport, patrimoine, drive, IA… changent de
-- propriétaire au lieu d'être exportés puis réimportés. Un export/import ne
-- convient pas ici : les lignes gardent leur id, l'id existe encore chez la
-- source, l'import heurte la clé primaire et n'écrit rien ; les renuméroter
-- casserait toutes les références (trades → comptes, JSON → ids de trades).
-- Changer user_id ne touche à aucun id, donc à aucune référence.
--
-- Reste sur la source : le profil (nom, avatar) et la connexion Google, qui
-- appartiennent à l'identité et pas aux données.

create or replace function public.transfer_all_data(p_source uuid, p_target uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  moved jsonb;
  n int;
  t text;
  cond text;
  sets text;
  plain text[] := array['ai_conversations', 'ai_messages', 'agent_notifications', 'trade_embeddings'];
  keyed jsonb := '{
    "bank_connections":  ["session_id"],
    "bank_transactions": ["account_uid", "tx_key"],
    "ai_patterns":       ["pattern_type", "pattern_key"],
    "ai_reports":        ["report_type", "period_start"]
  }'::jsonb;
  -- Une ligne par utilisateur : déplacée si la cible n'en a pas, sinon ses
  -- trous sont comblés par la source.
  single text[] := array['user_preferences', 'user_settings', 'ai_user_memory'];
begin
  moved := public.merge_trading_data(p_source, p_target);

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
      execute format('delete from public.%I where user_id = $1', t) using p_source;
    end if;
  end loop;

  foreach t in array single loop
    if to_regclass('public.' || t) is not null then
      execute format('select count(*) from public.%I where user_id = $1', t) into n using p_target;
      if n = 0 then
        execute format('update public.%I set user_id = $1 where user_id = $2', t) using p_target, p_source;
      else
        select string_agg(format('%1$I = coalesce(d.%1$I, s.%1$I)', column_name), ', ')
          into sets
          from information_schema.columns
          where table_schema = 'public' and table_name = t
            and column_name not in ('id', 'user_id', 'created_at', 'updated_at');
        if sets is not null then
          execute format(
            'update public.%1$I d set %2$s from public.%1$I s where d.user_id = $1 and s.user_id = $2',
            t, sets) using p_target, p_source;
        end if;
        execute format('delete from public.%I where user_id = $1', t) using p_source;
      end if;
    end if;
  end loop;

  -- Drive : les fichiers du bucket sont rangés par projet, pas par
  -- utilisateur. Passer la propriété et l'adhésion suffit à les rendre
  -- lisibles depuis la cible, sans déplacer un seul fichier.
  if to_regclass('public.drive_projects') is not null then
    update drive_projects set owner_id = p_target where owner_id = p_source;
    get diagnostics n = row_count;
    moved := moved || jsonb_build_object('drive_projects', n);
    update drive_project_members m set user_id = p_target
      where m.user_id = p_source
        and not exists (select 1 from drive_project_members x where x.project_id = m.project_id and x.user_id = p_target);
    delete from drive_project_members where user_id = p_source;
    -- La cible était peut-être simple invitée d'un projet qui est désormais à elle.
    update drive_project_members m set role = 'owner'
      from drive_projects p
      where p.id = m.project_id and p.owner_id = p_target and m.user_id = p_target;
    update drive_files set created_by = p_target where created_by = p_source;
    update drive_invites set created_by = p_target where created_by = p_source;
  end if;

  -- Magasins JSON (habitudes, objectifs, agenda, sport, patrimoine…). Les
  -- enregistrements d'Éloquence pointent vers `<user_id>/…` du bucket audio :
  -- la route a déjà recopié les fichiers sous le dossier de la cible, on
  -- réécrit les chemins pour qu'ils y mènent.
  if to_regclass('public.user_productivity') is not null then
    insert into user_productivity (user_id, key, value, updated_at)
      select p_target, s.key,
             case when s.key = 'eloquence'
                  then replace(s.value::text, '"' || p_source::text || '/', '"' || p_target::text || '/')::jsonb
                  else s.value end,
             now()
      from user_productivity s
      where s.user_id = p_source
    on conflict (user_id, key) do update
      set value = public._merge_jsonb_keep_first(user_productivity.value, excluded.value),
          updated_at = now();
    get diagnostics n = row_count;
    moved := moved || jsonb_build_object('user_productivity', n);
    delete from user_productivity where user_id = p_source;
  end if;

  return moved;
end;
$$;

revoke all on function public.transfer_all_data(uuid, uuid) from public, anon, authenticated;
grant execute on function public.transfer_all_data(uuid, uuid) to service_role;
