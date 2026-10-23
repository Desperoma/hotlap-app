/** 15 couleurs de carrosserie + « Autre » (affichée en gris pour l'instant). */
export const CAR_COLORS = [
  { value: 'black', label: 'Black', hex: '#111111' },
  { value: 'white', label: 'White', hex: '#F2F2F2' },
  { value: 'silver', label: 'Silver', hex: '#B9BCC0' },
  { value: 'grey', label: 'Grey', hex: '#6E7175' },
  { value: 'red', label: 'Red', hex: '#C4141B' },
  { value: 'burgundy', label: 'Burgundy', hex: '#7A1320' },
  { value: 'orange', label: 'Orange', hex: '#EE6A14' },
  { value: 'yellow', label: 'Yellow', hex: '#EBC21A' },
  { value: 'green', label: 'Green', hex: '#1F7A45' },
  { value: 'blue', label: 'Blue', hex: '#1E5BD6' },
  { value: 'navy', label: 'Navy', hex: '#16264F' },
  { value: 'purple', label: 'Purple', hex: '#5E2A93' },
  { value: 'brown', label: 'Brown', hex: '#6B4428' },
  { value: 'beige', label: 'Beige', hex: '#CDB892' },
  { value: 'gold', label: 'Gold', hex: '#B8933F' },
  { value: 'other', label: 'Other', hex: '#8A8D91' },
] as const;

export type CarColor = (typeof CAR_COLORS)[number]['value'];

export const carColorHex = (c: string | null | undefined) =>
  CAR_COLORS.find((x) => x.value === c)?.hex ?? null;
