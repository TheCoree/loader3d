import { TriangleAlert } from 'lucide-react';
import { formatMeters, formatPercent, formatVolume } from '../core/units';
import { useStore } from '../store/useStore';
import { cx, useStats } from './hooks';

/** Fill level per body and counts of cargo inside / on the dock / sticking out. */
export function StatsBar() {
  const stats = useStats();
  const total = useStore((s) => s.items.length);

  return (
    <div className="card stats-bar">
      {stats.bodies.map((b) => (
        <div key={b.id} className="stat-body">
          <div className="stat-head">
            <span className="stat-name">{b.name}</span>
            <span className="stat-value">{formatPercent(b.fill)}</span>
          </div>
          <div className="meter" role="meter" aria-valuenow={Math.round(b.fill * 100)} aria-valuemin={0} aria-valuemax={100}>
            <span style={{ width: `${Math.min(100, b.fill * 100)}%` }} />
          </div>
          <div className="stat-sub">
            {formatVolume(b.used)} из {formatVolume(b.capacity)} · LDM {formatMeters(b.ldm)}
          </div>
        </div>
      ))}
      <div className="stat-counts">
        <span className="pill pill--ok">В кузове: {stats.inside}</span>
        <span className="pill">На доке: {stats.dock}</span>
        {stats.overflow > 0 && (
          <span className={cx('pill pill--danger')}>
            <TriangleAlert size={13} /> За габаритами: {stats.overflow}
          </span>
        )}
        <span className="stat-total">
          Всего {total} · {formatVolume(stats.cargoVolume)}
        </span>
      </div>
    </div>
  );
}
