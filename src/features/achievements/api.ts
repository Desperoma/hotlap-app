import { useEffect, useState } from 'react';

import { isSupabaseConfigured, supabase } from '@/lib/supabase';

/** Succès du conducteur connecté avec sa progression (migration 0034). */
export type Achievement = {
  key: string; tier: number; xp: number; metric: string; target: number; lowerIsBetter: boolean;
  value: number | null; completed: boolean; collected: boolean;
};

// Nombre de succès à collecter : partagé entre le garage et l'écran des succès.
let toCollect = 0;
const listeners = new Set<(n: number) => void>();
const publish = (n: number) => { toCollect = n; listeners.forEach((l) => l(n)); };

export function useToCollect() {
  const [n, setN] = useState(toCollect);
  useEffect(() => { listeners.add(setN); return () => { listeners.delete(setN); }; }, []);
  return n;
}

/** Enregistre les succès nouvellement réalisés (et leurs notifications), renvoie le nombre à collecter. */
export async function syncAchievements(): Promise<number> {
  if (!isSupabaseConfigured) return 0;
  const { data, error } = await supabase.rpc('sync_achievements');
  if (error) return toCollect; // migration 0034 pas encore passée
  publish((data as number | null) ?? 0);
  return toCollect;
}

export async function myAchievements(): Promise<Achievement[] | null> {
  if (!isSupabaseConfigured) return [];
  const { data, error } = await supabase.rpc('my_achievements');
  if (error) return null;
  const list = ((data ?? []) as {
    key: string; tier: number; xp: number; metric: string; target: number | string; lower_is_better: boolean;
    value: number | string | null; completed_at: string | null; collected_at: string | null;
  }[]).map((r) => ({
    key: r.key, tier: r.tier, xp: r.xp, metric: r.metric, target: Number(r.target), lowerIsBetter: r.lower_is_better,
    value: r.value == null ? null : Number(r.value), completed: !!r.completed_at, collected: !!r.collected_at,
  }));
  publish(list.filter((a) => a.completed && !a.collected).length);
  return list;
}

/** Collecte un succès réalisé ; renvoie l'XP gagnée. */
export async function collectAchievement(key: string): Promise<number> {
  const { data, error } = await supabase.rpc('collect_achievement', { p_key: key });
  if (error) throw new Error(error.message);
  publish(Math.max(0, toCollect - 1));
  return (data as number | null) ?? 0;
}
