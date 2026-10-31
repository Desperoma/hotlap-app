import { useEffect, useState } from 'react';

import { driverLevels } from './api';
import { levelFromXp, type LevelInfo } from './levels';

/** Niveau et rang de plusieurs conducteurs (badges), rechargé quand la liste change. */
export function useLevels(userIds: string[]): Map<string, LevelInfo> {
  const key = [...new Set(userIds)].sort().join(',');
  const [levels, setLevels] = useState<Map<string, LevelInfo>>(new Map());
  useEffect(() => {
    if (!key) return;
    let live = true;
    driverLevels(key.split(',')).then((m) => {
      if (!live) return;
      setLevels(new Map([...m].map(([id, xp]) => [id, levelFromXp(xp)])));
    });
    return () => { live = false; };
  }, [key]);
  return levels;
}
