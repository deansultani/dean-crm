import { useState, useEffect, useRef } from "react";
import * as XLSX from "xlsx";

const SUPABASE_URL = "https://httokflilaixlvsbptsp.supabase.co";
const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh0dG9rZmxpbGFpeGx2c2JwdHNwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk3NDYxNDksImV4cCI6MjA5NTMyMjE0OX0.V5dRc75rMuD9kkzyl4XYWeoxbiop1cmDuRz_gRr7Axk";
const FIXED_USER_ID = "00000000-0000-0000-0000-000000000001";

const api = async (path, opts = {}) => {
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      apikey: SUPABASE_ANON,
      Authorization: `Bearer ${SUPABASE_ANON}`,
      "Content-Type": "application/json",
      Prefer: opts.prefer !== undefined ? opts.prefer : "return=representation",
      ...opts.headers,
    },
    ...opts,
  });
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

const linkifyText = (text, linkColor) => {
  if (!text) return text;
  const parts = text.split(/(https?:\/\/[^\s]+)/g);
  return parts.map((part, i) =>
    /^https?:\/\//.test(part)
      ? <a key={i} href={part} target="_blank" rel="noopener noreferrer" onClick={e=>e.stopPropagation()} style={{color:linkColor,textDecoration:"underline",overflowWrap:"anywhere",wordBreak:"break-word"}}>{part}</a>
      : <span key={i} style={{overflowWrap:"anywhere",wordBreak:"break-word"}}>{part}</span>
  );
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
        <input style={inputStyle || { flex:1, padding:"10px 12px", border:"1px solid rgba(255,255,255,0.12)", borderRadius:10, fontSize:16, color:"#e2e8f0", fontFamily:"inherit", outline:"none", boxSizing:"border-box", background:"rgba(255,255,255,0.05)" }}
          type="text" placeholder="MM/DD/YYYY" value={value} maxLength={10} inputMode="numeric"
          onChange={handleTextChange} onFocus={() => setCalOpen(false)}
        />
      </div>
      {value && (
        <div style={{ fontSize:11, marginTop:4, fontWeight:600 }}>
          {status === "overdue" && <span style={{color:"#f87171"}}>This date is in the past</span>}
          {status === "today" && <span style={{color:"#fcd34d"}}>Today</span>}
          {status === "upcoming" && <span style={{color:"#60a5fa"}}>Upcoming</span>}
        </div>
      )}
      {calOpen && <MiniCalendar value={value} onChange={(v) => { onChange(v); setCalOpen(false); }} onClose={() => setCalOpen(false)}/>}
    </div>
  );
}

// ── Health Categories (Medication added between Nutrition and Sleep) ──
const HEALTH_CATEGORIES = [
  { id:"exercise",    label:"Exercise",    emoji:"🏃", color:"#10b981", bg:"rgba(16,185,129,0.12)",  border:"rgba(16,185,129,0.3)"  },
  { id:"nutrition",   label:"Nutrition",   emoji:"🥗", color:"#f59e0b", bg:"rgba(245,158,11,0.12)",  border:"rgba(245,158,11,0.3)"  },
  { id:"medication",  label:"Medication",  emoji:"💊", color:"#f472b6", bg:"rgba(244,114,182,0.12)", border:"rgba(244,114,182,0.3)" },
  { id:"sleep",       label:"Sleep",       emoji:"😴", color:"#8b5cf6", bg:"rgba(139,92,246,0.12)",  border:"rgba(139,92,246,0.3)"  },
  { id:"appointment", label:"Appointment", emoji:"🩺", color:"#3b82f6", bg:"rgba(59,130,246,0.12)",  border:"rgba(59,130,246,0.3)"  },
  { id:"general",     label:"General",     emoji:"📝", color:"#94a3b8", bg:"rgba(148,163,184,0.12)", border:"rgba(148,163,184,0.3)" },
];
const getCat = (id) => HEALTH_CATEGORIES.find(c => c.id === id) || HEALTH_CATEGORIES[5];

// ── Main App ───────────────────────────────────────────────────────────
export default function DeanCRM() {
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
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
  // ── NEW: category filter for Health tab ──
  const [healthFilter, setHealthFilter] = useState("all");
  // ── Task <-> Contact linking ──
  const [newTaskContactId, setNewTaskContactId] = useState("");
  const [taskDraftContactId, setTaskDraftContactId] = useState("");
  const [addingContactTask, setAddingContactTask] = useState(false);
  const [contactTaskNote, setContactTaskNote] = useState("");
  const [contactTaskDate, setContactTaskDate] = useState("");
  const [showCompletedContactTasks, setShowCompletedContactTasks] = useState(false);
  // ── Dark/Light mode ──
  const [dark, setDark] = useState(true);

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
    fetchContacts();
    fetchTasks();
    fetchHealthNotes();
  }, []);

  useEffect(() => {
    if (!exportMenuOpen) return;
    const handler = () => setExportMenuOpen(false);
    setTimeout(() => document.addEventListener("click", handler), 0);
    return () => document.removeEventListener("click", handler);
  }, [exportMenuOpen]);

  const fetchContacts = async () => {
    setLoading(true);
    try {
      const res = await api("contacts?order=name.asc");
      if (res.ok) { const data = await res.json(); setContacts(data.map(c => ({ ...c, touch_log: c.touch_log || [] }))); }
    } catch {}
    setLoading(false);
  };

  const fetchTasks = async () => {
    setTasksLoading(true);
    try {
      const res = await api("tasks?order=due_date.asc");
      if (res.ok) { const data = await res.json(); setTasks(data); }
    } catch {}
    setTasksLoading(false);
  };

  const fetchHealthNotes = async () => {
    setHealthLoading(true);
    try {
      const res = await api("health_notes?order=due_date.asc,created_at.desc");
      if (res.ok) { const data = await res.json(); setHealthNotes(data); }
    } catch {}
    setHealthLoading(false);
  };

  const addTask = async () => {
    if (!newTaskNote.trim()) return showToast("Task note is required");
    const isoDate = newTaskDate.trim() ? parseNextTouch(newTaskDate.trim()) || null : null;
    const payload = { note: newTaskNote.trim(), due_date: isoDate, completed: false, completed_at: null, contact_id: newTaskContactId || null };
    try {
      const res = await api("tasks", { method:"POST", body: JSON.stringify(payload) });
      if (res.ok) {
        const created = await res.json();
        const t = Array.isArray(created) ? created[0] : created;
        setTasks(prev => [...prev, t].sort((a,b) => (a.due_date||"9999") > (b.due_date||"9999") ? 1 : -1));
        setNewTaskNote(""); setNewTaskDate(""); setNewTaskContactId(""); showToast("Task added!");
      } else showToast("Error saving task");
    } catch { showToast("Error saving task"); }
  };

  const addContactTask = async () => {
    if (!contactTaskNote.trim()) return showToast("Task note is required");
    const contact = contacts[selected];
    const isoDate = contactTaskDate.trim() ? parseNextTouch(contactTaskDate.trim()) || null : null;
    const payload = { note: contactTaskNote.trim(), due_date: isoDate, completed: false, completed_at: null, contact_id: contact.id };
    try {
      const res = await api("tasks", { method:"POST", body: JSON.stringify(payload) });
      if (res.ok) {
        const created = await res.json();
        const t = Array.isArray(created) ? created[0] : created;
        setTasks(prev => [...prev, t].sort((a,b) => (a.due_date||"9999") > (b.due_date||"9999") ? 1 : -1));
        setContactTaskNote(""); setContactTaskDate(""); setAddingContactTask(false); showToast("Task added!");
      } else showToast("Error saving task");
    } catch { showToast("Error saving task"); }
  };

  const completeTask = async (id, undo = false) => {
    const patch = { completed: !undo, completed_at: !undo ? new Date().toISOString() : null };
    try {
      await api(`tasks?id=eq.${id}`, { method:"PATCH", prefer:"", body: JSON.stringify(patch) });
      setTasks(prev => prev.map(t => t.id === id ? { ...t, ...patch } : t));
      showToast(undo ? "Task reopened" : "Task completed!");
    } catch { showToast("Error updating task"); }
  };

  const deleteTask = async (id) => {
    try { await api(`tasks?id=eq.${id}`, { method:"DELETE", prefer:"" }); setTasks(prev => prev.filter(t => t.id !== id)); } catch {}
    setConfirmDeleteTask(null); showToast("Task deleted");
  };

  const saveTaskEdit = async (id) => {
    if (!taskDraftNote.trim()) return showToast("Task note is required");
    const isoDate = taskDraftDate.trim() ? parseNextTouch(taskDraftDate.trim()) || null : null;
    const patch = { note: taskDraftNote.trim(), due_date: isoDate, contact_id: taskDraftContactId || null };
    try {
      await api(`tasks?id=eq.${id}`, { method:"PATCH", prefer:"", body: JSON.stringify(patch) });
      setTasks(prev => prev.map(t => t.id === id ? { ...t, ...patch } : t));
      setEditingTaskId(null); showToast("Task updated!");
    } catch { showToast("Error updating task"); }
  };

  const startEditTask = (t) => {
    setEditingTaskId(t.id); setTaskDraftNote(t.note); setTaskDraftContactId(t.contact_id || "");
    if (t.due_date) { const [yyyy,mm,dd] = t.due_date.slice(0,10).split("-"); setTaskDraftDate(`${mm}/${dd}/${yyyy}`); }
    else setTaskDraftDate("");
  };

  const addHealthNote = async () => {
    if (!newHealthNote.trim()) return showToast("Note is required");
    const isoDate = newHealthDate.trim() ? parseNextTouch(newHealthDate.trim()) || null : null;
    const payload = { note: newHealthNote.trim(), category: newHealthCategory, due_date: isoDate, completed: false, completed_at: null };
    try {
      const res = await api("health_notes", { method:"POST", body: JSON.stringify(payload) });
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
      await api(`health_notes?id=eq.${id}`, { method:"PATCH", prefer:"", body: JSON.stringify(patch) });
      setHealthNotes(prev => prev.map(h => h.id === id ? { ...h, ...patch } : h));
      showToast(undo ? "Reopened" : "Done!");
    } catch { showToast("Error updating"); }
  };

  const deleteHealthNote = async (id) => {
    try { await api(`health_notes?id=eq.${id}`, { method:"DELETE", prefer:"" }); setHealthNotes(prev => prev.filter(h => h.id !== id)); } catch {}
    setConfirmDeleteHealth(null); showToast("Deleted");
  };

  const saveHealthEdit = async (id) => {
    if (!healthDraftNote.trim()) return showToast("Note is required");
    const isoDate = healthDraftDate.trim() ? parseNextTouch(healthDraftDate.trim()) || null : null;
    const patch = { note: healthDraftNote.trim(), due_date: isoDate, category: healthDraftCategory };
    try {
      await api(`health_notes?id=eq.${id}`, { method:"PATCH", prefer:"", body: JSON.stringify(patch) });
      setHealthNotes(prev => prev.map(h => h.id === id ? { ...h, ...patch } : h));
      setEditingHealthId(null); showToast("Updated!");
    } catch { showToast("Error updating"); }
  };

  const startEditHealth = (h) => {
    setEditingHealthId(h.id); setHealthDraftNote(h.note); setHealthDraftCategory(h.category || "general");
    if (h.due_date) { const [yyyy,mm,dd] = h.due_date.slice(0,10).split("-"); setHealthDraftDate(`${mm}/${dd}/${yyyy}`); }
    else setHealthDraftDate("");
  };

  const saveEntry = async () => {
    if (!editEntry.name.trim()) return showToast("Name is required");
    const isNew = editEntry._isNew;
    const { _isNew, id, touch_log, ...fields } = editEntry;
    const payload = { ...fields, touch_log: touch_log || [] };
    try {
      if (isNew) {
        const res = await api("contacts", { method:"POST", body: JSON.stringify(payload) });
        if (res.ok) {
          const created = await res.json();
          const newContact = Array.isArray(created) ? created[0] : created;
          setContacts(prev => [...prev, { ...newContact, touch_log: newContact.touch_log || [] }].sort((a,b) => a.name.localeCompare(b.name)));
          showToast("Contact added!");
        } else { const err = await res.json(); showToast("Error: " + (err.message || err.hint || "Could not save")); return; }
      } else {
        const res = await api(`contacts?id=eq.${id}`, { method:"PATCH", prefer:"", body: JSON.stringify(fields) });
        if (res.ok) { setContacts(prev => prev.map(c => c.id === id ? { ...c, ...fields } : c)); showToast("Contact updated!"); }
      }
      setView("profile");
    } catch { showToast("Error saving contact"); }
  };

  const saveNextTouch = async () => {
    const contact = contacts[selected];
    try {
      await api(`contacts?id=eq.${contact.id}`, { method:"PATCH", prefer:"", body: JSON.stringify({ next_touch: nextTouchDraft.trim() }) });
      setContacts(prev => prev.map(c => c.id === contact.id ? { ...c, next_touch: nextTouchDraft.trim() } : c));
      setEditingNextTouch(false); showToast("Next touch updated!");
    } catch { showToast("Error saving"); }
  };

  const deleteContact = async (id) => {
    try { await api(`contacts?id=eq.${id}`, { method:"DELETE", prefer:"" }); setContacts(prev => prev.filter(c => c.id !== id)); } catch {}
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
      await api(`contacts?id=eq.${contact.id}`, { method:"PATCH", prefer:"", body: JSON.stringify(patch) });
      setContacts(prev => prev.map(c => c.id === contact.id ? { ...c, touch_log: updatedLog, ...(inlineNextTouch.trim() ? { next_touch: inlineNextTouch.trim() } : {}) } : c));
      setNewNote(""); setAddingNote(false); setInlineNextTouch("");
      showToast(inlineNextTouch.trim() ? "Note & next touch saved!" : "Note added!");
    } catch { showToast("Error saving note"); }
  };

  const deleteTouchNote = async ({ contactId, touchId }) => {
    const contact = contacts.find(c => c.id === contactId);
    const updatedLog = contact.touch_log.filter(t => t.id !== touchId);
    try {
      await api(`contacts?id=eq.${contactId}`, { method:"PATCH", prefer:"", body: JSON.stringify({ touch_log: updatedLog }) });
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
    showToast("Exported!"); setExportMenuOpen(false);
  };

  const exportCSV = () => {
    const headers = ["Name","Company","Phone","Email","Notes","Date","Touch Log"];
    const rows = contacts.map(c => { const log = (c.touch_log||[]).map(t => `[${formatDateTime(t.createdAt)}] ${t.text}`).join(" | "); return [c.name,c.company,c.phone,c.email,(c.notes||"").replace(/\n/g," "),c.date,log]; });
    const csv = [headers,...rows].map(r => r.map(v => `"${(v||"").replace(/"/g,'""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type:"text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `DeanBoard_${new Date().toISOString().slice(0,10)}.csv`; a.click();
    showToast("Exported!"); setExportMenuOpen(false);
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
        name: headers.findIndex(h => h === "name" || (h.includes("name") && !h.includes("company") && !h.includes("contact"))),
        company: headers.findIndex(h => h.includes("company") || h.includes("firm") || h.includes("org")),
        phone: headers.findIndex(h => h.includes("phone") || h.includes("mobile") || h.includes("tel")),
        email: headers.findIndex(h => h.includes("email") || h.includes("mail")),
        notes: headers.findIndex(h => h === "lastnote" || h.includes("lastnote") || h.includes("comment") || h.includes("memo") || (h.includes("note") && !h.includes("notes_count"))),
        next_touch: headers.findIndex(h => h === "followupdate" || h.includes("followup") || h.includes("nexttouch") || h.includes("next")),
      };
      if (map.name === -1) map.name = 0;
      const toNextTouch = (val) => {
        if (!val || !val.trim()) return "";
        const v = val.trim();
        if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(v)) return v;
        const iso = v.slice(0, 10);
        if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) { const [yyyy, mm, dd] = iso.split("-"); return `${mm}/${dd}/${yyyy}`; }
        return "";
      };
      const preview = lines.slice(1, 6).map(line => {
        const cols = parseCSVLine(line);
        return { name: cols[map.name]||"", company: map.company>=0?cols[map.company]||"":"", phone: map.phone>=0?cols[map.phone]||"":"", email: map.email>=0?cols[map.email]||"":"", notes: map.notes>=0?cols[map.notes]||"":"", next_touch: map.next_touch>=0?toNextTouch(cols[map.next_touch]||""):"" };
      }).filter(r => r.name);
      const allRows = lines.slice(1).map(line => {
        const cols = parseCSVLine(line);
        return { name: cols[map.name]||"", company: map.company>=0?cols[map.company]||"":"", phone: map.phone>=0?cols[map.phone]||"":"", email: map.email>=0?cols[map.email]||"":"", notes: map.notes>=0?cols[map.notes]||"":"", next_touch: map.next_touch>=0?toNextTouch(cols[map.next_touch]||""):"", date: new Date().toISOString().slice(0,10), touch_log: [] };
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
        const payload = { ...row };
        const res = await api("contacts", { method:"POST", body: JSON.stringify(payload) });
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

  // ── Health filter helpers ──
  const applyHealthFilter = (list) => healthFilter === "all" ? list : list.filter(h => h.category === healthFilter);
  const healthOpen       = applyHealthFilter(healthNotes.filter(h => !h.completed));
  const healthOverdue    = healthOpen.filter(h => taskDueStatus(h.due_date) === "overdue");
  const healthNonOverdue = healthOpen.filter(h => taskDueStatus(h.due_date) !== "overdue");
  const healthDone       = applyHealthFilter(healthNotes.filter(h => h.completed));

  // ── Theme palette ──
  const T = dark ? {
    shell:        "#0A0F1C",
    splashBg:     "#0A0F1C",
    heroBg:       "#121A2C",
    headerBg:     "#121A2C",
    headerBorder: "rgba(140,180,255,0.12)",
    tabBg:        "#121A2C",
    tabBorder:    "rgba(140,180,255,0.12)",
    tabColor:     "#6E85AC",
    tabActive:    "#6FB1FF",
    sectionBg:    "#0A0F1C",
    sectionColor: "#6FB1FF",
    rowBg:        "#121A2C",
    rowBorder:    "rgba(140,180,255,0.1)",
    cardBg:       "#121A2C",
    cardBorder:   "rgba(140,180,255,0.12)",
    inputBg:      "#0F1526",
    inputBorder:  "rgba(140,180,255,0.18)",
    inputColor:   "#EAF1FF",
    text:         "#EAF1FF",
    textSub:      "#A9BBD9",
    textMuted:    "#6E85AC",
    completedNote:"#3A4762",
    deleteIcon:   "#3A4762",
    fieldLabel:   "#6E85AC",
    touchColor:   "#6FB1FF",
    touchText:    "#EAF1FF",
    btnSecBorder: "rgba(140,180,255,0.18)",
    btnSecColor:  "#A9BBD9",
    iconBtnBg:    "#1B2338",
    iconBtnBorder:"rgba(140,180,255,0.15)",
    iconBtnColor: "#A9BBD9",
    overlayBg:    "rgba(3,6,14,0.72)",
    modalBg:      "#121A2C",
    toastBg:      "#0A0F1C",
    toastColor:   "#6FB1FF",
    exportBg:     "#121A2C",
    kpiBg:        "#121A2C",
    kpiBorder:    "#3D6FD9",
    kpiColor:     "#EAF1FF",
    kpiLabel:     "#6E85AC",
    subtleBg:     "#121A2C",
    subtleBg2:    "#0F1526",
    subtleBorder: "rgba(140,180,255,0.1)",
    subtleBorder2:"rgba(140,180,255,0.08)",
    inputFillAlt: "#0F1526",
    inputBorderAlt:"rgba(140,180,255,0.15)",
    doneBadgeBlueBg:"#1B2338",
    doneBadgeBlueColor:"#6FB1FF",
    doneBadgeGreenBg:"#1B2338",
    doneBadgeGreenColor:"#3D6FD9",
    railOverdue:  "#6FB1FF",
    railToday:    "#6FB1FF",
    railUpcoming: "#3D6FD9",
    railNeutral:  "#24314F",
    fontDisplay:  "'Space Grotesk',sans-serif",
    fontMono:     "'IBM Plex Mono',monospace",
  } : {
    shell:        "#f3f2f2",
    splashBg:     "#f3f2f2",
    heroBg:       "#ffffff",
    headerBg:     "#ffffff",
    headerBorder: "#dddbda",
    tabBg:        "#ffffff",
    tabBorder:    "#dddbda",
    tabColor:     "#3e3e3c",
    tabActive:    "#0176d3",
    sectionBg:    "#f3f2f2",
    sectionColor: "#0176d3",
    rowBg:        "#ffffff",
    rowBorder:    "#dddbda",
    cardBg:       "#ffffff",
    cardBorder:   "#c9c7c5",
    inputBg:      "#ffffff",
    inputBorder:  "#c9c7c5",
    inputColor:   "#181818",
    text:         "#181818",
    textSub:      "#3e3e3c",
    textMuted:    "#706e6b",
    completedNote:"#a8a6a4",
    deleteIcon:   "#706e6b",
    fieldLabel:   "#706e6b",
    touchColor:   "#0176d3",
    touchText:    "#181818",
    btnSecBorder: "#c9c7c5",
    btnSecColor:  "#3e3e3c",
    iconBtnBg:    "#f3f2f2",
    iconBtnBorder:"#c9c7c5",
    iconBtnColor: "#3e3e3c",
    overlayBg:    "rgba(24,24,24,0.5)",
    modalBg:      "#ffffff",
    toastBg:      "#032d60",
    toastColor:   "#ffffff",
    exportBg:     "#ffffff",
    kpiBg:        "#eef4fb",
    kpiBorder:    "#0176d3",
    kpiColor:     "#032d60",
    kpiLabel:     "#0176d3",
    subtleBg:     "#ffffff",
    subtleBg2:    "#ffffff",
    subtleBorder: "#dddbda",
    subtleBorder2:"#e5e5e5",
    inputFillAlt: "#ffffff",
    inputBorderAlt:"#c9c7c5",
    doneBadgeBlueBg:"#eef4fb",
    doneBadgeBlueColor:"#014486",
    doneBadgeGreenBg:"#e3f5ec",
    doneBadgeGreenColor:"#04844b",
    railOverdue:  "#dc2626",
    railToday:    "#d97706",
    railUpcoming: "#0176d3",
    railNeutral:  "#c9c7c5",
    fontDisplay:  "'Space Grotesk',sans-serif",
    fontMono:     "'IBM Plex Mono',monospace",
  };

  if (loading) return (
    <div style={{...styles.shell,background:dark?"#0A0F1C":"#f0f2f5",color:dark?"#EAF1FF":"#111827"}}>
      <div style={{...styles.splashScreen,background:T.splashBg}}>
        <div style={styles.splashLogo}>D</div>
        <div style={{...styles.splashTitle,color:T.text}}>DeanBoard</div>
        <div style={{...styles.splashTagline,color:T.textMuted}}>Making the World Better, one DeanTask at a Time</div>
        <div style={styles.splashSpinner}/>
      </div>
    </div>
  );

  return (
    <div style={{...styles.shell, background:T.shell, color:T.text}}>
      <style>{getCss(dark)}</style>
      {toast&&<div style={{...styles.toast,background:T.toastBg,color:T.toastColor,border:`1px solid ${T.cardBorder}`}}>{toast}</div>}

      {exportMenuOpen&&(
        <div style={{position:"fixed",top:60,right:16,background:T.exportBg,backdropFilter:"blur(20px)",borderRadius:14,boxShadow:"0 20px 60px rgba(0,0,0,0.3)",border:`1px solid ${T.cardBorder}`,zIndex:9999,minWidth:230,overflow:"hidden"}} onClick={e=>e.stopPropagation()}>
          <button style={{display:"flex",alignItems:"center",gap:12,width:"100%",padding:"13px 16px",background:"none",border:"none",cursor:"pointer",fontFamily:"inherit",textAlign:"left",color:T.text}} onClick={exportXLSX}><span style={styles.exportMenuIcon}>📊</span><div><div style={{fontSize:13,fontWeight:600,color:T.text}}>Spreadsheet (.xlsx)</div><div style={{fontSize:11,color:T.textMuted,marginTop:1}}>Best for Google Sheets</div></div></button>
          <div style={{height:1,background:T.cardBorder}}/>
          <button style={{display:"flex",alignItems:"center",gap:12,width:"100%",padding:"13px 16px",background:"none",border:"none",cursor:"pointer",fontFamily:"inherit",textAlign:"left",color:T.text}} onClick={exportCSV}><span style={styles.exportMenuIcon}>📄</span><div><div style={{fontSize:13,fontWeight:600,color:T.text}}>CSV (.csv)</div><div style={{fontSize:11,color:T.textMuted,marginTop:1}}>Plain text, universal</div></div></button>
          <div style={{height:1,background:T.cardBorder}}/>
          <label style={{...styles.exportMenuItem,cursor:"pointer"}}>
            <span style={styles.exportMenuIcon}>📥</span>
            <div><div style={{fontSize:13,fontWeight:600,color:T.text}}>Import CSV</div><div style={{fontSize:11,color:T.textMuted,marginTop:1}}>Add contacts from file</div></div>
            <input type="file" accept=".csv" style={{display:"none"}} onChange={e=>{setExportMenuOpen(false);handleImportFile(e);}}/>
          </label>
        </div>
      )}

      {importDone&&(<div style={{position:"absolute",bottom:"calc(94px + env(safe-area-inset-bottom))",left:"50%",transform:"translateX(-50%)",background:"#0f1f3d",color:"#f0f4f8",padding:"10px 20px",borderRadius:30,fontSize:13,fontWeight:600,zIndex:100,whiteSpace:"nowrap",boxShadow:"0 4px 20px rgba(0,0,0,0.3)"}}>Imported {importDone.added} contact{importDone.added!==1?"s":""}{importDone.skipped>0?` \u00b7 ${importDone.skipped} skipped`:""}</div>)}

      {importModal&&importPreview?.allRows&&(
        <div style={{...styles.overlay,background:T.overlayBg}}>
          <div style={{background:T.modalBg,backdropFilter:"blur(16px)",borderRadius:16,padding:"22px 20px",width:"100%",maxWidth:360,maxHeight:"80vh",overflowY:"auto",border:"1px solid rgba(59,130,246,0.2)",boxShadow:"0 24px 64px rgba(0,0,0,0.5)"}}>
            <p style={{fontSize:17,fontWeight:700,color:T.text,margin:"0 0 4px"}}>Import Contacts</p>
            <p style={{fontSize:13,color:"rgba(148,163,184,0.7)",margin:"0 0 14px"}}>{importPreview.total} contact{importPreview.total!==1?"s":""} found. Preview (first 5):</p>
            <div style={{background:"rgba(255,255,255,0.04)",borderRadius:10,padding:"10px 12px",marginBottom:14,border:"1px solid rgba(255,255,255,0.08)"}}>
              {importPreview.preview.map((r,i)=>(
                <div key={i} style={{borderBottom:i<importPreview.preview.length-1?"1px solid rgba(255,255,255,0.08)":"none",paddingBottom:i<importPreview.preview.length-1?8:0,marginBottom:i<importPreview.preview.length-1?8:0}}>
                  <div style={{fontSize:13,fontWeight:600,color:T.text}}>{r.name}</div>
                  <div style={{fontSize:11,color:T.textSub,marginTop:2}}>{[r.company,r.email,r.phone].filter(Boolean).join(" \u00b7 ")||"No extra fields detected"}</div>
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

      {confirmDelete&&(<div style={{...styles.overlay,background:T.overlayBg}}><div style={{...styles.modal,background:T.modalBg,border:`1.5px solid ${T.cardBorder}`}}><p style={{...styles.modalTitle,color:T.text}}>Delete Contact?</p><p style={{...styles.modalSub,color:T.textSub}}>This cannot be undone.</p><div style={{display:"flex",gap:10,marginTop:18}}><button style={styles.btnDanger} onClick={()=>deleteContact(confirmDelete)}>Delete</button><button style={{...styles.btnSecondary,border:`1.5px solid ${T.btnSecBorder}`,color:T.btnSecColor}} onClick={()=>setConfirmDelete(null)}>Cancel</button></div></div></div>)}
      {confirmDeleteTouch&&(<div style={{...styles.overlay,background:T.overlayBg}}><div style={{...styles.modal,background:T.modalBg}}><p style={{...styles.modalTitle,color:T.text}}>Delete Note?</p><p style={{...styles.modalSub,color:T.textSub}}>This cannot be undone.</p><div style={{display:"flex",gap:10,marginTop:18}}><button style={styles.btnDanger} onClick={()=>deleteTouchNote(confirmDeleteTouch)}>Delete</button><button style={{...styles.btnSecondary,border:`1px solid ${T.btnSecBorder}`,color:T.btnSecColor}} onClick={()=>setConfirmDeleteTouch(null)}>Cancel</button></div></div></div>)}
      {confirmDeleteTask&&(<div style={{...styles.overlay,background:T.overlayBg}}><div style={{...styles.modal,background:T.modalBg}}><p style={{...styles.modalTitle,color:T.text}}>Delete Task?</p><p style={{...styles.modalSub,color:T.textSub}}>This cannot be undone.</p><div style={{display:"flex",gap:10,marginTop:18}}><button style={styles.btnDanger} onClick={()=>deleteTask(confirmDeleteTask)}>Delete</button><button style={{...styles.btnSecondary,border:`1px solid ${T.btnSecBorder}`,color:T.btnSecColor}} onClick={()=>setConfirmDeleteTask(null)}>Cancel</button></div></div></div>)}
      {confirmDeleteHealth&&(<div style={{...styles.overlay,background:T.overlayBg}}><div style={{...styles.modal,background:T.modalBg}}><p style={{...styles.modalTitle,color:T.text}}>Delete Health Note?</p><p style={{...styles.modalSub,color:T.textSub}}>This cannot be undone.</p><div style={{display:"flex",gap:10,marginTop:18}}><button style={styles.btnDanger} onClick={()=>deleteHealthNote(confirmDeleteHealth)}>Delete</button><button style={{...styles.btnSecondary,border:`1px solid ${T.btnSecBorder}`,color:T.btnSecColor}} onClick={()=>setConfirmDeleteHealth(null)}>Cancel</button></div></div></div>)}

      <div style={{...styles.header,background:T.headerBg,borderBottom:dark?"1px solid rgba(140,180,255,0.12)":`1px solid ${T.headerBorder}`}}>
        {view!=="list"?(
          <button style={{...styles.backBtn,background:T.iconBtnBg,border:`1px solid ${T.iconBtnBorder}`,color:T.iconBtnColor}} onClick={()=>{setAddingNote(false);setNewNote("");setEditingNextTouch(false);setView("list");}}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15,18 9,12 15,6"/></svg>
          </button>
        ):(
          <div style={{width:32}}/>
        )}
        <span style={{...styles.headerTitle, fontFamily:T.fontDisplay, display:"flex", alignItems:"center", gap:8, background: "none", WebkitBackgroundClip: "unset", WebkitTextFillColor: T.text, color: T.text}}>
          {view==="list"&&<span style={{width:7,height:7,borderRadius:"50%",background:T.sectionColor,display:"inline-block",animation:"pulseDot 2s ease-in-out infinite",flexShrink:0}}/>}
          {view==="list"?"DeanBoard":view==="profile"?contact?.name||"Contact":view==="add"?"New Contact":"Edit Contact"}
        </span>
        <button style={{background:T.iconBtnBg,border:`1px solid ${T.iconBtnBorder}`,color:T.iconBtnColor,cursor:"pointer",padding:"7px",borderRadius:9,display:"flex",alignItems:"center"}} onClick={()=>setDark(d=>!d)} title={dark?"Switch to Light Mode":"Switch to Dark Mode"}>{dark?(<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>):(<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>)}</button>
        {view==="list"&&homeTab!=="contacts"&&<div style={{width:36}}/>}
        {view==="list"&&homeTab==="contacts"&&(
          <button style={styles.exportBtn} onClick={e=>{e.stopPropagation();setExportMenuOpen(o=>!o);}}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          </button>
        )}
        {view==="profile"&&<button style={{...styles.exportBtn,background:T.iconBtnBg,border:`1px solid ${T.iconBtnBorder}`,color:T.iconBtnColor}} onClick={()=>{setEditEntry({...contact});setView("edit");}}><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>}
        {(view==="profile"||view==="add"||view==="edit")&&<button style={{...styles.homeBtn,background:T.iconBtnBg,border:`1px solid ${T.iconBtnBorder}`,color:T.iconBtnColor}} onClick={()=>{setAddingNote(false);setNewNote("");setEditingNextTouch(false);setView("list");}}><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg></button>}
      </div>

      {view==="list"&&(
        <div style={{...styles.tabBar,background:T.tabBg,borderBottom:dark?"1px solid rgba(140,180,255,0.12)":`1px solid ${T.tabBorder}`}}>
          {[["home","🏠 Home"],["contacts","Contacts"],["tasks","Tasks"],["health","Health"]].map(([id,label])=>(
            <button key={id} style={{...styles.tab,color:homeTab===id?T.tabActive:T.tabColor,...(homeTab===id?{borderBottom:`2px solid ${T.tabActive}`}:{})}} onClick={()=>setHomeTab(id)}>
              {label}
              {id==="tasks"&&tasks.filter(t=>!t.completed).length>0&&<span style={styles.tabBadge}>{tasks.filter(t=>!t.completed).length}</span>}
              {id==="health"&&healthOverdueCount>0&&<span style={{...styles.tabBadge,background:T.railOverdue}}>{healthOverdueCount}</span>}
            </button>
          ))}
        </div>
      )}

      {view==="list"&&homeTab==="home"&&(
        <div style={styles.body}>
          <div style={styles.listScroll}>
            <div style={{background:T.heroBg,padding:"22px 20px 24px",borderBottom:dark?"1px solid rgba(140,180,255,0.12)":`1px solid ${T.headerBorder}`}}>
              <div style={{fontSize:11,fontWeight:600,color:T.textMuted,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:5,fontFamily:T.fontMono}}>{getGreeting()}, Dean</div>
              <div style={{fontSize:22,fontWeight:700,color:T.text,letterSpacing:"-0.02em",fontFamily:T.fontDisplay}}>{new Date().toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric",year:"numeric"})}</div>
              <div style={{display:"flex",gap:10,marginTop:16}}>
                {[{label:"Open Tasks",val:tasks.filter(t=>!t.completed).length,rail:T.railUpcoming},{label:"Overdue",val:upcomingTasks.filter(t=>taskDueStatus(t.due_date)==="overdue").length,rail:T.railOverdue},{label:"Follow-ups",val:upcomingContacts.length,rail:T.railUpcoming},{label:"Contacts",val:contacts.length,rail:T.railNeutral}].map(kpi=>(
                  <div key={kpi.label} style={{flex:1,background:T.cardBg,borderTop:`2px solid ${kpi.rail}`,borderRadius:"0 0 8px 8px",padding:"12px 10px"}}>
                    <div style={{fontSize:20,fontWeight:500,color:T.text,lineHeight:1,fontFamily:T.fontMono,fontVariantNumeric:"tabular-nums"}}>{kpi.val}</div>
                    <div style={{fontSize:9,color:T.textMuted,marginTop:4,fontWeight:500,textTransform:"uppercase",letterSpacing:"0.06em"}}>{kpi.label}</div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{padding:"18px 16px 6px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
              <span style={{fontSize:11,fontWeight:700,color:T.sectionColor,textTransform:"uppercase",letterSpacing:"0.08em"}}>📋 Upcoming Tasks</span>
              <span style={{fontSize:11,color:T.textMuted}}>{upcomingTasks.length} · next 7 days</span>
            </div>
            {upcomingTasks.length===0?(
              <div style={{margin:"0 16px 16px",background:T.cardBg,borderRadius:12,border:`1.5px solid ${T.cardBorder}`,padding:"24px 20px",textAlign:"center"}}>
                <div style={{fontSize:13,color:T.textMuted}}>No tasks due in the next 7 days 🎉</div>
              </div>
            ):(
              <div style={{display:"grid",gridTemplateColumns:"minmax(0,1fr) minmax(0,1fr)",gap:10,padding:"0 16px 8px"}}>
                {upcomingTasks.map(t=>{
                  const status=taskDueStatus(t.due_date);
                  const accentColor=status==="overdue"?T.railOverdue:status==="today"?T.railToday:T.railUpcoming;
                  const chipStyle=status==="overdue"?{color:T.railOverdue,background:dark?"rgba(111,177,255,0.14)":"rgba(220,38,38,0.1)",border:`1px solid ${dark?"rgba(111,177,255,0.3)":"rgba(220,38,38,0.35)"}`}:status==="today"?{color:T.railToday,background:dark?"rgba(111,177,255,0.14)":"rgba(217,119,6,0.1)",border:`1px solid ${dark?"rgba(111,177,255,0.3)":"rgba(217,119,6,0.35)"}`}:{color:T.railUpcoming,background:dark?"rgba(61,111,217,0.14)":"rgba(37,99,235,0.1)",border:`1px solid ${dark?"rgba(61,111,217,0.35)":"rgba(37,99,235,0.35)"}`};
                  return(
                    <div key={t.id} style={{background:T.cardBg,borderRadius:12,border:`1.5px solid ${T.cardBorder}`,borderTop:`4px solid ${accentColor}`,padding:"14px",display:"flex",flexDirection:"column",minHeight:110,cursor:"pointer"}} onClick={()=>{setHomeTab("tasks");startEditTask(t);}}>
                      <span style={{...styles.taskDueChip,...chipStyle,fontFamily:T.fontMono,fontSize:10,marginBottom:8,alignSelf:"flex-start"}}>{status==="overdue"?`Due ${formatTaskDue(t.due_date)}`:status==="today"?"Today":`${formatTaskDue(t.due_date)}`}</span>
                      <div style={{fontSize:12,color:T.text,lineHeight:1.45,fontWeight:500,flex:1,overflowWrap:"anywhere",wordBreak:"break-word"}}>{linkifyText(t.note, T.touchColor)}</div>
                      <button style={{marginTop:10,fontSize:10,fontWeight:600,padding:"5px 0",borderRadius:7,border:`1px solid ${dark?"rgba(59,130,246,0.25)":T.kpiBorder}`,background:T.doneBadgeBlueBg,color:T.doneBadgeBlueColor,cursor:"pointer",fontFamily:"inherit",width:"100%"}} onClick={(e)=>{e.stopPropagation();completeTask(t.id);}}>Done</button>
                    </div>
                  );
                })}
              </div>
            )}

            {upcomingContacts.length>0&&(<>
              <div style={{padding:"14px 16px 6px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                <span style={{fontSize:11,fontWeight:700,color:T.sectionColor,textTransform:"uppercase",letterSpacing:"0.08em"}}>🗓 Follow-ups Due</span>
                <span style={{fontSize:11,color:T.textMuted}}>{upcomingContacts.length} contact{upcomingContacts.length!==1?"s":""}</span>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"minmax(0,1fr) minmax(0,1fr)",gap:10,padding:"0 16px 8px"}}>
                {upcomingContacts.map(c=>{
                  const iso=parseNextTouch(c.next_touch);const status=nextTouchStatus(c.next_touch);
                  const origIdx=contacts.findIndex(x=>x.id===c.id);
                  const accentColor=status==="overdue"?T.railOverdue:status==="today"?T.railToday:T.railUpcoming;
                  const badgeStyle=status==="overdue"?{color:T.railOverdue,background:dark?"rgba(111,177,255,0.15)":"#fdecea",border:`1px solid ${dark?"rgba(111,177,255,0.3)":"#f5c6c3"}`}:status==="today"?{color:T.railToday,background:dark?"rgba(111,177,255,0.15)":"#fef3e2",border:`1px solid ${dark?"rgba(111,177,255,0.3)":"#fbdca3"}`}:{color:T.doneBadgeBlueColor,background:T.doneBadgeBlueBg,border:`1px solid ${dark?"rgba(59,130,246,0.25)":T.kpiBorder}`};
                  return(
                    <div key={c.id} style={{background:T.cardBg,borderRadius:12,border:`1.5px solid ${T.cardBorder}`,borderTop:`4px solid ${accentColor}`,padding:"14px",display:"flex",flexDirection:"column",minHeight:100,cursor:"pointer"}} onClick={()=>{setSelected(origIdx);setView("profile");}}>
                      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
                        <div style={{width:30,height:30,borderRadius:8,background:avatarColor(c.name),display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,color:"#fff",flexShrink:0}}>{initials(c.name)}</div>
                        <div style={{minWidth:0}}>
                          <div style={{fontSize:12,fontWeight:600,color:T.text,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{c.name}</div>
                          <div style={{fontSize:11,color:T.textSub,marginTop:1,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{c.company||c.email||""}</div>
                        </div>
                      </div>
                      <span style={{...badgeStyle,fontFamily:T.fontMono,fontSize:10,fontWeight:600,borderRadius:6,padding:"3px 8px",alignSelf:"flex-start"}}>{status==="overdue"?"Overdue":status==="today"?"Today":`${formatTaskDue(iso)}`}</span>
                    </div>
                  );
                })}
              </div>
            </>)}
            {/* ── Health Highlights on Home ── */}
            {(() => {
              const homeHealthItems = healthNotes
                .filter(h => !h.completed)
                .filter(h => {
                  const s = taskDueStatus(h.due_date);
                  return s === "overdue" || s === "today" || (h.due_date && h.due_date <= in7DaysIso);
                })
                .slice(0, 6);
              if (homeHealthItems.length === 0) return null;
              return (<>
                <div style={{padding:"14px 16px 6px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                  <span style={{fontSize:11,fontWeight:700,color:dark?T.sectionColor:"#04844b",textTransform:"uppercase",letterSpacing:"0.08em"}}>💊 Health · Next 7 Days</span>
                  <span style={{fontSize:11,color:T.textMuted}}>{homeHealthItems.length} item{homeHealthItems.length!==1?"s":""}</span>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"minmax(0,1fr) minmax(0,1fr)",gap:10,padding:"0 16px 8px"}}>
                  {homeHealthItems.map(h => {
                    const status = taskDueStatus(h.due_date);
                    const cat = getCat(h.category);
                    const accentColor = status==="overdue" ? T.railOverdue : status==="today" ? T.railToday : T.railUpcoming;
                    const chipStyle = status==="overdue"
                      ? {color:T.railOverdue,background:dark?"rgba(111,177,255,0.14)":"#fdecea",border:`1px solid ${dark?"rgba(111,177,255,0.3)":"#f5c6c3"}`}
                      : status==="today"
                      ? {color:T.railToday,background:dark?"rgba(111,177,255,0.14)":"#fef3e2",border:`1px solid ${dark?"rgba(111,177,255,0.3)":"#fbdca3"}`}
                      : {color:T.railUpcoming,background:dark?"rgba(61,111,217,0.14)":"#e3f5ec",border:`1px solid ${dark?"rgba(61,111,217,0.3)":"#c7ecdb"}`};
                    const chipLabel = status==="overdue" ? `Due ${formatTaskDue(h.due_date)}` : status==="today" ? "Today" : formatTaskDue(h.due_date);
                    return (
                      <div key={h.id} style={{background:T.cardBg,borderRadius:12,border:`1.5px solid ${T.cardBorder}`,borderTop:`4px solid ${accentColor}`,padding:"14px",display:"flex",flexDirection:"column",minHeight:110,cursor:"pointer"}} onClick={()=>{setHomeTab("health");startEditHealth(h);}}>
                        <span style={{fontSize:9,fontWeight:700,padding:"2px 8px",borderRadius:20,border:`1px solid ${cat.border}`,background:cat.bg,color:cat.color,marginBottom:8,alignSelf:"flex-start"}}>{cat.emoji} {cat.label}</span>
                        <div style={{fontSize:12,color:T.text,lineHeight:1.45,fontWeight:500,flex:1,overflowWrap:"anywhere",wordBreak:"break-word"}}>{linkifyText(h.note, T.touchColor)}</div>
                        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginTop:10,gap:6}}>
                          <span style={{...chipStyle,fontFamily:T.fontMono,fontSize:10,fontWeight:600,borderRadius:6,padding:"2px 7px"}}>{chipLabel}</span>
                          <button style={{fontSize:10,fontWeight:600,padding:"4px 10px",borderRadius:7,cursor:"pointer",fontFamily:"inherit",border:`1px solid ${dark?"rgba(111,177,255,0.3)":"#c7ecdb"}`,background:T.doneBadgeGreenBg,color:T.doneBadgeGreenColor,flexShrink:0}} onClick={(e)=>{e.stopPropagation();completeHealthNote(h.id);}}>Done</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>);
            })()}

            <div style={{height:32}}/>
          </div>
        </div>
      )}

      {view==="list"&&homeTab==="contacts"&&(
        <div style={styles.body}>
          <div style={{...styles.searchWrap,background:T.cardBg,border:`1.5px solid ${T.cardBorder}`}}>
            <svg style={{flexShrink:0,color:T.textMuted}} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input style={{...styles.searchInput,color:T.text}} placeholder="Search contacts..." value={search} onChange={e=>setSearch(e.target.value)}/>
            {search&&<button style={{...styles.clearSearch,color:T.textMuted}} onClick={()=>setSearch("")}>x</button>}
          </div>
          {contacts.length===0?<div style={styles.empty}><div style={styles.emptyIcon}>📋</div><p style={{...styles.emptyTitle,color:T.text}}>No contacts yet</p><p style={{...styles.emptySub,color:T.textMuted}}>Tap + to add your first contact</p></div>
          :filtered.length===0?<div style={styles.empty}><p style={{...styles.emptyTitle,color:T.text}}>No results for "{search}"</p></div>
          :(
            <div style={styles.listScroll}>
              {Object.keys(grouped).sort().map(letter=>(
                <div key={letter}>
                  <div style={{...styles.sectionHeader,background:T.sectionBg,color:T.sectionColor,borderBottom:`1px solid ${T.rowBorder}`}}>{letter}</div>
                  {grouped[letter].map(c=>(
                    <div key={c.id} style={{...styles.contactRow,background:T.rowBg,borderBottom:`1px solid ${T.rowBorder}`}} className="contact-row" onClick={()=>{setSelected(c._origIdx);setView("profile");}}>
                      <div style={{...styles.avatar,background:avatarColor(c.name)}}>{initials(c.name)}</div>
                      <div style={styles.rowInfo}><div style={{...styles.rowName,color:T.text}}>{c.name}</div><div style={{...styles.rowSub,color:T.textSub}}>{c.company||c.email||c.phone||"—"}</div><NextTouchChip val={c.next_touch}/></div>
                      {(c.touch_log||[]).length>0&&<span style={{...styles.touchBadge,background:T.doneBadgeBlueBg,color:T.doneBadgeBlueColor,border:`1px solid ${dark?"rgba(59,130,246,0.25)":T.kpiBorder}`}}>{c.touch_log.length}</span>}
                      <svg style={{color:T.textMuted,flexShrink:0}} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9,18 15,12 9,6"/></svg>
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
            <div style={{...styles.taskAddPanel,background:T.cardBg,border:`1.5px solid ${T.cardBorder}`}}>
              <div style={{...styles.taskAddTitle,color:T.textMuted}}>+ New Task</div>
              <div style={{marginBottom:8}}><NextTouchInput value={newTaskDate} onChange={setNewTaskDate} inputStyle={{flex:1,padding:"9px 12px",border:`1px solid ${T.inputBorderAlt}`,borderRadius:10,fontSize:16,color:T.text,fontFamily:"inherit",outline:"none",boxSizing:"border-box",background:T.inputFillAlt}}/></div>
              <select value={newTaskContactId} onChange={e=>setNewTaskContactId(e.target.value)} style={{width:"100%",padding:"9px 12px",marginBottom:8,border:`1px solid ${T.inputBorderAlt}`,borderRadius:10,fontSize:16,color:T.text,fontFamily:"inherit",outline:"none",boxSizing:"border-box",background:T.inputFillAlt}}>
                <option value="">No contact linked</option>
                {contacts.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <textarea style={{...styles.taskAddTextarea,background:T.inputBg,border:`1px solid ${T.inputBorder}`,color:T.inputColor}} placeholder="What needs to be done?" value={newTaskNote} onChange={e=>setNewTaskNote(e.target.value)} rows={2}/>
              <button style={styles.taskAddBtn} onClick={addTask}>Add Task</button>
            </div>
            {(() => {
              const open=tasks.filter(t=>!t.completed);const done=tasks.filter(t=>t.completed);
              return(<>
                <div style={styles.taskListHeader}><span style={{...styles.taskListTitle,color:T.textSub}}>Open Tasks ({open.length})</span></div>
                {tasksLoading?<div style={styles.empty}><div style={styles.splashSpinner}/></div>
                :open.length===0?<div style={{padding:"14px",fontSize:13,color:T.textSub,textAlign:"center"}}>No open tasks 🎉</div>
                :open.map(t=>{
                  const status=taskDueStatus(t.due_date);const isEditing=editingTaskId===t.id;
                  return(
                    <div key={t.id} style={{...styles.taskCard,background:T.cardBg,border:isEditing?`2px solid ${T.kpiBorder}`:`1.5px solid ${T.cardBorder}`}}>
                      <div style={styles.taskCardBody}>
                        {isEditing?(<>
                          <textarea style={{...styles.taskEditTextarea,background:T.inputBg,border:`1.5px solid ${T.inputBorder}`,color:T.inputColor}} value={taskDraftNote} onChange={e=>setTaskDraftNote(e.target.value)} rows={2} autoFocus/>
                          <NextTouchInput value={taskDraftDate} onChange={setTaskDraftDate} inputStyle={{flex:1,padding:"6px 10px",border:"none",outline:"none",fontSize:16,color:T.text,fontFamily:"inherit",background:"transparent"}}/>
                          <select value={taskDraftContactId} onChange={e=>setTaskDraftContactId(e.target.value)} style={{width:"100%",padding:"8px 10px",marginTop:8,border:`1px solid ${T.inputBorder}`,borderRadius:8,fontSize:16,color:T.inputColor,fontFamily:"inherit",outline:"none",boxSizing:"border-box",background:T.inputBg}}>
                            <option value="">No contact linked</option>
                            {contacts.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
                          </select>
                          <div style={{display:"flex",gap:6,marginTop:9}}>
                            <button style={styles.taskEditSaveBtn} onClick={()=>saveTaskEdit(t.id)}>Save</button>
                            <button style={{flex:1,padding:"8px",background:"transparent",border:`1px solid ${T.btnSecBorder}`,color:T.btnSecColor,borderRadius:8,fontSize:12,fontWeight:500,cursor:"pointer",fontFamily:"inherit"}} onClick={()=>setEditingTaskId(null)}>Cancel</button>
                          </div>
                        </>):(<>
                          <div style={styles.taskCardTop}>
                            <div style={{color:T.text,fontSize:13,lineHeight:1.5,fontWeight:500,flex:1,overflowWrap:"anywhere",wordBreak:"break-word"}}>{linkifyText(t.note, T.touchColor)}</div>
                            <div style={{display:"flex",gap:5,alignItems:"center",flexShrink:0}}>
                              <button style={{background:"none",border:`1px solid ${T.cardBorder}`,borderRadius:6,cursor:"pointer",color:T.textSub,padding:"3px 8px",fontSize:10,fontWeight:600,fontFamily:"inherit"}} onClick={()=>startEditTask(t)}>Edit</button>
                              <button style={{...styles.taskDeleteBtn,color:T.deleteIcon}} onClick={()=>setConfirmDeleteTask(t.id)}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg></button>
                            </div>
                          </div>
                          {t.contact_id&&(() => { const linkedIdx = contacts.findIndex(c=>c.id===t.contact_id); const linked = linkedIdx>=0?contacts[linkedIdx]:null; if(!linked) return null; return (
                            <button style={{display:"inline-flex",alignItems:"center",gap:5,marginTop:6,marginBottom:2,background:T.doneBadgeBlueBg,color:T.doneBadgeBlueColor,border:`1px solid ${dark?"rgba(59,130,246,0.25)":T.kpiBorder}`,borderRadius:20,padding:"3px 9px 3px 5px",fontSize:10,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}} onClick={()=>{setSelected(linkedIdx);setView("profile");}}>
                              <span style={{width:14,height:14,borderRadius:"50%",background:avatarColor(linked.name),display:"flex",alignItems:"center",justifyContent:"center",fontSize:7,fontWeight:700,color:"#fff",flexShrink:0}}>{initials(linked.name)}</span>
                              {linked.name}
                            </button>
                          );})()}
                          <div style={styles.taskCardFooter}>
                            {t.due_date?<span style={{...styles.taskDueChip,...(status==="overdue"?styles.taskDueOverdue:status==="today"?styles.taskDueToday:styles.taskDueUpcoming)}}>{status==="overdue"?`Due ${formatTaskDue(t.due_date)}`:status==="today"?"Today":`${formatTaskDue(t.due_date)}`}</span>:<span style={{fontSize:11,color:T.textMuted,fontWeight:500}}>No due date</span>}
                            <button style={styles.taskCompleteBtn} onClick={()=>completeTask(t.id)}>Done</button>
                          </div>
                        </>)}
                      </div>
                    </div>
                  );
                })}
                {done.length>0&&(<>
                  <div style={styles.taskListHeader}><span style={{...styles.taskListTitle,color:T.textMuted}}>Completed ({done.length})</span><button style={{fontSize:12,color:T.textMuted,fontWeight:500,background:"none",border:"none",cursor:"pointer",fontFamily:"inherit"}} onClick={()=>setShowCompleted(s=>!s)}>{showCompleted?"Hide":"Show"}</button></div>
                  {showCompleted&&done.map(t=>(
                    <div key={t.id} style={{...styles.taskCard,background:T.cardBg,border:`1.5px solid ${T.cardBorder}`,borderLeft:`3px solid ${T.kpiBorder}`}}>
                      <div style={styles.taskCardBody}>
                        <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:8,marginBottom:7}}>
                          <span style={{fontSize:9,fontWeight:700,padding:"2px 8px",borderRadius:20,background:T.doneBadgeBlueBg,color:T.doneBadgeBlueColor,border:`1px solid ${dark?"rgba(59,130,246,0.25)":T.kpiBorder}`}}>✓ Done {t.completed_at?formatTaskDue(t.completed_at.slice(0,10)):""}</span>
                          <div style={{display:"flex",gap:5,flexShrink:0}}>
                            <button style={styles.taskUndoBtn} onClick={()=>completeTask(t.id,true)}>Undo</button>
                            <button style={{...styles.taskDeleteBtn,color:T.deleteIcon}} onClick={()=>setConfirmDeleteTask(t.id)}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg></button>
                          </div>
                        </div>
                        <div style={{fontSize:13,color:T.completedNote,fontStyle:"italic",lineHeight:1.5,fontWeight:400}}>{linkifyText(t.note, T.touchColor)}</div>
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

            <div style={{background:T.heroBg,padding:"16px 16px 18px",borderBottom:dark?"1px solid rgba(140,180,255,0.12)":`1px solid ${T.headerBorder}`}}>
              <div style={{fontSize:11,fontWeight:700,color:dark?T.sectionColor:"#04844b",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:12,fontFamily:T.fontDisplay}}>Health Dashboard</div>
              <div style={{display:"flex",gap:8}}>
                {[
                  {label:"Open",     val:healthNotes.filter(h=>!h.completed).length,                                                           rail:T.railUpcoming},
                  {label:"Overdue",  val:healthOverdueCount,                                                                                   rail:T.railOverdue},
                  {label:"Upcoming", val:healthNotes.filter(h=>!h.completed&&h.due_date&&taskDueStatus(h.due_date)!=="overdue").length,         rail:T.railUpcoming},
                  {label:"Done",     val:healthNotes.filter(h=>h.completed).length,                                                            rail:T.railNeutral},
                ].map(kpi=>(
                  <div key={kpi.label} style={{flex:1,background:T.cardBg,borderTop:`2px solid ${kpi.rail}`,borderRadius:"0 0 8px 8px",padding:"10px 8px"}}>
                    <div style={{fontSize:18,fontWeight:500,color:T.text,lineHeight:1,fontFamily:T.fontMono,fontVariantNumeric:"tabular-nums"}}>{kpi.val}</div>
                    <div style={{fontSize:9,color:T.textMuted,marginTop:3,fontWeight:500,textTransform:"uppercase",letterSpacing:"0.06em"}}>{kpi.label}</div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{margin:"16px 16px 0",background:T.cardBg,borderRadius:12,border:`2px solid ${dark?"rgba(111,177,255,0.3)":"#04844b"}`,padding:"16px"}}>
              <div style={{fontSize:11,fontWeight:700,color:dark?T.sectionColor:"#04844b",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:10}}>+ New Health Note</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:10}}>
                {HEALTH_CATEGORIES.map(cat=>(
                  <button key={cat.id} onClick={()=>setNewHealthCategory(cat.id)} style={{padding:"5px 12px",borderRadius:20,border:`1px solid ${newHealthCategory===cat.id?cat.color:cat.border}`,background:newHealthCategory===cat.id?cat.bg:"transparent",color:newHealthCategory===cat.id?cat.color:T.textSub,fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>
                    {cat.emoji} {cat.label}
                  </button>
                ))}
              </div>
              <div style={{marginBottom:8}}><NextTouchInput value={newHealthDate} onChange={setNewHealthDate} inputStyle={{flex:1,padding:"9px 12px",border:`1px solid ${T.inputBorderAlt}`,borderRadius:10,fontSize:16,color:T.text,fontFamily:"inherit",outline:"none",boxSizing:"border-box",background:T.inputFillAlt}}/></div>
              <textarea style={{width:"100%",padding:"10px 12px",border:`1px solid ${T.inputBorder}`,borderRadius:10,fontSize:16,color:T.inputColor,fontFamily:"inherit",outline:"none",boxSizing:"border-box",resize:"none",lineHeight:1.5,background:T.inputBg,marginTop:4}} placeholder="What do you want to track?" value={newHealthNote} onChange={e=>setNewHealthNote(e.target.value)} rows={2}/>
              <button style={{display:"block",width:"100%",marginTop:10,padding:"10px",background:"linear-gradient(135deg,#059669,#10b981)",border:"none",color:"#fff",borderRadius:10,fontSize:13,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}} onClick={addHealthNote}>Add Note</button>
            </div>

            <div style={{padding:"14px 16px 10px"}}>
              <div style={{fontSize:10,fontWeight:700,color:dark?"rgba(147,197,253,0.6)":T.textMuted,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:8}}>Filter by category</div>
              <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                <button onClick={()=>setHealthFilter("all")} style={{padding:"5px 12px",borderRadius:20,fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"inherit",border:`1px solid ${healthFilter==="all"?T.sectionColor:(dark?"rgba(59,130,246,0.25)":"#c9c7c5")}`,background:healthFilter==="all"?T.doneBadgeBlueBg:"transparent",color:healthFilter==="all"?T.sectionColor:T.textSub}}>All</button>
                {HEALTH_CATEGORIES.map(cat=>(
                  <button key={cat.id} onClick={()=>setHealthFilter(cat.id)} style={{padding:"5px 12px",borderRadius:20,fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"inherit",border:`1px solid ${healthFilter===cat.id?cat.color:cat.border}`,background:healthFilter===cat.id?cat.bg:"transparent",color:healthFilter===cat.id?cat.color:T.textSub}}>
                    {cat.emoji} {cat.label}
                  </button>
                ))}
              </div>
            </div>

            {healthLoading ? (
              <div style={styles.empty}><div style={styles.splashSpinner}/></div>
            ) : (<>
              {healthOverdue.length > 0 && (<>
                <div style={{display:"flex",alignItems:"center",padding:"4px 20px 8px"}}>
                  <span style={{fontSize:11,fontWeight:700,color:T.railOverdue,textTransform:"uppercase",letterSpacing:"0.08em"}}>⚠ Overdue ({healthOverdue.length})</span>
                </div>
                {healthOverdue.map(h=>{
                  const cat=getCat(h.category); const isEditing=editingHealthId===h.id;
                  return(
                    <div key={h.id} style={{margin:"0 16px 8px",background:T.subtleBg,borderRadius:12,borderTop:`1px solid ${T.subtleBorder}`,borderRight:`1px solid ${T.subtleBorder}`,borderBottom:`1px solid ${T.subtleBorder}`,borderLeft:"3px solid #dc2626",overflow:"hidden"}}>
                      <div style={{padding:"14px"}}>
                        {isEditing?(<>
                          <div style={{display:"flex",flexWrap:"wrap",gap:5,marginBottom:8}}>
                            {HEALTH_CATEGORIES.map(c=>(
                              <button key={c.id} onClick={()=>setHealthDraftCategory(c.id)} style={{padding:"4px 10px",borderRadius:20,border:`1px solid ${healthDraftCategory===c.id?c.color:c.border}`,background:healthDraftCategory===c.id?c.bg:"transparent",color:healthDraftCategory===c.id?c.color:T.textSub,fontSize:10,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>{c.emoji} {c.label}</button>
                            ))}
                          </div>
                          <textarea style={{width:"100%",padding:"8px 10px",border:`1px solid ${T.inputBorder}`,borderRadius:8,fontSize:16,color:T.inputColor,fontFamily:"inherit",resize:"none",outline:"none",lineHeight:1.5,background:T.inputBg,boxSizing:"border-box",marginBottom:8}} value={healthDraftNote} onChange={e=>setHealthDraftNote(e.target.value)} rows={2} autoFocus/>
                          <NextTouchInput value={healthDraftDate} onChange={setHealthDraftDate} inputStyle={{flex:1,padding:"6px 10px",border:"none",outline:"none",fontSize:16,color:T.text,fontFamily:"inherit",background:"transparent"}}/>
                          <div style={{display:"flex",gap:6,marginTop:9}}>
                            <button style={{flex:1,padding:"8px",background:"linear-gradient(135deg,#059669,#10b981)",border:"none",color:"#fff",borderRadius:8,fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}} onClick={()=>saveHealthEdit(h.id)}>Save</button>
                            <button style={{flex:1,padding:"8px",background:"transparent",border:`1px solid ${T.btnSecBorder}`,color:T.btnSecColor,borderRadius:8,fontSize:12,fontWeight:500,cursor:"pointer",fontFamily:"inherit"}} onClick={()=>setEditingHealthId(null)}>Cancel</button>
                          </div>
                        </>):(<>
                          <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:8,marginBottom:8}}>
                            <span style={{fontSize:10,fontWeight:700,padding:"3px 10px",borderRadius:20,border:`1px solid ${cat.border}`,background:cat.bg,color:cat.color}}>{cat.emoji} {cat.label}</span>
                            <div style={{display:"flex",gap:5}}>
                              <button style={{background:"none",border:`1px solid ${T.cardBorder}`,borderRadius:6,cursor:"pointer",color:T.textSub,padding:"3px 8px",fontSize:10,fontWeight:600,fontFamily:"inherit"}} onClick={()=>startEditHealth(h)}>Edit</button>
                              <button style={{background:"none",border:"none",cursor:"pointer",color:T.deleteIcon,padding:"2px 4px",display:"flex",alignItems:"center"}} onClick={()=>setConfirmDeleteHealth(h.id)}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg></button>
                            </div>
                          </div>
                          <div style={{fontSize:13,color:T.text,lineHeight:1.5,fontWeight:500,marginBottom:10,overflowWrap:"anywhere",wordBreak:"break-word"}}>{linkifyText(h.note, T.touchColor)}</div>
                          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                            <span style={{fontSize:11,fontWeight:600,borderRadius:6,padding:"3px 8px",fontFamily:T.fontMono,color:T.railOverdue,background:dark?"rgba(111,177,255,0.15)":"#fdecea",border:`1px solid ${dark?"rgba(111,177,255,0.3)":"#f5c6c3"}`}}>Due {formatTaskDue(h.due_date)}</span>
                            <button style={{fontSize:11,fontWeight:600,padding:"5px 12px",borderRadius:8,cursor:"pointer",fontFamily:"inherit",border:`1px solid ${dark?"rgba(111,177,255,0.3)":"#c7ecdb"}`,background:T.doneBadgeGreenBg,color:T.doneBadgeGreenColor}} onClick={()=>completeHealthNote(h.id)}>Done</button>
                          </div>
                        </>)}
                      </div>
                    </div>
                  );
                })}
              </>)}

              <div style={{display:"flex",alignItems:"center",padding:`${healthOverdue.length>0?"10px":"4px"} 20px 8px`}}>
                <span style={{fontSize:11,fontWeight:700,color:dark?T.sectionColor:"#04844b",textTransform:"uppercase",letterSpacing:"0.08em"}}>Open ({healthNonOverdue.length})</span>
              </div>
              {healthNonOverdue.length===0&&healthOverdue.length===0?(
                <div style={{padding:"14px",fontSize:13,color:T.textSub,textAlign:"center"}}>No open health notes 🎉</div>
              ):healthNonOverdue.length===0?null:healthNonOverdue.map(h=>{
                const status=taskDueStatus(h.due_date); const cat=getCat(h.category); const isEditing=editingHealthId===h.id;
                return(
                  <div key={h.id} style={{margin:"0 16px 8px",background:T.subtleBg,borderRadius:12,border:`1px solid ${isEditing?"#10b981":T.subtleBorder}`,overflow:"hidden"}}>
                    <div style={{padding:"14px"}}>
                      {isEditing?(<>
                        <div style={{display:"flex",flexWrap:"wrap",gap:5,marginBottom:8}}>
                          {HEALTH_CATEGORIES.map(c=>(
                            <button key={c.id} onClick={()=>setHealthDraftCategory(c.id)} style={{padding:"4px 10px",borderRadius:20,border:`1px solid ${healthDraftCategory===c.id?c.color:c.border}`,background:healthDraftCategory===c.id?c.bg:"transparent",color:healthDraftCategory===c.id?c.color:T.textSub,fontSize:10,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>{c.emoji} {c.label}</button>
                          ))}
                        </div>
                        <textarea style={{width:"100%",padding:"8px 10px",border:`1px solid ${T.inputBorderAlt}`,borderRadius:8,fontSize:16,color:T.text,fontFamily:"inherit",resize:"none",outline:"none",lineHeight:1.5,background:T.inputFillAlt,boxSizing:"border-box",marginBottom:8}} value={healthDraftNote} onChange={e=>setHealthDraftNote(e.target.value)} rows={2} autoFocus/>
                        <NextTouchInput value={healthDraftDate} onChange={setHealthDraftDate} inputStyle={{flex:1,padding:"6px 10px",border:"none",outline:"none",fontSize:16,color:T.text,fontFamily:"inherit",background:"transparent"}}/>
                        <div style={{display:"flex",gap:6,marginTop:9}}>
                          <button style={{flex:1,padding:"8px",background:"linear-gradient(135deg,#059669,#10b981)",border:"none",color:"#fff",borderRadius:8,fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}} onClick={()=>saveHealthEdit(h.id)}>Save</button>
                          <button style={{flex:1,padding:"8px",background:"transparent",border:`1px solid ${T.btnSecBorder}`,color:T.btnSecColor,borderRadius:8,fontSize:12,fontWeight:500,cursor:"pointer",fontFamily:"inherit"}} onClick={()=>setEditingHealthId(null)}>Cancel</button>
                        </div>
                      </>):(<>
                        <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:8,marginBottom:8}}>
                          <span style={{fontSize:10,fontWeight:700,padding:"3px 10px",borderRadius:20,border:`1px solid ${cat.border}`,background:cat.bg,color:cat.color}}>{cat.emoji} {cat.label}</span>
                          <div style={{display:"flex",gap:5}}>
                            <button style={{background:"none",border:`1px solid ${T.subtleBorder}`,borderRadius:6,cursor:"pointer",color:T.textSub,padding:"3px 8px",fontSize:10,fontWeight:600,fontFamily:"inherit"}} onClick={()=>startEditHealth(h)}>Edit</button>
                            <button style={{background:"none",border:"none",cursor:"pointer",color:T.deleteIcon,padding:"2px 4px",display:"flex",alignItems:"center"}} onClick={()=>setConfirmDeleteHealth(h.id)}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg></button>
                          </div>
                        </div>
                        <div style={{fontSize:13,color:T.text,lineHeight:1.5,fontWeight:500,marginBottom:10,overflowWrap:"anywhere",wordBreak:"break-word"}}>{linkifyText(h.note, T.touchColor)}</div>
                        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                          {h.due_date?<span style={{fontSize:11,fontWeight:600,borderRadius:6,padding:"3px 8px",fontFamily:T.fontMono,...(status==="today"?{color:T.railToday,background:dark?"rgba(111,177,255,0.15)":"#fef3e2",border:`1px solid ${dark?"rgba(111,177,255,0.3)":"#fbdca3"}`}:{color:T.doneBadgeBlueColor,background:T.doneBadgeBlueBg,border:`1px solid ${dark?"rgba(59,130,246,0.25)":T.kpiBorder}`})}}>{status==="today"?"Today":formatTaskDue(h.due_date)}</span>:<span style={{fontSize:11,color:T.textMuted}}>No due date</span>}
                          <button style={{fontSize:11,fontWeight:600,padding:"5px 12px",borderRadius:8,cursor:"pointer",fontFamily:"inherit",border:`1px solid ${dark?"rgba(111,177,255,0.3)":"#c7ecdb"}`,background:T.doneBadgeGreenBg,color:T.doneBadgeGreenColor}} onClick={()=>completeHealthNote(h.id)}>Done</button>
                        </div>
                      </>)}
                    </div>
                  </div>
                );
              })}

              {healthDone.length>0&&(<>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 20px 8px"}}>
                  <span style={{fontSize:11,fontWeight:700,color:T.textMuted,textTransform:"uppercase",letterSpacing:"0.08em"}}>Completed ({healthDone.length})</span>
                  <button style={{fontSize:12,color:T.textSub,fontWeight:500,background:"none",border:"none",cursor:"pointer",fontFamily:"inherit"}} onClick={()=>setShowCompletedHealth(s=>!s)}>{showCompletedHealth?"Hide":"Show"}</button>
                </div>
                {showCompletedHealth&&healthDone.map(h=>{
                  const cat=getCat(h.category);
                  return(
                    <div key={h.id} style={{margin:"0 16px 8px",background:T.subtleBg2,borderRadius:12,border:`1px solid ${T.subtleBorder2}`,borderLeft:`3px solid ${dark?"rgba(111,177,255,0.3)":"#c7ecdb"}`}}>
                      <div style={{padding:"12px 14px"}}>
                        <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:8,marginBottom:7}}>
                          <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                            <span style={{fontSize:9,fontWeight:700,padding:"2px 8px",borderRadius:20,border:`1px solid ${cat.border}`,background:cat.bg,color:cat.color}}>{cat.emoji} {cat.label}</span>
                            <span style={{fontSize:9,fontWeight:700,padding:"2px 8px",borderRadius:20,background:T.doneBadgeGreenBg,color:T.doneBadgeGreenColor,border:`1px solid ${dark?"rgba(111,177,255,0.25)":"#c7ecdb"}`}}>✓ Done {h.completed_at?formatTaskDue(h.completed_at.slice(0,10)):""}</span>
                          </div>
                          <div style={{display:"flex",gap:5,flexShrink:0}}>
                            <button style={{fontSize:11,fontWeight:600,padding:"4px 10px",borderRadius:8,cursor:"pointer",fontFamily:"inherit",background:T.doneBadgeBlueBg,color:T.doneBadgeBlueColor,border:`1px solid ${dark?"rgba(59,130,246,0.15)":T.kpiBorder}`}} onClick={()=>completeHealthNote(h.id,true)}>Undo</button>
                            <button style={{background:"none",border:"none",cursor:"pointer",color:T.deleteIcon,padding:"2px 4px",display:"flex",alignItems:"center"}} onClick={()=>setConfirmDeleteHealth(h.id)}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg></button>
                          </div>
                        </div>
                        <div style={{fontSize:13,color:T.completedNote,fontStyle:"italic",lineHeight:1.5,fontWeight:400}}>{linkifyText(h.note, T.touchColor)}</div>
                      </div>
                    </div>
                  );
                })}
              </>)}
            </>)}

            <div style={{height:40}}/>
          </div>
        </div>
      )}

      {view==="profile"&&contact&&(
        <div style={styles.body}>
          <div style={styles.profileScroll}>
            <div style={{...styles.profileHero,background:T.heroBg,borderBottom:`1.5px solid ${T.cardBorder}`}}>
              <div style={{...styles.avatarLg,background:avatarColor(contact.name)}}>{initials(contact.name)}</div>
              <h2 style={{...styles.profileName,color:T.text,fontFamily:T.fontDisplay}}>{contact.name}</h2>
              {contact.company&&<p style={{fontSize:13,color:T.sectionColor,margin:0,textAlign:"center"}}>{contact.company}</p>}
            </div>
            <div style={{...styles.card,background:T.cardBg,border:`1.5px solid ${T.cardBorder}`}}>
              {(() => {
                const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
                const emailHref = isMobile ? `googlegmail:///co?to=${encodeURIComponent(contact.email)}` : `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(contact.email)}`;
                return [
                  { icon:"📞", label:"Phone", val:contact.phone, href:`tel:${contact.phone}` },
                  { icon:"✉️", label:"Email", val:contact.email, href:emailHref, target:isMobile?"_self":"_blank" },
                  { icon:"📅", label:"Date Added", val:formatDate(contact.date) }
                ];
              })().filter(f=>f.val).map(f=>(
                <div key={f.label} style={{...styles.fieldRow,borderBottom:`1px solid ${T.cardBorder}`}}>
                  <span style={styles.fieldIcon}>{f.icon}</span>
                  <div style={styles.fieldBody}>
                    <div style={{...styles.fieldLabel,color:T.fieldLabel}}>{f.label}</div>
                    {f.href?<a href={f.href} target={f.target||"_self"} rel="noopener noreferrer" style={{...styles.fieldValue,color:T.touchColor}}>{f.val}</a>:<div style={{...styles.fieldValue,color:T.text}}>{f.val}</div>}
                  </div>
                </div>
              ))}
              <div style={{...styles.fieldRow,borderBottom:`1px solid ${T.cardBorder}`}}><span style={styles.fieldIcon}>🗓</span><div style={styles.fieldBody}>
                <div style={{...styles.fieldLabel,color:T.fieldLabel}}>Next Touch</div>
                {editingNextTouch?(
                  <div style={{marginTop:2}}>
                    <NextTouchInput value={nextTouchDraft} onChange={setNextTouchDraft} inputStyle={{flex:1,border:`1px solid ${dark?"rgba(59,130,246,0.4)":T.kpiBorder}`,borderRadius:8,padding:"5px 9px",fontSize:16,background:T.inputFillAlt,fontFamily:"inherit",outline:"none",boxSizing:"border-box",width:"100%",color:T.text}}/>
                    <div style={{display:"flex",gap:6,marginTop:8}}><button style={styles.ntSaveBtn} onClick={saveNextTouch}>Save</button><button style={{background:"transparent",border:`1px solid ${T.btnSecBorder}`,color:T.btnSecColor,borderRadius:7,padding:"5px 8px",fontSize:12,fontWeight:500,cursor:"pointer",fontFamily:"inherit",flexShrink:0}} onClick={()=>setEditingNextTouch(false)}>Cancel</button></div>
                  </div>
                ):(
                  <div style={{display:"flex",alignItems:"center",gap:8,marginTop:2}}>
                    <div style={styles.fieldValue}>{contact.next_touch||<span style={{color:T.textMuted}}>Not set</span>}</div>
                    <button style={styles.ntEditBtn} onClick={()=>{setNextTouchDraft(contact.next_touch||"");setEditingNextTouch(true);}}>Update</button>
                  </div>
                )}
              </div></div>
            </div>

            <div style={{...styles.touchSection,background:T.cardBg,border:`1.5px solid ${T.cardBorder}`}}>
              <div style={{...styles.touchHeader,borderBottom:`1px solid ${T.cardBorder}`}}>
                <span style={{...styles.touchHeaderTitle,color:T.text}}>📋 Tasks</span>
                <button style={styles.addNoteBtn} onClick={()=>{setAddingContactTask(true);setContactTaskNote("");setContactTaskDate("");}}>+ Add Task</button>
              </div>
              {addingContactTask&&(
                <div style={styles.addNotePanel}>
                  <div style={{marginBottom:8}}><NextTouchInput value={contactTaskDate} onChange={setContactTaskDate} inputStyle={{flex:1,padding:"9px 12px",border:`1px solid ${T.inputBorderAlt}`,borderRadius:10,fontSize:16,color:T.text,fontFamily:"inherit",outline:"none",boxSizing:"border-box",background:T.inputFillAlt}}/></div>
                  <textarea style={{...styles.addNoteTextarea,background:T.inputBg,border:`1.5px solid ${T.inputBorder}`,color:T.inputColor}} placeholder="What needs to be done?" value={contactTaskNote} onChange={e=>setContactTaskNote(e.target.value)} rows={2} autoFocus/>
                  <div style={{display:"flex",gap:8,marginTop:10}}><button style={styles.saveNoteBtn} onClick={addContactTask}>Save Task</button><button style={{...styles.cancelNoteBtn,border:`1px solid ${T.btnSecBorder}`,color:T.btnSecColor}} onClick={()=>{setAddingContactTask(false);setContactTaskNote("");setContactTaskDate("");}}>Cancel</button></div>
                </div>
              )}
              {(() => {
                const contactTasks = tasks.filter(t => t.contact_id === contact.id);
                const openT = contactTasks.filter(t=>!t.completed).sort((a,b)=>(a.due_date||"9999")>(b.due_date||"9999")?1:-1);
                const doneT = contactTasks.filter(t=>t.completed);
                if (contactTasks.length===0 && !addingContactTask) return <div style={{padding:"20px",fontSize:13,color:T.textMuted,textAlign:"center",lineHeight:1.6}}>No tasks linked to this contact yet.</div>;
                return (<>
                  {openT.map(t=>{
                    const status=taskDueStatus(t.due_date);
                    const rail = status==="overdue"?T.railOverdue:status==="today"?T.railToday:status==="upcoming"?T.railUpcoming:T.railNeutral;
                    return (
                      <div key={t.id} style={{margin:"10px 16px 8px",background:T.subtleBg,borderRadius:10,border:`1px solid ${T.subtleBorder}`,borderLeft:`3px solid ${rail}`,padding:"12px 14px",cursor:"pointer"}} onClick={()=>{setView("list");setHomeTab("tasks");startEditTask(t);}}>
                        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8,marginBottom:7}}>
                          {t.due_date?<span style={{fontFamily:T.fontMono,fontSize:10,color:rail,background:dark?"rgba(111,177,255,0.1)":"rgba(1,118,211,0.08)",border:`1px solid ${rail}`,borderRadius:6,padding:"2px 7px"}}>{status==="overdue"?`Due ${formatTaskDue(t.due_date)}`:status==="today"?"Today":formatTaskDue(t.due_date)}</span>:<span style={{fontSize:10,color:T.textMuted}}>No due date</span>}
                          <button style={{fontSize:10,fontWeight:600,padding:"3px 9px",borderRadius:7,cursor:"pointer",fontFamily:"inherit",border:`1px solid ${dark?"rgba(59,130,246,0.25)":T.kpiBorder}`,background:T.doneBadgeBlueBg,color:T.doneBadgeBlueColor,flexShrink:0}} onClick={(e)=>{e.stopPropagation();completeTask(t.id);}}>Done</button>
                        </div>
                        <div style={{fontSize:13,color:T.text,lineHeight:1.5,overflowWrap:"anywhere",wordBreak:"break-word"}}>{linkifyText(t.note, T.touchColor)}</div>
                      </div>
                    );
                  })}
                  {doneT.length>0&&(<>
                    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"4px 16px 8px"}}>
                      <span style={{fontSize:11,color:T.textMuted,fontWeight:600}}>Completed ({doneT.length})</span>
                      <button style={{fontSize:11,color:T.textSub,background:"none",border:"none",cursor:"pointer",fontFamily:"inherit"}} onClick={()=>setShowCompletedContactTasks(s=>!s)}>{showCompletedContactTasks?"Hide":"Show"}</button>
                    </div>
                    {showCompletedContactTasks&&doneT.map(t=>(
                      <div key={t.id} style={{margin:"0 16px 8px",background:T.subtleBg2,borderRadius:10,border:`1px solid ${T.subtleBorder2}`,padding:"12px 14px"}}>
                        <div style={{fontSize:13,color:T.completedNote,fontStyle:"italic",lineHeight:1.5}}>{linkifyText(t.note, T.touchColor)}</div>
                      </div>
                    ))}
                  </>)}
                  <div style={{height:6}}/>
                </>);
              })()}
            </div>

            {contact.notes&&<div style={{...styles.card,background:T.cardBg,border:`1.5px solid ${T.cardBorder}`}}><div style={{...styles.notesLabel,color:T.fieldLabel}}>📝 Notes</div><div style={{...styles.notesText,color:T.text}}>{linkifyText(contact.notes, T.touchColor)}</div></div>}
            <div style={{...styles.touchSection,background:T.cardBg,border:`1.5px solid ${T.cardBorder}`}}>
              <div style={{...styles.touchHeader,borderBottom:`1px solid ${T.cardBorder}`}}><span style={{...styles.touchHeaderTitle,color:T.text}}>🤝 Touch Log</span><button style={styles.addNoteBtn} onClick={()=>{setAddingNote(true);setNewNote("");setInlineNextTouch(contact.next_touch||"");}}>+ Add Note</button></div>
              {addingNote&&(
                <div style={styles.addNotePanel}>
                  <div style={{...styles.addNoteDate,color:T.textMuted}}>📅 {formatDateTime(new Date().toISOString())}</div>
                  <textarea style={{...styles.addNoteTextarea,background:T.inputBg,border:`1.5px solid ${T.inputBorder}`,color:T.inputColor}} placeholder="What happened during this touch?" value={newNote} onChange={e=>setNewNote(e.target.value)} rows={3} autoFocus/>
                  <div style={{...styles.addNoteDivider,color:T.textMuted}}><span>also update next touch</span></div>
                  <NextTouchInput value={inlineNextTouch} onChange={setInlineNextTouch} inputStyle={{flex:1,padding:"9px 12px",border:`1px solid ${T.inputBorderAlt}`,borderRadius:10,fontSize:16,color:T.text,fontFamily:"inherit",outline:"none",boxSizing:"border-box",background:T.inputFillAlt}}/>
                  <div style={{display:"flex",gap:8,marginTop:10}}><button style={styles.saveNoteBtn} onClick={addTouchNote}>Save Note</button><button style={{...styles.cancelNoteBtn,border:`1px solid ${T.btnSecBorder}`,color:T.btnSecColor}} onClick={()=>{setAddingNote(false);setNewNote("");setInlineNextTouch("");}}>Cancel</button></div>
                </div>
              )}
              {(contact.touch_log||[]).length===0&&!addingNote?<div style={{padding:"20px",fontSize:13,color:T.textMuted,textAlign:"center",lineHeight:1.6}}>No touch log entries yet.</div>
              :(contact.touch_log||[]).map((touch,i)=>(
                <div key={touch.id} style={{...styles.touchEntry,borderTop:i===0?"none":`1px solid ${T.subtleBorder}`}}>
                  <div style={styles.touchEntryHeader}><span style={{...styles.touchEntryDate,color:T.touchColor}}>{formatDateTime(touch.createdAt)}</span><button style={{...styles.touchDeleteBtn,color:T.deleteIcon}} onClick={()=>setConfirmDeleteTouch({contactId:contact.id,touchId:touch.id})}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg></button></div>
                  <div style={{...styles.touchEntryText,color:T.touchText}}>{linkifyText(touch.text, T.touchColor)}</div>
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
                <label style={{...styles.formLabel,color:T.fieldLabel}}>{f.label}{f.required&&<span style={styles.required}> *</span>}</label>
                <input style={{...styles.formInput,background:T.inputBg,border:`1px solid ${T.inputBorder}`,color:T.inputColor}} type={f.type} placeholder={f.placeholder} value={editEntry[f.key]||""} maxLength={f.key==="phone"?12:undefined} inputMode={f.key==="phone"?"numeric":undefined}
                  onChange={e=>{if(f.key==="phone"){const d=e.target.value.replace(/\D/g,"").slice(0,10);let fmt=d;if(d.length>6)fmt=d.slice(0,3)+"-"+d.slice(3,6)+"-"+d.slice(6);else if(d.length>3)fmt=d.slice(0,3)+"-"+d.slice(3);setEditEntry({...editEntry,phone:fmt});}else setEditEntry({...editEntry,[f.key]:e.target.value});}}/>
                {f.key==="phone"&&<div style={{...styles.phoneHint,color:T.textMuted}}>{(editEntry.phone||"").replace(/\D/g,"").length}/10 digits</div>}
              </div>
            ))}
            <div style={styles.formGroup}><label style={{...styles.formLabel,color:T.fieldLabel}}>Next Touch Date</label><NextTouchInput value={editEntry.next_touch||""} onChange={v=>setEditEntry({...editEntry,next_touch:v})}/></div>
            <div style={styles.formGroup}><label style={{...styles.formLabel,color:T.fieldLabel}}>Notes</label><textarea style={{...styles.formTextarea,background:T.inputBg,border:`1.5px solid ${T.inputBorder}`,color:T.inputColor}} placeholder="General notes about this contact..." value={editEntry.notes||""} onChange={e=>setEditEntry({...editEntry,notes:e.target.value})} rows={4}/></div>
            <button style={styles.btnPrimary} onClick={saveEntry}>{view==="add"?"Add Contact":"Save Changes"}</button>
            <button style={{...styles.btnSecondaryFull,border:`1.5px solid ${T.btnSecBorder}`,color:T.btnSecColor}} onClick={()=>setView(view==="add"?"list":"profile")}>Cancel</button>
            <div style={{height:40}}/>
          </div>
        </div>
      )}
    </div>
  );
}


const styles = {
  shell:{width:"100%",height:"100dvh",display:"flex",flexDirection:"column",fontFamily:"'Inter','SF Pro Display',-apple-system,BlinkMacSystemFont,sans-serif",position:"relative",overflow:"hidden",paddingBottom:"env(safe-area-inset-bottom)"},
  header:{backdropFilter:"blur(12px)",paddingTop:"calc(14px + env(safe-area-inset-top))",paddingBottom:"14px",paddingLeft:"max(20px, env(safe-area-inset-left))",paddingRight:"max(20px, env(safe-area-inset-right))",display:"flex",alignItems:"center",gap:10,minHeight:"calc(56px + env(safe-area-inset-top))",flexShrink:0},
  headerTitle:{flex:1,fontSize:18,fontWeight:700,letterSpacing:"-0.01em"},
  iconBtn:{cursor:"pointer",padding:"7px",borderRadius:9,display:"flex",alignItems:"center"},
  exportMenuItem:{display:"flex",alignItems:"center",gap:12,width:"100%",padding:"13px 16px",background:"none",border:"none",cursor:"pointer",fontFamily:"inherit",textAlign:"left"},
  exportMenuIcon:{fontSize:20,flexShrink:0},
  exportMenuSub:{fontSize:11,color:"#6b7280",marginTop:1},
  tabBar:{display:"flex",flexShrink:0},
  tab:{flex:1,padding:"12px 0",textAlign:"center",fontSize:10,fontWeight:600,letterSpacing:"0.04em",textTransform:"uppercase",cursor:"pointer",background:"none",border:"none",borderBottom:"2px solid transparent",fontFamily:"inherit",display:"flex",alignItems:"center",justifyContent:"center",gap:4,transition:"color 0.2s"},
  tabBadge:{background:"#ef4444",color:"#fff",fontSize:10,fontWeight:700,borderRadius:10,padding:"1px 6px"},
  body:{flex:1,display:"flex",flexDirection:"column",overflow:"hidden",position:"relative"},
  listScroll:{flex:1,overflowY:"auto",WebkitOverflowScrolling:"touch"},
  searchWrap:{margin:"14px 16px 8px",borderRadius:10,display:"flex",alignItems:"center",padding:"10px 14px",gap:8},
  searchInput:{flex:1,border:"none",outline:"none",fontSize:16,background:"transparent",fontFamily:"inherit"},
  clearSearch:{background:"none",border:"none",cursor:"pointer",fontSize:14,padding:2},
  sectionHeader:{padding:"10px 20px 4px",fontSize:10,fontWeight:700,letterSpacing:"0.14em",textTransform:"uppercase"},
  contactRow:{display:"flex",alignItems:"center",padding:"13px 20px",gap:14,cursor:"pointer",transition:"background 0.15s"},
  avatar:{width:40,height:40,borderRadius:10,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,fontWeight:700,color:"#fff",flexShrink:0},
  rowInfo:{flex:1,minWidth:0},
  touchBadge:{fontSize:10,fontWeight:700,borderRadius:6,padding:"2px 7px",marginRight:4},
  fab:{position:"absolute",bottom:"calc(20px + env(safe-area-inset-bottom))",right:"max(20px, env(safe-area-inset-right))",width:52,height:52,borderRadius:14,background:"linear-gradient(135deg,#2563eb,#3b82f6)",border:"none",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",boxShadow:"0 4px 20px rgba(37,99,235,0.5)",transition:"transform 0.15s",zIndex:10},
  empty:{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:40,textAlign:"center"},
  emptyIcon:{fontSize:48,marginBottom:14},
  profileScroll:{flex:1,overflowY:"auto",WebkitOverflowScrolling:"touch",padding:"0 0 20px"},
  profileHero:{padding:"28px 20px 24px",display:"flex",flexDirection:"column",alignItems:"center",gap:10},
  avatarLg:{width:70,height:70,borderRadius:18,display:"flex",alignItems:"center",justifyContent:"center",fontSize:26,fontWeight:700,color:"#fff",boxShadow:"0 0 0 3px rgba(59,130,246,0.3),0 8px 24px rgba(0,0,0,0.3)"},
  card:{backdropFilter:"blur(8px)",margin:"14px 16px 0",borderRadius:12,padding:"4px 0",overflow:"hidden"},
  fieldRow:{display:"flex",alignItems:"flex-start",padding:"13px 16px",gap:14},
  fieldIcon:{fontSize:16,flexShrink:0,marginTop:1},
  fieldBody:{flex:1,minWidth:0},
  touchSection:{backdropFilter:"blur(8px)",margin:"14px 16px 0",borderRadius:12,overflow:"hidden"},
  touchHeader:{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"13px 16px"},
  addNoteBtn:{background:"linear-gradient(135deg,#2563eb,#3b82f6)",color:"#fff",border:"none",borderRadius:8,padding:"6px 14px",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit"},
  addNotePanel:{padding:"14px 16px"},
  addNoteTextarea:{width:"100%",padding:"10px 12px",borderRadius:10,fontSize:16,fontFamily:"inherit",outline:"none",boxSizing:"border-box",resize:"vertical",lineHeight:1.6},
  saveNoteBtn:{flex:1,padding:"10px",background:"linear-gradient(135deg,#2563eb,#3b82f6)",border:"none",color:"#fff",borderRadius:9,fontSize:13,fontWeight:600,cursor:"pointer",fontFamily:"inherit"},
  cancelNoteBtn:{flex:1,padding:"10px",background:"transparent",borderRadius:9,fontSize:13,fontWeight:500,cursor:"pointer",fontFamily:"inherit"},
  touchEntry:{padding:"13px 16px"},
  touchEntryHeader:{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6},
  touchDeleteBtn:{background:"none",border:"none",cursor:"pointer",padding:"2px 4px",display:"flex",alignItems:"center",borderRadius:4},
  ntEditBtn:{background:"rgba(59,130,246,0.12)",color:"#93c5fd",border:"1px solid rgba(59,130,246,0.25)",borderRadius:7,padding:"4px 10px",fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap",flexShrink:0},
  ntSaveBtn:{background:"linear-gradient(135deg,#2563eb,#3b82f6)",color:"#fff",border:"none",borderRadius:7,padding:"5px 12px",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap",flexShrink:0},
  taskAddPanel:{margin:"16px 16px 0",borderRadius:12,padding:"16px"},
  taskAddTitle:{fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:10},
  taskAddTextarea:{width:"100%",padding:"10px 12px",borderRadius:10,fontSize:16,fontFamily:"inherit",outline:"none",boxSizing:"border-box",resize:"none",lineHeight:1.5},
  taskEditTextarea:{width:"100%",padding:"8px 10px",borderRadius:8,fontSize:16,fontFamily:"inherit",outline:"none",boxSizing:"border-box",resize:"none",lineHeight:1.5,marginBottom:6},
  formLabel:{display:"block",fontSize:12,fontWeight:600,marginBottom:6},
  formInput:{width:"100%",padding:"10px 12px",borderRadius:10,fontSize:16,fontFamily:"inherit",outline:"none",boxSizing:"border-box"},
  formTextarea:{width:"100%",padding:"10px 12px",borderRadius:10,fontSize:16,fontFamily:"inherit",outline:"none",boxSizing:"border-box",resize:"vertical",lineHeight:1.6},
  taskAddBtn:{display:"block",width:"100%",marginTop:12,padding:"10px",background:"linear-gradient(135deg,#2563eb,#3b82f6)",border:"none",color:"#fff",borderRadius:10,fontSize:13,fontWeight:600,cursor:"pointer",fontFamily:"inherit"},
  taskListHeader:{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"16px 20px 8px"},
  taskCard:{margin:"0 16px 8px",borderRadius:12,overflow:"hidden"},
  taskCardBody:{padding:"14px"},
  taskCardTop:{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:10},
  taskDeleteBtn:{background:"none",border:"none",cursor:"pointer",padding:"2px 4px",display:"flex",alignItems:"center",flexShrink:0,borderRadius:4},
  taskCardFooter:{display:"flex",alignItems:"center",justifyContent:"space-between",marginTop:10},
  taskDueChip:{fontSize:11,fontWeight:600,borderRadius:6,padding:"3px 8px"},
  taskDueOverdue:{color:"#dc2626",background:"rgba(220,38,38,0.1)",border:"1px solid rgba(220,38,38,0.35)"},
  taskDueToday:{color:"#d97706",background:"rgba(217,119,6,0.1)",border:"1px solid rgba(217,119,6,0.35)"},
  taskDueUpcoming:{color:"#2563eb",background:"rgba(37,99,235,0.1)",border:"1px solid rgba(37,99,235,0.35)"},
  taskCompleteBtn:{fontSize:11,fontWeight:600,padding:"5px 12px",borderRadius:8,cursor:"pointer",fontFamily:"inherit",border:"1px solid rgba(59,130,246,0.3)",background:"rgba(59,130,246,0.1)",color:"#2563eb"},
  taskUndoBtn:{fontSize:11,fontWeight:600,padding:"5px 12px",borderRadius:8,cursor:"pointer",fontFamily:"inherit",background:"rgba(59,130,246,0.1)",color:"#2563eb",border:"1px solid rgba(59,130,246,0.25)"},
  taskEditSaveBtn:{flex:1,padding:"8px",background:"linear-gradient(135deg,#2563eb,#3b82f6)",border:"none",color:"#fff",borderRadius:8,fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit"},
  formScroll:{flex:1,overflowY:"auto",WebkitOverflowScrolling:"touch",padding:"16px"},
  formGroup:{marginBottom:16},
  required:{color:"#f87171"},
  btnPrimary:{display:"block",width:"100%",padding:"13px",background:"linear-gradient(135deg,#2563eb,#3b82f6)",border:"none",color:"#fff",borderRadius:10,fontSize:14,fontWeight:600,cursor:"pointer",fontFamily:"inherit",marginBottom:10,boxShadow:"0 4px 14px rgba(37,99,235,0.4)"},
  btnDanger:{flex:1,padding:"12px",background:"rgba(220,38,38,0.85)",border:"none",color:"#fff",borderRadius:10,fontSize:14,fontWeight:600,cursor:"pointer",fontFamily:"inherit"},
  btnDangerFull:{display:"block",width:"calc(100% - 32px)",margin:"14px 16px 0",padding:"12px",background:"transparent",border:"1px solid rgba(239,68,68,0.4)",color:"#ef4444",borderRadius:10,fontSize:14,fontWeight:500,cursor:"pointer",fontFamily:"inherit"},
  overlay:{position:"absolute",inset:0,backdropFilter:"blur(6px)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:200,padding:24},
  modal:{backdropFilter:"blur(16px)",borderRadius:16,padding:"24px",width:"100%",maxWidth:320,textAlign:"center"},
  splashScreen:{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:16},
  splashLogo:{width:68,height:68,borderRadius:18,background:"linear-gradient(135deg,#1d4ed8,#3b82f6)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:32,fontWeight:700,color:"#fff",boxShadow:"0 0 40px rgba(59,130,246,0.4)"},
  splashSpinner:{width:26,height:26,border:"2.5px solid rgba(59,130,246,0.2)",borderTop:"2.5px solid #3b82f6",borderRadius:"50%",animation:"spin 0.8s linear infinite"},
};


const getCss = (dark) => `
@keyframes spin { to { transform: rotate(360deg); } }
@keyframes pulseDot { 0%,100% { opacity:1; } 50% { opacity:.35; } }
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@500;700&family=IBM+Plex+Mono:wght@400;500&display=swap');
.contact-row:hover { background: ${dark ? "rgba(111,177,255,0.06)" : "rgba(1,118,211,0.05)"} !important; }
.fab:hover { transform: scale(1.06); }
input[type="date"] { color-scheme: ${dark ? "dark" : "light"}; }
input:focus, textarea:focus { border-color: ${dark ? "rgba(111,177,255,0.6)" : "#0176d3"} !important; box-shadow: 0 0 0 3px ${dark ? "rgba(111,177,255,0.14)" : "rgba(1,118,211,0.15)"} !important; }
::-webkit-scrollbar { width: 6px; }
::-webkit-scrollbar-thumb { background: ${dark ? "rgba(140,180,255,0.25)" : "#c9c7c5"}; border-radius: 4px; }
::-webkit-scrollbar-track { background: transparent; }
input, textarea, select { font-size: 16px; }
html, body { overscroll-behavior: none; overflow: hidden; height: 100%; background: ${dark ? "#0A0F1C" : "#f3f2f2"}; }
body { -webkit-user-select: none; user-select: none; }
input, textarea { -webkit-user-select: text; user-select: text; }
* { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
button:hover { opacity: 0.88; }
`;
