import type { CargoBody, Dims } from './types';

export type BodyTemplate = Omit<CargoBody, 'id'>;

export interface VehiclePreset {
  id: string;
  name: string;
  bodies: BodyTemplate[];
}

export const VEHICLE_PRESETS: VehiclePreset[] = [
  {
    id: 'tent',
    name: 'Еврофура 13,6 м (тент)',
    bodies: [{ kind: 'semi', name: 'Полуприцеп', dims: { l: 1360, w: 245, h: 270 } }],
  },
  {
    id: 'mega',
    name: 'Мега-трейлер 13,6 м',
    bodies: [{ kind: 'semi', name: 'Полуприцеп', dims: { l: 1360, w: 248, h: 300 } }],
  },
  {
    id: 'reefer',
    name: 'Рефрижератор 13,4 м',
    bodies: [{ kind: 'semi', name: 'Рефрижератор', dims: { l: 1340, w: 246, h: 260 } }],
  },
  {
    id: 'jumbo',
    name: 'Сцепка 7,7 + 8,2 м',
    bodies: [
      { kind: 'truck', name: 'Грузовик', dims: { l: 770, w: 245, h: 300 } },
      { kind: 'trailer', name: 'Прицеп', dims: { l: 820, w: 245, h: 300 } },
    ],
  },
  {
    id: 'c40',
    name: "Контейнер 40' HC",
    bodies: [{ kind: 'semi', name: "Контейнер 40'", dims: { l: 1203, w: 235, h: 269 } }],
  },
  {
    id: 'c20',
    name: "Контейнер 20'",
    bodies: [{ kind: 'semi', name: "Контейнер 20'", dims: { l: 590, w: 235, h: 239 } }],
  },
  {
    id: 'truck10',
    name: 'Грузовик 10 т',
    bodies: [{ kind: 'truck', name: 'Кузов', dims: { l: 800, w: 245, h: 260 } }],
  },
  {
    id: 'van',
    name: 'Фургон 3 т',
    bodies: [{ kind: 'truck', name: 'Фургон', dims: { l: 420, w: 205, h: 200 } }],
  },
];

export const DEFAULT_TRAILER: BodyTemplate = {
  kind: 'trailer',
  name: 'Прицеп',
  dims: { l: 820, w: 245, h: 270 },
};

export const MAX_BODIES = 3;

export const BODY_LIMITS: Record<keyof Dims, [number, number]> = {
  l: [100, 2500],
  w: [100, 400],
  h: [100, 450],
};

export interface CargoPreset {
  name: string;
  dims: Dims;
}

export const CARGO_PRESETS: CargoPreset[] = [
  { name: 'Европаллета', dims: { l: 120, w: 80, h: 150 } },
  { name: 'Финпаллета', dims: { l: 120, w: 100, h: 150 } },
  { name: 'Полупаллета', dims: { l: 80, w: 60, h: 100 } },
  { name: 'IBC-куб', dims: { l: 120, w: 100, h: 116 } },
  { name: 'Коробка', dims: { l: 60, w: 40, h: 40 } },
];

export const CARGO_COLORS = [
  '#f0a35e',
  '#5b8def',
  '#4fbf8b',
  '#e7738a',
  '#9b87f5',
  '#e2bd3f',
  '#45b8cf',
  '#c98a5b',
  '#86b33f',
  '#f07f5c',
];
