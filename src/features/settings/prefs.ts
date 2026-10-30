import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';

/** Réglages d'interface, gardés sur le téléphone (Settings > Interface). */
export type LiveView = 'map' | 'gforce' | 'both';
export type Prefs = { liveView: LiveView; mapType: 'standard' | 'satellite' };
const DEFAULTS: Prefs = { liveView: 'both', mapType: 'standard' };
// Emplacement AsyncStorage (pas un secret)
const SLOT = 'hotlap.prefs.v1';

let cache: Prefs | null = null;
const listeners = new Set<(p: Prefs) => void>();

async function load(): Promise<Prefs> {
  if (cache) return cache;
  try {
    const raw = await AsyncStorage.getItem(SLOT);
    cache = { ...DEFAULTS, ...(raw ? (JSON.parse(raw) as Partial<Prefs>) : {}) };
  } catch {
    cache = { ...DEFAULTS };
  }
  return cache;
}

export async function setPref<K extends keyof Prefs>(key: K, value: Prefs[K]) {
  const next = { ...(await load()), [key]: value };
  cache = next;
  listeners.forEach((l) => l(next));
  try { await AsyncStorage.setItem(SLOT, JSON.stringify(next)); } catch { /* réglage gardé pour la session */ }
}

export function usePrefs(): Prefs {
  const [p, setP] = useState<Prefs>(cache ?? DEFAULTS);
  useEffect(() => {
    let live = true;
    load().then((v) => live && setP(v));
    listeners.add(setP);
    return () => { live = false; listeners.delete(setP); };
  }, []);
  return p;
}
