-- Migration 032 : marque d'une prop firm, indépendante de son nom
--
-- Avant, le logo d'une firme était résolu sur son NOM : renommer « Topstep »
-- en « Topstep #2 » ou « Ma firme » faisait perdre le rattachement à la marque,
-- donc le logo. La marque choisie (le preset : topstep, apex, ftmo…) est
-- désormais mémorisée à part, et le nom redevient un libellé libre.
--
-- Colonne facultative : le code fonctionne sans elle (il retombe alors sur la
-- résolution par nom, comportement d'avant), cette migration ne fait que rendre
-- le rattachement persistant et synchronisé entre appareils.

ALTER TABLE prop_firms
  ADD COLUMN IF NOT EXISTS brand TEXT;

COMMENT ON COLUMN prop_firms.brand IS
  'Identifiant de la maison de prop trading (PLATFORMS.id : topstep, apex, ftmo…). Porte le logo et survit à un renommage. NULL = firme sans marque connue.';
