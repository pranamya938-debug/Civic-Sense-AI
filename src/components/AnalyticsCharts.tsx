import React from 'react';
import { AnalyticsOverview } from '../shared/types';

interface AnalyticsChartsProps {
  data: AnalyticsOverview;
}

export const AnalyticsCharts: React.FC<AnalyticsChartsProps> = ({ data }) => {
  const maxCat = Math.max(1, ...data.byCategory.map((c) => c.count));
  const maxTrend = Math.max(
    1,
    ...data.dailyTrend.map((d) => Math.max(d.submitted, d.resolved))
  );

  // Build SVG coordinates for the 10-day trend chart
  const width = 560;
  const height = 180;
  const padX = 28;
  const padY = 20;
  const plotW = width - padX * 2;
  const plotH = height - padY * 2;

  const submittedPoints = data.dailyTrend
    .map((d, i) => {
      const x = padX + (i / Math.max(1, data.dailyTrend.length - 1)) * plotW;
      const y = padY + plotH - (d.submitted / maxTrend) * plotH;
      return `${x},${y}`;
    })
    .join(' ');

  const resolvedPoints = data.dailyTrend
    .map((d, i) => {
      const x = padX + (i / Math.max(1, data.dailyTrend.length - 1)) * plotW;
      const y = padY + plotH - (d.resolved / maxTrend) * plotH;
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Category Distribution */}
        <div className="bg-white border border-neutral-200 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-display font-semibold text-[#0B3B2E]">
              Complaints by Category
            </h3>
            <span className="text-xs text-neutral-500">Total vs. Resolved</span>
          </div>
          <div className="space-y-3">
            {data.byCategory.map((item) => {
              const totalPct = Math.round((item.count / maxCat) * 100);
              const resPct = Math.round((item.resolved / maxCat) * 100);
              return (
                <div key={item.category}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-neutral-700 font-medium truncate pr-3">{item.category}</span>
                    <span className="font-mono tabular-nums text-neutral-600 shrink-0">
                      {item.resolved}/{item.count}
                    </span>
                  </div>
                  <div className="h-2.5 bg-neutral-100 rounded-md overflow-hidden relative">
                    <div
                      className="h-full bg-emerald-200 rounded-md transition-all"
                      style={{ width: `${totalPct}%` }}
                    />
                    <div
                      className="h-full bg-[#0B3B2E] rounded-md absolute top-0 left-0 transition-all"
                      style={{ width: `${resPct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Daily Trend Chart */}
        <div className="bg-white border border-neutral-200 rounded-xl p-6 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-display font-semibold text-[#0B3B2E]">
              10-Day Submission & Resolution Trend
            </h3>
            <div className="flex items-center gap-4 text-xs text-neutral-600">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 bg-orange-600 rounded-sm inline-block" />
                Submitted
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 bg-[#059669] rounded-sm inline-block" />
                Resolved
              </span>
            </div>
          </div>

          <div className="w-full overflow-x-auto">
            <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-48">
              {[0, 0.5, 1].map((t) => {
                const y = padY + plotH - t * plotH;
                return (
                  <g key={t}>
                    <line x1={padX} y1={y} x2={width - padX} y2={y} stroke="#E5E7EB" strokeDasharray="3 3" />
                    <text x={4} y={y + 4} fontSize="10" fill="#737373" className="font-mono">
                      {Math.round(t * maxTrend)}
                    </text>
                  </g>
                );
              })}
              <polyline
                fill="none"
                stroke="#EA580C"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                points={submittedPoints}
              />
              <polyline
                fill="none"
                stroke="#059669"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                points={resolvedPoints}
              />
              {data.dailyTrend.map((d, i) => {
                const x = padX + (i / Math.max(1, data.dailyTrend.length - 1)) * plotW;
                const ySub = padY + plotH - (d.submitted / maxTrend) * plotH;
                const yRes = padY + plotH - (d.resolved / maxTrend) * plotH;
                return (
                  <g key={d.date}>
                    <circle cx={x} cy={ySub} r="3.5" fill="#EA580C">
                      <title>{`${d.date}: ${d.submitted} submitted`}</title>
                    </circle>
                    <circle cx={x} cy={yRes} r="3.5" fill="#059669">
                      <title>{`${d.date}: ${d.resolved} resolved`}</title>
                    </circle>
                    {i % 2 === 0 && (
                      <text x={x - 16} y={height - 2} fontSize="9.5" fill="#737373" className="font-mono">
                        {d.date.slice(5)}
                      </text>
                    )}
                  </g>
                );
              })}
            </svg>
          </div>
        </div>
      </div>

      {/* Priority & Status Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white border border-neutral-200 rounded-xl p-6">
          <h3 className="text-base font-display font-semibold text-[#0B3B2E] mb-4">
            Complaints by Priority & Status
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
            {data.byPriority.map((p) => (
              <div key={p.priority} className="border border-neutral-200 rounded-lg p-3">
                <div className="text-xs text-neutral-500">{p.priority}</div>
                <div
                  className={`text-2xl font-display font-bold tabular-nums mt-1 ${
                    p.priority === 'Critical' || p.priority === 'High'
                      ? 'text-orange-700'
                      : 'text-[#0B3B2E]'
                  }`}
                >
                  {p.count}
                </div>
              </div>
            ))}
          </div>
          <div className="space-y-2">
            {data.byStatus.map((s) => (
              <div
                key={s.status}
                className="flex items-center justify-between text-xs py-1.5 border-b border-neutral-100 last:border-b-0"
              >
                <span className="text-neutral-700 font-medium">{s.status}</span>
                <span className="font-mono tabular-nums font-semibold text-[#0B3B2E]">{s.count}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Ward Distribution */}
        <div className="bg-white border border-neutral-200 rounded-xl p-6">
          <h3 className="text-base font-display font-semibold text-[#0B3B2E] mb-4">
            Ward-Level Complaint Distribution
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-neutral-200 text-neutral-500">
                  <th className="py-2 font-medium">Ward</th>
                  <th className="py-2 font-medium text-right">Total</th>
                  <th className="py-2 font-medium text-right">Resolved</th>
                  <th className="py-2 font-medium text-right">Rate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {data.byWard.map((w) => {
                  const rate = w.count > 0 ? Math.round((w.resolved / w.count) * 100) : 0;
                  return (
                    <tr key={w.wardId} className="hover:bg-neutral-50">
                      <td className="py-2.5 text-neutral-800 font-medium">{w.wardName}</td>
                      <td className="py-2.5 text-right font-mono tabular-nums">{w.count}</td>
                      <td className="py-2.5 text-right font-mono tabular-nums text-emerald-700">
                        {w.resolved}
                      </td>
                      <td className="py-2.5 text-right font-mono tabular-nums text-neutral-600">
                        {rate}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Department Performance */}
      <div className="bg-white border border-neutral-200 rounded-xl p-6">
        <h3 className="text-base font-display font-semibold text-[#0B3B2E] mb-4">
          Department Operational Performance
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-neutral-200 text-xs text-neutral-500">
                <th className="py-2.5 font-medium">Municipal Department</th>
                <th className="py-2.5 font-medium text-right">Assigned</th>
                <th className="py-2.5 font-medium text-right">Resolved</th>
                <th className="py-2.5 font-medium text-right">Avg Resolution Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {data.byDepartment.map((d) => (
                <tr key={d.departmentId} className="hover:bg-neutral-50">
                  <td className="py-2.5 font-medium text-[#0B3B2E]">{d.departmentName}</td>
                  <td className="py-2.5 text-right font-mono tabular-nums">{d.assigned}</td>
                  <td className="py-2.5 text-right font-mono tabular-nums text-emerald-700">{d.resolved}</td>
                  <td className="py-2.5 text-right font-mono tabular-nums text-neutral-600">
                    {d.avgHours > 0 ? `${d.avgHours} hrs` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
