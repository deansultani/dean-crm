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

// Parse MM/DD/YYYY → "YYYY-MM-DD" for comparison, or "" if invalid
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

const blankContact = () => ({
  name: "", company: "", phone: "", email: "", notes: "",
  date: new Date().toISOString().slice(0, 10),
  next_touch: "",
  touch_log: []
});

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
  const [exportMenuOpen, setExportMenuOpen] = useState(false);

  useEffect(() => {
    const metas = [
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { name: "apple-mobile-web-app-title", content: "Dean CRM" },
      { name: "theme-color", content: "#0d1b2e" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
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
          if (userData.id) {
            setSession({ ...stored, user: userData });
            setUserId(userData.id);
            setCheckingSession(false);
            return;
          }
          if (stored.refresh_token) {
            const refreshed = await authFetch("token?grant_type=refresh_token", {
              refresh_token: stored.refresh_token,
            });
            if (refreshed.access_token) {
              const userData2 = await getUser(refreshed.access_token);
              if (userData2.id) {
                const newSess = {
                  access_token: refreshed.access_token,
                  refresh_token: refreshed.refresh_token || stored.refresh_token,
                  user: userData2,
                };
                setSession(newSess);
                setUserId(userData2.id);
                localStorage.setItem("dean_crm_session", JSON.stringify(newSess));
                setCheckingSession(false);
                return;
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

  useEffect(() => {
    if (session && userId) fetchContacts();
  }, [session, userId]);

  useEffect(() => {
    if (resendCountdown > 0) {
      const t = setTimeout(() => setResendCountdown(r => r - 1), 1000);
      return () => clearTimeout(t);
    }
  }, [resendCountdown]);

  useEffect(() => {
    if (authStep === "code") {
      setTimeout(() => codeRefs[0].current?.focus(), 100);
    }
  }, [authStep]);

  // Close export menu on outside click
  useEffect(() => {
    if (!exportMenuOpen) return;
    const handler = () => setExportMenuOpen(false);
    setTimeout(() => document.addEventListener("click", handler), 0);
    return () => document.removeEventListener("click", handler);
  }, [exportMenuOpen]);

  const fetchContacts = async () => {
    setLoading(true);
    try {
      const res = await api("contacts?order=name.asc", { token: session.access_token, prefer: "" });
      if (res.ok) {
        const data = await res.json();
        setContacts(data.map((c) => ({ ...c, touch_log: c.touch_log || [] })));
      }
    } catch {}
    setLoading(false);
  };

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(""), 2400); };

  const sendOTP = async () => {
    if (!email.trim()) return setAuthError("Please enter your email");
    setAuthLoading(true); setAuthError("");
    const res = await authFetch("otp", {
      email: email.trim(),
      create_user: true,
      email_redirect_to: null,
      go_true_enabled: false,
    });
    setAuthLoading(false);
    if (res.error) return setAuthError(res.error.message || "Something went wrong");
    setAuthStep("code");
    setCode(["","","","","",""]);
    setResendCountdown(30);
  };

  const verifyOTPWithCode = async (codeArr) => {
    const token = codeArr.join("");
    if (token.length !== 6) return setAuthError("Please enter the full 6-digit code");
    setAuthLoading(true); setAuthError("");
    const res = await authFetch("verify", { email: email.trim(), token, type: "email" });
    setAuthLoading(false);
    if (res.error) {
      setAuthError("Invalid or expired code. Please try again.");
      setCode(["","","","","",""]);
      setTimeout(() => codeRefs[0].current?.focus(), 50);
      return;
    }
    if (res.access_token) {
      const userData = await getUser(res.access_token);
      const sess = { access_token: res.access_token, refresh_token: res.refresh_token, user: userData };
      setSession(sess);
      setUserId(userData.id);
      localStorage.setItem("dean_crm_session", JSON.stringify(sess));
    }
  };

  const verifyOTP = () => verifyOTPWithCode(code);

  const handleCodeInput = (i, val) => {
    const digit = val.replace(/\D/g, "").slice(-1);
    const next = [...code];
    next[i] = digit;
    setCode(next);
    setAuthError("");
    if (digit && i < 5) codeRefs[i + 1].current?.focus();
    if (next.every(d => d !== "")) {
      setTimeout(() => verifyOTPWithCode(next), 80);
    }
  };

  const handleCodeKeyDown = (i, e) => {
    if (e.key === "Backspace") {
      if (code[i]) {
        const next = [...code]; next[i] = ""; setCode(next);
      } else if (i > 0) {
        codeRefs[i - 1].current?.focus();
        const next = [...code]; next[i - 1] = ""; setCode(next);
      }
    }
    if (e.key === "ArrowLeft" && i > 0) codeRefs[i - 1].current?.focus();
    if (e.key === "ArrowRight" && i < 5) codeRefs[i + 1].current?.focus();
  };

  const handleCodePaste = (e) => {
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (pasted.length === 6) {
      const arr = pasted.split("");
      setCode(arr);
      codeRefs[5].current?.focus();
      setTimeout(() => verifyOTPWithCode(arr), 80);
    }
  };

  const signOut = () => {
    setSession(null); setUserId(null);
    localStorage.removeItem("dean_crm_session");
    setContacts([]); setView("list"); setSelected(null);
    setAuthStep("email"); setCode(["","","","","",""]);
  };

  const saveEntry = async () => {
    if (!editEntry.name.trim()) return showToast("Name is required");
    if (!userId) return showToast("Not logged in");
    const isNew = editEntry._isNew;
    const { _isNew, id, touch_log, ...fields } = editEntry;
    const payload = { ...fields, touch_log: touch_log || [], user_id: userId };
    try {
      if (isNew) {
        const res = await api("contacts", { method: "POST", token: session.access_token, body: JSON.stringify(payload) });
        if (res.ok) {
          const created = await res.json();
          const newContact = Array.isArray(created) ? created[0] : created;
          setContacts((prev) => [...prev, { ...newContact, touch_log: newContact.touch_log || [] }].sort((a,b) => a.name.localeCompare(b.name)));
          showToast("Contact added!");
        } else {
          const err = await res.json();
          showToast("Error: " + (err.message || err.hint || "Could not save"));
          return;
        }
      } else {
        const res = await api(`contacts?id=eq.${id}`, { method: "PATCH", token: session.access_token, prefer: "", body: JSON.stringify(fields) });
        if (res.ok) {
          setContacts((prev) => prev.map((c) => c.id === id ? { ...c, ...fields } : c));
          showToast("Contact updated!");
        }
      }
      setView("profile");
    } catch { showToast("Error saving contact"); }
  };

  const deleteContact = async (id) => {
    try {
      await api(`contacts?id=eq.${id}`, { method: "DELETE", token: session.access_token, prefer: "" });
      setContacts((prev) => prev.filter((c) => c.id !== id));
    } catch {}
    setView("list"); setSelected(null); setConfirmDelete(null);
    showToast("Contact deleted");
  };

  const addTouchNote = async () => {
    if (!newNote.trim()) return showToast("Note cannot be empty");
    const contact = contacts[selected];
    const entry = { id: Date.now(), text: newNote.trim(), createdAt: new Date().toISOString() };
    const updatedLog = [entry, ...(contact.touch_log || [])];
    try {
      await api(`contacts?id=eq.${contact.id}`, { method: "PATCH", token: session.access_token, prefer: "", body: JSON.stringify({ touch_log: updatedLog }) });
      setContacts((prev) => prev.map((c) => c.id === contact.id ? { ...c, touch_log: updatedLog } : c));
      setNewNote(""); setAddingNote(false);
      showToast("Note added!");
    } catch { showToast("Error saving note"); }
  };

  const deleteTouchNote = async ({ contactId, touchId }) => {
    const contact = contacts.find((c) => c.id === contactId);
    const updatedLog = contact.touch_log.filter((t) => t.id !== touchId);
    try {
      await api(`contacts?id=eq.${contactId}`, { method: "PATCH", token: session.access_token, prefer: "", body: JSON.stringify({ touch_log: updatedLog }) });
      setContacts((prev) => prev.map((c) => c.id === contactId ? { ...c, touch_log: updatedLog } : c));
    } catch {}
    setConfirmDeleteTouch(null); showToast("Note removed");
  };

  // ── XLSX EXPORT ──
  const exportXLSX = () => {
    const wb = XLSX.utils.book_new();

    // ── Sheet 1: Contacts ──
    const contactRows = contacts.map((c) => ({
      "Name": c.name || "",
      "Company": c.company || "",
      "Phone": c.phone || "",
      "Email": c.email || "",
      "Date Added": c.date ? formatDate(c.date) : "",
      "Next Touch": c.next_touch || "",
      "Touch Count": (c.touch_log || []).length,
      "Notes": (c.notes || "").replace(/\n/g, " "),
    }));

    const ws1 = XLSX.utils.json_to_sheet(contactRows);
    ws1["!cols"] = [
      { wch: 24 }, // Name
      { wch: 22 }, // Company
      { wch: 16 }, // Phone
      { wch: 28 }, // Email
      { wch: 16 }, // Date Added
      { wch: 14 }, // Next Touch
      { wch: 13 }, // Touch Count
      { wch: 40 }, // Notes
    ];
    XLSX.utils.book_append_sheet(wb, ws1, "Contacts");

    // ── Sheet 2: Touch Log ──
    const touchRows = [];
    contacts.forEach((c) => {
      (c.touch_log || []).forEach((t) => {
        touchRows.push({
          "Contact Name": c.name || "",
          "Company": c.company || "",
          "Date & Time": formatDateTime(t.createdAt),
          "Note": t.text || "",
        });
      });
    });

    if (touchRows.length > 0) {
      const ws2 = XLSX.utils.json_to_sheet(touchRows);
      ws2["!cols"] = [
        { wch: 24 }, // Contact Name
        { wch: 22 }, // Company
        { wch: 22 }, // Date & Time
        { wch: 50 }, // Note
      ];
      XLSX.utils.book_append_sheet(wb, ws2, "Touch Log");
    }

    const filename = `DeanCRM_${new Date().toISOString().slice(0,10)}.xlsx`;
    XLSX.writeFile(wb, filename);
    showToast("Exported to spreadsheet!");
    setExportMenuOpen(false);
  };

  // ── CSV EXPORT (kept as fallback) ──
  const exportCSV = () => {
    const headers = ["Name","Company","Phone","Email","Notes","Date","Touch Log"];
    const rows = contacts.map((c) => {
      const log = (c.touch_log || []).map((t) => `[${formatDateTime(t.createdAt)}] ${t.text}`).join(" | ");
      return [c.name,c.company,c.phone,c.email,(c.notes||"").replace(/\n/g," "),c.date,log];
    });
    const csv = [headers, ...rows].map((r) => r.map((v) => `"${(v||"").replace(/"/g,'""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = `DeanCRM_${new Date().toISOString().slice(0,10)}.csv`; a.click();
    showToast("Exported to CSV!");
    setExportMenuOpen(false);
  };

  const filtered = contacts.filter((c) =>
    !search || [c.name,c.company,c.email,c.phone].some((f) => (f||"").toLowerCase().includes(search.toLowerCase()))
  );
  const grouped = filtered.reduce((acc, c) => {
    const letter = (c.name[0] || "#").toUpperCase();
    if (!acc[letter]) acc[letter] = [];
    acc[letter].push({ ...c, _origIdx: contacts.findIndex((x) => x.id === c.id) });
    return acc;
  }, {});
  const contact = selected !== null ? contacts[selected] : null;

  // ── SPLASH ──
  if (checkingSession) return (
    <div style={styles.shell}>
      <div style={styles.splashScreen}>
        <div style={styles.splashLogo}>D</div>
        <div style={styles.splashTitle}>Dean CRM</div>
        <div style={styles.splashSpinner}/>
      </div>
    </div>
  );

  // ── AUTH ──
  if (!session) return (
    <div style={styles.shell}>
      <style>{css}</style>
      <div style={styles.authScreen}>
        <div style={styles.authLogo}>D</div>
        <h1 style={styles.authTitle}>Dean CRM</h1>
        <p style={styles.authSub}>Your contacts, always in sync</p>

        {authStep === "email" ? (
          <div style={styles.authCard}>
            <p style={styles.authCardTitle}>Sign In</p>
            <p style={styles.authCardSub}>Enter your email and we'll send you a 6-digit code.</p>
            <input
              style={styles.authInput} type="email" placeholder="your@email.com"
              value={email} onChange={(e) => { setEmail(e.target.value); setAuthError(""); }}
              onKeyDown={(e) => e.key === "Enter" && sendOTP()}
              autoCapitalize="none" autoCorrect="off"
            />
            {authError && <div style={styles.authError}>{authError}</div>}
            <button style={{ ...styles.authBtn, opacity: authLoading ? 0.7 : 1 }} onClick={sendOTP} disabled={authLoading}>
              {authLoading ? "Sending…" : "Send Code →"}
            </button>
          </div>
        ) : (
          <div style={styles.authCard}>
            <p style={styles.authCardTitle}>Enter your code</p>
            <p style={styles.authCardSub}>We sent a 6-digit code to <strong>{email}</strong></p>
            <div style={styles.codeRow} onPaste={handleCodePaste}>
              {code.map((digit, i) => (
                <input
                  key={i}
                  ref={codeRefs[i]}
                  style={{ ...styles.codeBox, borderColor: digit ? "#1a6fc4" : authError ? "#c0392b" : "#cdd8ea" }}
                  type="text" inputMode="numeric" maxLength={1}
                  value={digit}
                  onChange={(e) => handleCodeInput(i, e.target.value)}
                  onKeyDown={(e) => handleCodeKeyDown(i, e)}
                  onFocus={(e) => e.target.select()}
                />
              ))}
            </div>
            {authError && <div style={{ ...styles.authError, marginTop: 8 }}>{authError}</div>}
            <button
              style={{ ...styles.authBtn, opacity: authLoading ? 0.7 : 1, marginTop: 16 }}
              onClick={verifyOTP} disabled={authLoading}>
              {authLoading ? "Verifying…" : "Verify Code ✓"}
            </button>
            <div style={styles.resendRow}>
              {resendCountdown > 0 ? (
                <span style={styles.resendTimer}>Resend in {resendCountdown}s</span>
              ) : (
                <button style={styles.resendBtn} onClick={() => { setCode(["","","","","",""]); sendOTP(); }}>
                  Resend code
                </button>
              )}
              <button style={styles.changeEmailBtn} onClick={() => { setAuthStep("email"); setAuthError(""); setCode(["","","","","",""]); }}>
                Change email
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  // ── MAIN APP ──
  return (
    <div style={styles.shell}>
      <style>{css}</style>

      {toast && <div style={styles.toast}>{toast}</div>}

      {confirmDelete && (
        <div style={styles.overlay}>
          <div style={styles.modal}>
            <p style={styles.modalTitle}>Delete Contact?</p>
            <p style={styles.modalSub}>This cannot be undone.</p>
            <div style={{display:"flex",gap:10,marginTop:18}}>
              <button style={styles.btnDanger} onClick={() => deleteContact(confirmDelete)}>Delete</button>
              <button style={styles.btnSecondary} onClick={() => setConfirmDelete(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {confirmDeleteTouch && (
        <div style={styles.overlay}>
          <div style={styles.modal}>
            <p style={styles.modalTitle}>Delete Note?</p>
            <p style={styles.modalSub}>This cannot be undone.</p>
            <div style={{display:"flex",gap:10,marginTop:18}}>
              <button style={styles.btnDanger} onClick={() => deleteTouchNote(confirmDeleteTouch)}>Delete</button>
              <button style={styles.btnSecondary} onClick={() => setConfirmDeleteTouch(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      <div style={styles.header}>
        {view !== "list" ? (
          <button style={styles.backBtn} onClick={() => { setAddingNote(false); setNewNote(""); setView("list"); }} title="Back to contacts">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15,18 9,12 15,6"/></svg>
          </button>
        ) : (
          <button style={styles.signOutBtn} onClick={signOut} title="Sign out">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
          </button>
        )}
        <span style={styles.headerTitle}>
          {view === "list" ? "Dean CRM" : view === "profile" ? contact?.name || "Contact" : view === "add" ? "New Contact" : "Edit Contact"}
        </span>

        {/* Export button — list view only */}
        {view === "list" && (
          <div style={{ position: "relative" }}>
            <button
              style={styles.exportBtn}
              onClick={(e) => { e.stopPropagation(); setExportMenuOpen(o => !o); }}
              title="Export"
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
            </button>
            {exportMenuOpen && (
              <div style={styles.exportMenu} onClick={e => e.stopPropagation()}>
                <button style={styles.exportMenuItem} onClick={exportXLSX}>
                  <span style={styles.exportMenuIcon}>📊</span>
                  <div>
                    <div style={styles.exportMenuLabel}>Spreadsheet (.xlsx)</div>
                    <div style={styles.exportMenuSub}>Best for Google Sheets</div>
                  </div>
                </button>
                <div style={styles.exportMenuDivider}/>
                <button style={styles.exportMenuItem} onClick={exportCSV}>
                  <span style={styles.exportMenuIcon}>📄</span>
                  <div>
                    <div style={styles.exportMenuLabel}>CSV (.csv)</div>
                    <div style={styles.exportMenuSub}>Plain text, universal</div>
                  </div>
                </button>
              </div>
            )}
          </div>
        )}

        {view === "profile" && (
          <button style={styles.exportBtn} onClick={() => { setEditEntry({ ...contact }); setView("edit"); }}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
        )}
        {(view === "profile" || view === "add" || view === "edit") && (
          <button style={styles.homeBtn} onClick={() => { setAddingNote(false); setNewNote(""); setView("list"); }} title="All contacts">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
          </button>
        )}
      </div>

      {view === "list" && (
        <div style={styles.body}>
          <div style={styles.searchWrap}>
            <svg style={styles.searchIcon} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input style={styles.searchInput} placeholder="Search contacts…" value={search} onChange={(e) => setSearch(e.target.value)} />
            {search && <button style={styles.clearSearch} onClick={() => setSearch("")}>✕</button>}
          </div>
          {loading ? (
            <div style={styles.empty}><div style={styles.splashSpinner}/></div>
          ) : contacts.length === 0 ? (
            <div style={styles.empty}>
              <div style={styles.emptyIcon}>📋</div>
              <p style={styles.emptyTitle}>No contacts yet</p>
              <p style={styles.emptySub}>Tap + to add your first contact</p>
            </div>
          ) : filtered.length === 0 ? (
            <div style={styles.empty}><p style={styles.emptyTitle}>No results for "{search}"</p></div>
          ) : (
            <div style={styles.listScroll}>
              {Object.keys(grouped).sort().map((letter) => (
                <div key={letter}>
                  <div style={styles.sectionHeader}>{letter}</div>
                  {grouped[letter].map((c) => (
                    <div key={c.id} style={styles.contactRow} className="contact-row"
                      onClick={() => { setSelected(c._origIdx); setView("profile"); }}>
                      <div style={{ ...styles.avatar, background: avatarColor(c.name) }}>{initials(c.name)}</div>
                      <div style={styles.rowInfo}>
                        <div style={styles.rowName}>{c.name}</div>
                        <div style={styles.rowSub}>{c.company || c.email || c.phone || "—"}</div>
                        {c.next_touch && (() => {
                          const status = nextTouchStatus(c.next_touch);
                          const chipStyle = status === "overdue"
                            ? styles.touchChipOverdue
                            : status === "today"
                            ? styles.touchChipToday
                            : styles.touchChipUpcoming;
                          const label = status === "overdue" ? "⚠ Overdue · " : status === "today" ? "📌 Today · " : "🗓 ";
                          return <div style={chipStyle}>{label}{c.next_touch}</div>;
                        })()}
                      </div>
                      {(c.touch_log||[]).length > 0 && <span style={styles.touchBadge}>{c.touch_log.length}</span>}
                      <svg style={styles.chevron} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9,18 15,12 9,6"/></svg>
                    </div>
                  ))}
                </div>
              ))}
              <div style={{height:90}}/>
            </div>
          )}
          <button style={styles.fab} className="fab" onClick={() => { setEditEntry({ ...blankContact(), _isNew: true }); setView("add"); }}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          </button>
        </div>
      )}

      {view === "profile" && contact && (
        <div style={styles.body}>
          <div style={styles.profileScroll}>
            <div style={styles.profileHero}>
              <div style={{ ...styles.avatarLg, background: avatarColor(contact.name) }}>{initials(contact.name)}</div>
              <h2 style={styles.profileName}>{contact.name}</h2>
              {contact.company && <p style={styles.profileCompany}>{contact.company}</p>}
            </div>
            <div style={styles.card}>
              {[
                { icon: "📞", label: "Phone", val: contact.phone, href: `tel:${contact.phone}` },
                { icon: "✉️", label: "Email", val: contact.email, href: `mailto:${contact.email}` },
                { icon: "📅", label: "Date Added", val: formatDate(contact.date) },
                { icon: "🗓", label: "Next Touch", val: contact.next_touch || "" },
              ].filter(f => f.val).map((f) => (
                <div key={f.label} style={styles.fieldRow}>
                  <span style={styles.fieldIcon}>{f.icon}</span>
                  <div style={styles.fieldBody}>
                    <div style={styles.fieldLabel}>{f.label}</div>
                    {f.href ? <a href={f.href} style={styles.fieldValue}>{f.val}</a> : <div style={styles.fieldValue}>{f.val}</div>}
                  </div>
                </div>
              ))}
            </div>
            {contact.notes && (
              <div style={styles.card}>
                <div style={styles.notesLabel}>📝 Notes</div>
                <div style={styles.notesText}>{contact.notes}</div>
              </div>
            )}
            <div style={styles.touchSection}>
              <div style={styles.touchHeader}>
                <span style={styles.touchHeaderTitle}>🤝 Touch Log</span>
                <button style={styles.addNoteBtn} onClick={() => { setAddingNote(true); setNewNote(""); }}>+ Add Note</button>
              </div>
              {addingNote && (
                <div style={styles.addNotePanel}>
                  <div style={styles.addNoteDate}>📅 {formatDateTime(new Date().toISOString())}</div>
                  <textarea style={styles.addNoteTextarea} placeholder="What happened during this touch?" value={newNote} onChange={(e) => setNewNote(e.target.value)} rows={3} autoFocus/>
                  <div style={{display:"flex",gap:8,marginTop:10}}>
                    <button style={styles.saveNoteBtn} onClick={addTouchNote}>Save Note</button>
                    <button style={styles.cancelNoteBtn} onClick={() => { setAddingNote(false); setNewNote(""); }}>Cancel</button>
                  </div>
                </div>
              )}
              {(contact.touch_log||[]).length === 0 && !addingNote ? (
                <div style={styles.touchEmpty}>No touch log entries yet. Tap "+ Add Note" to record an interaction.</div>
              ) : (
                (contact.touch_log||[]).map((touch, i) => (
                  <div key={touch.id} style={{ ...styles.touchEntry, borderTop: i === 0 ? "none" : "1px solid #d6e2f0" }}>
                    <div style={styles.touchEntryHeader}>
                      <span style={styles.touchEntryDate}>{formatDateTime(touch.createdAt)}</span>
                      <button style={styles.touchDeleteBtn} onClick={() => setConfirmDeleteTouch({ contactId: contact.id, touchId: touch.id })}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                      </button>
                    </div>
                    <div style={styles.touchEntryText}>{touch.text}</div>
                  </div>
                ))
              )}
            </div>
            <button style={styles.btnDangerFull} onClick={() => setConfirmDelete(contact.id)}>Delete Contact</button>
            <div style={{height:40}}/>
          </div>
        </div>
      )}

      {(view === "add" || view === "edit") && editEntry && (
        <div style={styles.body}>
          <div style={styles.formScroll}>
            {[
              { key: "name", label: "Full Name", placeholder: "Jane Smith", type: "text", required: true },
              { key: "company", label: "Company", placeholder: "Acme Corp", type: "text" },
              { key: "phone", label: "Phone", placeholder: "916-213-4051", type: "tel" },
              { key: "email", label: "Email", placeholder: "jane@acme.com", type: "email" },
              { key: "date", label: "Date Added", placeholder: "", type: "date" },
            ].map((f) => (
              <div key={f.key} style={styles.formGroup}>
                <label style={styles.formLabel}>{f.label}{f.required && <span style={styles.required}> *</span>}</label>
                <input
                  style={styles.formInput} type={f.type} placeholder={f.placeholder}
                  value={editEntry[f.key] || ""}
                  maxLength={f.key === "phone" ? 12 : undefined}
                  inputMode={f.key === "phone" ? "numeric" : undefined}
                  onChange={(e) => {
                    if (f.key === "phone") {
                      const digits = e.target.value.replace(/\D/g,"").slice(0,10);
                      let fmt = digits;
                      if (digits.length > 6) fmt = digits.slice(0,3)+"-"+digits.slice(3,6)+"-"+digits.slice(6);
                      else if (digits.length > 3) fmt = digits.slice(0,3)+"-"+digits.slice(3);
                      setEditEntry({ ...editEntry, phone: fmt });
                    } else setEditEntry({ ...editEntry, [f.key]: e.target.value });
                  }}
                />
                {f.key === "phone" && <div style={styles.phoneHint}>{(editEntry.phone||"").replace(/\D/g,"").length}/10 digits</div>}
              </div>
            ))}
            {/* Next Touch Date — free-text MM/DD/YYYY */}
            <div style={styles.formGroup}>
              <label style={styles.formLabel}>Next Touch Date</label>
              <input
                style={styles.formInput}
                type="text"
                placeholder="MM/DD/YYYY"
                value={editEntry.next_touch || ""}
                maxLength={10}
                inputMode="numeric"
                onChange={(e) => {
                  // Auto-format as MM/DD/YYYY while typing
                  const raw = e.target.value.replace(/\D/g, "").slice(0, 8);
                  let fmt = raw;
                  if (raw.length > 4) fmt = raw.slice(0,2) + "/" + raw.slice(2,4) + "/" + raw.slice(4);
                  else if (raw.length > 2) fmt = raw.slice(0,2) + "/" + raw.slice(2);
                  setEditEntry({ ...editEntry, next_touch: fmt });
                }}
              />
              <div style={styles.phoneHint}>
                {editEntry.next_touch && nextTouchStatus(editEntry.next_touch) === "overdue" && <span style={{color:"#c0392b"}}>⚠ This date is in the past</span>}
                {editEntry.next_touch && nextTouchStatus(editEntry.next_touch) === "today" && <span style={{color:"#e67e22"}}>📌 Today</span>}
                {editEntry.next_touch && nextTouchStatus(editEntry.next_touch) === "upcoming" && <span style={{color:"#1a6fc4"}}>✓ Upcoming</span>}
                {!editEntry.next_touch && <span style={{color:"#aaa"}}>optional</span>}
              </div>
            </div>
            <div style={styles.formGroup}>
              <label style={styles.formLabel}>Notes</label>
              <textarea style={styles.formTextarea} placeholder="General notes about this contact…" value={editEntry.notes||""} onChange={(e) => setEditEntry({ ...editEntry, notes: e.target.value })} rows={4}/>
            </div>
            <button style={styles.btnPrimary} onClick={saveEntry}>{view === "add" ? "Add Contact" : "Save Changes"}</button>
            <button style={styles.btnSecondaryFull} onClick={() => setView(view === "add" ? "list" : "profile")}>Cancel</button>
            <div style={{height:40}}/>
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  shell: { width:"100%", height:"100dvh", display:"flex", flexDirection:"column", fontFamily:"'Georgia','Times New Roman',serif", background:"#eef2f8", color:"#0d1b2e", position:"relative", overflow:"hidden", paddingBottom:"env(safe-area-inset-bottom)" },
  header: { background:"#0d1b2e", color:"#eef2f8", paddingTop:"calc(14px + env(safe-area-inset-top))", paddingBottom:"14px", paddingLeft:"max(16px, env(safe-area-inset-left))", paddingRight:"max(16px, env(safe-area-inset-right))", display:"flex", alignItems:"center", gap:10, minHeight:"calc(56px + env(safe-area-inset-top))", flexShrink:0, borderBottom:"2px solid #1a6fc4" },
  headerTitle: { flex:1, fontSize:20, fontWeight:700, letterSpacing:"0.04em", fontFamily:"'Georgia',serif" },
  backBtn: { background:"none", border:"none", color:"#eef2f8", cursor:"pointer", padding:"4px 6px", borderRadius:6, display:"flex", alignItems:"center" },
  signOutBtn: { background:"none", border:"none", color:"#eef2f8", cursor:"pointer", padding:"6px 8px", borderRadius:6, display:"flex", alignItems:"center", opacity:0.75 },
  exportBtn: { background:"none", border:"none", color:"#eef2f8", cursor:"pointer", padding:"6px 8px", borderRadius:6, display:"flex", alignItems:"center", opacity:0.85 },
  exportMenu: { position:"absolute", top:"calc(100% + 8px)", right:0, background:"#fff", borderRadius:14, boxShadow:"0 8px 32px rgba(0,0,0,0.18)", border:"1px solid #d6e2f0", zIndex:300, minWidth:210, overflow:"hidden" },
  exportMenuItem: { display:"flex", alignItems:"center", gap:12, width:"100%", padding:"13px 16px", background:"none", border:"none", cursor:"pointer", fontFamily:"'Georgia',serif", textAlign:"left" },
  exportMenuIcon: { fontSize:22, flexShrink:0 },
  exportMenuLabel: { fontSize:14, fontWeight:700, color:"#0d1b2e" },
  exportMenuSub: { fontSize:11, color:"#999", marginTop:1 },
  exportMenuDivider: { height:1, background:"#e8f0fa", margin:"0 14px" },
  body: { flex:1, display:"flex", flexDirection:"column", overflow:"hidden", position:"relative" },
  searchWrap: { margin:"12px 14px 4px", background:"#fff", borderRadius:12, display:"flex", alignItems:"center", padding:"8px 12px", gap:8, border:"1.5px solid #cdd8ea", flexShrink:0 },
  searchIcon: { flexShrink:0, color:"#888" },
  searchInput: { flex:1, border:"none", outline:"none", fontSize:15, background:"transparent", fontFamily:"inherit", color:"#0d1b2e" },
  clearSearch: { background:"none", border:"none", cursor:"pointer", color:"#999", fontSize:14, padding:2 },
  listScroll: { flex:1, overflowY:"auto", WebkitOverflowScrolling:"touch" },
  sectionHeader: { padding:"10px 16px 4px", fontSize:12, fontWeight:700, color:"#1a6fc4", letterSpacing:"0.12em", textTransform:"uppercase", background:"#eef2f8" },
  contactRow: { display:"flex", alignItems:"center", padding:"10px 16px", gap:12, cursor:"pointer", borderBottom:"1px solid #d6e2f0", background:"#fff", transition:"background 0.12s" },
  avatar: { width:42, height:42, borderRadius:"50%", display:"flex", alignItems:"center", justifyContent:"center", fontSize:15, fontWeight:700, color:"#fff", flexShrink:0, letterSpacing:"0.04em" },
  rowInfo: { flex:1, minWidth:0 },
  rowName: { fontSize:16, fontWeight:600, color:"#0d1b2e", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" },
  rowSub: { fontSize:13, color:"#888", marginTop:1, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" },
  touchBadge: { background:"#1a6fc4", color:"#fff", fontSize:11, fontWeight:700, borderRadius:10, padding:"2px 7px", marginRight:4, fontFamily:"sans-serif" },
  touchChipOverdue: { display:"inline-block", marginTop:4, fontSize:11, fontWeight:700, color:"#c0392b", background:"#fdecea", borderRadius:6, padding:"2px 7px" },
  touchChipToday: { display:"inline-block", marginTop:4, fontSize:11, fontWeight:700, color:"#b7580a", background:"#fff3e0", borderRadius:6, padding:"2px 7px" },
  touchChipUpcoming: { display:"inline-block", marginTop:4, fontSize:11, fontWeight:600, color:"#1a6fc4", background:"#e8f0fc", borderRadius:6, padding:"2px 7px" },
  chevron: { color:"#ccc", flexShrink:0 },
  fab: { position:"absolute", bottom:"calc(24px + env(safe-area-inset-bottom))", right:"max(20px, env(safe-area-inset-right))", width:58, height:58, borderRadius:"50%", background:"#1a6fc4", border:"none", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", boxShadow:"0 4px 20px rgba(26,111,196,0.45)", transition:"transform 0.15s, box-shadow 0.15s", zIndex:10 },
  empty: { flex:1, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:40, textAlign:"center" },
  emptyIcon: { fontSize:52, marginBottom:16 },
  emptyTitle: { fontSize:18, fontWeight:600, color:"#444", marginBottom:6 },
  emptySub: { fontSize:14, color:"#999" },
  profileScroll: { flex:1, overflowY:"auto", WebkitOverflowScrolling:"touch", padding:"0 0 20px" },
  profileHero: { background:"#0d1b2e", padding:"32px 20px 28px", display:"flex", flexDirection:"column", alignItems:"center", gap:10, borderBottom:"2px solid #1a6fc4" },
  avatarLg: { width:78, height:78, borderRadius:"50%", display:"flex", alignItems:"center", justifyContent:"center", fontSize:28, fontWeight:700, color:"#fff", letterSpacing:"0.04em" },
  profileName: { fontSize:22, fontWeight:700, color:"#eef2f8", margin:0, textAlign:"center" },
  profileCompany: { fontSize:14, color:"#8aafd4", margin:0, textAlign:"center" },
  card: { background:"#fff", margin:"14px 14px 0", borderRadius:14, padding:"4px 0", border:"1px solid #d6e2f0", overflow:"hidden" },
  fieldRow: { display:"flex", alignItems:"flex-start", padding:"12px 16px", gap:12, borderBottom:"1px solid #e8f0fa" },
  fieldIcon: { fontSize:18, flexShrink:0, marginTop:1 },
  fieldBody: { flex:1, minWidth:0 },
  fieldLabel: { fontSize:11, color:"#1a6fc4", fontWeight:700, letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:2 },
  fieldValue: { fontSize:15, color:"#0d1b2e", textDecoration:"none", wordBreak:"break-all" },
  notesLabel: { fontSize:12, color:"#1a6fc4", fontWeight:700, letterSpacing:"0.1em", textTransform:"uppercase", padding:"12px 16px 4px" },
  notesText: { fontSize:14, color:"#444", padding:"0 16px 14px", lineHeight:1.7, whiteSpace:"pre-wrap" },
  touchSection: { margin:"14px 14px 0", background:"#fff", borderRadius:14, border:"1px solid #d6e2f0", overflow:"hidden" },
  touchHeader: { display:"flex", alignItems:"center", justifyContent:"space-between", padding:"12px 16px", borderBottom:"1px solid #d6e2f0", background:"#f4f8ff" },
  touchHeaderTitle: { fontSize:13, fontWeight:700, color:"#1a6fc4", letterSpacing:"0.08em", textTransform:"uppercase" },
  addNoteBtn: { background:"#1a6fc4", color:"#fff", border:"none", borderRadius:8, padding:"6px 12px", fontSize:13, fontWeight:700, cursor:"pointer", fontFamily:"inherit" },
  addNotePanel: { padding:"14px 16px", borderBottom:"1px solid #d6e2f0", background:"#f0f6ff" },
  addNoteDate: { fontSize:11, color:"#1a6fc4", fontWeight:600, marginBottom:8, letterSpacing:"0.04em" },
  addNoteTextarea: { width:"100%", padding:"10px 12px", border:"1.5px solid #cdd8ea", borderRadius:10, fontSize:14, color:"#0d1b2e", fontFamily:"inherit", outline:"none", boxSizing:"border-box", resize:"vertical", lineHeight:1.6, background:"#fff" },
  saveNoteBtn: { flex:1, padding:"10px", background:"#1a6fc4", border:"none", color:"#fff", borderRadius:9, fontSize:14, fontWeight:700, cursor:"pointer", fontFamily:"inherit" },
  cancelNoteBtn: { flex:1, padding:"10px", background:"transparent", border:"1.5px solid #b0c4de", color:"#666", borderRadius:9, fontSize:14, fontWeight:600, cursor:"pointer", fontFamily:"inherit" },
  touchEmpty: { padding:"16px", fontSize:13, color:"#999", textAlign:"center", lineHeight:1.6 },
  touchEntry: { padding:"12px 16px" },
  touchEntryHeader: { display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:6 },
  touchEntryDate: { fontSize:11, color:"#1a6fc4", fontWeight:600, letterSpacing:"0.03em" },
  touchDeleteBtn: { background:"none", border:"none", cursor:"pointer", color:"#bbb", padding:"2px 4px", display:"flex", alignItems:"center", borderRadius:4 },
  touchEntryText: { fontSize:14, color:"#1c2a3a", lineHeight:1.65, whiteSpace:"pre-wrap" },
  btnDangerFull: { display:"block", width:"calc(100% - 28px)", margin:"14px 14px 0", padding:"13px", background:"transparent", border:"1.5px solid #c0392b", color:"#c0392b", borderRadius:12, fontSize:15, fontWeight:600, cursor:"pointer", fontFamily:"inherit" },
  formScroll: { flex:1, overflowY:"auto", WebkitOverflowScrolling:"touch", padding:"16px 14px" },
  formGroup: { marginBottom:14 },
  formLabel: { display:"block", fontSize:12, color:"#1a6fc4", fontWeight:700, letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:5 },
  required: { color:"#c0392b" },
  formInput: { width:"100%", padding:"12px 14px", background:"#fff", border:"1.5px solid #cdd8ea", borderRadius:10, fontSize:15, color:"#0d1b2e", fontFamily:"inherit", outline:"none", boxSizing:"border-box", transition:"border-color 0.15s" },
  formTextarea: { width:"100%", padding:"12px 14px", background:"#fff", border:"1.5px solid #cdd8ea", borderRadius:10, fontSize:15, color:"#0d1b2e", fontFamily:"inherit", outline:"none", boxSizing:"border-box", resize:"vertical", lineHeight:1.6 },
  btnPrimary: { display:"block", width:"100%", padding:"14px", background:"#1a6fc4", border:"none", color:"#fff", borderRadius:12, fontSize:16, fontWeight:700, cursor:"pointer", fontFamily:"inherit", marginBottom:10 },
  btnSecondaryFull: { display:"block", width:"100%", padding:"13px", background:"transparent", border:"1.5px solid #b0c4de", color:"#666", borderRadius:12, fontSize:15, fontWeight:600, cursor:"pointer", fontFamily:"inherit" },
  btnSecondary: { flex:1, padding:"12px", background:"transparent", border:"1.5px solid #b0c4de", color:"#555", borderRadius:10, fontSize:15, fontWeight:600, cursor:"pointer", fontFamily:"inherit" },
  btnDanger: { flex:1, padding:"12px", background:"#c0392b", border:"none", color:"#fff", borderRadius:10, fontSize:15, fontWeight:700, cursor:"pointer", fontFamily:"inherit" },
  toast: { position:"absolute", bottom:"calc(94px + env(safe-area-inset-bottom))", left:"50%", transform:"translateX(-50%)", background:"#0d1b2e", color:"#eef2f8", padding:"10px 20px", borderRadius:30, fontSize:13, fontWeight:600, zIndex:100, whiteSpace:"nowrap", boxShadow:"0 4px 20px rgba(0,0,0,0.3)" },
  overlay: { position:"absolute", inset:0, background:"rgba(0,0,0,0.5)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:200, padding:30 },
  modal: { background:"#fff", borderRadius:16, padding:"24px 22px", width:"100%", maxWidth:320, textAlign:"center" },
  modalTitle: { fontSize:18, fontWeight:700, color:"#0d1b2e", margin:"0 0 6px" },
  modalSub: { fontSize:14, color:"#888", margin:0 },
  phoneHint: { fontSize:11, color:"#1560e8", marginTop:4, textAlign:"right" },
  splashScreen: { flex:1, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", background:"#0d1b2e", gap:16 },
  splashLogo: { width:72, height:72, borderRadius:20, background:"#1a6fc4", display:"flex", alignItems:"center", justifyContent:"center", fontSize:36, fontWeight:700, color:"#fff", fontFamily:"'Georgia',serif" },
  splashTitle: { fontSize:24, fontWeight:700, color:"#eef2f8", fontFamily:"'Georgia',serif", letterSpacing:"0.04em" },
  splashSpinner: { width:28, height:28, border:"3px solid rgba(255,255,255,0.2)", borderTop:"3px solid #1a6fc4", borderRadius:"50%", animation:"spin 0.8s linear infinite" },
  authScreen: { flex:1, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", background:"#0d1b2e", padding:"30px 24px", paddingTop:"calc(30px + env(safe-area-inset-top))" },
  authLogo: { width:68, height:68, borderRadius:18, background:"#1a6fc4", display:"flex", alignItems:"center", justifyContent:"center", fontSize:34, fontWeight:700, color:"#fff", fontFamily:"'Georgia',serif", marginBottom:12 },
  authTitle: { fontSize:26, fontWeight:700, color:"#eef2f8", margin:"0 0 6px", fontFamily:"'Georgia',serif" },
  authSub: { fontSize:14, color:"#8aafd4", margin:"0 0 32px", textAlign:"center" },
  authCard: { background:"#fff", borderRadius:18, padding:"24px 20px", width:"100%", maxWidth:360 },
  authCardTitle: { fontSize:17, fontWeight:700, color:"#0d1b2e", margin:"0 0 8px", textAlign:"center" },
  authCardSub: { fontSize:13, color:"#666", margin:"0 0 18px", textAlign:"center", lineHeight:1.6 },
  authInput: { width:"100%", padding:"13px 14px", border:"1.5px solid #cdd8ea", borderRadius:10, fontSize:15, color:"#0d1b2e", fontFamily:"inherit", outline:"none", boxSizing:"border-box", marginBottom:10 },
  authError: { fontSize:13, color:"#c0392b", textAlign:"center" },
  authBtn: { display:"block", width:"100%", padding:"14px", background:"#1a6fc4", border:"none", color:"#fff", borderRadius:12, fontSize:16, fontWeight:700, cursor:"pointer", fontFamily:"inherit" },
  codeRow: { display:"flex", gap:8, justifyContent:"center", margin:"4px 0 0" },
  codeBox: { width:42, height:52, textAlign:"center", fontSize:22, fontWeight:700, color:"#0d1b2e", border:"2px solid #cdd8ea", borderRadius:10, outline:"none", fontFamily:"'Georgia',serif", background:"#f8faff", transition:"border-color 0.15s" },
  homeBtn: { background:"none", border:"none", color:"#eef2f8", cursor:"pointer", padding:"6px 8px", borderRadius:6, display:"flex", alignItems:"center", opacity:0.85, marginLeft:2 },
  resendRow: { display:"flex", justifyContent:"space-between", alignItems:"center", marginTop:14 },
  resendTimer: { fontSize:12, color:"#999" },
  resendBtn: { fontSize:13, color:"#1a6fc4", background:"none", border:"none", cursor:"pointer", fontFamily:"inherit", fontWeight:600, padding:0 },
  changeEmailBtn: { fontSize:13, color:"#888", background:"none", border:"none", cursor:"pointer", fontFamily:"inherit", padding:0 },
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
