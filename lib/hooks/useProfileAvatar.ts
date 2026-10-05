import { useCloudState } from "@/lib/hooks/useCloudState";
import { AVATAR_CLOUD_KEY, AVATAR_STORAGE_KEY, DEFAULT_AVATAR, normalizeAvatar, type AvatarStore } from "@/lib/profileAvatar";

/**
 * L'avatar du compte. Monté à la fois par la coquille (barre latérale) et par
 * les réglages : `useCloudState` relaie entre les deux, un changement fait dans
 * le profil se voit donc tout de suite dans la barre.
 */
export function useProfileAvatar(): [AvatarStore, (updater: (prev: AvatarStore) => AvatarStore) => void] {
  const [raw, setRaw] = useCloudState<AvatarStore>(AVATAR_STORAGE_KEY, AVATAR_CLOUD_KEY, DEFAULT_AVATAR);
  const store = normalizeAvatar(raw);
  const update = (updater: (prev: AvatarStore) => AvatarStore) => setRaw((prev) => updater(normalizeAvatar(prev)));
  return [store, update];
}
