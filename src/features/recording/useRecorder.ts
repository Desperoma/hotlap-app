import { useEffect, useState } from 'react';

import { computeStats } from './geo';
import { recorder, type RecorderState } from './recorder';

/** État live de l'enregistrement + stats recalculées chaque seconde. */
export function useRecorder() {
  const [state, setState] = useState<RecorderState>(recorder.getState());
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const unsub = recorder.subscribe(setState);
    return () => {
      unsub();
    };
  }, []);

  useEffect(() => {
    if (state.status !== 'recording') return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [state.status]);

  const stats = state.startedAt ? computeStats(state.points, state.startedAt, now) : null;
  return { ...state, stats, recorder };
}
