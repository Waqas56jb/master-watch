import { useMemo, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  LineChart,
  Line,
  Legend,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
} from 'recharts';
import { apiFetch } from '../api.js';

const PIE_COLORS = ['#f97316', '#22d3ee', '#64748b'];

const card = (title, value, sub) => (
  <motion.div layout className="stat-card glass" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
    <div className="stat-label">{title}</div>
    <div className="stat-value">{value}</div>
    {sub ? <div className="stat-sub muted">{sub}</div> : null}
  </motion.div>
);

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const s = await apiFetch('/api/admin/stats');
        if (!cancel) setData(s);
      } catch (e) {
        if (!cancel) setErr(e?.data?.error || e.message);
      }
    })();
    return () => {
      cancel = true;
    };
  }, []);

  const catData = (data?.categories || []).map((c) => ({ name: c.name || '—', count: c.count }));
  const lineKb = (data?.knowledgeTimeline || []).map((r) => ({ day: r.day, knowledge: r.count }));
  const lineChat = (data?.chatTimeline || []).map((r) => ({ day: r.day, chats: r.count }));

  const mergedDays = [...new Set([...lineKb.map((d) => d.day), ...lineChat.map((d) => d.day)])].sort();
  const activity = mergedDays.map((day) => ({
    day,
    knowledge: lineKb.find((k) => k.day === day)?.knowledge || 0,
    chats: lineChat.find((k) => k.day === day)?.chats || 0,
  }));

  const subLine = useMemo(() => {
    const rows = ((data && data.submissionTimeline) || []).map((r) => ({ day: r.day, eingänge: r.count }));
    return rows.sort((a, b) => a.day.localeCompare(b.day));
  }, [data]);

  const pieInq = useMemo(() => {
    const open = data?.inquiriesOpen ?? 0;
    const res = data?.inquiriesResolved ?? 0;
    const total = data?.inquiriesTotal ?? 0;
    const arch = Math.max(0, total - open - res);
    return [
      { name: 'Offen', value: open },
      { name: 'Gelöst', value: res },
      ...(arch > 0 ? [{ name: 'Archiv/Sonst.', value: arch }] : []),
    ].filter((d) => d.value > 0);
  }, [data]);

  const pieData = pieInq.length ? pieInq : [{ name: 'Keine Daten', value: 1 }];

  const avgRating =
    data?.feedbackTotal > 0 && data.feedbackAvg != null ? Number(data.feedbackAvg).toFixed(1) : null;

  return (
    <div className="page">
      <div className="page-head">
        <h2 className="page-head-title-dash">Überblick</h2>
        <p className="muted">Knowledge Base · Chatbot · Buchungen · Anfragen · Feedback · Einreichungen (30 Tage)</p>
      </div>

      {err ? <div className="banner-error">{err}</div> : null}
      {data?.offline ? (
        <div className="banner-warn">
          Datenbank nicht verbunden — setze <code>DATABASE_URL</code> im Backend und führe{' '}
          <code>schema.sql</code> aus.
        </div>
      ) : null}

      <div className="stat-grid stat-grid-extended">
        {card('Aktive KB', data?.knowledgeActive ?? '—', 'live im Prompt')}
        {card('KB gesamt', data?.knowledgeTotal ?? '—', 'alle Einträge')}
        {card('Kategorien', catData.length, 'Klassen im KB')}
        {card('Ausstehende Buchungen', data?.bookingsPending ?? '—', 'Status pending')}
        {card('Anfragen offen', data?.inquiriesOpen ?? '—', `Gelöst: ${data?.inquiriesResolved ?? '—'}`)}
        {card('Feedback', data?.feedbackTotal ?? '—', avgRating ? `Ø ${avgRating}/5` : '')}
      </div>

      <div className="chart-grid chart-grid-three">
        <div className="chart-card glass">
          <h3>Anfragen: Status</h3>
          <div className="chart-body">
            <ResponsiveContainer width="100%" height="100%" minHeight={240}>
              <PieChart>
                <Tooltip
                  formatter={(value) => [value, '']}
                  contentStyle={{
                    background: '#111522',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: 8,
                  }}
                  labelStyle={{ color: '#e6e9f2' }}
                />
                <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={88}>
                  {pieData.map((entry, i) => (
                    <Cell
                      key={entry.name}
                      fill={pieInq.length ? PIE_COLORS[i % PIE_COLORS.length] : '#475569'}
                      stroke="rgba(0,0,0,0)"
                    />
                  ))}
                </Pie>
                <Legend wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="chart-card glass">
          <h3>Einträge pro KB-Kategorie</h3>
          <div className="chart-body chart-body-shrink">
            <ResponsiveContainer width="100%" height="100%" minHeight={240}>
              <BarChart data={catData.length ? catData : [{ name: '—', count: 0 }]} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis dataKey="name" stroke="#8b93a7" tick={{ fontSize: 11 }} />
                <YAxis stroke="#8b93a7" tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ background: '#111522', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8 }}
                  labelStyle={{ color: '#e6e9f2' }}
                />
                <Bar dataKey="count" fill="url(#barGradDash)" radius={[6, 6, 0, 0]} />
                <defs>
                  <linearGradient id="barGradDash" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#22d3ee" stopOpacity={0.95} />
                    <stop offset="100%" stopColor="#6366f1" stopOpacity={0.85} />
                  </linearGradient>
                </defs>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="chart-card glass">
          <h3>CRM-Eingänge (30 T.)</h3>
          <p className="chart-caption muted">Buchungen + Anfragen + Feedback pro Tag</p>
          <div className="chart-body chart-body-shrink">
            <ResponsiveContainer width="100%" height="100%" minHeight={240}>
              <AreaChart data={subLine.length ? subLine : [{ day: '-', eingänge: 0 }]} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis dataKey="day" stroke="#8b93a7" tick={{ fontSize: 10 }} />
                <YAxis stroke="#8b93a7" tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ background: '#111522', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8 }}
                  labelStyle={{ color: '#e6e9f2' }}
                />
                <Area type="monotone" dataKey="eingänge" name="Eingänge" stroke="#a78bfa" fill="url(#areaSub)" strokeWidth={2} />
                <defs>
                  <linearGradient id="areaSub" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#a78bfa" stopOpacity={0.45} />
                    <stop offset="100%" stopColor="#a78bfa" stopOpacity={0} />
                  </linearGradient>
                </defs>
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="chart-grid">
        <div className="chart-card glass">
          <h3>Aktivität (30 Tage)</h3>
          <p className="chart-caption muted">Neue KB-Einträge vs. Chat-Nachrichten</p>
          <div className="chart-body tall">
            <ResponsiveContainer width="100%" height="100%" minHeight={300}>
              <LineChart data={activity.length ? activity : [{ day: '-', knowledge: 0, chats: 0 }]} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis dataKey="day" stroke="#8b93a7" tick={{ fontSize: 10 }} />
                <YAxis stroke="#8b93a7" tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ background: '#111522', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8 }}
                  labelStyle={{ color: '#e6e9f2' }}
                />
                <Legend />
                <Line type="monotone" dataKey="knowledge" name="Neue KB-Einträge" stroke="#22d3ee" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="chats" name="Chat-Nachrichten" stroke="#a78bfa" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
