import { useMemo, useEffect, useState, useCallback } from 'react';
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
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  Treemap,
} from 'recharts';
import {
  HiOutlineArrowDownTray,
  HiOutlineArrowPath,
  HiOutlineBookOpen,
  HiOutlineCalendarDays,
  HiOutlineChatBubbleLeftRight,
  HiOutlineRectangleStack,
  HiOutlineStar,
} from 'react-icons/hi2';
import { apiFetch } from '../api.js';
import { notify } from '../toast.js';

const GOLD = '#d4af37';
const GOLD_MUTED = '#9a8a52';
const AXIS = '#737373';
const GRID = 'rgba(255,255,255,0.045)';
const PIE_TONES = ['#d4af37', '#a8903a', '#6b6230', '#4a4a4a', '#525252', '#656565'];
const TREEMAP_GOLDS = ['#3d3520', '#5c4d1f', '#7a6828', '#9a852e', '#b89a2e', '#d4af37', '#e8c547'];

const chartTip = {
  contentStyle: {
    background: '#1a1a1a',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 10,
    fontSize: 12,
  },
  labelStyle: { color: '#fafafa', fontWeight: 600 },
};

function sliceLastByDay(rows, days, dayKey = 'day') {
  if (!rows?.length) return rows || [];
  const sorted = [...rows].sort((a, b) => String(a[dayKey]).localeCompare(String(b[dayKey])));
  return sorted.slice(-days);
}

function exportStatsCsv(data) {
  if (!data) return;
  const rows = [
    ['Kennzahl', 'Wert'],
    ['knowledgeTotal', data.knowledgeTotal ?? ''],
    ['knowledgeActive', data.knowledgeActive ?? ''],
    ['bookingsTotal', data.bookingsTotal ?? ''],
    ['bookingsPending', data.bookingsPending ?? ''],
    ['inquiriesTotal', data.inquiriesTotal ?? ''],
    ['inquiriesOpen', data.inquiriesOpen ?? ''],
    ['inquiriesResolved', data.inquiriesResolved ?? ''],
    ['feedbackTotal', data.feedbackTotal ?? ''],
    ['feedbackAvg', data.feedbackAvg ?? ''],
  ];
  const csv = `\uFEFF${rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')}`;
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `misterwatch-kpis-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
  notify.ok('CSV exportiert');
}

function KpiCard({ label, value, sub, accent, Icon }) {
  return (
    <motion.div
      layout
      className={`kpi-card kpi-card--${accent}`}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 420, damping: 32 }}
    >
      <div className="kpi-card__top">
        <p className="kpi-label">{label}</p>
        {Icon ? <Icon className="kpi-card__ico" size={20} aria-hidden /> : null}
      </div>
      <p className="kpi-value">{value}</p>
      {sub ? <p className="kpi-sub">{sub}</p> : null}
    </motion.div>
  );
}

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [periodDays, setPeriodDays] = useState(30);

  const load = useCallback(async () => {
    try {
      const s = await apiFetch('/api/admin/stats');
      setData(s);
      setErr('');
    } catch (e) {
      const m = e?.data?.error || e.message;
      setErr(m);
      notify.err(m);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const catData = (data?.categories || []).map((c) => ({ name: c.name || '—', count: c.count }));
  const lineKb = (data?.knowledgeTimeline || []).map((r) => ({ day: r.day, knowledge: r.count }));
  const lineChat = (data?.chatTimeline || []).map((r) => ({ day: r.day, chats: r.count }));

  const mergedDays = [...new Set([...lineKb.map((d) => d.day), ...lineChat.map((d) => d.day)])].sort();
  const activityFull = mergedDays.map((day) => ({
    day,
    knowledge: lineKb.find((k) => k.day === day)?.knowledge || 0,
    chats: lineChat.find((k) => k.day === day)?.chats || 0,
    total:
      (lineKb.find((k) => k.day === day)?.knowledge || 0) + (lineChat.find((k) => k.day === day)?.chats || 0),
  }));

  const activity = useMemo(() => sliceLastByDay(activityFull, periodDays), [activityFull, periodDays]);

  const subLineFull = useMemo(() => {
    const rows = ((data && data.submissionTimeline) || []).map((r) => ({ day: r.day, eingänge: r.count }));
    return rows.sort((a, b) => a.day.localeCompare(b.day));
  }, [data]);

  const subLine = useMemo(() => sliceLastByDay(subLineFull, periodDays), [subLineFull, periodDays]);

  const pieInq = useMemo(() => {
    const open = data?.inquiriesOpen ?? 0;
    const res = data?.inquiriesResolved ?? 0;
    const total = data?.inquiriesTotal ?? 0;
    const arch = Math.max(0, total - open - res);
    return [
      { name: 'Offen', value: open },
      { name: 'Gelöst', value: res },
      ...(arch > 0 ? [{ name: 'Sonst.', value: arch }] : []),
    ].filter((d) => d.value > 0);
  }, [data]);

  const pieData = pieInq.length ? pieInq : [{ name: 'Keine Daten', value: 1 }];

  const avgRating =
    data?.feedbackTotal > 0 && data.feedbackAvg != null ? Number(data.feedbackAvg).toFixed(1) : null;

  const chatSum = useMemo(() => activity.reduce((a, r) => a + (r.chats || 0), 0), [activity]);

  const radarData = useMemo(() => {
    if (!data) return [];
    const raw = {
      'KB aktiv': data.knowledgeActive ?? 0,
      Chats: chatSum,
      'Buch. offen': data.bookingsPending ?? 0,
      'Anfr. offen': data.inquiriesOpen ?? 0,
      Feedback: data.feedbackTotal ?? 0,
    };
    const max = Math.max(1, ...Object.values(raw));
    return Object.entries(raw).map(([metric, v]) => ({
      metric,
      v: Math.round((v / max) * 100),
    }));
  }, [data, chatSum]);

  const crmBars = useMemo(() => {
    if (!data) return [];
    return [
      { name: 'Buchungen', n: data.bookingsTotal ?? 0 },
      { name: 'Anfragen', n: data.inquiriesTotal ?? 0 },
      { name: 'Feedback', n: data.feedbackTotal ?? 0 },
    ];
  }, [data]);

  const crmChartData = crmBars.length ? crmBars : [{ name: '—', n: 0 }];

  const treemapData = useMemo(() => {
    if (!catData.length) return [{ name: '—', size: 1 }];
    return catData.map((c) => ({ name: String(c.name).slice(0, 28), size: Math.max(1, c.count) }));
  }, [catData]);

  const ratingBar = [{ label: 'Ø Bewertung', stars: avgRating != null ? Number(avgRating) : 0 }];

  const sparkData = useMemo(() => {
    const tail = activity.slice(-7);
    return tail.length ? tail : [{ day: '—', total: 0 }];
  }, [activity]);

  return (
    <div className="page page--dash">
      <div className="dash-toolbar">
        <div className="dash-period" role="group" aria-label="Zeitraum">
          <button type="button" className={periodDays === 7 ? 'active' : ''} onClick={() => setPeriodDays(7)}>
            7 Tage
          </button>
          <button type="button" className={periodDays === 30 ? 'active' : ''} onClick={() => setPeriodDays(30)}>
            30 Tage
          </button>
        </div>
        <div className="dash-toolbar-actions">
          <button type="button" className="btn-secondary btn-sm" onClick={() => exportStatsCsv(data)} disabled={!data}>
            <HiOutlineArrowDownTray size={16} style={{ marginRight: 6, verticalAlign: 'middle' }} aria-hidden />
            Export CSV
          </button>
          <button type="button" className="btn-primary btn-sm" onClick={() => void load()}>
            <HiOutlineArrowPath size={16} style={{ marginRight: 6, verticalAlign: 'middle' }} aria-hidden />
            Aktualisieren
          </button>
        </div>
      </div>

      {err ? <div className="banner-error">{err}</div> : null}
      {data?.offline ? (
        <div className="banner-warn">
          Datenbank nicht verbunden — <code>DATABASE_URL</code> im Backend setzen und <code>schema.sql</code> ausführen.
        </div>
      ) : null}

      <div className="kpi-grid">
        <KpiCard label="Aktive KB" value={data?.knowledgeActive ?? '—'} sub="Live im Chatbot-Prompt" accent="a" Icon={HiOutlineBookOpen} />
        <KpiCard label="KB gesamt" value={data?.knowledgeTotal ?? '—'} sub="Alle Einträge" accent="b" Icon={HiOutlineRectangleStack} />
        <KpiCard label="Kategorien" value={catData.length} sub="Klassen im Knowledge-Base" accent="c" Icon={HiOutlineRectangleStack} />
        <KpiCard
          label="Buchungen pending"
          value={data?.bookingsPending ?? '—'}
          sub={`Gesamt: ${data?.bookingsTotal ?? '—'}`}
          accent="d"
          Icon={HiOutlineCalendarDays}
        />
        <KpiCard
          label="Anfragen offen"
          value={data?.inquiriesOpen ?? '—'}
          sub={`Gelöst: ${data?.inquiriesResolved ?? '—'}`}
          accent="e"
          Icon={HiOutlineChatBubbleLeftRight}
        />
        <KpiCard label="Feedback" value={data?.feedbackTotal ?? '—'} sub={avgRating ? `Ø ${avgRating} / 5` : 'Noch keine Sterne'} accent="f" Icon={HiOutlineStar} />
      </div>

      <div className="chart-card glass chart-card--compact">
        <h3>Kurztrend · letzte 7 Datenpunkte</h3>
        <p className="chart-card-sub">KB + Chat pro Tag (im gewählten Fenster)</p>
        <div className="chart-body" style={{ minHeight: 96 }}>
          <ResponsiveContainer width="100%" height={96}>
            <AreaChart data={sparkData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="sparkGold" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={GOLD} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={GOLD} stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="day" hide />
              <YAxis hide />
              <Tooltip {...chartTip} />
              <Area type="monotone" dataKey="total" stroke={GOLD} fill="url(#sparkGold)" strokeWidth={1.75} dot={{ r: 2, fill: GOLD }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="chart-grid chart-grid-three">
        <div className="chart-card glass">
          <h3>Anfragen · Status</h3>
          <p className="chart-card-sub">Verteilung</p>
          <div className="chart-body chart-body-shrink">
            <ResponsiveContainer width="100%" height="100%" minHeight={220}>
              <PieChart>
                <Tooltip formatter={(value) => [value, '']} {...chartTip} />
                <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={86} innerRadius={32}>
                  {pieData.map((entry, i) => (
                    <Cell key={entry.name} fill={pieInq.length ? PIE_TONES[i % PIE_TONES.length] : '#525252'} stroke="none" />
                  ))}
                </Pie>
                <Legend wrapperStyle={{ fontSize: 11, color: AXIS }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="chart-card glass">
          <h3>Knowledge · Kategorien</h3>
          <p className="chart-card-sub">Einträge je Kategorie</p>
          <div className="chart-body chart-body-shrink">
            <ResponsiveContainer width="100%" height="100%" minHeight={220}>
              <BarChart data={catData.length ? catData : [{ name: '—', count: 0 }]} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
                <XAxis dataKey="name" stroke={AXIS} tick={{ fontSize: 10 }} interval={0} angle={-14} textAnchor="end" height={48} />
                <YAxis stroke={AXIS} tick={{ fontSize: 10 }} allowDecimals={false} width={32} />
                <Tooltip {...chartTip} />
                <Bar dataKey="count" fill={GOLD} radius={[6, 6, 0, 0]} maxBarSize={48} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="chart-card glass">
          <h3>CRM · Eingänge / Tag</h3>
          <p className="chart-card-sub">Buchungen + Anfragen + Feedback</p>
          <div className="chart-body chart-body-shrink">
            <ResponsiveContainer width="100%" height="100%" minHeight={220}>
              <AreaChart data={subLine.length ? subLine : [{ day: '-', eingänge: 0 }]} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
                <XAxis dataKey="day" stroke={AXIS} tick={{ fontSize: 9 }} />
                <YAxis stroke={AXIS} tick={{ fontSize: 10 }} allowDecimals={false} width={28} />
                <Tooltip {...chartTip} />
                <defs>
                  <linearGradient id="crmAreaGold" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={GOLD} stopOpacity={0.28} />
                    <stop offset="100%" stopColor={GOLD} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Area type="monotone" dataKey="eingänge" name="Eingänge" stroke={GOLD_MUTED} fill="url(#crmAreaGold)" strokeWidth={1.75} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="chart-card glass">
        <h3>Aktivität · Zeitreihe</h3>
        <p className="chart-card-sub">Neue KB-Einträge vs. Chat (gewählter Zeitraum, max. 30 Tage Daten)</p>
        <div className="chart-body tall">
          <ResponsiveContainer width="100%" height="100%" minHeight={260}>
            <LineChart data={activity.length ? activity : [{ day: '-', knowledge: 0, chats: 0 }]} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
              <XAxis dataKey="day" stroke={AXIS} tick={{ fontSize: 9 }} />
              <YAxis stroke={AXIS} tick={{ fontSize: 10 }} allowDecimals={false} width={28} />
              <Tooltip {...chartTip} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line type="monotone" dataKey="knowledge" name="KB neu" stroke={GOLD} strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="chats" name="Chats" stroke="#a3a3a3" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="dash-chart-grid-2">
        <div className="chart-card glass">
          <h3>CRM · Profil</h3>
          <p className="chart-card-sub">Normalisiert (max = 100%)</p>
          <div className="chart-body chart-body-shrink">
            <ResponsiveContainer width="100%" height="100%" minHeight={240}>
              <RadarChart data={radarData.length ? radarData : [{ metric: '—', v: 0 }]} cx="50%" cy="50%" outerRadius="76%">
                <PolarGrid stroke={GRID} />
                <PolarAngleAxis dataKey="metric" tick={{ fill: AXIS, fontSize: 10 }} />
                <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                <Radar name="%" dataKey="v" stroke={GOLD} fill={GOLD} fillOpacity={0.22} strokeWidth={1.75} />
                <Tooltip {...chartTip} formatter={(v) => [`${v}%`, '']} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="chart-card glass">
          <h3>Bestand</h3>
          <p className="chart-card-sub">Buchungen · Anfragen · Feedback</p>
          <div className="chart-body chart-body-shrink">
            <ResponsiveContainer width="100%" height="100%" minHeight={240}>
              <BarChart data={crmChartData} layout="vertical" margin={{ top: 8, right: 16, left: 4, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID} horizontal={false} />
                <XAxis type="number" stroke={AXIS} tick={{ fontSize: 10 }} allowDecimals={false} />
                <YAxis type="category" dataKey="name" stroke={AXIS} tick={{ fontSize: 11 }} width={84} />
                <Tooltip {...chartTip} />
                <Bar dataKey="n" fill={GOLD} radius={[0, 6, 6, 0]} barSize={32} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="dash-chart-grid-2">
        <div className="chart-card glass">
          <h3>Kategorien · Fläche</h3>
          <p className="chart-card-sub">Anteil am KB-Volumen</p>
          <div className="chart-body chart-body-shrink">
            <ResponsiveContainer width="100%" height="100%" minHeight={240}>
              <Treemap
                data={treemapData}
                dataKey="size"
                aspectRatio={4 / 3}
                stroke="rgba(13,13,13,0.95)"
                isAnimationActive={false}
                content={<TreemapTiles />}
              >
                <Tooltip {...chartTip} formatter={(v, _n, p) => [v, p?.payload?.name]} />
              </Treemap>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="chart-card glass">
          <h3>Feedback</h3>
          <p className="chart-card-sub">{avgRating ? `${data?.feedbackTotal} Bewertungen` : 'Noch keine Daten'}</p>
          <div className="chart-body chart-body-shrink">
            <ResponsiveContainer width="100%" height="100%" minHeight={200}>
              <BarChart data={ratingBar} layout="vertical" margin={{ top: 12, right: 20, left: 16, bottom: 12 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
                <XAxis type="number" domain={[0, 5]} ticks={[0, 1, 2, 3, 4, 5]} stroke={AXIS} tick={{ fontSize: 10 }} />
                <YAxis type="category" dataKey="label" width={96} stroke={AXIS} tick={{ fontSize: 12 }} />
                <Tooltip {...chartTip} formatter={(v) => [`${v} / 5`, '']} />
                <Bar dataKey="stars" fill={GOLD} radius={[0, 8, 8, 0]} barSize={40} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}

function TreemapTiles(props) {
  const { x, y, width, height, name, value, index } = props;
  if (x == null || width == null || height == null) return null;
  const fill = TREEMAP_GOLDS[(index ?? 0) % TREEMAP_GOLDS.length];
  return (
    <g>
      <rect x={x} y={y} width={width} height={height} fill={fill} fillOpacity={0.92} rx={4} ry={4} stroke="rgba(0,0,0,0.25)" />
      {width > 48 && height > 24 ? (
        <text
          x={x + 8}
          y={y + height / 2 + 3}
          fill="#fafafa"
          stroke="rgba(0,0,0,0.5)"
          strokeWidth={2.5}
          paintOrder="stroke fill"
          fontSize={10}
          fontWeight={700}
        >
          {String(name).slice(0, 14)}
        </text>
      ) : null}
      {width > 32 && height > 38 ? (
        <text
          x={x + 8}
          y={y + height / 2 + 16}
          fill="rgba(250, 250, 250, 0.95)"
          stroke="rgba(0,0,0,0.45)"
          strokeWidth={2}
          paintOrder="stroke fill"
          fontSize={9}
          fontWeight={600}
        >
          {value}
        </text>
      ) : null}
    </g>
  );
}
