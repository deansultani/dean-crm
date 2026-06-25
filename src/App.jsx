import { useState, useEffect, useRef } from "react";
import * as XLSX from "xlsx";

const SUPABASE_URL = "https://ecjinukgzizwysiezoyz.supabase.co";
const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVjamludWtneml6d3lzaWV6b3l6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk1NTU0NTksImV4cCI6MjA5NTEzMTQ1OX0._T6LNKlodbxYhb5IaIubn9oac3ToQgCjp3UQcmA1-8U";

const api = async (path, opts = {}) => {
  const token = opts.token || SUPABASE_ANON;
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      apikey: SUPABASE_ANON,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Prefer: opts.prefer !== undefined ? opts.prefer : "return=representation",
      ...opts.headers,
    },
    ...opts,
  });
};

const authFetch = (path, body) =>
  fetch(`${SUPABASE_URL}/auth/v1/${path}`, {
    method: "POST",
    headers: { apikey: SUPABASE_ANON, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then((r) => r.json());

const getUser = async (access_token) => {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${access_token}` },
  });
  return res.json();
};

const formatDate = (d) => {
  if (!d) return "";
  const dt = new Date(d + "T00:00:00");
  return dt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};

const formatDateTime = (iso) => {
  if (!iso) return "";
  const dt = new Date(iso);
  return dt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) +
    " · " + dt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
};

const initials = (name) => name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();

const avatarColor = (name) => {
  const colors = ["#1560e8","#003fa5","#1a6fc4","#0a2e6e","#2480d6","#0052cc","#1873b8"];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % colors.length;
  return colors[h];
};

const parseNextTouch = (val) => {
  if (!val) return "";
  const m = val.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return "";
  const [, mm, dd, yyyy] = m;
  return `${yyyy}-${mm.padStart(2,"0")}-${dd.padStart(2,"0")}`;
};

const nextTouchStatus = (val) => {
  const iso = parseNextTouch(val);
  if (!iso) return null;
  const today = new Date().toISOString().slice(0, 10);
  if (iso < today) return "overdue";
  if (iso === today) return "today";
  return "upcoming";
};

const taskDueStatus = (due_date) => {
  if (!due_date) return null;
  const today = new Date().toISOString().slice(0, 10);
  if (due_date < today) return "overdue";
  if (due_date === today) return "today";
  return "upcoming";
};

const formatTaskDue = (due_date) => {
  if (!due_date) return "";
  const dt = new Date(due_date + "T00:00:00");
  return dt.toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

const blankContact = () => ({
  name: "", company: "", phone: "", email: "", notes: "",
  date: new Date().toISOString().slice(0, 10),
  next_touch: "",
  touch_log: []
});

const NextTouchChip = ({ val }) => {
  if (!val) return null;
  const status = nextTouchStatus(val);
  if (!status) return null;
  const chipStyle = status === "overdue"
    ? { display:"inline-block", marginTop:4, fontSize:11, fontWeight:700, color:"#c0392b", background:"#fdecea", borderRadius:6, padding:"2px 7px" }
    : status === "today"
    ? { display:"inline-block", marginTop:4, fontSize:11, fontWeight:700, color:"#b7580a", background:"#fff3e0", borderRadius:6, padding:"2px 7px" }
    : { display:"inline-block", marginTop:4, fontSize:11, fontWeight:600, color:"#1a6fc4", background:"#e8f0fc", borderRadius:6, padding:"2px 7px" };
  const label = status === "overdue" ? `⚠ Overdue · ${val}` : status === "today" ? `📌 Today · ${val}` : `🗓 ${val}`;
  return <div style={chipStyle}>{label}</div>;
};

const DAYS = ["Su","Mo","Tu","We","Th","Fr","Sa"];
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

function MiniCalendar({ value, onChange, onClose }) {
  const today = new Date();
  const getInitial = () => {
    const iso = parseNextTouch(value);
    if (iso) { const d = new Date(iso + "T00:00:00"); return { y: d.getFullYear(), m: d.getMonth() }; }
    return { y: today.getFullYear(), m: today.getMonth() };
  };
  const [view, setView] = useState(getInitial);
  const selectedIso = parseNextTouch(value);
  const todayIso = today.toISOString().slice(0,10);
  const firstDay = new Date(view.y, view.m, 1).getDay();
  const daysInMonth = new Date(view.y, view.m + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  const pick = (d) => {
    const mm = String(view.m + 1).padStart(2,"0");
    const dd = String(d).padStart(2,"0");
    onChange(`${mm}/${dd}/${view.y}`);
    onClose();
  };
  const prevMonth = () => setView(v => v.m === 0 ? { y: v.y-1, m: 11 } : { y: v.y, m: v.m-1 });
  const nextMonth = () => setView(v => v.m === 11 ? { y: v.y+1, m: 0 } : { y: v.y, m: v.m+1 });
  return (
    <div style={calStyles.wrap}>
      <div style={calStyles.header}>
        <button style={calStyles.nav} onClick={prevMonth}>‹</button>
        <span style={calStyles.month}>{MONTHS[view.m]} {view.y}</span>
        <button style={calStyles.nav} onClick={nextMonth}>›</button>
      </div>
      <div style={calStyles.grid}>
        <div style={calStyles.dayNames}>{DAYS.map(d => <div key={d} style={calStyles.dayName}>{d}</div>)}</div>
        <div style={calStyles.days}>
          {cells.map((d, i) => {
            if (!d) return <div key={`e${i}`}/>;
            const iso = `${view.y}-${String(view.m+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
            const isSelected = iso === selectedIso;
            const isToday = iso === todayIso;
            return (
              <div key={d} onClick={() => pick(d)} style={{ ...calStyles.day, ...(isSelected ? calStyles.daySelected : {}), ...(isToday && !isSelected ? calStyles.dayToday : {}) }}>{d}</div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

const calStyles = {
  wrap: { background:"#fff", border:"1.5px solid #1a6fc4", borderRadius:10, overflow:"hidden", marginTop:6, boxShadow:"0 4px 16px rgba(26,111,196,0.15)", maxWidth:280 },
  header: { background:"#0d1b2e", display:"flex", alignItems:"center", justifyContent:"space-between", padding:"6px 10px" },
  nav: { background:"none", border:"none", color:"#eef2f8", cursor:"pointer", fontSize:15, padding:"0 4px", lineHeight:1, fontFamily:"inherit" },
  month: { fontSize:12, fontWeight:700, color:"#eef2f8", letterSpacing:"0.04em", fontFamily:"'Georgia',serif" },
  grid: { padding:"4px 6px 6px" },
  dayNames: { display:"grid", gridTemplateColumns:"repeat(7,1fr)", marginBottom:2 },
  dayName: { fontSize:8, fontWeight:700, color:"#1a6fc4", textAlign:"center", textTransform:"uppercase", letterSpacing:"0.06em", padding:"2px 0" },
  days: { display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:1 },
  day: { aspectRatio:"1", display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, color:"#0d1b2e", borderRadius:"50%", cursor:"pointer", fontFamily:"'Georgia',serif" },
  daySelected: { background:"#1a6fc4", color:"#fff", fontWeight:700 },
  dayToday: { border:"1.5px solid #1a6fc4", color:"#1a6fc4", fontWeight:700 },
};

function NextTouchInput({ value, onChange, inputStyle }) {
  const [calOpen, setCalOpen] = useState(false);
  const handleTextChange = (e) => {
    const raw = e.target.value.replace(/\D/g,"").slice(0,8);
    let fmt = raw;
    if (raw.length > 4) fmt = raw.slice(0,2)+"/"+raw.slice(2,4)+"/"+raw.slice(4);
    else if (raw.length > 2) fmt = raw.slice(0,2)+"/"+raw.slice(2);
    onChange(fmt);
  };
  const status = nextTouchStatus(value);
  return (
    <div>
      <div style={{ display:"flex", alignItems:"center", gap:6 }}>
        <button style={{ width:38, height:38, background:"#1a6fc4", border:"none", borderRadius:9, display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer", flexShrink:0 }} onClick={() => setCalOpen(o => !o)} title="Pick from calendar" type="button">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
        </button>
        <input style={inputStyle || { flex:1, padding:"10px 12px", border:"1.5px solid #cdd8ea", borderRadius:10, fontSize:15, color:"#0d1b2e", fontFamily:"inherit", outline:"none", boxSizing:"border-box", background:"#fff" }}
          type="text" placeholder="MM/DD/YYYY" value={value} maxLength={10} inputMode="numeric"
          onChange={handleTextChange} onFocus={() => setCalOpen(false)}
        />
      </div>
      {value && (
        <div style={{ fontSize:11, marginTop:4, fontWeight:600 }}>
          {status === "overdue" && <span style={{color:"#c0392b"}}>⚠ This date is in the past</span>}
          {status === "today" && <span style={{color:"#b7580a"}}>📌 Today</span>}
          {status === "upcoming" && <span style={{color:"#1a6fc4"}}>✓ Upcoming</span>}
        </div>
      )}
      {calOpen && <MiniCalendar value={value} onChange={(v) => { onChange(v); setCalOpen(false); }} onClose={() => setCalOpen(false)}/>}
    </div>
  );
}

// ── Gita Data ──────────────────────────────────────────────────────────
const GITA_VERSES = [
  { chapter:2, verse:47, sanskrit:"कर्मण्येवाधिकारस्ते मा फलेषु कदाचन ।\nमा कर्मफलहेतुर्भूर्मा ते सङ्गोऽस्त्वकर्मणि ॥", transliteration:"karmaṇy-evādhikāras te · mā phaleṣu kadācana\nmā karma-phala-hetur bhūr · mā te saṅgo 'stv akarmaṇi", translation:"You have a right to perform your prescribed duties, but never to the fruits of your actions. Never consider yourself the cause of the results, and never be attached to not doing your duty.", commentary:"This is the pivot of the entire Gita. Krishna is not asking Arjuna to work without caring — he is pointing to the deeper structure of action itself: the act belongs to you; the outcome does not. The fruit is given by the field, not the farmer. When we act from duty rather than craving, action becomes clean — it neither accumulates nor depletes. This is nishkama karma: desire-free action.", title:"Nishkama Karma" },
  { chapter:2, verse:20, sanskrit:"न जायते म्रियते वा कदाचिन्\nनायं भूत्वा भविता वा न भूयः ।\nअजो नित्यः शाश्वतोऽयं पुराणो\nन हन्यते हन्यमाने शरीरे ॥", transliteration:"na jāyate mriyate vā kadācin\nnāyaṁ bhūtvā bhavitā vā na bhūyaḥ\najo nityaḥ śāśvato 'yaṁ purāṇo\nna hanyate hanyamāne śarīre", translation:"The soul is never born nor dies at any time. It has not come into being, does not come into being, and will not come into being. It is unborn, eternal, ever-existing, and primeval. It is not slain when the body is slain.", commentary:"Arjuna weeps for those who cannot be lost. Krishna's answer is not consolation — it is ontology. The Atman is not a tenant of the body; it is prior to the body's arising. Grief assumes something has ended. But what if ending is only the body's experience, not the soul's? This verse asks us to locate ourselves correctly: not in what changes, but in what witnesses change.", title:"The Eternal Atman" },
  { chapter:6, verse:5, sanskrit:"उद्धरेदात्मनात्मानं\nनात्मानमवसादयेत् ।\nआत्मैव ह्यात्मनो बन्धुः\nआत्मैव रिपुरात्मनः ॥", transliteration:"uddhared ātmanātmānaṁ · nātmānam avasādayet\nātmaiva hy ātmano bandhuḥ · ātmaiva ripur ātmanaḥ", translation:"One must deliver oneself with the help of the mind, and not degrade oneself. The mind is the friend of the conditioned soul, and its enemy as well.", commentary:"No teacher can cross this threshold for you. The mind that torments you is the same mind that can liberate you. This is not a comfortable teaching; it removes the alibi of circumstance. Your suffering and your freedom both live in the same instrument. The path begins the moment you stop asking the jailer to open the door and realize you are holding the key.", title:"Mind: Friend or Enemy" },
  { chapter:9, verse:22, sanskrit:"अनन्याश्चिन्तयन्तो मां\nये जनाः पर्युपासते ।\nतेषां नित्याभियुक्तानां\nयोगक्षेमं वहाम्यहम् ॥", transliteration:"ananyāś cintayanto māṁ · ye janāḥ paryupāsate\nteṣāṁ nityābhiyuktānāṁ · yoga-kṣemaṁ vahāmy aham", translation:"But those who worship me with devotion, meditating on my transcendental form — to them I carry what they lack and preserve what they have.", commentary:"The word yoga-kshema is layered: yoga means acquiring what you need; kshema means protecting what you have. For those who think of Krishna without division, he takes care of both sides. This is not a transactional promise — it is a description of how undivided attention works. Bhakti is not weakness; it is the most efficient posture the mind can assume.", title:"Yoga-Kshema" },
  { chapter:18, verse:66, sanskrit:"सर्वधर्मान्परित्यज्य\nमामेकं शरणं व्रज ।\nअहं त्वां सर्वपापेभ्यो\nमोक्षयिष्यामि मा शुचः ॥", transliteration:"sarva-dharmān parityajya · mām ekaṁ śaraṇaṁ vraja\nahaṁ tvāṁ sarva-pāpebhyo · mokṣayiṣyāmi mā śucaḥ", translation:"Abandon all varieties of dharma and simply surrender unto me alone. I shall liberate you from all sinful reactions; do not fear.", commentary:"The final verse of Krishna's teaching — and the most radical. After eighteen chapters of instruction, the conclusion is surrender. Not the surrender of the defeated, but of the one who has understood that the small self's management of outcomes is itself the burden. Mā śucaḥ: do not grieve. The one who holds everything is also holding you.", title:"Surrender" },
];

function GitaTab({ showToast }) {
  const [verseIdx, setVerseIdx] = useState(0);
  const [section, setSection] = useState("sanskrit");
  const verse = GITA_VERSES[verseIdx];
  const goNext = () => { setVerseIdx(i => (i + 1) % GITA_VERSES.length); setSection("sanskrit"); };
  const goPrev = () => { setVerseIdx(i => (i - 1 + GITA_VERSES.length) % GITA_VERSES.length); setSection("sanskrit"); };
  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100%", overflow:"hidden" }}>
      <div style={gitaStyles.verseStrip}>
        <button style={gitaStyles.navArrow} onClick={goPrev}>‹</button>
        <div style={gitaStyles.verseStripCenter}>
          <div style={gitaStyles.verseRef}>BG {verse.chapter}:{verse.verse}</div>
          <div style={gitaStyles.verseTitle}>{verse.title}</div>
        </div>
        <button style={{ ...gitaStyles.navArrow, color:"#1a6fc4", background:"#e8f0fc" }} onClick={goNext}>›</button>
      </div>
      <div style={gitaStyles.dots}>
        {GITA_VERSES.map((_, i) => (
          <div key={i} onClick={() => { setVerseIdx(i); setSection("sanskrit"); }}
            style={{ width:i===verseIdx?22:6, height:6, borderRadius:3, background:i===verseIdx?"#1a6fc4":"#cdd8ea", cursor:"pointer", transition:"all 0.25s" }}/>
        ))}
      </div>
      <div style={gitaStyles.sectionTabs}>
        {[{id:"sanskrit",label:"Sanskrit"},{id:"translation",label:"Translation"},{id:"commentary",label:"Commentary"}].map(s => (
          <button key={s.id} onClick={() => setSection(s.id)} style={{ ...gitaStyles.sectionTab, ...(section===s.id?gitaStyles.sectionTabActive:{}) }}>{s.label}</button>
        ))}
      </div>
      <div style={gitaStyles.contentScroll}>
        {section === "sanskrit" && (<>
          <div style={gitaStyles.card}><div style={gitaStyles.cardLabel}>Sanskrit</div><p style={gitaStyles.sanskritText}>{verse.sanskrit}</p></div>
          <div style={{ ...gitaStyles.card, marginTop:10 }}><div style={gitaStyles.cardLabel}>IAST Transliteration</div><p style={gitaStyles.translit}>{verse.transliteration}</p></div>
        </>)}
        {section === "translation" && <div style={gitaStyles.card}><div style={gitaStyles.cardLabel}>Translation</div><p style={gitaStyles.translationText}>{verse.translation}</p></div>}
        {section === "commentary" && (
          <div style={gitaStyles.card}>
            <div style={gitaStyles.cardLabel}>Commentary</div>
            <div style={gitaStyles.commentaryPull}><div style={gitaStyles.commentaryPullBar}/><p style={gitaStyles.commentaryPullText}>{verse.commentary.split(". ")[0]}.</p></div>
            <p style={gitaStyles.commentaryBody}>{verse.commentary.split(". ").slice(1).join(". ")}</p>
          </div>
        )}
        <div style={gitaStyles.browseHeader}><span style={gitaStyles.browseLabel}>All Verses</span></div>
        {GITA_VERSES.map((v, i) => (
          <div key={i} onClick={() => { setVerseIdx(i); setSection("sanskrit"); }} style={{ ...gitaStyles.browseRow, ...(i===verseIdx?gitaStyles.browseRowActive:{}) }}>
            <div style={{ ...gitaStyles.browseRef, ...(i===verseIdx?{color:"#1a6fc4"}:{}) }}>BG {v.chapter}:{v.verse}</div>
            <div style={gitaStyles.browseTitle}>{v.title}</div>
            {i===verseIdx && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#1a6fc4" strokeWidth="2.5"><polyline points="9,18 15,12 9,6"/></svg>}
          </div>
        ))}
        <div style={{ height:40 }}/>
      </div>
    </div>
  );
}

const gitaStyles = {
  verseStrip: { display:"flex", alignItems:"center", gap:10, padding:"10px 14px", background:"#0d1b2e", borderBottom:"1px solid #1a4a8a", flexShrink:0 },
  navArrow: { width:34, height:34, borderRadius:8, background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.12)", color:"#8aafd4", fontSize:20, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"Georgia,serif", flexShrink:0, lineHeight:1 },
  verseStripCenter: { flex:1, textAlign:"center" },
  verseRef: { fontSize:11, fontWeight:700, color:"#1a6fc4", letterSpacing:"0.12em", textTransform:"uppercase", marginBottom:2 },
  verseTitle: { fontSize:15, fontWeight:700, color:"#eef2f8", fontFamily:"'Georgia',serif" },
  dots: { display:"flex", alignItems:"center", justifyContent:"center", gap:5, padding:"8px 0", background:"#0d1b2e", borderBottom:"2px solid #1a6fc4", flexShrink:0 },
  sectionTabs: { display:"flex", background:"#0d1b2e", borderBottom:"2px solid #1a6fc4", flexShrink:0 },
  sectionTab: { flex:1, padding:"9px 0", background:"none", border:"none", color:"#8aafd4", fontSize:11, fontWeight:700, letterSpacing:"0.08em", textTransform:"uppercase", cursor:"pointer", fontFamily:"'Georgia',serif", borderBottom:"3px solid transparent" },
  sectionTabActive: { color:"#eef2f8", borderBottom:"3px solid #1a6fc4" },
  contentScroll: { flex:1, overflowY:"auto", WebkitOverflowScrolling:"touch", padding:"12px 14px 0" },
  card: { background:"#fff", border:"1px solid #d6e2f0", borderRadius:14, padding:"14px 16px" },
  cardLabel: { fontSize:10, fontWeight:700, color:"#1a6fc4", letterSpacing:"0.15em", textTransform:"uppercase", marginBottom:10 },
  sanskritText: { margin:0, fontSize:19, lineHeight:1.8, color:"#0d1b2e", fontFamily:"'Noto Serif Devanagari','Noto Serif','Georgia',serif", whiteSpace:"pre-line" },
  translit: { margin:0, fontSize:13, lineHeight:2, color:"#1a6fc4", fontFamily:"'Georgia',serif", fontStyle:"italic", whiteSpace:"pre-line", letterSpacing:"0.02em" },
  translationText: { margin:0, fontSize:15, lineHeight:1.8, color:"#0d1b2e", fontFamily:"'Georgia',serif" },
  commentaryPull: { display:"flex", gap:12, marginBottom:14, padding:"2px 0" },
  commentaryPullBar: { width:3, borderRadius:2, background:"#1a6fc4", flexShrink:0 },
  commentaryPullText: { margin:0, fontSize:14, lineHeight:1.7, color:"#1a6fc4", fontFamily:"'Georgia',serif", fontStyle:"italic" },
  commentaryBody: { margin:0, fontSize:14, lineHeight:1.75, color:"#3a4a5a", fontFamily:"'Georgia',serif" },
  browseHeader: { display:"flex", alignItems:"center", padding:"16px 2px 6px" },
  browseLabel: { fontSize:10, fontWeight:700, color:"#888", letterSpacing:"0.15em", textTransform:"uppercase" },
  browseRow: { display:"flex", alignItems:"center", gap:10, background:"#fff", border:"1px solid #d6e2f0", borderRadius:10, padding:"10px 14px", marginBottom:6, cursor:"pointer" },
  browseRowActive: { background:"#e8f0fc", border:"1px solid #b0c8e8" },
  browseRef: { fontSize:11, fontWeight:700, color:"#888", letterSpacing:"0.08em", textTransform:"uppercase", width:52, flexShrink:0 },
  browseTitle: { flex:1, fontSize:14, color:"#0d1b2e", fontFamily:"'Georgia',serif" },
};

// ── Prospect Research Agent ────────────────────────────────────────────
const PROSPECT_SYSTEM_PROMPT = `You are a sales intelligence agent for Legalet AI, a document and case management platform built specifically for California workers' compensation defense law firms.

Your job is to research a law firm and produce a concise, actionable prospect profile for a business development rep.

When given a firm name (and optionally a location), use web search to find:
1. Firm overview — size, practice focus, office locations, years in business
2. Key decision-makers — managing partners, administrators, operations leads (the people who buy software)
3. Current tech signals — any mentions of case management software, tech stack, or digital initiatives
4. Recent news — growth, hires, awards, verdicts, or anything notable in the last 12 months
5. Workers' comp defense focus — confirm they handle CA workers' comp defense and estimate how central it is to their practice

Then produce a structured JSON response ONLY (no markdown, no preamble, no backticks) with this exact shape:

{
  "firmName": "...",
  "location": "...",
  "founded": "...",
  "size": "...",
  "wcDefenseFocus": "high | medium | low | unknown",
  "wcFocusNote": "one sentence explanation",
  "decisionMakers": [
    { "name": "...", "title": "...", "note": "..." }
  ],
  "techSignals": "...",
  "recentNews": "...",
  "outreachAngle": "A 2-3 sentence personalized cold outreach angle for a Legalet AI intro — warm, specific, not salesy. Reference something real you found.",
  "sources": ["url1", "url2"]
}

If you cannot find information for a field, use null. Always search before responding.`;

const WC_COLORS = {
  high: { bg:"#0f3d2e", text:"#4ade80", label:"High WC Focus" },
  medium: { bg:"#3d2e0a", text:"#fbbf24", label:"Medium WC Focus" },
  low: { bg:"#3d0f0f", text:"#f87171", label:"Low WC Focus" },
  unknown: { bg:"#1e2030", text:"#94a3b8", label:"Focus Unknown" },
};

function ProspectBadge({ level }) {
  const c = WC_COLORS[level] || WC_COLORS.unknown;
  return <span style={{ background:c.bg, color:c.text, padding:"3px 10px", borderRadius:"4px", fontSize:"11px", fontWeight:700, letterSpacing:"0.08em", textTransform:"uppercase", border:`1px solid ${c.text}33` }}>{c.label}</span>;
}

function ProspectSection({ title, children }) {
  return (
    <div style={{ marginBottom:"20px" }}>
      <div style={{ fontSize:"10px", fontWeight:700, letterSpacing:"0.12em", color:"#64748b", textTransform:"uppercase", marginBottom:"8px", borderBottom:"1px solid #1e2a3a", paddingBottom:"6px" }}>{title}</div>
      {children}
    </div>
  );
}

function ProspectPersonCard({ person }) {
  return (
    <div style={{ background:"#0d1520", border:"1px solid #1e2a3a", borderRadius:"6px", padding:"10px 14px", marginBottom:"8px" }}>
      <div style={{ color:"#e2e8f0", fontWeight:600, fontSize:"14px" }}>{person.name}</div>
      <div style={{ color:"#6c8aac", fontSize:"12px", marginTop:"2px" }}>{person.title}</div>
      {person.note && <div style={{ color:"#94a3b8", fontSize:"12px", marginTop:"6px", lineHeight:1.5 }}>{person.note}</div>}
    </div>
  );
}

function ProspectAgent() {
  const [firmName, setFirmName] = useState("");
  const [location, setLocation] = useState("");
  const [loading, setLoading] = useState(false);
  const [log, setLog] = useState([]);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const addLog = (msg) => setLog(prev => [...prev, `> ${msg}`]);

  const runAgent = async () => {
    if (!firmName.trim()) return;
    setLoading(true); setResult(null); setError(null); setLog([]);
    addLog(`Researching: ${firmName}${location ? `, ${location}` : ""}`);
    addLog("Calling Claude with web search...");
    try {
      const userMessage = `Research this California workers' compensation defense law firm for Legalet AI sales prospecting:\n\nFirm: ${firmName}${location ? `\nLocation: ${location}` : ""}`;
      const response = await fetch("/api/claude-proxy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 1000,
          system: PROSPECT_SYSTEM_PROMPT,
          tools: [{ type: "web_search_20250305", name: "web_search" }],
          messages: [{ role: "user", content: userMessage }]
        })
      });
      const data = await response.json();
      if (data.error) throw new Error(data.error.message);
      const searches = data.content.filter(b => b.type === "tool_use");
      if (searches.length > 0) addLog(`Ran ${searches.length} web search${searches.length > 1 ? "es" : ""}`);
      const textBlocks = data.content.filter(b => b.type === "text").map(b => b.text).join("\n");
      addLog("Parsing profile...");
      const clean = textBlocks.replace(/```json|```/g, "").trim();
      const jsonStart = clean.indexOf("{");
      const jsonEnd = clean.lastIndexOf("}");
      if (jsonStart === -1) throw new Error("No JSON found in response.");
      const parsed = JSON.parse(clean.slice(jsonStart, jsonEnd + 1));
      addLog("Profile complete ✓");
      setResult(parsed);
    } catch (e) {
      addLog(`Error: ${e.message}`);
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ height:"100%", overflowY:"auto", WebkitOverflowScrolling:"touch", background:"#060c14", fontFamily:"'Inter',system-ui,sans-serif", color:"#cbd5e1" }}>
      <div style={{ padding:"16px 14px" }}>
        <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4 }}>
          <div style={{ width:26, height:26, borderRadius:"5px", background:"linear-gradient(135deg,#1e40af,#3b82f6)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:13, fontWeight:800, color:"#fff" }}>L</div>
          <span style={{ fontSize:11, fontWeight:700, color:"#3b82f6", letterSpacing:"0.05em" }}>LEGALET AI · PROSPECT RESEARCH</span>
        </div>
        <p style={{ fontSize:12, color:"#475569", margin:"0 0 14px" }}>Enter a firm name to generate a prospect profile.</p>
        <div style={{ display:"flex", flexDirection:"column", gap:8, marginBottom:10 }}>
          <input value={firmName} onChange={e => setFirmName(e.target.value)} onKeyDown={e => e.key==="Enter" && !loading && runAgent()} placeholder="Firm name, e.g. Mullen & Filippi"
            style={{ background:"#0d1520", border:"1px solid #1e2a3a", borderRadius:"6px", padding:"10px 14px", color:"#e2e8f0", fontSize:"14px", outline:"none", width:"100%", boxSizing:"border-box" }}/>
          <div style={{ display:"flex", gap:8 }}>
            <input value={location} onChange={e => setLocation(e.target.value)} onKeyDown={e => e.key==="Enter" && !loading && runAgent()} placeholder="Location (optional)"
              style={{ flex:1, background:"#0d1520", border:"1px solid #1e2a3a", borderRadius:"6px", padding:"10px 14px", color:"#e2e8f0", fontSize:"14px", outline:"none" }}/>
            <button onClick={runAgent} disabled={loading || !firmName.trim()}
              style={{ background:loading?"#1e3a5f":"linear-gradient(135deg,#1e40af,#2563eb)", color:loading?"#64748b":"#fff", border:"none", borderRadius:"6px", padding:"10px 18px", fontSize:"13px", fontWeight:700, cursor:loading?"not-allowed":"pointer", whiteSpace:"nowrap" }}>
              {loading ? "Searching..." : "Research →"}
            </button>
          </div>
        </div>
        {(loading || log.length > 0) && (
          <div style={{ marginBottom:"16px" }}>
            <div style={{ fontSize:"10px", fontWeight:700, letterSpacing:"0.12em", color:"#334155", textTransform:"uppercase", marginBottom:"6px" }}>Agent Log</div>
            <div style={{ background:"#070d14", border:"1px solid #1e2a3a", borderRadius:"6px", padding:"12px 14px", fontFamily:"monospace", fontSize:"12px", color:"#4ade80", maxHeight:"140px", overflowY:"auto", lineHeight:1.6 }}>
              {log.map((l, i) => <div key={i}>{l}</div>)}
              {log.length === 0 && <span style={{ color:"#334155" }}>Waiting...</span>}
            </div>
          </div>
        )}
        {error && <div style={{ background:"#3d0f0f", border:"1px solid #7f1d1d", borderRadius:"6px", padding:"12px 16px", color:"#fca5a5", fontSize:"13px", marginBottom:"16px" }}>{error}</div>}
        {result && (
          <div style={{ background:"#0b1422", border:"1px solid #1e2a3a", borderRadius:"10px", padding:"20px" }}>
            <div style={{ marginBottom:"16px" }}>
              <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", flexWrap:"wrap", gap:"8px" }}>
                <div>
                  <h2 style={{ margin:0, fontSize:"18px", fontWeight:700, color:"#f1f5f9" }}>{result.firmName}</h2>
                  <div style={{ color:"#64748b", fontSize:"12px", marginTop:"3px" }}>{[result.location, result.founded && `Est. ${result.founded}`, result.size].filter(Boolean).join(" · ")}</div>
                </div>
                <ProspectBadge level={result.wcDefenseFocus}/>
              </div>
              {result.wcFocusNote && <p style={{ margin:"10px 0 0", color:"#94a3b8", fontSize:"13px", lineHeight:1.5 }}>{result.wcFocusNote}</p>}
            </div>
            <div style={{ background:"linear-gradient(135deg,#0f2040,#0f1e35)", border:"1px solid #1e3a5f", borderRadius:"8px", padding:"14px 16px", marginBottom:"16px" }}>
              <div style={{ fontSize:"10px", fontWeight:700, letterSpacing:"0.12em", color:"#3b82f6", textTransform:"uppercase", marginBottom:"8px" }}>Suggested Outreach Angle</div>
              <p style={{ margin:0, color:"#cbd5e1", fontSize:"13px", lineHeight:1.7 }}>{result.outreachAngle}</p>
              <button onClick={() => navigator.clipboard?.writeText(result.outreachAngle)}
                style={{ marginTop:"10px", background:"transparent", border:"1px solid #1e3a5f", borderRadius:"4px", color:"#64748b", fontSize:"11px", padding:"3px 9px", cursor:"pointer" }}>Copy</button>
            </div>
            {result.decisionMakers?.length > 0 && (
              <ProspectSection title="Key Contacts">
                {result.decisionMakers.map((p, i) => <ProspectPersonCard key={i} person={p}/>)}
              </ProspectSection>
            )}
            {(result.techSignals || result.recentNews) && (
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"14px", marginBottom:"16px" }}>
                {result.techSignals && <ProspectSection title="Tech Signals"><p style={{ margin:0, fontSize:"12px", color:"#94a3b8", lineHeight:1.6 }}>{result.techSignals}</p></ProspectSection>}
                {result.recentNews && <ProspectSection title="Recent News"><p style={{ margin:0, fontSize:"12px", color:"#94a3b8", lineHeight:1.6 }}>{result.recentNews}</p></ProspectSection>}
              </div>
            )}
            {result.sources?.filter(Boolean).length > 0 && (
              <ProspectSection title="Sources">
                <div style={{ display:"flex", flexWrap:"wrap", gap:"6px" }}>
                  {result.sources.filter(Boolean).map((s, i) => (
                    <a key={i} href={s} target="_blank" rel="noopener noreferrer"
                      style={{ background:"#0d1520", border:"1px solid #1e2a3a", borderRadius:"4px", padding:"3px 9px", fontSize:"11px", color:"#3b82f6", textDecoration:"none", maxWidth:"200px", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                      {s.replace(/^https?:\/\/(www\.)?/, "")}
                    </a>
                  ))}
                </div>
              </ProspectSection>
            )}
          </div>
        )}
        {!loading && !result && !error && (
          <div style={{ textAlign:"center", padding:"36px 20px", border:"1px dashed #1e2a3a", borderRadius:"10px", color:"#334155", fontSize:"12px" }}>
            Enter a California workers' comp defense firm to generate a prospect profile.
          </div>
        )}
        <div style={{ height:40 }}/>
      </div>
    </div>
  );
}

// ── Main App ───────────────────────────────────────────────────────────
export default function DeanCRM() {
  const [session, setSession] = useState(null);
  const [userId, setUserId] = useState(null);
  const [authStep, setAuthStep] = useState("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState(["","","","","",""]);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState("");
  const [checkingSession, setCheckingSession] = useState(true);
  const [resendCountdown, setResendCountdown] = useState(0);
  const codeRefs = [useRef(),useRef(),useRef(),useRef(),useRef(),useRef()];
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState("list");
  const [selected, setSelected] = useState(null);
  const [editEntry, setEditEntry] = useState(null);
  const [search, setSearch] = useState("");
  const [toast, setToast] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [confirmDeleteTouch, setConfirmDeleteTouch] = useState(null);
  const [newNote, setNewNote] = useState("");
  const [addingNote, setAddingNote] = useState(false);
  const [inlineNextTouch, setInlineNextTouch] = useState("");
  const [editingNextTouch, setEditingNextTouch] = useState(false);
  const [nextTouchDraft, setNextTouchDraft] = useState("");
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [homeTab, setHomeTab] = useState("home");
  const [tasks, setTasks] = useState([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [newTaskNote, setNewTaskNote] = useState("");
  const [newTaskDate, setNewTaskDate] = useState("");
  const [confirmDeleteTask, setConfirmDeleteTask] = useState(null);
  const [showCompleted, setShowCompleted] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState(null);
  const [taskDraftNote, setTaskDraftNote] = useState("");
  const [taskDraftDate, setTaskDraftDate] = useState("");

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(""), 2500); };

  useEffect(() => {
    const metas = [
      { name:"apple-mobile-web-app-capable", content:"yes" },
      { name:"apple-mobile-web-app-status-bar-style", content:"black-translucent" },
      { name:"apple-mobile-web-app-title", content:"DeanBoard" },
      { name:"theme-color", content:"#0d1b2e" },
      { name:"viewport", content:"width=device-width, initial-scale=1, viewport-fit=cover" },
    ];
    metas.forEach(({ name, content }) => {
      let el = document.querySelector(`meta[name="${name}"]`);
      if (!el) { el = document.createElement("meta"); el.name = name; document.head.appendChild(el); }
      el.content = content;
    });
  }, []);

  useEffect(() => {
    const init = async () => {
      try {
        const stored = JSON.parse(localStorage.getItem("dean_crm_session"));
        if (stored?.access_token) {
          const userData = await getUser(stored.access_token);
          if (userData.id) { setSession({ ...stored, user: userData }); setUserId(userData.id); setCheckingSession(false); return; }
          if (stored.refresh_token) {
            const refreshed = await authFetch("token?grant_type=refresh_token", { refresh_token: stored.refresh_token });
            if (refreshed.access_token) {
              const userData2 = await getUser(refreshed.access_token);
              if (userData2.id) {
                const newSess = { access_token: refreshed.access_token, refresh_token: refreshed.refresh_token || stored.refresh_token, user: userData2 };
                setSession(newSess); setUserId(userData2.id);
                localStorage.setItem("dean_crm_session", JSON.stringify(newSess));
                setCheckingSession(false); return;
              }
            }
          }
          localStorage.removeItem("dean_crm_session");
        }
      } catch {}
      setCheckingSession(false);
    };
    init();
  }, []);

  useEffect(() => { if (session && userId) { fetchContacts(); fetchTasks(); } }, [session, userId]);
  useEffect(() => { if (resendCountdown > 0) { const t = setTimeout(() => setResendCountdown(r => r-1), 1000); return () => clearTimeout(t); } }, [resendCountdown]);
  useEffect(() => { if (authStep === "code") setTimeout(() => codeRefs[0].current?.focus(), 100); }, [authStep]);
  useEffect(() => {
    if (!exportMenuOpen) return;
    const handler = () => setExportMenuOpen(false);
    setTimeout(() => document.addEventListener("click", handler), 0);
    return () => document.removeEventListener("click", handler);
  }, [exportMenuOpen]);

  const fetchContacts = async () => {
    setLoading(true);
    try {
      const res = await api("contacts?order=name.asc", { token: session.access_token, prefer:"" });
      if (res.ok) { const data = await res.json(); setContacts(data.map(c => ({ ...c, touch_log: c.touch_log || [] }))); }
    } catch {}
    setLoading(false);
  };

  const fetchTasks = async () => {
    setTasksLoading(true);
    try {
      const res = await api("tasks?order=due_date.asc", { token: session.access_token, prefer:"" });
      if (res.ok) { const data = await res.json(); setTasks(data); }
    } catch {}
    setTasksLoading(false);
  };

  const addTask = async () => {
    if (!newTaskNote.trim()) return showToast("Task note is required");
    const isoDate = newTaskDate.trim() ? parseNextTouch(newTaskDate.trim()) || null : null;
    const payload = { note: newTaskNote.trim(), due_date: isoDate, completed: false, completed_at: null, user_id: userId };
    try {
      const res = await api("tasks", { method:"POST", token: session.access_token, body: JSON.stringify(payload) });
      if (res.ok) {
        const created = await res.json();
        const t = Array.isArray(created) ? created[0] : created;
        setTasks(prev => [...prev, t].sort((a,b) => (a.due_date||"9999") > (b.due_date||"9999") ? 1 : -1));
        setNewTaskNote(""); setNewTaskDate(""); showToast("Task added!");
      } else showToast("Error saving task");
    } catch { showToast("Error saving task"); }
  };

  const completeTask = async (id, undo = false) => {
    const patch = { completed: !undo, completed_at: !undo ? new Date().toISOString() : null };
    try {
      await api(`tasks?id=eq.${id}`, { method:"PATCH", token: session.access_token, prefer:"", body: JSON.stringify(patch) });
      setTasks(prev => prev.map(t => t.id === id ? { ...t, ...patch } : t));
      showToast(undo ? "Task reopened" : "Task completed! ✓");
    } catch { showToast("Error updating task"); }
  };

  const deleteTask = async (id) => {
    try { await api(`tasks?id=eq.${id}`, { method:"DELETE", token: session.access_token, prefer:"" }); setTasks(prev => prev.filter(t => t.id !== id)); } catch {}
    setConfirmDeleteTask(null); showToast("Task deleted");
  };

  const saveTaskEdit = async (id) => {
    if (!taskDraftNote.trim()) return showToast("Task note is required");
    const isoDate = taskDraftDate.trim() ? parseNextTouch(taskDraftDate.trim()) || null : null;
    const patch = { note: taskDraftNote.trim(), due_date: isoDate };
    try {
      await api(`tasks?id=eq.${id}`, { method:"PATCH", token: session.access_token, prefer:"", body: JSON.stringify(patch) });
      setTasks(prev => prev.map(t => t.id === id ? { ...t, ...patch } : t));
      setEditingTaskId(null); showToast("Task updated!");
    } catch { showToast("Error updating task"); }
  };

  const startEditTask = (t) => {
    setEditingTaskId(t.id); setTaskDraftNote(t.note);
    if (t.due_date) { const [yyyy,mm,dd] = t.due_date.slice(0,10).split("-"); setTaskDraftDate(`${mm}/${dd}/${yyyy}`); }
    else setTaskDraftDate("");
  };

  const sendOTP = async () => {
    if (!email.trim()) return setAuthError("Please enter your email");
    setAuthLoading(true); setAuthError("");
    const res = await authFetch("otp", { email: email.trim(), create_user: true, email_redirect_to: null, go_true_enabled: false });
    setAuthLoading(false);
    if (res.error) return setAuthError(res.error.message || "Something went wrong");
    setAuthStep("code"); setCode(["","","","","",""]); setResendCountdown(30);
  };

  const verifyOTPWithCode = async (codeArr) => {
    const token = codeArr.join("");
    if (token.length !== 6) return setAuthError("Please enter the full 6-digit code");
    setAuthLoading(true); setAuthError("");
    const res = await authFetch("verify", { email: email.trim(), token, type:"email" });
    setAuthLoading(false);
    if (res.error) { setAuthError("Invalid or expired code. Please try again."); setCode(["","","","","",""]); setTimeout(() => codeRefs[0].current?.focus(), 50); return; }
    if (res.access_token) {
      const userData = await getUser(res.access_token);
      const sess = { access_token: res.access_token, refresh_token: res.refresh_token, user: userData };
      setSession(sess); setUserId(userData.id);
      localStorage.setItem("dean_crm_session", JSON.stringify(sess));
    }
  };

  const verifyOTP = () => verifyOTPWithCode(code);

  const handleCodeInput = (i, val) => {
    const digit = val.replace(/\D/g,"").slice(-1);
    const next = [...code]; next[i] = digit; setCode(next); setAuthError("");
    if (digit && i < 5) codeRefs[i+1].current?.focus();
    if (next.every(d => d !== "")) setTimeout(() => verifyOTPWithCode(next), 80);
  };

  const handleCodeKeyDown = (i, e) => {
    if (e.key === "Backspace") {
      if (code[i]) { const next = [...code]; next[i] = ""; setCode(next); }
      else if (i > 0) { codeRefs[i-1].current?.focus(); const next = [...code]; next[i-1] = ""; setCode(next); }
    }
    if (e.key === "ArrowLeft" && i > 0) codeRefs[i-1].current?.focus();
    if (e.key === "ArrowRight" && i < 5) codeRefs[i+1].current?.focus();
  };

  const handleCodePaste = (e) => {
    const pasted = e.clipboardData.getData("text").replace(/\D/g,"").slice(0,6);
    if (pasted.length === 6) { const arr = pasted.split(""); setCode(arr); codeRefs[5].current?.focus(); setTimeout(() => verifyOTPWithCode(arr), 80); }
  };

  const signOut = () => {
    setSession(null); setUserId(null); localStorage.removeItem("dean_crm_session");
    setContacts([]); setView("list"); setSelected(null); setAuthStep("email"); setCode(["","","","","",""]);
  };

  const saveEntry = async () => {
    if (!editEntry.name.trim()) return showToast("Name is required");
    if (!userId) return showToast("Not logged in");
    const isNew = editEntry._isNew;
    const { _isNew, id, touch_log, ...fields } = editEntry;
    const payload = { ...fields, touch_log: touch_log || [], user_id: userId };
    try {
      if (isNew) {
        const res = await api("contacts", { method:"POST", token: session.access_token, body: JSON.stringify(payload) });
        if (res.ok) {
          const created = await res.json();
          const newContact = Array.isArray(created) ? created[0] : created;
          setContacts(prev => [...prev, { ...newContact, touch_log: newContact.touch_log || [] }].sort((a,b) => a.name.localeCompare(b.name)));
          showToast("Contact added!");
        } else { const err = await res.json(); showToast("Error: " + (err.message || err.hint || "Could not save")); return; }
      } else {
        const res = await api(`contacts?id=eq.${id}`, { method:"PATCH", token: session.access_token, prefer:"", body: JSON.stringify(fields) });
        if (res.ok) { setContacts(prev => prev.map(c => c.id === id ? { ...c, ...fields } : c)); showToast("Contact updated!"); }
      }
      setView("profile");
    } catch { showToast("Error saving contact"); }
  };

  const saveNextTouch = async () => {
    const contact = contacts[selected];
    try {
      await api(`contacts?id=eq.${contact.id}`, { method:"PATCH", token: session.access_token, prefer:"", body: JSON.stringify({ next_touch: nextTouchDraft.trim() }) });
      setContacts(prev => prev.map(c => c.id === contact.id ? { ...c, next_touch: nextTouchDraft.trim() } : c));
      setEditingNextTouch(false); showToast("Next touch updated!");
    } catch { showToast("Error saving"); }
  };

  const deleteContact = async (id) => {
    try { await api(`contacts?id=eq.${id}`, { method:"DELETE", token: session.access_token, prefer:"" }); setContacts(prev => prev.filter(c => c.id !== id)); } catch {}
    setView("list"); setSelected(null); setConfirmDelete(null); showToast("Contact deleted");
  };

  const addTouchNote = async () => {
    if (!newNote.trim()) return showToast("Note cannot be empty");
    const contact = contacts[selected];
    const entry = { id: Date.now(), text: newNote.trim(), createdAt: new Date().toISOString() };
    const updatedLog = [entry, ...(contact.touch_log || [])];
    const patch = { touch_log: updatedLog };
    if (inlineNextTouch.trim()) patch.next_touch = inlineNextTouch.trim();
    try {
      await api(`contacts?id=eq.${contact.id}`, { method:"PATCH", token: session.access_token, prefer:"", body: JSON.stringify(patch) });
      setContacts(prev => prev.map(c => c.id === contact.id ? { ...c, touch_log: updatedLog, ...(inlineNextTouch.trim() ? { next_touch: inlineNextTouch.trim() } : {}) } : c));
      setNewNote(""); setAddingNote(false); setInlineNextTouch("");
      showToast(inlineNextTouch.trim() ? "Note & next touch saved!" : "Note added!");
    } catch { showToast("Error saving note"); }
  };

  const deleteTouchNote = async ({ contactId, touchId }) => {
    const contact = contacts.find(c => c.id === contactId);
    const updatedLog = contact.touch_log.filter(t => t.id !== touchId);
    try {
      await api(`contacts?id=eq.${contactId}`, { method:"PATCH", token: session.access_token, prefer:"", body: JSON.stringify({ touch_log: updatedLog }) });
      setContacts(prev => prev.map(c => c.id === contactId ? { ...c, touch_log: updatedLog } : c));
    } catch {}
    setConfirmDeleteTouch(null); showToast("Note removed");
  };

  const exportXLSX = () => {
    const wb = XLSX.utils.book_new();
    const contactRows = contacts.map(c => ({ "Name":c.name||"","Company":c.company||"","Phone":c.phone||"","Email":c.email||"","Date Added":c.date?formatDate(c.date):"","Next Touch":c.next_touch||"","Touch Count":(c.touch_log||[]).length,"Notes":(c.notes||"").replace(/\n/g," ") }));
    const ws1 = XLSX.utils.json_to_sheet(contactRows);
    ws1["!cols"] = [{wch:24},{wch:22},{wch:16},{wch:28},{wch:16},{wch:14},{wch:13},{wch:40}];
    XLSX.utils.book_append_sheet(wb, ws1, "Contacts");
    const touchRows = [];
    contacts.forEach(c => { (c.touch_log||[]).forEach(t => { touchRows.push({ "Contact Name":c.name||"","Company":c.company||"","Date & Time":formatDateTime(t.createdAt),"Note":t.text||"" }); }); });
    if (touchRows.length > 0) { const ws2 = XLSX.utils.json_to_sheet(touchRows); ws2["!cols"] = [{wch:24},{wch:22},{wch:22},{wch:50}]; XLSX.utils.book_append_sheet(wb, ws2, "Touch Log"); }
    XLSX.writeFile(wb, `DeanBoard_${new Date().toISOString().slice(0,10)}.xlsx`);
    showToast("Exported to spreadsheet!"); setExportMenuOpen(false);
  };

  const exportCSV = () => {
    const headers = ["Name","Company","Phone","Email","Notes","Date","Touch Log"];
    const rows = contacts.map(c => { const log = (c.touch_log||[]).map(t => `[${formatDateTime(t.createdAt)}] ${t.text}`).join(" | "); return [c.name,c.company,c.phone,c.email,(c.notes||"").replace(/\n/g," "),c.date,log]; });
    const csv = [headers,...rows].map(r => r.map(v => `"${(v||"").replace(/"/g,'""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type:"text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `DeanBoard_${new Date().toISOString().slice(0,10)}.csv`; a.click();
    showToast("Exported to CSV!"); setExportMenuOpen(false);
  };

  const todayIso = new Date().toISOString().slice(0,10);
  const in7DaysIso = new Date(Date.now()+7*24*60*60*1000).toISOString().slice(0,10);
  const upcomingTasks = tasks.filter(t=>!t.completed&&t.due_date&&t.due_date<=in7DaysIso).sort((a,b)=>a.due_date>b.due_date?1:-1);
  const tasksByDay = upcomingTasks.reduce((acc,t)=>{if(!acc[t.due_date])acc[t.due_date]=[];acc[t.due_date].push(t);return acc;},{});
  const upcomingContacts = contacts.filter(c=>{if(!c.next_touch)return false;const iso=parseNextTouch(c.next_touch);return iso&&iso<=in7DaysIso;}).sort((a,b)=>{const ia=parseNextTouch(a.next_touch);const ib=parseNextTouch(b.next_touch);return ia>ib?1:-1;});

  const getDayLabel = (iso) => {
    if (iso===todayIso) return "Today";
    const tomorrow = new Date(Date.now()+24*60*60*1000).toISOString().slice(0,10);
    if (iso===tomorrow) return "Tomorrow";
    return new Date(iso+"T00:00:00").toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric"});
  };

  const getGreeting = () => { const h=new Date().getHours(); return h<12?"Good morning":h<17?"Good afternoon":"Good evening"; };

  const filtered = contacts.filter(c=>!search||[c.name,c.company,c.email,c.phone].some(f=>(f||"").toLowerCase().includes(search.toLowerCase())));
  const grouped = filtered.reduce((acc,c)=>{const letter=(c.name[0]||"#").toUpperCase();if(!acc[letter])acc[letter]=[];acc[letter].push({...c,_origIdx:contacts.findIndex(x=>x.id===c.id)});return acc;},{});
  const contact = selected!==null?contacts[selected]:null;
  const dailyVerseIdx = Math.floor(Date.now()/86400000)%GITA_VERSES.length;
  const dailyVerse = GITA_VERSES[dailyVerseIdx];

  if (checkingSession) return (
    <div style={styles.shell}>
      <div style={styles.splashScreen}>
        <div style={styles.splashLogo}>D</div>
        <div style={styles.splashTitle}>DeanBoard</div>
        <div style={styles.splashTagline}>Making the World Better, one DeanTask at a Time</div>
        <div style={styles.splashSpinner}/>
      </div>
    </div>
  );

  if (!session) return (
    <div style={styles.shell}>
      <style>{css}</style>
      <div style={styles.authScreen}>
        <div style={styles.authLogo}>D</div>
        <h1 style={styles.authTitle}>DeanBoard</h1>
        <p style={styles.authSub}>Making the World Better, one DeanTask at a Time</p>
        {authStep==="email" ? (
          <div style={styles.authCard}>
            <p style={styles.authCardTitle}>Sign In</p>
            <p style={styles.authCardSub}>Enter your email and we'll send you a 6-digit code.</p>
            <input style={styles.authInput} type="email" placeholder="your@email.com" value={email} onChange={e=>{setEmail(e.target.value);setAuthError("");}} onKeyDown={e=>e.key==="Enter"&&sendOTP()} autoCapitalize="none" autoCorrect="off"/>
            {authError&&<div style={styles.authError}>{authError}</div>}
            <button style={{...styles.authBtn,opacity:authLoading?0.7:1}} onClick={sendOTP} disabled={authLoading}>{authLoading?"Sending…":"Send Code →"}</button>
          </div>
        ) : (
          <div style={styles.authCard}>
            <p style={styles.authCardTitle}>Enter your code</p>
            <p style={styles.authCardSub}>We sent a 6-digit code to <strong>{email}</strong></p>
            <div style={styles.codeRow} onPaste={handleCodePaste}>
              {code.map((digit,i)=>(
                <input key={i} ref={codeRefs[i]} style={{...styles.codeBox,borderColor:digit?"#1a6fc4":authError?"#c0392b":"#cdd8ea"}} type="text" inputMode="numeric" maxLength={1} value={digit} onChange={e=>handleCodeInput(i,e.target.value)} onKeyDown={e=>handleCodeKeyDown(i,e)} onFocus={e=>e.target.select()}/>
              ))}
            </div>
            {authError&&<div style={{...styles.authError,marginTop:8}}>{authError}</div>}
            <button style={{...styles.authBtn,opacity:authLoading?0.7:1,marginTop:16}} onClick={verifyOTP} disabled={authLoading}>{authLoading?"Verifying…":"Verify Code ✓"}</button>
            <div style={styles.resendRow}>
              {resendCountdown>0?<span style={styles.resendTimer}>Resend in {resendCountdown}s</span>:<button style={styles.resendBtn} onClick={()=>{setCode(["","","","","",""]);sendOTP();}}>Resend code</button>}
              <button style={styles.changeEmailBtn} onClick={()=>{setAuthStep("email");setAuthError("");setCode(["","","","","",""]);}} >Change email</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div style={styles.shell}>
      <style>{css}</style>
      {toast&&<div style={styles.toast}>{toast}</div>}
      {confirmDelete&&(<div style={styles.overlay}><div style={styles.modal}><p style={styles.modalTitle}>Delete Contact?</p><p style={styles.modalSub}>This cannot be undone.</p><div style={{display:"flex",gap:10,marginTop:18}}><button style={styles.btnDanger} onClick={()=>deleteContact(confirmDelete)}>Delete</button><button style={styles.btnSecondary} onClick={()=>setConfirmDelete(null)}>Cancel</button></div></div></div>)}
      {confirmDeleteTouch&&(<div style={styles.overlay}><div style={styles.modal}><p style={styles.modalTitle}>Delete Note?</p><p style={styles.modalSub}>This cannot be undone.</p><div style={{display:"flex",gap:10,marginTop:18}}><button style={styles.btnDanger} onClick={()=>deleteTouchNote(confirmDeleteTouch)}>Delete</button><button style={styles.btnSecondary} onClick={()=>setConfirmDeleteTouch(null)}>Cancel</button></div></div></div>)}
      {confirmDeleteTask&&(<div style={styles.overlay}><div style={styles.modal}><p style={styles.modalTitle}>Delete Task?</p><p style={styles.modalSub}>This cannot be undone.</p><div style={{display:"flex",gap:10,marginTop:18}}><button style={styles.btnDanger} onClick={()=>deleteTask(confirmDeleteTask)}>Delete</button><button style={styles.btnSecondary} onClick={()=>setConfirmDeleteTask(null)}>Cancel</button></div></div></div>)}

      <div style={styles.header}>
        {view!=="list"?(
          <button style={styles.backBtn} onClick={()=>{setAddingNote(false);setNewNote("");setEditingNextTouch(false);setView("list");}}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15,18 9,12 15,6"/></svg>
          </button>
        ):(
          <button style={styles.signOutBtn} onClick={signOut}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
          </button>
        )}
        <span style={styles.headerTitle}>
          {view==="list"?(homeTab==="gita"?"ॐ DeanBoard":homeTab==="prospect"?"🔍 DeanBoard":"DeanBoard"):view==="profile"?contact?.name||"Contact":view==="add"?"New Contact":"Edit Contact"}
        </span>
        {view==="list"&&homeTab!=="gita"&&homeTab!=="prospect"&&(
          <div style={{position:"relative"}}>
            <button style={styles.exportBtn} onClick={e=>{e.stopPropagation();setExportMenuOpen(o=>!o);}}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            </button>
            {exportMenuOpen&&(
              <div style={styles.exportMenu} onClick={e=>e.stopPropagation()}>
                <button style={styles.exportMenuItem} onClick={exportXLSX}><span style={styles.exportMenuIcon}>📊</span><div><div style={styles.exportMenuLabel}>Spreadsheet (.xlsx)</div><div style={styles.exportMenuSub}>Best for Google Sheets</div></div></button>
                <div style={styles.exportMenuDivider}/>
                <button style={styles.exportMenuItem} onClick={exportCSV}><span style={styles.exportMenuIcon}>📄</span><div><div style={styles.exportMenuLabel}>CSV (.csv)</div><div style={styles.exportMenuSub}>Plain text, universal</div></div></button>
              </div>
            )}
          </div>
        )}
        {view==="list"&&(homeTab==="gita"||homeTab==="prospect")&&<div style={{width:36}}/>}
        {view==="profile"&&<button style={styles.exportBtn} onClick={()=>{setEditEntry({...contact});setView("edit");}}><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>}
        {(view==="profile"||view==="add"||view==="edit")&&<button style={styles.homeBtn} onClick={()=>{setAddingNote(false);setNewNote("");setEditingNextTouch(false);setView("list");}}><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg></button>}
      </div>

      {view==="list"&&(
        <div style={styles.tabBar}>
          <button style={{...styles.tab,...(homeTab==="home"?styles.tabActive:{})}} onClick={()=>setHomeTab("home")}>🏠 Home</button>
          <button style={{...styles.tab,...(homeTab==="contacts"?styles.tabActive:{})}} onClick={()=>setHomeTab("contacts")}>Contacts</button>
          <button style={{...styles.tab,...(homeTab==="tasks"?styles.tabActive:{})}} onClick={()=>setHomeTab("tasks")}>
            Tasks{tasks.filter(t=>!t.completed).length>0&&<span style={styles.tabBadge}>{tasks.filter(t=>!t.completed).length}</span>}
          </button>
          <button style={{...styles.tab,...(homeTab==="gita"?styles.tabActive:{})}} onClick={()=>setHomeTab("gita")}>ॐ Gita</button>
          <button style={{...styles.tab,...(homeTab==="prospect"?styles.tabActive:{})}} onClick={()=>setHomeTab("prospect")}>🔍 Pros</button>
        </div>
      )}

      {view==="list"&&homeTab==="home"&&(
        <div style={styles.body}>
          <div style={styles.listScroll}>
            <div style={styles.homeGreeting}>
              <div style={styles.homeGreetingTitle}>{getGreeting()}, Dean</div>
              <div style={styles.homeGreetingDate}>{new Date().toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric",year:"numeric"})}</div>
            </div>
            <div style={styles.homeSectionHeader}><span style={styles.homeSectionTitle}>📋 Upcoming Tasks</span><span style={styles.homeSectionCount}>Next 7 days · {upcomingTasks.length} task{upcomingTasks.length!==1?"s":""}</span></div>
            {upcomingTasks.length===0?(<div style={styles.homeEmpty}><div style={styles.homeEmptyIcon}>🎉</div><div>No tasks due in the next 7 days!</div></div>):(
              Object.keys(tasksByDay).sort().map(dateKey=>(
                <div key={dateKey} style={styles.homeDayGroup}>
                  <div style={styles.homeDayLabel}>{getDayLabel(dateKey)}<div style={styles.homeDayLine}/></div>
                  {tasksByDay[dateKey].map(t=>{
                    const status=taskDueStatus(t.due_date);
                    return(<div key={t.id} style={{...styles.homeTaskCard,borderLeft:status==="overdue"?"3px solid #c0392b":status==="today"?"3px solid #e67e22":"3px solid #1a6fc4"}}>
                      <div style={styles.homeTaskTop}><div style={styles.homeTaskText}>{t.note}</div><span style={{...styles.taskDueChip,...(status==="overdue"?styles.taskDueOverdue:status==="today"?styles.taskDueToday:styles.taskDueUpcoming)}}>{status==="overdue"?`⚠ ${formatTaskDue(t.due_date)}`:status==="today"?"📌 Today":`🗓 ${formatTaskDue(t.due_date)}`}</span></div>
                      <button style={styles.homeTaskCompleteBtn} onClick={()=>completeTask(t.id)}>✓ Mark Complete</button>
                    </div>);
                  })}
                </div>
              ))
            )}
            {upcomingContacts.length>0&&(<>
              <div style={{...styles.homeSectionHeader,marginTop:8}}><span style={styles.homeSectionTitle}>🗓 Next Touch Due</span><span style={styles.homeSectionCount}>Overdue or this week</span></div>
              {upcomingContacts.map(c=>{
                const iso=parseNextTouch(c.next_touch);const status=nextTouchStatus(c.next_touch);const origIdx=contacts.findIndex(x=>x.id===c.id);
                return(<div key={c.id} style={styles.homeTouchCard} onClick={()=>{setSelected(origIdx);setView("profile");}}>
                  <div style={{...styles.avatar,background:avatarColor(c.name),width:36,height:36,fontSize:13}}>{initials(c.name)}</div>
                  <div style={{flex:1,minWidth:0}}><div style={{fontSize:13,fontWeight:600,color:"#0d1b2e"}}>{c.name}</div><div style={{fontSize:11,color:"#888",marginTop:1}}>{c.company||c.email||""}</div></div>
                  <span style={{fontSize:10,fontWeight:700,borderRadius:5,padding:"2px 7px",flexShrink:0,...(status==="overdue"?{color:"#c0392b",background:"#fdecea"}:status==="today"?{color:"#b7580a",background:"#fff3e0"}:{color:"#1a6fc4",background:"#e8f0fc"})}}>{status==="overdue"?"⚠ Overdue":status==="today"?"📌 Today":`🗓 ${formatTaskDue(iso)}`}</span>
                </div>);
              })}
            </>)}
            <div style={{...styles.homeSectionHeader,marginTop:8}}>
              <span style={styles.homeSectionTitle}>ॐ Daily Verse</span>
              <button style={{fontSize:11,color:"#1a6fc4",fontWeight:700,background:"none",border:"none",cursor:"pointer",fontFamily:"inherit",padding:0}} onClick={()=>setHomeTab("gita")}>Open Gita →</button>
            </div>
            <div style={styles.dailyVerseCard} onClick={()=>setHomeTab("gita")}>
              <div style={styles.dailyVerseRef}>BG {dailyVerse.chapter}:{dailyVerse.verse} · {dailyVerse.title}</div>
              <p style={styles.dailyVerseText}>"{dailyVerse.translation.slice(0,110)}…"</p>
            </div>
            <div style={{height:40}}/>
          </div>
        </div>
      )}

      {view==="list"&&homeTab==="contacts"&&(
        <div style={styles.body}>
          <div style={styles.searchWrap}>
            <svg style={styles.searchIcon} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input style={styles.searchInput} placeholder="Search contacts…" value={search} onChange={e=>setSearch(e.target.value)}/>
            {search&&<button style={styles.clearSearch} onClick={()=>setSearch("")}>✕</button>}
          </div>
          {loading?<div style={styles.empty}><div style={styles.splashSpinner}/></div>
          :contacts.length===0?<div style={styles.empty}><div style={styles.emptyIcon}>📋</div><p style={styles.emptyTitle}>No contacts yet</p><p style={styles.emptySub}>Tap + to add your first contact</p></div>
          :filtered.length===0?<div style={styles.empty}><p style={styles.emptyTitle}>No results for "{search}"</p></div>
          :(
            <div style={styles.listScroll}>
              {Object.keys(grouped).sort().map(letter=>(
                <div key={letter}>
                  <div style={styles.sectionHeader}>{letter}</div>
                  {grouped[letter].map(c=>(
                    <div key={c.id} style={styles.contactRow} className="contact-row" onClick={()=>{setSelected(c._origIdx);setView("profile");}}>
                      <div style={{...styles.avatar,background:avatarColor(c.name)}}>{initials(c.name)}</div>
                      <div style={styles.rowInfo}><div style={styles.rowName}>{c.name}</div><div style={styles.rowSub}>{c.company||c.email||c.phone||"—"}</div><NextTouchChip val={c.next_touch}/></div>
                      {(c.touch_log||[]).length>0&&<span style={styles.touchBadge}>{c.touch_log.length}</span>}
                      <svg style={styles.chevron} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9,18 15,12 9,6"/></svg>
                    </div>
                  ))}
                </div>
              ))}
              <div style={{height:90}}/>
            </div>
          )}
          <button style={styles.fab} className="fab" onClick={()=>{setEditEntry({...blankContact(),_isNew:true});setView("add");}}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          </button>
        </div>
      )}

      {view==="list"&&homeTab==="tasks"&&(
        <div style={styles.body}>
          <div style={styles.listScroll}>
            <div style={styles.taskAddPanel}>
              <div style={styles.taskAddTitle}>➕ New Task</div>
              <div style={{marginBottom:8}}><NextTouchInput value={newTaskDate} onChange={setNewTaskDate} inputStyle={{flex:1,padding:"9px 12px",border:"1.5px solid #cdd8ea",borderRadius:10,fontSize:14,color:"#0d1b2e",fontFamily:"inherit",outline:"none",boxSizing:"border-box",background:"#fff"}}/></div>
              <textarea style={styles.taskAddTextarea} placeholder="What needs to be done?" value={newTaskNote} onChange={e=>setNewTaskNote(e.target.value)} rows={2}/>
              <button style={styles.taskAddBtn} onClick={addTask}>Add Task</button>
            </div>
            {(()=>{
              const open=tasks.filter(t=>!t.completed);const done=tasks.filter(t=>t.completed);
              return(<>
                <div style={styles.taskListHeader}><span style={styles.taskListTitle}>📋 Open Tasks ({open.length})</span></div>
                {tasksLoading?<div style={styles.empty}><div style={styles.splashSpinner}/></div>
                :open.length===0?<div style={{padding:"14px 14px 4px",fontSize:13,color:"#aaa",textAlign:"center"}}>No open tasks 🎉</div>
                :open.map(t=>{
                  const status=taskDueStatus(t.due_date);const isEditing=editingTaskId===t.id;
                  return(
                    <div key={t.id} style={{...styles.taskCard,...(isEditing?{border:"1.5px solid #1a6fc4",boxShadow:"0 0 0 3px rgba(26,111,196,0.08)"}:{})}}>
                      <div style={styles.taskCardBody}>
                        {isEditing?(<>
                          <div style={styles.taskEditLabel}>Task note</div>
                          <textarea style={styles.taskEditTextarea} value={taskDraftNote} onChange={e=>setTaskDraftNote(e.target.value)} rows={2} autoFocus/>
                          <div style={{...styles.taskEditLabel,marginTop:8}}>Due date</div>
                          <NextTouchInput value={taskDraftDate} onChange={setTaskDraftDate} inputStyle={{flex:1,padding:"6px 10px",border:"none",outline:"none",fontSize:13,color:"#0d1b2e",fontFamily:"inherit",background:"transparent"}}/>
                          <div style={{display:"flex",gap:6,marginTop:9}}>
                            <button style={styles.taskEditSaveBtn} onClick={()=>saveTaskEdit(t.id)}>Save Changes</button>
                            <button style={styles.taskEditCancelBtn} onClick={()=>setEditingTaskId(null)}>Cancel</button>
                          </div>
                        </>):(<>
                          <div style={styles.taskCardTop}>
                            <div style={styles.taskCardText}>{t.note}</div>
                            <div style={{display:"flex",gap:5,alignItems:"center",flexShrink:0}}>
                              <button style={styles.taskEditBtn} onClick={()=>startEditTask(t)}><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>Edit</button>
                              <button style={styles.taskDeleteBtn} onClick={()=>setConfirmDeleteTask(t.id)}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg></button>
                            </div>
                          </div>
                          <div style={styles.taskCardFooter}>
                            {t.due_date?<span style={{...styles.taskDueChip,...(status==="overdue"?styles.taskDueOverdue:status==="today"?styles.taskDueToday:styles.taskDueUpcoming)}}>{status==="overdue"?`⚠ Due ${formatTaskDue(t.due_date)}`:status==="today"?"📌 Due Today":`🗓 Due ${formatTaskDue(t.due_date)}`}</span>:<span style={styles.taskDueNone}>No due date</span>}
                            <button style={styles.taskCompleteBtn} onClick={()=>completeTask(t.id)}>✓ Mark Complete</button>
                          </div>
                        </>)}
                      </div>
                    </div>
                  );
                })}
                {done.length>0&&(<>
                  <div style={styles.taskListHeader}><span style={{...styles.taskListTitle,color:"#aaa"}}>✓ Completed ({done.length})</span><button style={styles.taskFilterBtn} onClick={()=>setShowCompleted(s=>!s)}>{showCompleted?"Hide ↑":"Show ↓"}</button></div>
                  {showCompleted&&done.map(t=>(
                    <div key={t.id} style={{...styles.taskCard,opacity:0.9,borderColor:"#b0c8e8",background:"#f0f6ff"}}>
                      <div style={styles.taskCardBody}>
                        <div style={styles.taskCardTop}><div style={{...styles.taskCardText,textDecoration:"line-through",color:"#1a6fc4"}}>{t.note}</div><button style={styles.taskDeleteBtn} onClick={()=>setConfirmDeleteTask(t.id)}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg></button></div>
                        <div style={styles.taskCardFooter}><span style={{fontSize:11,color:"#1a6fc4",fontWeight:700}}>✓ Completed {t.completed_at?formatTaskDue(t.completed_at.slice(0,10)):""}</span><button style={styles.taskUndoBtn} onClick={()=>completeTask(t.id,true)}>↩ Undo</button></div>
                      </div>
                    </div>
                  ))}
                </>)}
                <div style={{height:40}}/>
              </>);
            })()}
          </div>
        </div>
      )}

      {view==="list"&&homeTab==="gita"&&<div style={{...styles.body,overflow:"hidden"}}><GitaTab showToast={showToast}/></div>}
      {view==="list"&&homeTab==="prospect"&&<div style={{...styles.body,overflow:"hidden"}}><ProspectAgent/></div>}

      {view==="profile"&&contact&&(
        <div style={styles.body}>
          <div style={styles.profileScroll}>
            <div style={styles.profileHero}>
              <div style={{...styles.avatarLg,background:avatarColor(contact.name)}}>{initials(contact.name)}</div>
              <h2 style={styles.profileName}>{contact.name}</h2>
              {contact.company&&<p style={styles.profileCompany}>{contact.company}</p>}
            </div>
            <div style={styles.card}>
              {[{icon:"📞",label:"Phone",val:contact.phone,href:`tel:${contact.phone}`},{icon:"✉️",label:"Email",val:contact.email,href:`mailto:${contact.email}`},{icon:"📅",label:"Date Added",val:formatDate(contact.date)}].filter(f=>f.val).map(f=>(
                <div key={f.label} style={styles.fieldRow}><span style={styles.fieldIcon}>{f.icon}</span><div style={styles.fieldBody}><div style={styles.fieldLabel}>{f.label}</div>{f.href?<a href={f.href} style={styles.fieldValue}>{f.val}</a>:<div style={styles.fieldValue}>{f.val}</div>}</div></div>
              ))}
              <div style={styles.fieldRow}><span style={styles.fieldIcon}>🗓</span><div style={styles.fieldBody}>
                <div style={styles.fieldLabel}>Next Touch</div>
                {editingNextTouch?(
                  <div style={{marginTop:2}}>
                    <NextTouchInput value={nextTouchDraft} onChange={setNextTouchDraft} inputStyle={{flex:1,border:"1.5px solid #1a6fc4",borderRadius:8,padding:"5px 9px",fontSize:14,background:"#f4f8ff",fontFamily:"inherit",outline:"none",boxSizing:"border-box",width:"100%"}}/>
                    <div style={{display:"flex",gap:6,marginTop:8}}><button style={styles.ntSaveBtn} onClick={saveNextTouch}>Save</button><button style={styles.ntCancelBtn} onClick={()=>setEditingNextTouch(false)}>Cancel</button></div>
                  </div>
                ):(
                  <div style={{display:"flex",alignItems:"center",gap:8,marginTop:2}}>
                    <div style={styles.fieldValue}>{contact.next_touch||<span style={{color:"#aaa"}}>Not set</span>}</div>
                    <button style={styles.ntEditBtn} onClick={()=>{setNextTouchDraft(contact.next_touch||"");setEditingNextTouch(true);}}>Update Next Touch</button>
                  </div>
                )}
              </div></div>
            </div>
            {contact.notes&&<div style={styles.card}><div style={styles.notesLabel}>📝 Notes</div><div style={styles.notesText}>{contact.notes}</div></div>}
            <div style={styles.touchSection}>
              <div style={styles.touchHeader}><span style={styles.touchHeaderTitle}>🤝 Touch Log</span><button style={styles.addNoteBtn} onClick={()=>{setAddingNote(true);setNewNote("");setInlineNextTouch(contact.next_touch||"");}}>+ Add Note</button></div>
              {addingNote&&(
                <div style={styles.addNotePanel}>
                  <div style={styles.addNoteDate}>📅 {formatDateTime(new Date().toISOString())}</div>
                  <textarea style={styles.addNoteTextarea} placeholder="What happened during this touch?" value={newNote} onChange={e=>setNewNote(e.target.value)} rows={3} autoFocus/>
                  <div style={styles.addNoteDivider}><span>also update next touch</span></div>
                  <NextTouchInput value={inlineNextTouch} onChange={setInlineNextTouch} inputStyle={{flex:1,padding:"9px 12px",border:"1.5px solid #cdd8ea",borderRadius:10,fontSize:14,color:"#0d1b2e",fontFamily:"inherit",outline:"none",boxSizing:"border-box",background:"#fff"}}/>
                  <div style={{display:"flex",gap:8,marginTop:10}}><button style={styles.saveNoteBtn} onClick={addTouchNote}>Save Note</button><button style={styles.cancelNoteBtn} onClick={()=>{setAddingNote(false);setNewNote("");setInlineNextTouch("");}}>Cancel</button></div>
                </div>
              )}
              {(contact.touch_log||[]).length===0&&!addingNote?<div style={styles.touchEmpty}>No touch log entries yet. Tap "+ Add Note" to record an interaction.</div>
              :(contact.touch_log||[]).map((touch,i)=>(
                <div key={touch.id} style={{...styles.touchEntry,borderTop:i===0?"none":"1px solid #d6e2f0"}}>
                  <div style={styles.touchEntryHeader}><span style={styles.touchEntryDate}>{formatDateTime(touch.createdAt)}</span><button style={styles.touchDeleteBtn} onClick={()=>setConfirmDeleteTouch({contactId:contact.id,touchId:touch.id})}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg></button></div>
                  <div style={styles.touchEntryText}>{touch.text}</div>
                </div>
              ))}
            </div>
            <button style={styles.btnDangerFull} onClick={()=>setConfirmDelete(contact.id)}>Delete Contact</button>
            <div style={{height:40}}/>
          </div>
        </div>
      )}

      {(view==="add"||view==="edit")&&editEntry&&(
        <div style={styles.body}>
          <div style={styles.formScroll}>
            {[{key:"name",label:"Full Name",placeholder:"Jane Smith",type:"text",required:true},{key:"company",label:"Company",placeholder:"Acme Corp",type:"text"},{key:"phone",label:"Phone",placeholder:"916-213-4051",type:"tel"},{key:"email",label:"Email",placeholder:"jane@acme.com",type:"email"},{key:"date",label:"Date Added",placeholder:"",type:"date"}].map(f=>(
              <div key={f.key} style={styles.formGroup}>
                <label style={styles.formLabel}>{f.label}{f.required&&<span style={styles.required}> *</span>}</label>
                <input style={styles.formInput} type={f.type} placeholder={f.placeholder} value={editEntry[f.key]||""} maxLength={f.key==="phone"?12:undefined} inputMode={f.key==="phone"?"numeric":undefined}
                  onChange={e=>{if(f.key==="phone"){const d=e.target.value.replace(/\D/g,"").slice(0,10);let fmt=d;if(d.length>6)fmt=d.slice(0,3)+"-"+d.slice(3,6)+"-"+d.slice(6);else if(d.length>3)fmt=d.slice(0,3)+"-"+d.slice(3);setEditEntry({...editEntry,phone:fmt});}else setEditEntry({...editEntry,[f.key]:e.target.value});}}/>
                {f.key==="phone"&&<div style={styles.phoneHint}>{(editEntry.phone||"").replace(/\D/g,"").length}/10 digits</div>}
              </div>
            ))}
            <div style={styles.formGroup}><label style={styles.formLabel}>Next Touch Date</label><NextTouchInput value={editEntry.next_touch||""} onChange={v=>setEditEntry({...editEntry,next_touch:v})}/></div>
            <div style={styles.formGroup}><label style={styles.formLabel}>Notes</label><textarea style={styles.formTextarea} placeholder="General notes about this contact…" value={editEntry.notes||""} onChange={e=>setEditEntry({...editEntry,notes:e.target.value})} rows={4}/></div>
            <button style={styles.btnPrimary} onClick={saveEntry}>{view==="add"?"Add Contact":"Save Changes"}</button>
            <button style={styles.btnSecondaryFull} onClick={()=>setView(view==="add"?"list":"profile")}>Cancel</button>
            <div style={{height:40}}/>
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  shell:{width:"100%",height:"100dvh",display:"flex",flexDirection:"column",fontFamily:"'Georgia','Times New Roman',serif",background:"#eef2f8",color:"#0d1b2e",position:"relative",overflow:"hidden",paddingBottom:"env(safe-area-inset-bottom)"},
  header:{background:"#0d1b2e",color:"#eef2f8",paddingTop:"calc(14px + env(safe-area-inset-top))",paddingBottom:"14px",paddingLeft:"max(16px, env(safe-area-inset-left))",paddingRight:"max(16px, env(safe-area-inset-right))",display:"flex",alignItems:"center",gap:10,minHeight:"calc(56px + env(safe-area-inset-top))",flexShrink:0,borderBottom:"2px solid #1a6fc4"},
  headerTitle:{flex:1,fontSize:20,fontWeight:700,letterSpacing:"0.04em",fontFamily:"'Georgia',serif"},
  backBtn:{background:"none",border:"none",color:"#eef2f8",cursor:"pointer",padding:"4px 6px",borderRadius:6,display:"flex",alignItems:"center"},
  signOutBtn:{background:"none",border:"none",color:"#eef2f8",cursor:"pointer",padding:"6px 8px",borderRadius:6,display:"flex",alignItems:"center",opacity:0.75},
  exportBtn:{background:"none",border:"none",color:"#eef2f8",cursor:"pointer",padding:"6px 8px",borderRadius:6,display:"flex",alignItems:"center",opacity:0.85},
  exportMenu:{position:"absolute",top:"calc(100% + 8px)",right:0,background:"#fff",borderRadius:14,boxShadow:"0 8px 32px rgba(0,0,0,0.18)",border:"1px solid #d6e2f0",zIndex:300,minWidth:210,overflow:"hidden"},
  exportMenuItem:{display:"flex",alignItems:"center",gap:12,width:"100%",padding:"13px 16px",background:"none",border:"none",cursor:"pointer",fontFamily:"'Georgia',serif",textAlign:"left"},
  exportMenuIcon:{fontSize:22,flexShrink:0},exportMenuLabel:{fontSize:14,fontWeight:700,color:"#0d1b2e"},exportMenuSub:{fontSize:11,color:"#999",marginTop:1},
  exportMenuDivider:{height:1,background:"#e8f0fa",margin:"0 14px"},
  body:{flex:1,display:"flex",flexDirection:"column",overflow:"hidden",position:"relative"},
  searchWrap:{margin:"12px 14px 4px",background:"#fff",borderRadius:12,display:"flex",alignItems:"center",padding:"8px 12px",gap:8,border:"1.5px solid #cdd8ea",flexShrink:0},
  searchIcon:{flexShrink:0,color:"#888"},searchInput:{flex:1,border:"none",outline:"none",fontSize:15,background:"transparent",fontFamily:"inherit",color:"#0d1b2e"},
  clearSearch:{background:"none",border:"none",cursor:"pointer",color:"#999",fontSize:14,padding:2},
  listScroll:{flex:1,overflowY:"auto",WebkitOverflowScrolling:"touch"},
  sectionHeader:{padding:"10px 16px 4px",fontSize:12,fontWeight:700,color:"#1a6fc4",letterSpacing:"0.12em",textTransform:"uppercase",background:"#eef2f8"},
  contactRow:{display:"flex",alignItems:"center",padding:"10px 16px",gap:12,cursor:"pointer",borderBottom:"1px solid #d6e2f0",background:"#fff",transition:"background 0.12s"},
  avatar:{width:42,height:42,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",fontSize:15,fontWeight:700,color:"#fff",flexShrink:0,letterSpacing:"0.04em"},
  rowInfo:{flex:1,minWidth:0},rowName:{fontSize:16,fontWeight:600,color:"#0d1b2e",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"},
  rowSub:{fontSize:13,color:"#888",marginTop:1,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"},
  touchBadge:{background:"#1a6fc4",color:"#fff",fontSize:11,fontWeight:700,borderRadius:10,padding:"2px 7px",marginRight:4,fontFamily:"sans-serif"},
  chevron:{color:"#ccc",flexShrink:0},
  fab:{position:"absolute",bottom:"calc(24px + env(safe-area-inset-bottom))",right:"max(20px, env(safe-area-inset-right))",width:58,height:58,borderRadius:"50%",background:"#1a6fc4",border:"none",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",boxShadow:"0 4px 20px rgba(26,111,196,0.45)",transition:"transform 0.15s, box-shadow 0.15s",zIndex:10},
  empty:{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:40,textAlign:"center"},
  emptyIcon:{fontSize:52,marginBottom:16},emptyTitle:{fontSize:18,fontWeight:600,color:"#444",marginBottom:6},emptySub:{fontSize:14,color:"#999"},
  profileScroll:{flex:1,overflowY:"auto",WebkitOverflowScrolling:"touch",padding:"0 0 20px"},
  profileHero:{background:"#0d1b2e",padding:"32px 20px 28px",display:"flex",flexDirection:"column",alignItems:"center",gap:10,borderBottom:"2px solid #1a6fc4"},
  avatarLg:{width:78,height:78,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",fontSize:28,fontWeight:700,color:"#fff",letterSpacing:"0.04em"},
  profileName:{fontSize:22,fontWeight:700,color:"#eef2f8",margin:0,textAlign:"center"},profileCompany:{fontSize:14,color:"#8aafd4",margin:0,textAlign:"center"},
  card:{background:"#fff",margin:"14px 14px 0",borderRadius:14,padding:"4px 0",border:"1px solid #d6e2f0",overflow:"hidden"},
  fieldRow:{display:"flex",alignItems:"flex-start",padding:"12px 16px",gap:12,borderBottom:"1px solid #e8f0fa"},
  fieldIcon:{fontSize:18,flexShrink:0,marginTop:1},fieldBody:{flex:1,minWidth:0},
  fieldLabel:{fontSize:11,color:"#1a6fc4",fontWeight:700,letterSpacing:"0.1em",textTransform:"uppercase",marginBottom:2},
  fieldValue:{fontSize:15,color:"#0d1b2e",textDecoration:"none",wordBreak:"break-all"},
  notesLabel:{fontSize:12,color:"#1a6fc4",fontWeight:700,letterSpacing:"0.1em",textTransform:"uppercase",padding:"12px 16px 4px"},
  notesText:{fontSize:14,color:"#444",padding:"0 16px 14px",lineHeight:1.7,whiteSpace:"pre-wrap"},
  touchSection:{margin:"14px 14px 0",background:"#fff",borderRadius:14,border:"1px solid #d6e2f0",overflow:"hidden"},
  touchHeader:{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 16px",borderBottom:"1px solid #d6e2f0",background:"#f4f8ff"},
  touchHeaderTitle:{fontSize:13,fontWeight:700,color:"#1a6fc4",letterSpacing:"0.08em",textTransform:"uppercase"},
  addNoteBtn:{background:"#1a6fc4",color:"#fff",border:"none",borderRadius:8,padding:"6px 12px",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit"},
  addNotePanel:{padding:"14px 16px",borderBottom:"1px solid #d6e2f0",background:"#f0f6ff"},
  addNoteDate:{fontSize:11,color:"#1a6fc4",fontWeight:600,marginBottom:8,letterSpacing:"0.04em"},
  addNoteDivider:{display:"flex",alignItems:"center",gap:8,margin:"10px 0 0",fontSize:10,color:"#999",fontWeight:600,letterSpacing:"0.04em",textTransform:"uppercase"},
  tabBar:{display:"flex",background:"#0d1b2e",borderBottom:"2px solid #1a6fc4",flexShrink:0},
  tab:{flex:1,padding:"10px 0",textAlign:"center",fontSize:10,fontWeight:700,letterSpacing:"0.04em",textTransform:"uppercase",color:"#8aafd4",cursor:"pointer",background:"none",border:"none",borderBottom:"3px solid transparent",fontFamily:"'Georgia',serif",display:"flex",alignItems:"center",justifyContent:"center",gap:3},
  tabActive:{color:"#eef2f8",borderBottom:"3px solid #1a6fc4"},
  tabBadge:{background:"#c0392b",color:"#fff",fontSize:10,fontWeight:700,borderRadius:9,padding:"1px 6px",fontFamily:"sans-serif"},
  homeGreeting:{background:"#0d1b2e",padding:"16px 16px 18px",borderBottom:"1px solid #1a6fc4"},
  homeGreetingTitle:{fontSize:11,fontWeight:700,color:"#8aafd4",textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:4},
  homeGreetingDate:{fontSize:17,fontWeight:700,color:"#eef2f8",letterSpacing:"0.02em"},
  homeSectionHeader:{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 14px 6px"},
  homeSectionTitle:{fontSize:12,fontWeight:700,color:"#1a6fc4",textTransform:"uppercase",letterSpacing:"0.08em"},
  homeSectionCount:{fontSize:11,color:"#888",fontWeight:600},
  homeDayGroup:{margin:"0 12px 8px"},
  homeDayLabel:{fontSize:10,fontWeight:700,color:"#1a6fc4",textTransform:"uppercase",letterSpacing:"0.1em",padding:"6px 4px 4px",display:"flex",alignItems:"center",gap:6},
  homeDayLine:{flex:1,height:1,background:"#d6e2f0"},
  homeTaskCard:{background:"#fff",borderRadius:10,border:"1px solid #d6e2f0",marginBottom:6,padding:"10px 12px"},
  homeTaskTop:{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:8},
  homeTaskText:{fontSize:13,color:"#0d1b2e",lineHeight:1.5,flex:1},
  homeTaskCompleteBtn:{marginTop:8,fontSize:11,fontWeight:700,padding:"4px 10px",borderRadius:7,border:"none",background:"#1a6fc4",color:"#fff",cursor:"pointer",fontFamily:"inherit"},
  homeTouchCard:{background:"#fff",borderRadius:10,border:"1px solid #d6e2f0",borderLeft:"3px solid #1a6fc4",margin:"0 12px 6px",padding:"10px 12px",display:"flex",alignItems:"center",gap:10,cursor:"pointer"},
  homeEmpty:{padding:"28px 20px",textAlign:"center",fontSize:13,color:"#aaa",lineHeight:1.7},
  homeEmptyIcon:{fontSize:36,marginBottom:10},
  dailyVerseCard:{margin:"0 12px 8px",background:"#fff",border:"1px solid #d6e2f0",borderLeft:"3px solid #1a6fc4",borderRadius:10,padding:"12px 14px",cursor:"pointer"},
  dailyVerseRef:{fontSize:10,fontWeight:700,color:"#1a6fc4",letterSpacing:"0.1em",textTransform:"uppercase",marginBottom:6},
  dailyVerseText:{margin:0,fontSize:13,color:"#3a4a5a",lineHeight:1.7,fontFamily:"'Georgia',serif",fontStyle:"italic"},
  taskAddPanel:{margin:"12px 14px 0",background:"#fff",borderRadius:14,border:"1.5px solid #1a6fc4",padding:"13px 14px"},
  taskAddTitle:{fontSize:12,fontWeight:700,color:"#1a6fc4",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:10},
  taskAddTextarea:{width:"100%",padding:"9px 12px",border:"1.5px solid #cdd8ea",borderRadius:10,fontSize:14,color:"#0d1b2e",fontFamily:"inherit",outline:"none",boxSizing:"border-box",resize:"none",lineHeight:1.5,background:"#f8faff",marginTop:2},
  taskAddBtn:{display:"block",width:"100%",marginTop:10,padding:"10px",background:"#1a6fc4",border:"none",color:"#fff",borderRadius:10,fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:"inherit"},
  taskListHeader:{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 16px 4px"},
  taskListTitle:{fontSize:12,fontWeight:700,color:"#1a6fc4",textTransform:"uppercase",letterSpacing:"0.08em"},
  taskFilterBtn:{fontSize:12,color:"#888",fontWeight:600,background:"none",border:"none",cursor:"pointer",fontFamily:"inherit"},
  taskCard:{margin:"6px 14px 0",background:"#fff",borderRadius:12,border:"1px solid #d6e2f0",overflow:"hidden"},
  taskCardBody:{padding:"11px 13px"},
  taskCardTop:{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:8},
  taskCardText:{fontSize:14,color:"#0d1b2e",lineHeight:1.5,flex:1},
  taskDeleteBtn:{background:"none",border:"none",cursor:"pointer",color:"#ccc",padding:"2px 4px",display:"flex",alignItems:"center",flexShrink:0,borderRadius:4},
  taskCardFooter:{display:"flex",alignItems:"center",justifyContent:"space-between",marginTop:9},
  taskDueChip:{fontSize:11,fontWeight:700,borderRadius:6,padding:"2px 8px"},
  taskDueOverdue:{color:"#c0392b",background:"#fdecea"},taskDueToday:{color:"#b7580a",background:"#fff3e0"},taskDueUpcoming:{color:"#1a6fc4",background:"#e8f0fc"},
  taskDueNone:{fontSize:11,color:"#aaa",fontWeight:600},
  taskCompleteBtn:{fontSize:12,fontWeight:700,padding:"5px 12px",borderRadius:8,cursor:"pointer",fontFamily:"inherit",border:"none",background:"#1a6fc4",color:"#fff"},
  taskUndoBtn:{fontSize:12,fontWeight:700,padding:"5px 12px",borderRadius:8,cursor:"pointer",fontFamily:"inherit",background:"#e8f0fc",color:"#1a6fc4",border:"1px solid #b0c8e8"},
  taskEditBtn:{background:"none",border:"1.5px solid #1a6fc4",borderRadius:6,cursor:"pointer",color:"#1a6fc4",padding:"3px 7px",fontSize:10,fontWeight:700,display:"flex",alignItems:"center",gap:3,fontFamily:"inherit",whiteSpace:"nowrap"},
  taskEditLabel:{fontSize:9,fontWeight:700,color:"#1a6fc4",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:4},
  taskEditTextarea:{width:"100%",padding:"7px 9px",border:"1.5px solid #cdd8ea",borderRadius:8,fontSize:13,color:"#0d1b2e",fontFamily:"inherit",resize:"none",outline:"none",lineHeight:1.5,background:"#f8faff",boxSizing:"border-box"},
  taskEditSaveBtn:{flex:1,padding:"8px",background:"#1a6fc4",border:"none",color:"#fff",borderRadius:8,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit"},
  taskEditCancelBtn:{flex:1,padding:"8px",background:"transparent",border:"1.5px solid #b0c4de",color:"#666",borderRadius:8,fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit"},
  ntEditBtn:{background:"#1a6fc4",color:"#fff",border:"none",borderRadius:7,padding:"4px 10px",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap",flexShrink:0},
  ntSaveBtn:{background:"#1a6fc4",color:"#fff",border:"none",borderRadius:7,padding:"5px 12px",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap",flexShrink:0},
  ntCancelBtn:{background:"none",border:"1.5px solid #cdd8ea",color:"#888",borderRadius:7,padding:"5px 8px",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit",flexShrink:0},
  addNoteTextarea:{width:"100%",padding:"10px 12px",border:"1.5px solid #cdd8ea",borderRadius:10,fontSize:14,color:"#0d1b2e",fontFamily:"inherit",outline:"none",boxSizing:"border-box",resize:"vertical",lineHeight:1.6,background:"#fff"},
  saveNoteBtn:{flex:1,padding:"10px",background:"#1a6fc4",border:"none",color:"#fff",borderRadius:9,fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:"inherit"},
  cancelNoteBtn:{flex:1,padding:"10px",background:"transparent",border:"1.5px solid #b0c4de",color:"#666",borderRadius:9,fontSize:14,fontWeight:600,cursor:"pointer",fontFamily:"inherit"},
  touchEmpty:{padding:"16px",fontSize:13,color:"#999",textAlign:"center",lineHeight:1.6},
  touchEntry:{padding:"12px 16px"},
  touchEntryHeader:{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6},
  touchEntryDate:{fontSize:11,color:"#1a6fc4",fontWeight:600,letterSpacing:"0.03em"},
  touchDeleteBtn:{background:"none",border:"none",cursor:"pointer",color:"#bbb",padding:"2px 4px",display:"flex",alignItems:"center",borderRadius:4},
  touchEntryText:{fontSize:14,color:"#1c2a3a",lineHeight:1.65,whiteSpace:"pre-wrap"},
  btnDangerFull:{display:"block",width:"calc(100% - 28px)",margin:"14px 14px 0",padding:"13px",background:"transparent",border:"1.5px solid #c0392b",color:"#c0392b",borderRadius:12,fontSize:15,fontWeight:600,cursor:"pointer",fontFamily:"inherit"},
  formScroll:{flex:1,overflowY:"auto",WebkitOverflowScrolling:"touch",padding:"16px 14px"},
  formGroup:{marginBottom:14},
  formLabel:{display:"block",fontSize:12,color:"#1a6fc4",fontWeight:700,letterSpacing:"0.1em",textTransform:"uppercase",marginBottom:5},
  required:{color:"#c0392b"},
  formInput:{width:"100%",padding:"12px 14px",background:"#fff",border:"1.5px solid #cdd8ea",borderRadius:10,fontSize:15,color:"#0d1b2e",fontFamily:"inherit",outline:"none",boxSizing:"border-box",transition:"border-color 0.15s"},
  formTextarea:{width:"100%",padding:"12px 14px",background:"#fff",border:"1.5px solid #cdd8ea",borderRadius:10,fontSize:15,color:"#0d1b2e",fontFamily:"inherit",outline:"none",boxSizing:"border-box",resize:"vertical",lineHeight:1.6},
  btnPrimary:{display:"block",width:"100%",padding:"14px",background:"#1a6fc4",border:"none",color:"#fff",borderRadius:12,fontSize:16,fontWeight:700,cursor:"pointer",fontFamily:"inherit",marginBottom:10},
  btnSecondaryFull:{display:"block",width:"100%",padding:"13px",background:"transparent",border:"1.5px solid #b0c4de",color:"#666",borderRadius:12,fontSize:15,fontWeight:600,cursor:"pointer",fontFamily:"inherit"},
  btnSecondary:{flex:1,padding:"12px",background:"transparent",border:"1.5px solid #b0c4de",color:"#555",borderRadius:10,fontSize:15,fontWeight:600,cursor:"pointer",fontFamily:"inherit"},
  btnDanger:{flex:1,padding:"12px",background:"#c0392b",border:"none",color:"#fff",borderRadius:10,fontSize:15,fontWeight:700,cursor:"pointer",fontFamily:"inherit"},
  toast:{position:"absolute",bottom:"calc(94px + env(safe-area-inset-bottom))",left:"50%",transform:"translateX(-50%)",background:"#0d1b2e",color:"#eef2f8",padding:"10px 20px",borderRadius:30,fontSize:13,fontWeight:600,zIndex:100,whiteSpace:"nowrap",boxShadow:"0 4px 20px rgba(0,0,0,0.3)"},
  overlay:{position:"absolute",inset:0,background:"rgba(0,0,0,0.5)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:200,padding:30},
  modal:{background:"#fff",borderRadius:16,padding:"24px 22px",width:"100%",maxWidth:320,textAlign:"center"},
  modalTitle:{fontSize:18,fontWeight:700,color:"#0d1b2e",margin:"0 0 6px"},modalSub:{fontSize:14,color:"#888",margin:0},
  phoneHint:{fontSize:11,color:"#1560e8",marginTop:4,textAlign:"right"},
  splashScreen:{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",background:"#0d1b2e",gap:16},
  splashLogo:{width:72,height:72,borderRadius:20,background:"#1a6fc4",display:"flex",alignItems:"center",justifyContent:"center",fontSize:36,fontWeight:700,color:"#fff",fontFamily:"'Georgia',serif"},
  splashTitle:{fontSize:24,fontWeight:700,color:"#eef2f8",fontFamily:"'Georgia',serif",letterSpacing:"0.04em"},
  splashTagline:{fontSize:12,color:"#8aafd4",textAlign:"center",maxWidth:260,lineHeight:1.6,fontStyle:"italic"},
  splashSpinner:{width:28,height:28,border:"3px solid rgba(255,255,255,0.2)",borderTop:"3px solid #1a6fc4",borderRadius:"50%",animation:"spin 0.8s linear infinite"},
  authScreen:{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",background:"#0d1b2e",padding:"30px 24px",paddingTop:"calc(30px + env(safe-area-inset-top))"},
  authLogo:{width:68,height:68,borderRadius:18,background:"#1a6fc4",display:"flex",alignItems:"center",justifyContent:"center",fontSize:34,fontWeight:700,color:"#fff",fontFamily:"'Georgia',serif",marginBottom:12},
  authTitle:{fontSize:26,fontWeight:700,color:"#eef2f8",margin:"0 0 6px",fontFamily:"'Georgia',serif"},
  authSub:{fontSize:13,color:"#8aafd4",margin:"0 0 32px",textAlign:"center",lineHeight:1.6,fontStyle:"italic",maxWidth:260},
  authCard:{background:"#fff",borderRadius:18,padding:"24px 20px",width:"100%",maxWidth:360},
  authCardTitle:{fontSize:17,fontWeight:700,color:"#0d1b2e",margin:"0 0 8px",textAlign:"center"},
  authCardSub:{fontSize:13,color:"#666",margin:"0 0 18px",textAlign:"center",lineHeight:1.6},
  authInput:{width:"100%",padding:"13px 14px",border:"1.5px solid #cdd8ea",borderRadius:10,fontSize:15,color:"#0d1b2e",fontFamily:"inherit",outline:"none",boxSizing:"border-box",marginBottom:10},
  authError:{fontSize:13,color:"#c0392b",textAlign:"center"},
  authBtn:{display:"block",width:"100%",padding:"14px",background:"#1a6fc4",border:"none",color:"#fff",borderRadius:12,fontSize:16,fontWeight:700,cursor:"pointer",fontFamily:"inherit"},
  codeRow:{display:"flex",gap:8,justifyContent:"center",margin:"4px 0 0"},
  codeBox:{width:42,height:52,textAlign:"center",fontSize:22,fontWeight:700,color:"#0d1b2e",border:"2px solid #cdd8ea",borderRadius:10,outline:"none",fontFamily:"'Georgia',serif",background:"#f8faff",transition:"border-color 0.15s"},
  homeBtn:{background:"none",border:"none",color:"#eef2f8",cursor:"pointer",padding:"6px 8px",borderRadius:6,display:"flex",alignItems:"center",opacity:0.85,marginLeft:2},
  resendRow:{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:14},
  resendTimer:{fontSize:12,color:"#999"},
  resendBtn:{fontSize:13,color:"#1a6fc4",background:"none",border:"none",cursor:"pointer",fontFamily:"inherit",fontWeight:600,padding:0},
  changeEmailBtn:{fontSize:13,color:"#888",background:"none",border:"none",cursor:"pointer",fontFamily:"inherit",padding:0},
};

const css = `
@keyframes spin { to { transform: rotate(360deg); } }
.contact-row:hover { background: #f0f5fc !important; }
.fab:hover { transform: scale(1.07); box-shadow: 0 6px 28px rgba(26,111,196,0.55) !important; }
input[type="date"] { color-scheme: light; }
input:focus, textarea:focus { border-color: #1a6fc4 !important; }
::-webkit-scrollbar { width: 4px; }
::-webkit-scrollbar-thumb { background: #a8bcd4; border-radius: 4px; }
html, body { overscroll-behavior: none; overflow: hidden; height: 100%; background: #0d1b2e; }
body { -webkit-user-select: none; user-select: none; }
input, textarea { -webkit-user-select: text; user-select: text; }
* { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
button:hover { opacity: 0.85; }
`;
