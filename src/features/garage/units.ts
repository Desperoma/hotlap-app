/** Chevaux (DIN, ch) par kW */
export const HP_PER_KW = 1.35962;
export const kwToHp = (kw: number) => Math.round(kw * HP_PER_KW);
