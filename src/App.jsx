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

const parseTask​​​​​​​​​​​​​​​​

