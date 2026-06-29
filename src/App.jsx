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
    " \u00b7 " + dt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
};

const initials = (name) => name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();

const avatarColor = (name) => {
  const colors = ["#2563eb","#1e40af","#2563eb","#1e3a8a","#3b82f6","#1d4ed8","#2563eb"];
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
  const d = new Date(); const today = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  if (iso < today) return "overdue";
  if (iso === today) return "today";
  return "upcoming";
};

const taskDueStatus = (due_date) => {
  if (!due_date) return null;
  const d = new Date(); const today = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
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
    ? { display:"inline-block", marginTop:4, fontSize:11, fontWeight:600, color:"#dc2626", background:"#fef2f2", borderRadius:6, padding:"2px 8px", border:"1px solid #fecaca" }
    : status === "today"
    ? { display:"inline-block", marginTop:4, fontSize:11, fontWeight:600, color:"#d97706", background:"#fffbeb", borderRadius:6, padding:"2px 8px", border:"1px solid #fde68a" }
    : { display:"inline-block", marginTop:4, fontSize:11, fontWeight:600, color:"#2563eb", background:"#eff6ff", borderRadius:6, padding:"2px 8px", border:"1px solid #dbeafe" };
  const label = status === "overdue" ? `\u26a0 Overdue \u00b7 ${val}` : status === "today" ? `\ud83d\udccc Today \u00b7 ${val}` : `\ud83d\uddd3 ${val}`;
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
        <button style={calStyles.nav} onClick={prevMonth}>&lsaquo;</button>
        <span style={calStyles.month}>{MONTHS[view.m]} {view.y}</span>
        <button style={calStyles.nav} onClick={nextMonth}>&rsaquo;</button>
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
  wrap: { background:"rgba(13,28,57,0.98)", backdropFilter:"blur(16px)", border:"1px solid rgba(59,130,246,0.25)", borderRadius:10, overflow:"hidden", marginTop:6, boxShadow:"0 4px 16px rgba(26,111,196,0.15)", maxWidth:280 },
  header: { background:"#0f1f3d", display:"flex", alignItems:"center", justifyContent:"space-between", padding:"6px 10px" },
  nav: { background:"none", border:"none", color:"#f0f4f8", cursor:"pointer", fontSize:15, padding:"0 4px", lineHeight:1, fontFamily:"inherit" },
  month: { fontSize:12, fontWeight:700, color:"#f0f4f8", letterSpacing:"0.04em", fontFamily:"inherit" },
  grid: { padding:"4px 6px 6px" },
  dayNames: { display:"grid", gridTemplateColumns:"repeat(7,1fr)", marginBottom:2 },
  dayName: { fontSize:8, fontWeight:700, color:"#3b82f6", textAlign:"center", textTransform:"uppercase", letterSpacing:"0.06em", padding:"2px 0" },
  days: { display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:1 },
  day: { aspectRatio:"1", display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, color:"#e2e8f0", borderRadius:"50%", cursor:"pointer", fontFamily:"inherit" },
  daySelected: { background:"#2563eb", color:"#fff", fontWeight:700 },
  dayToday: { border:"1.5px solid #3b82f6", color:"#2563eb", fontWeight:700 },
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
        <button style={{ width:36, height:36, background:"#2563eb", border:"none", borderRadius:9, display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer", flexShrink:0 }} onClick={() => setCalOpen(o => !o)} title="Pick from calendar" type="button">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
        </button>
        <input style={inputStyle || { flex:1, padding:"10px 12px", border:"1px solid rgba(255,255,255,0.12)", borderRadius:10, fontSize:15, color:"#e2e8f0", fontFamily:"inherit", outline:"none", boxSizing:"border-box", background:"rgba(255,255,255,0.05)" }}
          type="text" placeholder="MM/DD/YYYY" value={value} maxLength={10} inputMode="numeric"
          onChange={handleTextChange} onFocus={() => setCalOpen(false)}
        />
      </div>
      {value && (
        <div style={{ fontSize:11, marginTop:4, fontWeight:600 }}>
          {status === "overdue" && <span style={{color:"#f87171"}}>&warning; This date is in the past</span>}
          {status === "today" && <span style={{color:"#fcd34d"}}>Today</span>}
          {status === "upcoming" && <span style={{color:"#60a5fa"}}>&#10003; Upcoming</span>}
        </div>
      )}
      {calOpen && <MiniCalendar value={value} onChange={(v) => { onChange(v); setCalOpen(false); }} onClose={() => setCalOpen(false)}/>}
    </div>
  );
}

const HEALTH_CATEGORIES = [
  { id:"exercise", label:"Exercise", emoji:"🏃", color:"#10b981", bg:"rgba(16,185,129,0.12)", border:"rgba(16,185,129,0.3)" },
  { id:"nutrition", label:"Nutrition", emoji:"🥗", color:"#f59e0b", bg:"rgba(245,158,11,0.12)", border:"rgba(245,158,11,0.3)" },
  { id:"sleep", label:"Sleep", emoji:"😴", color:"#8b5cf6", bg:"rgba(139,92,246,0.12)", border:"rgba(139,92,246,0.3)" },
  { id:"appointment", label:"Appointment", emoji:"🩺", color:"#3b82f6", bg:"rgba(59,130,246,0.12)", border:"rgba(59,130,246,0.3)" },
  { id:"general", label:"General", emoji:"📝", color:"#94a3b8", bg:"rgba(148,163,184,0.12)", border:"rgba(148,163,184,0.3)" },
];
const getCat = (id) => HEALTH_CATEGORIES.find(c => c.id === id) || HEALTH_CATEGORIES[4];

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
  const [importModal, setImportModal] = useState(false);
  const [importPreview, setImportPreview] = useState(null);
  const [importLoading, setImportLoading] = useState(false);
  const [importDone, setImportDone] = useState(null);
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
  // Health state
  const [healthNotes, setHealthNotes] = useState([]);
  const [healthLoading, setHealthLoading] = useState(false);
  const [newHealthNote, setNewHealthNote] = useState("");
  const [newHealthDate, setNewHealthDate] = useState("");
  const [newHealthCategory, setNewHealthCategory] = useState("general");
  const [confirmDeleteHealth, setConfirmDeleteHealth] = useState(null);
  const [showCompletedHealth, setShowCompletedHealth] = useState(false);
  const [editingHealthId, setEditingHealthId] = useState(null);
  const [healthDraftNote, setHealthDraftNote] = useState("");
  const [healthDraftDate, setHealthDraftDate] = useState("");
  const [healthDraftCategory, setHealthDraftCategory] = useState("general");

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(""), 2500); };

  useEffect(() => {
    const metas = [
      { name:"apple-mobile-web-app-capable", content:"yes" },
      { name:"apple-mobile-web-app-status-bar-style", content:"black-translucent" },
      { name:"apple-mobile-web-app-title", content:"DeanBoard" },
      { name:"theme-color", content:"#0f1f3d" },
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

  useEffect(() => { if (session && userId) { fetchContacts(); fetchTasks(); fetchHealthNotes(); } }, [session, userId]);
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

  const fetchHealthNotes = async () => {
    setHealthLoading(true);
    try {
      const res = await api("health_notes?order=due_date.asc,created_at.desc", { token: session.access_token, prefer:"" });
      if (res.ok) { const data = await res.json(); setHealthNotes(data); }
    } catch {}
    setHealthLoading(false);
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
      showToast(undo ? "Task reopened" : "Task completed! &#10003;");
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

  // Health CRUD
  const addHealthNote = async () => {
    if (!newHealthNote.trim()) return showToast("Note is required");
    const isoDate = newHealthDate.trim() ? parseNextTouch(newHealthDate.trim()) || null : null;
    const payload = { note: newHealthNote.trim(), category: newHealthCategory, due_date: isoDate, completed: false, completed_at: null, user_id: userId };
    try {
      const res = await api("health_notes", { method:"POST", token: session.access_token, body: JSON.stringify(payload) });
      if (res.ok) {
        const created = await res.json();
        const h = Array.isArray(created) ? created[0] : created;
        setHealthNotes(prev => [...prev, h].sort((a,b) => (a.due_date||"9999") > (b.due_date||"9999") ? 1 : -1));
        setNewHealthNote(""); setNewHealthDate(""); setNewHealthCategory("general"); showToast("Health note added!");
      } else showToast("Error saving note");
    } catch { showToast("Error saving note"); }
  };

  const completeHealthNote = async (id, undo = false) => {
    const patch = { completed: !undo, completed_at: !undo ? new Date().toISOString() : null };
    try {
      await api(`health_notes?id=eq.${id}`, { method:"PATCH", token: session.access_token, prefer:"", body: JSON.stringify(patch) });
      setHealthNotes(prev => prev.map(h => h.id === id ? { ...h, ...patch } : h));
      showToast(undo ? "Reopened" : "Done!");
    } catch { showToast("Error updating"); }
  };

  const deleteHealthNote = async (id) => {
    try { await api(`health_notes?id=eq.${id}`, { method:"DELETE", token: session.access_token, prefer:"" }); setHealthNotes(prev => prev.filter(h => h.id !== id)); } catch {}
    setConfirmDeleteHealth(null); showToast("Deleted");
  };

  const saveHealthEdit = async (id) => {
    if (!healthDraftNote.trim()) return showToast("Note is required");
    const isoDate = healthDraftDate.trim() ? parseNextTouch(healthDraftDate.trim()) || null : null;
    const patch = { note: healthDraftNote.trim(), due_date: isoDate, category: healthDraftCategory };
    try {
      await api(`health_notes?id=eq.${id}`, { method:"PATCH", token: session.access_token, prefer:"", body: JSON.stringify(patch) });
      setHealthNotes(prev => prev.map(h => h.id === id ? { ...h, ...patch } : h));
      setEditingHealthId(null); showToast("Updated!");
    } catch { showToast("Error updating"); }
  };

  const startEditHealth = (h) => {
    setEditingHealthId(h.id); setHealthDraftNote(h.note); setHealthDraftCategory(h.category || "general");
    if (h.due_date) { const [yyyy,mm,dd] = h.due_date.slice(0,10).split("-"); setHealthDraftDate(`${mm}/${dd}/${yyyy}`); }
    else setHealthDraftDate("");
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

  const parseCSVLine = (line) => {
    const result = []; let cur = ""; let inQuote = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { if (inQuote && line[i+1] === '"') { cur += '"'; i++; } else inQuote = !inQuote; }
      else if (ch === "," && !inQuote) { result.push(cur); cur = ""; }
      else cur += ch;
    }
    result.push(cur);
    return result.map(s => s.trim());
  };

  const handleImportFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target.result;
      const lines = text.split(/\r?\n/).filter(l => l.trim());
      if (lines.length < 2) return showToast("CSV appears empty");
      const headers = parseCSVLine(lines[0]).map(h => h.toLowerCase().replace(/[^a-z0-9]/g,""));
      const map = {
        name: headers.findIndex(h => h.includes("name") && !h.includes("company") && !h.includes("contact")),
        company: headers.findIndex(h => h.includes("company") || h.includes("firm") || h.includes("org")),
        phone: headers.findIndex(h => h.includes("phone") || h.includes("mobile") || h.includes("tel")),
        email: headers.findIndex(h => h.includes("email") || h.includes("mail")),
        notes: headers.findIndex(h => h.includes("note") || h.includes("comment") || h.includes("memo")),
        next_touch: headers.findIndex(h => h.includes("nexttouch") || h.includes("followup") || h.includes("next")),
      };
      if (map.name === -1) map.name = 0;
      const preview = lines.slice(1, 6).map(line => {
        const cols = parseCSVLine(line);
        return { name: cols[map.name]||"", company: map.company>=0?cols[map.company]||"":"", phone: map.phone>=0?cols[map.phone]||"":"", email: map.email>=0?cols[map.email]||"":"", notes: map.notes>=0?cols[map.notes]||"":"", next_touch: map.next_touch>=0?cols[map.next_touch]||"":"" };
      }).filter(r => r.name);
      const allRows = lines.slice(1).map(line => {
        const cols = parseCSVLine(line);
        return { name: cols[map.name]||"", company: map.company>=0?cols[map.company]||"":"", phone: map.phone>=0?cols[map.phone]||"":"", email: map.email>=0?cols[map.email]||"":"", notes: map.notes>=0?cols[map.notes]||"":"", next_touch: map.next_touch>=0?cols[map.next_touch]||"":"", date: new Date().toISOString().slice(0,10), touch_log: [] };
      }).filter(r => r.name);
      setImportPreview({ preview, allRows, total: allRows.length });
      setImportModal(true);
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const runImport = async () => {
    if (!importPreview?.allRows?.length) return;
    setImportLoading(true);
    let added = 0; let skipped = 0;
    const existingNames = new Set(contacts.map(c => c.name.toLowerCase().trim()));
    for (const row of importPreview.allRows) {
      if (!row.name.trim()) { skipped++; continue; }
      if (existingNames.has(row.name.toLowerCase().trim())) { skipped++; continue; }
      try {
        const payload = { ...row, user_id: userId };
        const res = await api("contacts", { method:"POST", token: session.access_token, body: JSON.stringify(payload) });
        if (res.ok) { const created = await res.json(); const nc = Array.isArray(created)?created[0]:created; existingNames.add(nc.name.toLowerCase().trim()); added++; } else skipped++;
      } catch { skipped++; }
    }
    await fetchContacts();
    setImportLoading(false); setImportModal(false); setImportPreview([]);
    setImportDone({ added, skipped }); setTimeout(() => setImportDone(null), 4000);
  };

  const todayIso = new Date().toISOString().slice(0,10);
  const in7DaysIso = new Date(Date.now()+7*24*60*60*1000).toISOString().slice(0,10);
  const upcomingTasks = tasks.filter(t=>!t.completed&&t.due_date&&t.due_date<=in7DaysIso).sort((a,b)=>a.due_date>b.due_date?1:-1);
  const upcomingContacts = contacts.filter(c=>{if(!c.next_touch)return false;const iso=parseNextTouch(c.next_touch);return iso&&iso<=in7DaysIso;}).sort((a,b)=>{const ia=parseNextTouch(a.next_touch);const ib=parseNextTouch(b.next_touch);return ia>ib?1:-1;});
  const getGreeting = () => { const h=new Date().getHours(); return h<12?"Good morning":h<17?"Good afternoon":"Good evening"; };
  const filtered = contacts.filter(c=>!search||[c.name,c.company,c.email,c.phone].some(f=>(f||"").toLowerCase().includes(search.toLowerCase())));
  const grouped = filtered.reduce((acc,c)=>{const letter=(c.name[0]||"#").toUpperCase();if(!acc[letter])acc[letter]=[];acc[letter].push({...c,_origIdx:contacts.findIndex(x=>x.id===c.id)});return acc;},{});
  const contact = selected!==null?contacts[selected]:null;
  const healthOverdueCount = healthNotes.filter(h=>!h.completed&&taskDueStatus(h.due_date)==="overdue").length;

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
            <button style={{...styles.authBtn,opacity:authLoading?0.7:1}} onClick={sendOTP} disabled={authLoading}>{authLoading?"Sending...":"Send Code"}</button>
          </div>
        ) : (
          <div style={styles.authCard}>
            <p style={styles.authCardTitle}>Enter your code</p>
            <p style={styles.authCardSub}>We sent a 6-digit code to <strong>{email}</strong></p>
            <div style={styles.codeRow} onPaste={handleCodePaste}>
              {code.map((digit,i)=>(
                <input key={i} ref={codeRefs[i]} style={{...styles.codeBox,borderColor:digit?"#2563eb":authError?"#dc2626":"#e2e8f0"}} type="text" inputMode="numeric" maxLength={1} value={digit} onChange={e=>handleCodeInput(i,e.target.value)} onKeyDown={e=>handleCodeKeyDown(i,e)} onFocus={e=>e.target.select()}/>
              ))}
            </div>
            {authError&&<div style={{...styles.authError,marginTop:8}}>{authError}</div>}
            <button style={{...styles.authBtn,opacity:authLoading?0.7:1,marginTop:16}} onClick={verifyOTP} disabled={authLoading}>{authLoading?"Verifying...":"Verify Code"}</button>
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

      {exportMenuOpen&&(
        <div style={{position:"fixed",top:60,right:16,background:"rgba(13,28,57,0.98)",backdropFilter:"blur(20px)",borderRadius:14,boxShadow:"0 20px 60px rgba(0,0,0,0.6)",border:"1px solid rgba(59,130,246,0.2)",zIndex:9999,minWidth:230,overflow:"hidden"}} onClick={e=>e.stopPropagation()}>
          <button style={styles.exportMenuItem} onClick={exportXLSX}><span style={styles.exportMenuIcon}>📊</span><div><div style={styles.exportMenuLabel}>Spreadsheet (.xlsx)</div><div style={styles.exportMenuSub}>Best for Google Sheets</div></div></button>
          <div style={styles.exportMenuDivider}/>
          <button style={styles.exportMenuItem} onClick={exportCSV}><span style={styles.exportMenuIcon}>📄</span><div><div style={styles.exportMenuLabel}>CSV (.csv)</div><div style={styles.exportMenuSub}>Plain text, universal</div></div></button>
          <div style={styles.exportMenuDivider}/>
          <label style={{...styles.exportMenuItem,cursor:"pointer"}}>
            <span style={styles.exportMenuIcon}>📥</span>
            <div><div style={styles.exportMenuLabel}>Import CSV</div><div style={styles.exportMenuSub}>Add contacts from file</div></div>
            <input type="file" accept=".csv" style={{display:"none"}} onChange={e=>{setExportMenuOpen(false);handleImportFile(e);}}/>
          </label>
        </div>
      )}

      {importDone&&(
        <div style={{position:"absolute",bottom:"calc(94px + env(safe-area-inset-bottom))",left:"50%",transform:"translateX(-50%)",background:"#0f1f3d",color:"#f0f4f8",padding:"10px 20px",borderRadius:30,fontSize:13,fontWeight:600,zIndex:100,whiteSpace:"nowrap",boxShadow:"0 4px 20px rgba(0,0,0,0.3)"}}>
          Imported {importDone.added} contact{importDone.added!==1?"s":""}{importDone.skipped>0?` · ${importDone.skipped} skipped`:""}
        </div>
      )}

      {importModal&&importPreview?.allRows&&(
        <div style={styles.overlay}>
          <div style={{background:"rgba(13,28,57,0.98)",backdropFilter:"blur(16px)",borderRadius:16,padding:"22px 20px",width:"100%",maxWidth:360,maxHeight:"80vh",overflowY:"auto",border:"1px solid rgba(59,130,246,0.2)",boxShadow:"0 24px 64px rgba(0,0,0,0.5)"}}>
            <p style={{fontSize:17,fontWeight:700,color:"#e2e8f0",margin:"0 0 4px"}}>Import Contacts</p>
            <p style={{fontSize:13,color:"rgba(148,163,184,0.7)",margin:"0 0 14px"}}>{importPreview.total} contact{importPreview.total!==1?"s":""} found. Preview (first 5):</p>
            <div style={{background:"rgba(255,255,255,0.04)",borderRadius:10,padding:"10px 12px",marginBottom:14,border:"1px solid rgba(255,255,255,0.08)"}}>
              {importPreview.preview.map((r,i)=>(
                <div key={i} style={{borderBottom:i<importPreview.preview.length-1?"1px solid rgba(255,255,255,0.08)":"none",paddingBottom:i<importPreview.preview.length-1?8:0,marginBottom:i<importPreview.preview.length-1?8:0}}>
                  <div style={{fontSize:13,fontWeight:600,color:"#e2e8f0"}}>{r.name}</div>
                  <div style={{fontSize:11,color:"rgba(148,163,184,0.6)",marginTop:2}}>{[r.company,r.email,r.phone].filter(Boolean).join(" · ")||"No extra fields detected"}</div>
                </div>
              ))}
            </div>
            <div style={{background:"rgba(217,119,6,0.1)",borderRadius:8,padding:"8px 12px",marginBottom:16,fontSize:12,color:"#fcd34d",border:"1px solid rgba(217,119,6,0.3)"}}>Duplicates (same name) will be skipped automatically.</div>
            <div style={{display:"flex",gap:10}}>
              <button style={{flex:1,padding:"12px",background:importLoading?"#ccc":"#2563eb",border:"none",color:"#fff",borderRadius:10,fontSize:14,fontWeight:700,cursor:importLoading?"not-allowed":"pointer",fontFamily:"inherit"}} onClick={runImport} disabled={importLoading}>{importLoading?"Importing...":"Import All"}</button>
              <button style={{flex:1,padding:"12px",background:"transparent",border:"1px solid rgba(255,255,255,0.12)",color:"rgba(226,232,240,0.7)",borderRadius:10,fontSize:14,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}} onClick={()=>{setImportModal(false);setImportPreview(null);}}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {confirmDelete&&(<div style={styles.overlay}><div style={styles.modal}><p style={styles.modalTitle}>Delete Contact?</p><p style={styles.modalSub}>This cannot be undone.</p><div style={{display:"flex",gap:10,marginTop:18}}><button style={styles.btnDanger} onClick={()=>deleteContact(confirmDelete)}>Delete</button><button style={styles.btnSecondary} onClick={()=>setConfirmDelete(null)}>Cancel</button></div></div></div>)}
      {confirmDeleteTouch&&(<div style={styles.overlay}><div style={styles.modal}><p style={styles.modalTitle}>Delete Note?</p><p style={styles.modalSub}>This cannot be undone.</p><div style={{display:"flex",gap:10,marginTop:18}}><button style={styles.btnDanger} onClick={()=>deleteTouchNote(confirmDeleteTouch)}>Delete</button><button style={styles.btnSecondary} onClick={()=>setConfirmDeleteTouch(null)}>Cancel</button></div></div></div>)}
      {confirmDeleteTask&&(<div style={styles.overlay}><div style={styles.modal}><p style={styles.modalTitle}>Delete Task?</p><p style={styles.modalSub}>This cannot be undone.</p><div style={{display:"flex",gap:10,marginTop:18}}><button style={styles.btnDanger} onClick={()=>deleteTask(confirmDeleteTask)}>Delete</button><button style={styles.btnSecondary} onClick={()=>setConfirmDeleteTask(null)}>Cancel</button></div></div></div>)}
      {confirmDeleteHealth&&(<div style={styles.overlay}><div style={styles.modal}><p style={styles.modalTitle}>Delete Health Note?</p><p style={styles.modalSub}>This cannot be undone.</p><div style={{display:"flex",gap:10,marginTop:18}}><button style={styles.btnDanger} onClick={()=>deleteHealthNote(confirmDeleteHealth)}>Delete</button><button style={styles.btnSecondary} onClick={()=>setConfirmDeleteHealth(null)}>Cancel</button></div></div></div>)}

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
          {view==="list"?"DeanBoard":view==="profile"?contact?.name||"Contact":view==="add"?"New Contact":"Edit Contact"}
        </span>
        {view==="list"&&homeTab!=="contacts"&&<div style={{width:36}}/>}
        {view==="list"&&homeTab==="contacts"&&(
          <button style={styles.exportBtn} onClick={e=>{e.stopPropagation();setExportMenuOpen(o=>!o);}}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          </button>
        )}
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
          <button style={{...styles.tab,...(homeTab==="health"?styles.tabActive:{})}} onClick={()=>setHomeTab("health")}>
            Health{healthOverdueCount>0&&<span style={{...styles.tabBadge,background:"#dc2626"}}>{healthOverdueCount}</span>}
          </button>
        </div>
      )}

      {view==="list"&&homeTab==="home"&&(
        <div style={styles.body}>
          <div style={styles.listScroll}>
            <div style={{background:"linear-gradient(160deg,#050c19 0%,#0a1628 60%,#0d1f3c 100%)",padding:"22px 20px 24px",borderBottom:"1px solid rgba(59,130,246,0.15)"}}>
              <div style={{fontSize:11,fontWeight:600,color:"rgba(255,255,255,0.4)",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:5}}>{getGreeting()}, Dean</div>
              <div style={{fontSize:22,fontWeight:700,color:"#fff",letterSpacing:"-0.02em"}}>{new Date().toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric",year:"numeric"})}</div>
              <div style={{display:"flex",gap:10,marginTop:16}}>
                <div style={{flex:1,background:"rgba(59,130,246,0.08)",backdropFilter:"blur(8px)",borderRadius:10,padding:"12px 14px",border:"1px solid rgba(59,130,246,0.2)"}}>
                  <div style={{fontSize:24,fontWeight:700,color:"#fff",lineHeight:1}}>{tasks.filter(t=>!t.completed).length}</div>
                  <div style={{fontSize:11,color:"rgba(255,255,255,0.45)",marginTop:4,fontWeight:500}}>Open Tasks</div>
                </div>
                <div style={{flex:1,background:"rgba(59,130,246,0.08)",backdropFilter:"blur(8px)",borderRadius:10,padding:"12px 14px",border:"1px solid rgba(59,130,246,0.2)"}}>
                  <div style={{fontSize:24,fontWeight:700,color:"#fff",lineHeight:1}}>{upcomingTasks.filter(t=>taskDueStatus(t.due_date)==="overdue").length}</div>
                  <div style={{fontSize:11,color:"rgba(255,255,255,0.45)",marginTop:4,fontWeight:500}}>Overdue</div>
                </div>
                <div style={{flex:1,background:"rgba(59,130,246,0.08)",backdropFilter:"blur(8px)",borderRadius:10,padding:"12px 14px",border:"1px solid rgba(59,130,246,0.2)"}}>
                  <div style={{fontSize:24,fontWeight:700,color:"#fff",lineHeight:1}}>{upcomingContacts.length}</div>
                  <div style={{fontSize:11,color:"rgba(255,255,255,0.45)",marginTop:4,fontWeight:500}}>Follow-ups</div>
                </div>
                <div style={{flex:1,background:"rgba(59,130,246,0.08)",backdropFilter:"blur(8px)",borderRadius:10,padding:"12px 14px",border:"1px solid rgba(59,130,246,0.2)"}}>
                  <div style={{fontSize:24,fontWeight:700,color:"#fff",lineHeight:1}}>{contacts.length}</div>
                  <div style={{fontSize:11,color:"rgba(255,255,255,0.45)",marginTop:4,fontWeight:500}}>Contacts</div>
                </div>
              </div>
            </div>

            <div style={{padding:"18px 16px 6px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
              <span style={{fontSize:11,fontWeight:700,color:"rgba(147,197,253,0.7)",textTransform:"uppercase",letterSpacing:"0.08em"}}>📋 Upcoming Tasks</span>
              <span style={{fontSize:11,color:"rgba(148,163,184,0.55)"}}>{upcomingTasks.length} task{upcomingTasks.length!==1?"s":""} · next 7 days</span>
            </div>
            {upcomingTasks.length===0?(
              <div style={{margin:"0 16px 16px",background:"rgba(255,255,255,0.03)",borderRadius:12,border:"1px solid rgba(255,255,255,0.08)",padding:"28px 20px",textAlign:"center"}}>
                <div style={{fontSize:28,marginBottom:8}}>🎉</div>
                <div style={{fontSize:13,color:"rgba(148,163,184,0.7)",fontWeight:500}}>No tasks due in the next 7 days</div>
              </div>
            ):(
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,padding:"0 16px 8px"}}>
                {upcomingTasks.map(t=>{
                  const status=taskDueStatus(t.due_date);const isEditing=editingTaskId===t.id;
                  const accentColor=status==="overdue"?"#dc2626":status==="today"?"#d97706":"#2563eb";
                  const chipStyle=status==="overdue"?styles.taskDueOverdue:status==="today"?styles.taskDueToday:styles.taskDueUpcoming;
                  return(
                    <div key={t.id} style={{background:"rgba(255,255,255,0.04)",backdropFilter:"blur(8px)",borderRadius:12,border:"1px solid rgba(255,255,255,0.08)",padding:"14px",display:"flex",flexDirection:"column",justifyContent:"space-between",minHeight:110,borderTop:`3px solid ${accentColor}`}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:4,marginBottom:8}}>
                        <span style={{...styles.taskDueChip,...chipStyle,fontSize:10}}>{status==="overdue"?`Overdue ${formatTaskDue(t.due_date)}`:status==="today"?"Today":`${formatTaskDue(t.due_date)}`}</span>
                      </div>
                      <div style={{fontSize:12,color:"#e2e8f0",lineHeight:1.45,fontWeight:500,flex:1}}>{t.note}</div>
                      <button style={{marginTop:10,fontSize:10,fontWeight:600,padding:"5px 0",borderRadius:7,border:"1px solid rgba(59,130,246,0.25)",background:"rgba(59,130,246,0.1)",color:"#93c5fd",cursor:"pointer",fontFamily:"inherit",width:"100%"}} onClick={()=>completeTask(t.id)}>&#10003; Complete</button>
                    </div>
                  );
                })}
              </div>
            )}

            {upcomingContacts.length>0&&(<>
              <div style={{padding:"14px 16px 6px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                <span style={{fontSize:11,fontWeight:700,color:"rgba(147,197,253,0.7)",textTransform:"uppercase",letterSpacing:"0.08em"}}>🗓 Follow-ups Due</span>
                <span style={{fontSize:11,color:"rgba(148,163,184,0.55)"}}>{upcomingContacts.length} contact{upcomingContacts.length!==1?"s":""}</span>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,padding:"0 16px 8px"}}>
                {upcomingContacts.map(c=>{
                  const iso=parseNextTouch(c.next_touch);const status=nextTouchStatus(c.next_touch);
                  const origIdx=contacts.findIndex(x=>x.id===c.id);
                  const accentColor=status==="overdue"?"#dc2626":status==="today"?"#d97706":"#2563eb";
                  const badgeStyle=status==="overdue"?{color:"#fca5a5",background:"rgba(220,38,38,0.15)",border:"1px solid rgba(220,38,38,0.3)"}:status==="today"?{color:"#fcd34d",background:"rgba(217,119,6,0.15)",border:"1px solid rgba(217,119,6,0.3)"}:{color:"#93c5fd",background:"rgba(59,130,246,0.12)",border:"1px solid rgba(59,130,246,0.25)"};
                  return(
                    <div key={c.id} style={{background:"rgba(255,255,255,0.04)",backdropFilter:"blur(8px)",borderRadius:12,border:"1px solid rgba(255,255,255,0.08)",padding:"14px",display:"flex",flexDirection:"column",justifyContent:"space-between",minHeight:100,borderTop:`3px solid ${accentColor}`,cursor:"pointer"}} onClick={()=>{setSelected(origIdx);setView("profile");}}>
                      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
                        <div style={{width:32,height:32,borderRadius:8,background:avatarColor(c.name),display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:700,color:"#fff",flexShrink:0}}>{initials(c.name)}</div>
                        <div style={{minWidth:0}}>
                          <div style={{fontSize:12,fontWeight:600,color:"#e2e8f0",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{c.name}</div>
                          <div style={{fontSize:11,color:"rgba(148,163,184,0.6)",marginTop:1,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{c.company||c.email||""}</div>
                        </div>
                      </div>
                      <span style={{...badgeStyle,fontSize:10,fontWeight:600,borderRadius:6,padding:"3px 8px",alignSelf:"flex-start"}}>{status==="overdue"?"Overdue":status==="today"?"Today":`${formatTaskDue(iso)}`}</span>
                    </div>
                  );
                })}
              </div>
            </>)}
            <div style={{height:32}}/>
          </div>
        </div>
      )}

      {view==="list"&&homeTab==="contacts"&&(
        <div style={styles.body}>
          <div style={styles.searchWrap}>
            <svg style={styles.searchIcon} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input style={styles.searchInput} placeholder="Search contacts..." value={search} onChange={e=>setSearch(e.target.value)}/>
            {search&&<button style={styles.clearSearch} onClick={()=>setSearch("")}>x</button>}
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
              <div style={styles.taskAddTitle}>+ New Task</div>
              <div style={{marginBottom:8}}><NextTouchInput value={newTaskDate} onChange={setNewTaskDate} inputStyle={{flex:1,padding:"9px 12px",border:"1px solid rgba(255,255,255,0.1)",borderRadius:10,fontSize:14,color:"#e2e8f0",fontFamily:"inherit",outline:"none",boxSizing:"border-box",background:"rgba(255,255,255,0.05)"}}/></div>
              <textarea style={styles.taskAddTextarea} placeholder="What needs to be done?" value={newTaskNote} onChange={e=>setNewTaskNote(e.target.value)} rows={2}/>
              <button style={styles.taskAddBtn} onClick={addTask}>Add Task</button>
            </div>
            {(() => {
              const open=tasks.filter(t=>!t.completed);const done=tasks.filter(t=>t.completed);
              return(<>
                <div style={styles.taskListHeader}><span style={styles.taskListTitle}>📋 Open Tasks ({open.length})</span></div>
                {tasksLoading?<div style={styles.empty}><div style={styles.splashSpinner}/></div>
                :open.length===0?<div style={{padding:"14px 14px 4px",fontSize:13,color:"rgba(148,163,184,0.6)",textAlign:"center"}}>No open tasks 🎉</div>
                :open.map(t=>{
                  const status=taskDueStatus(t.due_date);const isEditing=editingTaskId===t.id;
                  return(
                    <div key={t.id} style={{...styles.taskCard,...(isEditing?{border:"1.5px solid #2563eb",boxShadow:"0 0 0 3px rgba(37,99,235,0.12)"}:{})}}>
                      <div style={styles.taskCardBody}>
                        {isEditing?(<>
                          <div style={styles.taskEditLabel}>Task note</div>
                          <textarea style={styles.taskEditTextarea} value={taskDraftNote} onChange={e=>setTaskDraftNote(e.target.value)} rows={2} autoFocus/>
                          <div style={{...styles.taskEditLabel,marginTop:8}}>Due date</div>
                          <NextTouchInput value={taskDraftDate} onChange={setTaskDraftDate} inputStyle={{flex:1,padding:"6px 10px",border:"none",outline:"none",fontSize:13,color:"#e2e8f0",fontFamily:"inherit",background:"transparent"}}/>
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
                            {t.due_date?<span style={{...styles.taskDueChip,...(status==="overdue"?styles.taskDueOverdue:status==="today"?styles.taskDueToday:styles.taskDueUpcoming)}}>{status==="overdue"?`Due ${formatTaskDue(t.due_date)}`:status==="today"?"Due Today":`Due ${formatTaskDue(t.due_date)}`}</span>:<span style={styles.taskDueNone}>No due date</span>}
                            <button style={styles.taskCompleteBtn} onClick={()=>completeTask(t.id)}>&#10003; Mark Complete</button>
                          </div>
                        </>)}
                      </div>
                    </div>
                  );
                })}
                {done.length>0&&(<>
                  <div style={styles.taskListHeader}><span style={{...styles.taskListTitle,color:"rgba(148,163,184,0.5)"}}>&#10003; Completed ({done.length})</span><button style={styles.taskFilterBtn} onClick={()=>setShowCompleted(s=>!s)}>{showCompleted?"Hide":"Show"}</button></div>
                  {showCompleted&&done.map(t=>(
                    <div key={t.id} style={{...styles.taskCard,opacity:0.75,borderColor:"rgba(59,130,246,0.2)"}}>
                      <div style={styles.taskCardBody}>
                        <div style={styles.taskCardTop}><div style={{...styles.taskCardText,textDecoration:"line-through",color:"rgba(147,197,253,0.5)"}}>{t.note}</div><button style={styles.taskDeleteBtn} onClick={()=>setConfirmDeleteTask(t.id)}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg></button></div>
                        <div style={styles.taskCardFooter}><span style={{fontSize:11,color:"#60a5fa",fontWeight:700}}>Done {t.completed_at?formatTaskDue(t.completed_at.slice(0,10)):""}</span><button style={styles.taskUndoBtn} onClick={()=>completeTask(t.id,true)}>Undo</button></div>
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

      {view==="list"&&homeTab==="health"&&(
        <div style={styles.body}>
          <div style={styles.listScroll}>
            {/* KPI strip */}
            <div style={{background:"linear-gradient(160deg,#050c19 0%,#0a1628 60%,#0d1f3c 100%)",padding:"16px 16px 18px",borderBottom:"1px solid rgba(16,185,129,0.15)"}}>
              <div style={{fontSize:11,fontWeight:700,color:"rgba(16,185,129,0.7)",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:12}}>Health Dashboard</div>
              <div style={{display:"flex",gap:8}}>
                {[
                  {label:"Open",val:healthNotes.filter(h=>!h.completed).length,accent:"rgba(16,185,129,0.2)"},
                  {label:"Overdue",val:healthNotes.filter(h=>!h.completed&&taskDueStatus(h.due_date)==="overdue").length,accent:"rgba(220,38,38,0.2)"},
                  {label:"Upcoming",val:healthNotes.filter(h=>!h.completed&&h.due_date&&taskDueStatus(h.due_date)!=="overdue").length,accent:"rgba(59,130,246,0.2)"},
                  {label:"Done",val:healthNotes.filter(h=>h.completed).length,accent:"rgba(139,92,246,0.2)"},
                ].map(kpi=>(
                  <div key={kpi.label} style={{flex:1,background:kpi.accent,borderRadius:10,padding:"10px 8px",border:"1px solid rgba(255,255,255,0.08)"}}>
                    <div style={{fontSize:22,fontWeight:700,color:"#fff",lineHeight:1}}>{kpi.val}</div>
                    <div style={{fontSize:10,color:"rgba(255,255,255,0.45)",marginTop:3,fontWeight:500}}>{kpi.label}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Add new note */}
            <div style={{margin:"16px 16px 0",background:"rgba(255,255,255,0.04)",backdropFilter:"blur(8px)",borderRadius:12,border:"1px solid rgba(16,185,129,0.2)",padding:"16px"}}>
              <div style={{fontSize:11,fontWeight:700,color:"rgba(16,185,129,0.7)",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:10}}>+ New Health Note</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:10}}>
                {HEALTH_CATEGORIES.map(cat=>(
                  <button key={cat.id} onClick={()=>setNewHealthCategory(cat.id)} style={{padding:"5px 12px",borderRadius:20,border:`1px solid ${newHealthCategory===cat.id?cat.color:cat.border}`,background:newHealthCategory===cat.id?cat.bg:"transparent",color:newHealthCategory===cat.id?cat.color:"rgba(148,163,184,0.6)",fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"inherit",transition:"all 0.15s"}}>
                    {cat.emoji} {cat.label}
                  </button>
                ))}
              </div>
              <div style={{marginBottom:8}}><NextTouchInput value={newHealthDate} onChange={setNewHealthDate} inputStyle={{flex:1,padding:"9px 12px",border:"1px solid rgba(255,255,255,0.1)",borderRadius:10,fontSize:14,color:"#e2e8f0",fontFamily:"inherit",outline:"none",boxSizing:"border-box",background:"rgba(255,255,255,0.05)"}}/></div>
              <textarea style={{width:"100%",padding:"10px 12px",border:"1px solid rgba(255,255,255,0.1)",borderRadius:10,fontSize:13,color:"#e2e8f0",fontFamily:"inherit",outline:"none",boxSizing:"border-box",resize:"none",lineHeight:1.5,background:"rgba(255,255,255,0.05)",marginTop:4}} placeholder="What do you want to track?" value={newHealthNote} onChange={e=>setNewHealthNote(e.target.value)} rows={2}/>
              <button style={{display:"block",width:"100%",marginTop:10,padding:"10px",background:"linear-gradient(135deg,#059669,#10b981)",border:"none",color:"#fff",borderRadius:10,fontSize:13,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}} onClick={addHealthNote}>Add Note</button>
            </div>

            {/* Open notes */}
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"16px 20px 8px"}}>
              <span style={{fontSize:11,fontWeight:700,color:"rgba(16,185,129,0.7)",textTransform:"uppercase",letterSpacing:"0.08em"}}>Open ({healthNotes.filter(h=>!h.completed).length})</span>
            </div>
            {healthLoading?<div style={styles.empty}><div style={styles.splashSpinner}/></div>
            :healthNotes.filter(h=>!h.completed).length===0?<div style={{padding:"14px",fontSize:13,color:"rgba(148,163,184,0.6)",textAlign:"center"}}>No open health notes 🎉</div>
            :healthNotes.filter(h=>!h.completed).map(h=>{
              const status=taskDueStatus(h.due_date);const cat=getCat(h.category);const isEditing=editingHealthId===h.id;
              return(
                <div key={h.id} style={{margin:"0 16px 8px",background:"rgba(255,255,255,0.04)",backdropFilter:"blur(8px)",borderRadius:12,border:`1px solid ${isEditing?"#10b981":"rgba(255,255,255,0.08)"}`,overflow:"hidden",...(isEditing?{boxShadow:"0 0 0 3px rgba(16,185,129,0.12)"}:{})}}>
                  <div style={{padding:"14px"}}>
                    {isEditing?(<>
                      <div style={{display:"flex",flexWrap:"wrap",gap:5,marginBottom:8}}>
                        {HEALTH_CATEGORIES.map(c=>(
                          <button key={c.id} onClick={()=>setHealthDraftCategory(c.id)} style={{padding:"4px 10px",borderRadius:20,border:`1px solid ${healthDraftCategory===c.id?c.color:c.border}`,background:healthDraftCategory===c.id?c.bg:"transparent",color:healthDraftCategory===c.id?c.color:"rgba(148,163,184,0.6)",fontSize:10,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>
                            {c.emoji} {c.label}
                          </button>
                        ))}
                      </div>
                      <textarea style={{width:"100%",padding:"8px 10px",border:"1px solid rgba(255,255,255,0.1)",borderRadius:8,fontSize:13,color:"#e2e8f0",fontFamily:"inherit",resize:"none",outline:"none",lineHeight:1.5,background:"rgba(255,255,255,0.05)",boxSizing:"border-box",marginBottom:8}} value={healthDraftNote} onChange={e=>setHealthDraftNote(e.target.value)} rows={2} autoFocus/>
                      <NextTouchInput value={healthDraftDate} onChange={setHealthDraftDate} inputStyle={{flex:1,padding:"6px 10px",border:"none",outline:"none",fontSize:13,color:"#e2e8f0",fontFamily:"inherit",background:"transparent"}}/>
                      <div style={{display:"flex",gap:6,marginTop:9}}>
                        <button style={{flex:1,padding:"8px",background:"linear-gradient(135deg,#059669,#10b981)",border:"none",color:"#fff",borderRadius:8,fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}} onClick={()=>saveHealthEdit(h.id)}>Save</button>
                        <button style={{flex:1,padding:"8px",background:"transparent",border:"1px solid rgba(255,255,255,0.12)",color:"rgba(226,232,240,0.6)",borderRadius:8,fontSize:12,fontWeight:500,cursor:"pointer",fontFamily:"inherit"}} onClick={()=>setEditingHealthId(null)}>Cancel</button>
                      </div>
                    </>):(<>
                      <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:8,marginBottom:8}}>
                        <span style={{fontSize:10,fontWeight:700,padding:"3px 10px",borderRadius:20,border:`1px solid ${cat.border}`,background:cat.bg,color:cat.color}}>{cat.emoji} {cat.label}</span>
                        <div style={{display:"flex",gap:5,flexShrink:0}}>
                          <button style={{background:"none",border:"1px solid rgba(255,255,255,0.1)",borderRadius:6,cursor:"pointer",color:"rgba(148,163,184,0.8)",padding:"3px 8px",fontSize:10,fontWeight:600,display:"flex",alignItems:"center",gap:3,fontFamily:"inherit"}} onClick={()=>startEditHealth(h)}><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>Edit</button>
                          <button style={{background:"none",border:"none",cursor:"pointer",color:"rgba(255,255,255,0.2)",padding:"2px 4px",display:"flex",alignItems:"center",borderRadius:4}} onClick={()=>setConfirmDeleteHealth(h.id)}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg></button>
                        </div>
                      </div>
                      <div style={{fontSize:13,color:"#e2e8f0",lineHeight:1.5,fontWeight:500,marginBottom:10}}>{h.note}</div>
                      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                        {h.due_date?<span style={{fontSize:11,fontWeight:600,borderRadius:6,padding:"3px 8px",...(status==="overdue"?{color:"#fca5a5",background:"rgba(220,38,38,0.15)",border:"1px solid rgba(220,38,38,0.3)"}:status==="today"?{color:"#fcd34d",background:"rgba(217,119,6,0.15)",border:"1px solid rgba(217,119,6,0.3)"}:{color:"#93c5fd",background:"rgba(59,130,246,0.12)",border:"1px solid rgba(59,130,246,0.25)"})}}>{status==="overdue"?`Due ${formatTaskDue(h.due_date)}`:status==="today"?"Due Today":`Due ${formatTaskDue(h.due_date)}`}</span>:<span style={{fontSize:11,color:"rgba(148,163,184,0.5)"}}>No due date</span>}
                        <button style={{fontSize:11,fontWeight:600,padding:"5px 12px",borderRadius:8,cursor:"pointer",fontFamily:"inherit",border:"1px solid rgba(16,185,129,0.3)",background:"rgba(16,185,129,0.1)",color:"#34d399"}} onClick={()=>completeHealthNote(h.id)}>&#10003; Done</button>
                      </div>
                    </>)}
                  </div>
                </div>
              );
            })}

            {/* Completed notes */}
            {healthNotes.filter(h=>h.completed).length>0&&(<>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 20px 8px"}}>
                <span style={{fontSize:11,fontWeight:700,color:"rgba(148,163,184,0.5)",textTransform:"uppercase",letterSpacing:"0.08em"}}>Completed ({healthNotes.filter(h=>h.completed).length})</span>
                <button style={{fontSize:12,color:"rgba(148,163,184,0.6)",fontWeight:500,background:"none",border:"none",cursor:"pointer",fontFamily:"inherit"}} onClick={()=>setShowCompletedHealth(s=>!s)}>{showCompletedHealth?"Hide":"Show"}</button>
              </div>
              {showCompletedHealth&&healthNotes.filter(h=>h.completed).map(h=>{
                const cat=getCat(h.category);
                return(
                  <div key={h.id} style={{margin:"0 16px 8px",background:"rgba(255,255,255,0.03)",borderRadius:12,border:"1px solid rgba(255,255,255,0.06)",overflow:"hidden",opacity:0.7}}>
                    <div style={{padding:"12px 14px"}}>
                      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8}}>
                        <div style={{flex:1,minWidth:0}}>
                          <span style={{fontSize:9,fontWeight:700,padding:"2px 8px",borderRadius:20,border:`1px solid ${cat.border}`,background:cat.bg,color:cat.color,marginBottom:4,display:"inline-block"}}>{cat.emoji} {cat.label}</span>
                          <div style={{fontSize:13,color:"rgba(147,197,253,0.5)",textDecoration:"line-through",lineHeight:1.4}}>{h.note}</div>
                          <div style={{fontSize:11,color:"#60a5fa",fontWeight:600,marginTop:4}}>Done {h.completed_at?formatTaskDue(h.completed_at.slice(0,10)):""}</div>
                        </div>
                        <div style={{display:"flex",gap:5,flexShrink:0}}>
                          <button style={{fontSize:11,fontWeight:600,padding:"5px 10px",borderRadius:8,cursor:"pointer",fontFamily:"inherit",background:"rgba(59,130,246,0.1)",color:"#93c5fd",border:"1px solid rgba(59,130,246,0.2)"}} onClick={()=>completeHealthNote(h.id,true)}>Undo</button>
                          <button style={{background:"none",border:"none",cursor:"pointer",color:"rgba(255,255,255,0.2)",padding:"2px 4px",display:"flex",alignItems:"center",borderRadius:4}} onClick={()=>setConfirmDeleteHealth(h.id)}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg></button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </>)}
            <div style={{height:40}}/>
          </div>
        </div>
      )}

      {view==="profile"&&contact&&(
        <div style={styles.body}>
          <div style={styles.profileScroll}>
            <div style={styles.profileHero}>
              <div style={{...styles.avatarLg,background:avatarColor(contact.name)}}>{initials(contact.name)}</div>
              <h2 style={styles.profileName}>{contact.name}</h2>
              {contact.company&&<p style={styles.profileCompany}>{contact.company}</p>}
            </div>
            <div style={styles.card}>
              {(() => {
                const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
                const emailHref = isMobile
                  ? `googlegmail:///co?to=${encodeURIComponent(contact.email)}`
                  : `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(contact.email)}`;
                return [
                  { icon: "📞", label: "Phone", val: contact.phone, href: `tel:${contact.phone}` },
                  { icon: "✉️", label: "Email", val: contact.email, href: emailHref, target: isMobile ? "_self" : "_blank" },
                  { icon: "📅", label: "Date Added", val: formatDate(contact.date) }
                ];
              })().filter(f=>f.val).map(f=>(
                <div key={f.label} style={styles.fieldRow}>
                  <span style={styles.fieldIcon}>{f.icon}</span>
                  <div style={styles.fieldBody}>
                    <div style={styles.fieldLabel}>{f.label}</div>
                    {f.href ? (
                      <a href={f.href} target={f.target || "_self"} rel="noopener noreferrer" style={{...styles.fieldValue,color:"#60a5fa"}}>{f.val}</a>
                    ) : (
                      <div style={styles.fieldValue}>{f.val}</div>
                    )}
                  </div>
                </div>
              ))}
              <div style={styles.fieldRow}><span style={styles.fieldIcon}>🗓</span><div style={styles.fieldBody}>
                <div style={styles.fieldLabel}>Next Touch</div>
                {editingNextTouch?(
                  <div style={{marginTop:2}}>
                    <NextTouchInput value={nextTouchDraft} onChange={setNextTouchDraft} inputStyle={{flex:1,border:"1px solid rgba(59,130,246,0.4)",borderRadius:8,padding:"5px 9px",fontSize:14,background:"rgba(255,255,255,0.05)",fontFamily:"inherit",outline:"none",boxSizing:"border-box",width:"100%",color:"#e2e8f0"}}/>
                    <div style={{display:"flex",gap:6,marginTop:8}}><button style={styles.ntSaveBtn} onClick={saveNextTouch}>Save</button><button style={styles.ntCancelBtn} onClick={()=>setEditingNextTouch(false)}>Cancel</button></div>
                  </div>
                ):(
                  <div style={{display:"flex",alignItems:"center",gap:8,marginTop:2}}>
                    <div style={styles.fieldValue}>{contact.next_touch||<span style={{color:"rgba(148,163,184,0.4)"}}>Not set</span>}</div>
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
                  <NextTouchInput value={inlineNextTouch} onChange={setInlineNextTouch} inputStyle={{flex:1,padding:"9px 12px",border:"1px solid rgba(255,255,255,0.1)",borderRadius:10,fontSize:14,color:"#e2e8f0",fontFamily:"inherit",outline:"none",boxSizing:"border-box",background:"rgba(255,255,255,0.05)"}}/>
                  <div style={{display:"flex",gap:8,marginTop:10}}><button style={styles.saveNoteBtn} onClick={addTouchNote}>Save Note</button><button style={styles.cancelNoteBtn} onClick={()=>{setAddingNote(false);setNewNote("");setInlineNextTouch("");}}>Cancel</button></div>
                </div>
              )}
              {(contact.touch_log||[]).length===0&&!addingNote?<div style={styles.touchEmpty}>No touch log entries yet. Tap "+ Add Note" to record an interaction.</div>
              :(contact.touch_log||[]).map((touch,i)=>(
                <div key={touch.id} style={{...styles.touchEntry,borderTop:i===0?"none":"1px solid rgba(255,255,255,0.05)"}}>
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
            <div style={styles.formGroup}><label style={styles.formLabel}>Notes</label><textarea style={styles.formTextarea} placeholder="General notes about this contact..." value={editEntry.notes||""} onChange={e=>setEditEntry({...editEntry,notes:e.target.value})} rows={4}/></div>
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
  shell:{width:"100%",height:"100dvh",display:"flex",flexDirection:"column",fontFamily:"'Inter','SF Pro Display',-apple-system,BlinkMacSystemFont,sans-serif",background:"linear-gradient(160deg,#0a1628 0%,#0d1f3c 50%,#0a1628 100%)",color:"#e2e8f0",position:"relative",overflow:"hidden",paddingBottom:"env(safe-area-inset-bottom)"},
  header:{background:"rgba(10,22,40,0.85)",backdropFilter:"blur(12px)",color:"#fff",paddingTop:"calc(14px + env(safe-area-inset-top))",paddingBottom:"14px",paddingLeft:"max(20px, env(safe-area-inset-left))",paddingRight:"max(20px, env(safe-area-inset-right))",display:"flex",alignItems:"center",gap:12,minHeight:"calc(56px + env(safe-area-inset-top))",flexShrink:0,borderBottom:"1px solid rgba(59,130,246,0.2)"},
  headerTitle:{flex:1,fontSize:18,fontWeight:700,letterSpacing:"-0.01em",color:"#fff",background:"linear-gradient(90deg,#fff 0%,#93c5fd 100%)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"},
  backBtn:{background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.1)",color:"rgba(255,255,255,0.8)",cursor:"pointer",padding:"7px",borderRadius:9,display:"flex",alignItems:"center"},
  signOutBtn:{background:"none",border:"none",color:"rgba(255,255,255,0.35)",cursor:"pointer",padding:"6px",borderRadius:8,display:"flex",alignItems:"center"},
  exportBtn:{background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.1)",color:"rgba(255,255,255,0.8)",cursor:"pointer",padding:"7px",borderRadius:9,display:"flex",alignItems:"center"},
  homeBtn:{background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.1)",color:"rgba(255,255,255,0.8)",cursor:"pointer",padding:"7px",borderRadius:9,display:"flex",alignItems:"center",marginLeft:2},
  exportMenu:{position:"fixed",top:60,right:16,background:"rgba(13,28,57,0.98)",backdropFilter:"blur(20px)",borderRadius:14,boxShadow:"0 20px 60px rgba(0,0,0,0.6)",border:"1px solid rgba(59,130,246,0.2)",zIndex:9999,minWidth:230,overflow:"hidden"},
  exportMenuItem:{display:"flex",alignItems:"center",gap:12,width:"100%",padding:"13px 16px",background:"none",border:"none",cursor:"pointer",fontFamily:"inherit",textAlign:"left",color:"#e2e8f0"},
  exportMenuIcon:{fontSize:20,flexShrink:0},
  exportMenuLabel:{fontSize:13,fontWeight:600,color:"#e2e8f0"},
  exportMenuSub:{fontSize:11,color:"#64748b",marginTop:1},
  exportMenuDivider:{height:1,background:"rgba(255,255,255,0.06)"},
  tabBar:{display:"flex",background:"rgba(10,22,40,0.9)",backdropFilter:"blur(12px)",borderBottom:"1px solid rgba(59,130,246,0.15)",flexShrink:0},
  tab:{flex:1,padding:"12px 0",textAlign:"center",fontSize:10,fontWeight:600,letterSpacing:"0.04em",textTransform:"uppercase",color:"rgba(255,255,255,0.35)",cursor:"pointer",background:"none",border:"none",borderBottom:"2px solid transparent",fontFamily:"inherit",display:"flex",alignItems:"center",justifyContent:"center",gap:4,transition:"color 0.2s"},
  tabActive:{color:"#93c5fd",borderBottom:"2px solid #3b82f6"},
  tabBadge:{background:"#ef4444",color:"#fff",fontSize:10,fontWeight:700,borderRadius:10,padding:"1px 6px",fontFamily:"sans-serif"},
  body:{flex:1,display:"flex",flexDirection:"column",overflow:"hidden",position:"relative"},
  listScroll:{flex:1,overflowY:"auto",WebkitOverflowScrolling:"touch"},
  searchWrap:{margin:"14px 16px 8px",background:"rgba(255,255,255,0.05)",backdropFilter:"blur(8px)",borderRadius:10,display:"flex",alignItems:"center",padding:"10px 14px",gap:8,border:"1px solid rgba(255,255,255,0.1)"},
  searchIcon:{flexShrink:0,color:"rgba(148,163,184,0.6)"},
  searchInput:{flex:1,border:"none",outline:"none",fontSize:14,background:"transparent",fontFamily:"inherit",color:"#e2e8f0"},
  clearSearch:{background:"none",border:"none",cursor:"pointer",color:"rgba(148,163,184,0.6)",fontSize:14,padding:2},
  sectionHeader:{padding:"10px 20px 4px",fontSize:10,fontWeight:700,color:"rgba(59,130,246,0.8)",letterSpacing:"0.14em",textTransform:"uppercase",background:"rgba(10,22,40,0.6)"},
  contactRow:{display:"flex",alignItems:"center",padding:"13px 20px",gap:14,cursor:"pointer",borderBottom:"1px solid rgba(255,255,255,0.05)",background:"rgba(255,255,255,0.02)",transition:"background 0.15s"},
  avatar:{width:40,height:40,borderRadius:10,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,fontWeight:700,color:"#fff",flexShrink:0},
  rowInfo:{flex:1,minWidth:0},
  rowName:{fontSize:14,fontWeight:600,color:"#e2e8f0",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"},
  rowSub:{fontSize:12,color:"rgba(148,163,184,0.7)",marginTop:1,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"},
  touchBadge:{background:"rgba(59,130,246,0.15)",color:"#93c5fd",fontSize:10,fontWeight:700,borderRadius:6,padding:"2px 7px",marginRight:4,border:"1px solid rgba(59,130,246,0.25)"},
  chevron:{color:"rgba(255,255,255,0.2)",flexShrink:0},
  fab:{position:"absolute",bottom:"calc(20px + env(safe-area-inset-bottom))",right:"max(20px, env(safe-area-inset-right))",width:52,height:52,borderRadius:14,background:"linear-gradient(135deg,#2563eb,#3b82f6)",border:"none",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",boxShadow:"0 4px 20px rgba(37,99,235,0.5),0 0 0 1px rgba(59,130,246,0.3)",transition:"transform 0.15s,box-shadow 0.15s",zIndex:10},
  empty:{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:40,textAlign:"center"},
  emptyIcon:{fontSize:48,marginBottom:14},
  emptyTitle:{fontSize:17,fontWeight:600,color:"rgba(226,232,240,0.8)",marginBottom:6},
  emptySub:{fontSize:13,color:"rgba(148,163,184,0.6)"},
  profileScroll:{flex:1,overflowY:"auto",WebkitOverflowScrolling:"touch",padding:"0 0 20px"},
  profileHero:{background:"linear-gradient(160deg,#0a1628 0%,#0f2347 100%)",padding:"28px 20px 24px",display:"flex",flexDirection:"column",alignItems:"center",gap:10,borderBottom:"1px solid rgba(59,130,246,0.15)"},
  avatarLg:{width:70,height:70,borderRadius:18,display:"flex",alignItems:"center",justifyContent:"center",fontSize:26,fontWeight:700,color:"#fff",boxShadow:"0 0 0 3px rgba(59,130,246,0.3),0 8px 24px rgba(0,0,0,0.3)"},
  profileName:{fontSize:20,fontWeight:700,color:"#fff",margin:0,textAlign:"center"},
  profileCompany:{fontSize:13,color:"rgba(147,197,253,0.7)",margin:0,textAlign:"center"},
  card:{background:"rgba(255,255,255,0.04)",backdropFilter:"blur(8px)",margin:"14px 16px 0",borderRadius:12,padding:"4px 0",border:"1px solid rgba(255,255,255,0.08)",overflow:"hidden"},
  fieldRow:{display:"flex",alignItems:"flex-start",padding:"13px 16px",gap:14,borderBottom:"1px solid rgba(255,255,255,0.05)"},
  fieldIcon:{fontSize:16,flexShrink:0,marginTop:1},
  fieldBody:{flex:1,minWidth:0},
  fieldLabel:{fontSize:10,color:"rgba(148,163,184,0.7)",fontWeight:700,letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:3},
  fieldValue:{fontSize:14,color:"#e2e8f0",textDecoration:"none",wordBreak:"break-all"},
  notesLabel:{fontSize:10,color:"rgba(148,163,184,0.7)",fontWeight:700,letterSpacing:"0.08em",textTransform:"uppercase",padding:"13px 16px 4px"},
  notesText:{fontSize:13,color:"rgba(226,232,240,0.8)",padding:"0 16px 14px",lineHeight:1.7,whiteSpace:"pre-wrap"},
  touchSection:{margin:"14px 16px 0",background:"rgba(255,255,255,0.04)",backdropFilter:"blur(8px)",borderRadius:12,border:"1px solid rgba(255,255,255,0.08)",overflow:"hidden"},
  touchHeader:{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"13px 16px",borderBottom:"1px solid rgba(255,255,255,0.06)",background:"rgba(255,255,255,0.03)"},
  touchHeaderTitle:{fontSize:11,fontWeight:700,color:"rgba(148,163,184,0.8)",letterSpacing:"0.08em",textTransform:"uppercase"},
  addNoteBtn:{background:"linear-gradient(135deg,#2563eb,#3b82f6)",color:"#fff",border:"none",borderRadius:8,padding:"6px 14px",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit"},
  addNotePanel:{padding:"14px 16px",borderBottom:"1px solid rgba(255,255,255,0.06)",background:"rgba(255,255,255,0.02)"},
  addNoteDate:{fontSize:11,color:"rgba(148,163,184,0.6)",fontWeight:600,marginBottom:8},
  addNoteDivider:{display:"flex",alignItems:"center",gap:8,margin:"10px 0 0",fontSize:10,color:"rgba(148,163,184,0.5)",fontWeight:600,letterSpacing:"0.06em",textTransform:"uppercase"},
  addNoteTextarea:{width:"100%",padding:"10px 12px",border:"1px solid rgba(255,255,255,0.1)",borderRadius:10,fontSize:13,color:"#e2e8f0",fontFamily:"inherit",outline:"none",boxSizing:"border-box",resize:"vertical",lineHeight:1.6,background:"rgba(255,255,255,0.05)"},
  saveNoteBtn:{flex:1,padding:"10px",background:"linear-gradient(135deg,#2563eb,#3b82f6)",border:"none",color:"#fff",borderRadius:9,fontSize:13,fontWeight:600,cursor:"pointer",fontFamily:"inherit"},
  cancelNoteBtn:{flex:1,padding:"10px",background:"transparent",border:"1px solid rgba(255,255,255,0.12)",color:"rgba(226,232,240,0.7)",borderRadius:9,fontSize:13,fontWeight:500,cursor:"pointer",fontFamily:"inherit"},
  touchEmpty:{padding:"20px",fontSize:13,color:"rgba(148,163,184,0.6)",textAlign:"center",lineHeight:1.6},
  touchEntry:{padding:"13px 16px"},
  touchEntryHeader:{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6},
  touchEntryDate:{fontSize:11,color:"#60a5fa",fontWeight:600},
  touchDeleteBtn:{background:"none",border:"none",cursor:"pointer",color:"rgba(255,255,255,0.2)",padding:"2px 4px",display:"flex",alignItems:"center",borderRadius:4},
  touchEntryText:{fontSize:13,color:"rgba(226,232,240,0.85)",lineHeight:1.65,whiteSpace:"pre-wrap"},
  ntEditBtn:{background:"rgba(59,130,246,0.12)",color:"#93c5fd",border:"1px solid rgba(59,130,246,0.25)",borderRadius:7,padding:"4px 10px",fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap",flexShrink:0},
  ntSaveBtn:{background:"linear-gradient(135deg,#2563eb,#3b82f6)",color:"#fff",border:"none",borderRadius:7,padding:"5px 12px",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap",flexShrink:0},
  ntCancelBtn:{background:"none",border:"1px solid rgba(255,255,255,0.12)",color:"rgba(226,232,240,0.6)",borderRadius:7,padding:"5px 8px",fontSize:12,fontWeight:500,cursor:"pointer",fontFamily:"inherit",flexShrink:0},
  taskAddPanel:{margin:"16px 16px 0",background:"rgba(255,255,255,0.04)",backdropFilter:"blur(8px)",borderRadius:12,border:"1px solid rgba(255,255,255,0.08)",padding:"16px"},
  taskAddTitle:{fontSize:11,fontWeight:700,color:"rgba(148,163,184,0.7)",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:12},
  taskAddTextarea:{width:"100%",padding:"10px 12px",border:"1px solid rgba(255,255,255,0.1)",borderRadius:10,fontSize:13,color:"#e2e8f0",fontFamily:"inherit",outline:"none",boxSizing:"border-box",resize:"none",lineHeight:1.5,background:"rgba(255,255,255,0.05)",marginTop:8},
  taskAddBtn:{display:"block",width:"100%",marginTop:12,padding:"10px",background:"linear-gradient(135deg,#2563eb,#3b82f6)",border:"none",color:"#fff",borderRadius:10,fontSize:13,fontWeight:600,cursor:"pointer",fontFamily:"inherit"},
  taskListHeader:{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"16px 20px 8px"},
  taskListTitle:{fontSize:11,fontWeight:700,color:"rgba(148,163,184,0.8)",textTransform:"uppercase",letterSpacing:"0.08em"},
  taskFilterBtn:{fontSize:12,color:"rgba(148,163,184,0.6)",fontWeight:500,background:"none",border:"none",cursor:"pointer",fontFamily:"inherit"},
  taskCard:{margin:"0 16px 8px",background:"rgba(255,255,255,0.04)",backdropFilter:"blur(8px)",borderRadius:12,border:"1px solid rgba(255,255,255,0.08)",overflow:"hidden"},
  taskCardBody:{padding:"14px"},
  taskCardTop:{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:10},
  taskCardText:{fontSize:13,color:"#e2e8f0",lineHeight:1.5,flex:1,fontWeight:500},
  taskDeleteBtn:{background:"none",border:"none",cursor:"pointer",color:"rgba(255,255,255,0.2)",padding:"2px 4px",display:"flex",alignItems:"center",flexShrink:0,borderRadius:4},
  taskCardFooter:{display:"flex",alignItems:"center",justifyContent:"space-between",marginTop:10},
  taskDueChip:{fontSize:11,fontWeight:600,borderRadius:6,padding:"3px 8px"},
  taskDueOverdue:{color:"#fca5a5",background:"rgba(220,38,38,0.15)",border:"1px solid rgba(220,38,38,0.3)"},
  taskDueToday:{color:"#fcd34d",background:"rgba(217,119,6,0.15)",border:"1px solid rgba(217,119,6,0.3)"},
  taskDueUpcoming:{color:"#93c5fd",background:"rgba(59,130,246,0.12)",border:"1px solid rgba(59,130,246,0.25)"},
  taskDueNone:{fontSize:11,color:"rgba(148,163,184,0.5)",fontWeight:500},
  taskCompleteBtn:{fontSize:11,fontWeight:600,padding:"5px 12px",borderRadius:8,cursor:"pointer",fontFamily:"inherit",border:"1px solid rgba(59,130,246,0.25)",background:"rgba(59,130,246,0.1)",color:"#93c5fd"},
  taskUndoBtn:{fontSize:11,fontWeight:600,padding:"5px 12px",borderRadius:8,cursor:"pointer",fontFamily:"inherit",background:"rgba(59,130,246,0.1)",color:"#93c5fd",border:"1px solid rgba(59,130,246,0.2)"},
  taskEditBtn:{background:"none",border:"1px solid rgba(255,255,255,0.1)",borderRadius:6,cursor:"pointer",color:"rgba(148,163,184,0.8)",padding:"3px 8px",fontSize:10,fontWeight:600,display:"flex",alignItems:"center",gap:3,fontFamily:"inherit",whiteSpace:"nowrap"},
  taskEditLabel:{fontSize:9,fontWeight:700,color:"rgba(148,163,184,0.6)",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:4},
  taskEditTextarea:{width:"100%",padding:"8px 10px",border:"1px solid rgba(255,255,255,0.1)",borderRadius:8,fontSize:13,color:"#e2e8f0",fontFamily:"inherit",resize:"none",outline:"none",lineHeight:1.5,background:"rgba(255,255,255,0.05)",boxSizing:"border-box"},
  taskEditSaveBtn:{flex:1,padding:"8px",background:"linear-gradient(135deg,#2563eb,#3b82f6)",border:"none",color:"#fff",borderRadius:8,fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit"},
  taskEditCancelBtn:{flex:1,padding:"8px",background:"transparent",border:"1px solid rgba(255,255,255,0.12)",color:"rgba(226,232,240,0.6)",borderRadius:8,fontSize:12,fontWeight:500,cursor:"pointer",fontFamily:"inherit"},
  formScroll:{flex:1,overflowY:"auto",WebkitOverflowScrolling:"touch",padding:"16px"},
  formGroup:{marginBottom:16},
  formLabel:{display:"block",fontSize:11,color:"rgba(148,163,184,0.8)",fontWeight:700,letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:6},
  required:{color:"#f87171"},
  formInput:{width:"100%",padding:"11px 14px",background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:10,fontSize:14,color:"#e2e8f0",fontFamily:"inherit",outline:"none",boxSizing:"border-box",transition:"border-color 0.15s"},
  formTextarea:{width:"100%",padding:"11px 14px",background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:10,fontSize:14,color:"#e2e8f0",fontFamily:"inherit",outline:"none",boxSizing:"border-box",resize:"vertical",lineHeight:1.6},
  btnPrimary:{display:"block",width:"100%",padding:"13px",background:"linear-gradient(135deg,#2563eb,#3b82f6)",border:"none",color:"#fff",borderRadius:10,fontSize:14,fontWeight:600,cursor:"pointer",fontFamily:"inherit",marginBottom:10,boxShadow:"0 4px 14px rgba(37,99,235,0.4)"},
  btnSecondaryFull:{display:"block",width:"100%",padding:"12px",background:"transparent",border:"1px solid rgba(255,255,255,0.12)",color:"rgba(226,232,240,0.7)",borderRadius:10,fontSize:14,fontWeight:500,cursor:"pointer",fontFamily:"inherit"},
  btnSecondary:{flex:1,padding:"12px",background:"transparent",border:"1px solid rgba(255,255,255,0.12)",color:"rgba(226,232,240,0.7)",borderRadius:10,fontSize:14,fontWeight:500,cursor:"pointer",fontFamily:"inherit"},
  btnDanger:{flex:1,padding:"12px",background:"rgba(220,38,38,0.8)",border:"none",color:"#fff",borderRadius:10,fontSize:14,fontWeight:600,cursor:"pointer",fontFamily:"inherit"},
  btnDangerFull:{display:"block",width:"calc(100% - 32px)",margin:"14px 16px 0",padding:"12px",background:"transparent",border:"1px solid rgba(239,68,68,0.3)",color:"#f87171",borderRadius:10,fontSize:14,fontWeight:500,cursor:"pointer",fontFamily:"inherit"},
  phoneHint:{fontSize:11,color:"rgba(148,163,184,0.6)",marginTop:4,textAlign:"right"},
  overlay:{position:"absolute",inset:0,background:"rgba(5,12,25,0.7)",backdropFilter:"blur(6px)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:200,padding:24},
  modal:{background:"rgba(13,28,57,0.98)",backdropFilter:"blur(16px)",borderRadius:16,padding:"24px",width:"100%",maxWidth:320,textAlign:"center",boxShadow:"0 24px 64px rgba(0,0,0,0.5),0 0 0 1px rgba(59,130,246,0.2)",border:"1px solid rgba(59,130,246,0.15)"},
  modalTitle:{fontSize:17,fontWeight:700,color:"#e2e8f0",margin:"0 0 6px"},
  modalSub:{fontSize:13,color:"rgba(148,163,184,0.8)",margin:0},
  toast:{position:"absolute",bottom:"calc(20px + env(safe-area-inset-bottom))",left:"50%",transform:"translateX(-50%)",background:"rgba(13,28,57,0.95)",backdropFilter:"blur(12px)",color:"#93c5fd",padding:"10px 20px",borderRadius:10,fontSize:13,fontWeight:500,zIndex:100,whiteSpace:"nowrap",boxShadow:"0 4px 20px rgba(0,0,0,0.4)",border:"1px solid rgba(59,130,246,0.3)"},
  splashScreen:{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",background:"linear-gradient(160deg,#050c19 0%,#0a1628 60%,#0d1f3c 100%)",gap:16},
  splashLogo:{width:68,height:68,borderRadius:18,background:"linear-gradient(135deg,#1d4ed8,#3b82f6)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:32,fontWeight:700,color:"#fff",boxShadow:"0 0 40px rgba(59,130,246,0.4)"},
  splashTitle:{fontSize:22,fontWeight:700,color:"#fff",letterSpacing:"-0.02em"},
  splashTagline:{fontSize:12,color:"rgba(147,197,253,0.5)",textAlign:"center",maxWidth:260,lineHeight:1.6},
  splashSpinner:{width:26,height:26,border:"2.5px solid rgba(59,130,246,0.2)",borderTop:"2.5px solid #3b82f6",borderRadius:"50%",animation:"spin 0.8s linear infinite"},
  authScreen:{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",background:"linear-gradient(160deg,#050c19 0%,#0a1628 60%,#0d1f3c 100%)",padding:"30px 24px",paddingTop:"calc(30px + env(safe-area-inset-top))"},
  authLogo:{width:64,height:64,borderRadius:16,background:"linear-gradient(135deg,#1d4ed8,#3b82f6)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:30,fontWeight:700,color:"#fff",marginBottom:16,boxShadow:"0 0 32px rgba(59,130,246,0.4)"},
  authTitle:{fontSize:24,fontWeight:700,color:"#fff",margin:"0 0 6px",letterSpacing:"-0.02em"},
  authSub:{fontSize:13,color:"rgba(147,197,253,0.5)",margin:"0 0 32px",textAlign:"center",lineHeight:1.6,maxWidth:260},
  authCard:{background:"rgba(13,28,57,0.9)",backdropFilter:"blur(16px)",borderRadius:16,padding:"24px",width:"100%",maxWidth:360,boxShadow:"0 24px 64px rgba(0,0,0,0.5),0 0 0 1px rgba(59,130,246,0.2)",border:"1px solid rgba(59,130,246,0.15)"},
  authCardTitle:{fontSize:16,fontWeight:700,color:"#e2e8f0",margin:"0 0 6px",textAlign:"center"},
  authCardSub:{fontSize:13,color:"rgba(148,163,184,0.7)",margin:"0 0 18px",textAlign:"center",lineHeight:1.6},
  authInput:{width:"100%",padding:"12px 14px",border:"1px solid rgba(255,255,255,0.1)",borderRadius:10,fontSize:14,color:"#e2e8f0",fontFamily:"inherit",outline:"none",boxSizing:"border-box",marginBottom:10,background:"rgba(255,255,255,0.05)"},
  authError:{fontSize:12,color:"#f87171",textAlign:"center"},
  authBtn:{display:"block",width:"100%",padding:"13px",background:"linear-gradient(135deg,#2563eb,#3b82f6)",border:"none",color:"#fff",borderRadius:10,fontSize:14,fontWeight:600,cursor:"pointer",fontFamily:"inherit",boxShadow:"0 4px 16px rgba(37,99,235,0.4)"},
  codeRow:{display:"flex",gap:8,justifyContent:"center",margin:"4px 0 0"},
  codeBox:{width:42,height:50,textAlign:"center",fontSize:22,fontWeight:700,color:"#e2e8f0",border:"1px solid rgba(255,255,255,0.12)",borderRadius:10,outline:"none",fontFamily:"inherit",background:"rgba(255,255,255,0.05)",transition:"border-color 0.15s"},
  resendRow:{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:14},
  resendTimer:{fontSize:12,color:"rgba(148,163,184,0.6)"},
  resendBtn:{fontSize:13,color:"#60a5fa",background:"none",border:"none",cursor:"pointer",fontFamily:"inherit",fontWeight:600,padding:0},
  changeEmailBtn:{fontSize:13,color:"rgba(148,163,184,0.6)",background:"none",border:"none",cursor:"pointer",fontFamily:"inherit",padding:0},
};

const css = `
@keyframes spin { to { transform: rotate(360deg); } }
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
.contact-row:hover { background: rgba(59,130,246,0.06) !important; }
.fab:hover { transform: scale(1.06); box-shadow: 0 8px 28px rgba(37,99,235,0.6), 0 0 0 1px rgba(59,130,246,0.4) !important; }
input[type="date"] { color-scheme: dark; }
input:focus, textarea:focus { border-color: rgba(59,130,246,0.6) !important; box-shadow: 0 0 0 3px rgba(59,130,246,0.12) !important; }
::-webkit-scrollbar { width: 9px; }
::-webkit-scrollbar-thumb { background: rgba(59,130,246,0.35); border-radius: 4px; }
::-webkit-scrollbar-thumb:hover { background: rgba(59,130,246,0.55); }
::-webkit-scrollbar-track { background: transparent; }
html, body { overscroll-behavior: none; overflow: hidden; height: 100%; background: #050c19; }
body { -webkit-user-select: none; user-select: none; }
input, textarea { -webkit-user-select: text; user-select: text; }
* { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
button:hover { opacity: 0.88; }
`;
