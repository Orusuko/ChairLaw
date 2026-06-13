export const AREAS = [
  'COMANDEROS',
  'TAQUILLA',
  'CORREDORES',
  'COCINA',
  'BAÑOS',
  'LIMPIEZA PROFUNDA',
  'SALAS',
  'DULCERIA',
  'APOYO',
] as const;

export type AreaId = (typeof AREAS)[number];

export function normalizeArea(area?: string): string {
  return area?.trim().toUpperCase() || 'SIN ÁREA';
}

export function isValidArea(area?: string): boolean {
  if (!area?.trim()) return false;
  return (AREAS as readonly string[]).includes(normalizeArea(area));
}
