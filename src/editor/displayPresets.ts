import { DEFAULT_SETTINGS, type Settings } from '@/store/useStore';

/** What a display preset sets; everything else (units, x-ray, wall opacity…) stays as it is. */
export type DisplayKey =
  | 'showBodyWalls'
  | 'showBodyPosts'
  | 'showFloorMarks'
  | 'showChassis'
  | 'showShadows'
  | 'showDimensions'
  | 'showLoadLength'
  | 'showLabels';

export type DisplayValues = Record<DisplayKey, boolean>;

export const DISPLAY_KEYS: readonly DisplayKey[] = [
  'showBodyWalls',
  'showBodyPosts',
  'showFloorMarks',
  'showChassis',
  'showShadows',
  'showDimensions',
  'showLoadLength',
  'showLabels',
];

export interface DisplayPreset {
  id: string;
  name: string;
  hint: string;
  values: DisplayValues;
}

const standard = Object.fromEntries(DISPLAY_KEYS.map((k) => [k, DEFAULT_SETTINGS[k]])) as DisplayValues;
const edgesOnly: DisplayValues = { ...standard, showBodyWalls: false, showBodyPosts: false, showFloorMarks: false };

export const DISPLAY_PRESETS: readonly DisplayPreset[] = [
  { id: 'standard', name: 'Стандарт', hint: 'Всё сразу: стенки, машина, размеры и номера', values: standard },
  {
    id: 'edges',
    name: 'Только рёбра',
    hint: 'Кузов — одни рёбра, без стенок и лишних линий; размеры остаются',
    values: edgesOnly,
  },
  {
    id: 'drawing',
    name: 'Чертёж',
    hint: 'Рёбра кузова, грузы и размеры — без кабины, колёс и теней',
    values: { ...edgesOnly, showChassis: false, showShadows: false },
  },
  {
    id: 'clean',
    name: 'Для клиента',
    hint: 'Чистая картинка: машина и грузы без размеров, линеек и номеров',
    values: { ...standard, showFloorMarks: false, showDimensions: false, showLoadLength: false, showLabels: false },
  },
];

/** The preset the settings match, or null («Свои»). */
export function activePreset(settings: Settings): DisplayPreset | null {
  return DISPLAY_PRESETS.find((p) => DISPLAY_KEYS.every((k) => settings[k] === p.values[k])) ?? null;
}
