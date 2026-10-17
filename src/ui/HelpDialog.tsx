import { useEffect } from 'react';
import { X } from 'lucide-react';
import { useUi } from '../store/useUi';
import { IconButton } from './controls';

const SECTIONS: Array<{ title: string; rows: Array<[string, string]> }> = [
  {
    title: 'Мышь',
    rows: [
      ['Тянуть по пустому месту', 'Вращение сцены'],
      ['Тянуть по грузу', 'Перемещение груза вместе со стопкой на нём'],
      ['Alt + тянуть по грузу', 'Взять только этот груз'],
      ['Shift при перетаскивании', 'Временно без магнитов'],
      ['Правая кнопка / колесо', 'Панорама / масштаб'],
      ['Двойной клик по грузу', 'Приблизить камеру к грузу'],
      ['Стрелки на гранях выбранного груза', 'Изменить размер (тянуть)'],
    ],
  },
  {
    title: 'Планшет',
    rows: [
      ['Один палец по фону', 'Вращение сцены'],
      ['Палец на грузе', 'Перемещение груза'],
      ['Два пальца', 'Масштаб и панорама'],
      ['Двойной тап по грузу', 'Приблизить камеру'],
    ],
  },
  {
    title: 'Клавиатура (выбран груз)',
    rows: [
      ['R', 'Повернуть на 90°'],
      ['Del / Backspace', 'Удалить'],
      ['Ctrl + D', 'Дублировать'],
      ['Стрелки (Shift)', 'Сдвиг на 1 см (10 см) относительно камеры'],
      ['F', 'Показать груз'],
      ['Ctrl + Z / Ctrl + Y', 'Отменить / повторить'],
      ['Esc', 'Отменить перетаскивание или снять выделение'],
    ],
  },
];

export function HelpDialog() {
  const open = useUi((s) => s.helpOpen);
  const setOpen = useUi((s) => s.setHelpOpen);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, setOpen]);

  if (!open) return null;
  return (
    <div className="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && setOpen(false)}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="help-title">
        <header className="modal-head">
          <h2 id="help-title">Управление</h2>
          <IconButton title="Закрыть" onClick={() => setOpen(false)}>
            <X size={18} />
          </IconButton>
        </header>
        <p className="modal-lead">
          Режимы не переключаются: нажали на пустое место — вращаете сцену, нажали на груз — двигаете груз. Грузы не висят
          в воздухе и не пересекаются: при перетаскивании они встают на пол или сверху на другие грузы и притягиваются к
          граням соседей и стенкам кузова.
        </p>
        <div className="help-grid">
          {SECTIONS.map((s) => (
            <section key={s.title}>
              <h3>{s.title}</h3>
              <dl>
                {s.rows.map(([k, v]) => (
                  <div key={k} className="help-row">
                    <dt>{k}</dt>
                    <dd>{v}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
