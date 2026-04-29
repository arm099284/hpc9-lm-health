import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  deleteRecord as deleteRecordFromSupabase,
  loadAllRecords,
  loadAuditLogs,
  saveRecord as saveRecordToSupabase,
  signInAdmin as signInAdminWithSupabase,
  signOutAdmin as signOutAdminFromSupabase,
} from "./lib/healthRepository";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  Legend,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

// แก้ปัญหา build: ไม่ใช้ lucide-react เพราะบาง sandbox fetch icon จาก CDN ไม่ได้
// ใช้ไอคอน SVG แบบ local แทน เพื่อให้รันได้โดยไม่ต้องพึ่ง external icon files
const IconBase = ({ children, className = "h-6 w-6 text-slate-500" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
);

const ActivityIcon = (props) => <IconBase {...props}><path d="M22 12h-4l-3 8-6-16-3 8H2" /></IconBase>;
const ClipboardIcon = (props) => <IconBase {...props}><path d="M9 3h6" /><path d="M9 7h6" /><path d="M8 3h8a2 2 0 0 1 2 2v15H6V5a2 2 0 0 1 2-2Z" /><path d="M9 12h6" /><path d="M9 16h6" /></IconBase>;
const FileIcon = (props) => <IconBase {...props}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" /><path d="M14 2v6h6" /><path d="M8 13h8" /><path d="M8 17h6" /></IconBase>;
const HeartIcon = (props) => <IconBase {...props}><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 1 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8Z" /><path d="M3 12h4l2-4 4 8 2-4h6" /></IconBase>;
const SearchIcon = (props) => <IconBase {...props}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></IconBase>;
const UserIcon = (props) => <IconBase {...props}><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></IconBase>;

function outcomeColor(name) {
  if (name === "เทียบได้ ≥2 ครั้ง") return "#93c5fd";
  if (name === "ดีขึ้น") return "#86efac";
  if (name === "ต้องติดตาม") return "#fde68a";
  if (name === "คงเดิม") return "#cbd5e1";
  if (name === "ข้อมูลไม่พอ") return "#94a3b8";
  return "#94a3b8";
}

const ADMIN_PASSWORD = "LMHPC9";
const ADMIN_USERS = {
  admin1: { id: "admin1", name: "ชัยวัฒน์", role: "Admin" },
  admin2: { id: "admin2", name: "ธนาวุฒิ", role: "Admin" },
};
const PAGE_SIZE = 10;
const RECORDS_STORAGE_KEY = "hpc9_lm_health_records_v1";
const AUDIT_STORAGE_KEY = "hpc9_lm_audit_logs_v1";

const clone = (x) => JSON.parse(JSON.stringify(x));
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const show = (v) => (v === "" || v === null || v === undefined ? "-" : v);
const todayThai = () => new Date().toISOString();
function todayThaiDateText() {
  const now = new Date();
  const yyyy = now.getFullYear() + 543;
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${dd}/${mm}/${yyyy}`;
}

function formatDateTimeThai(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (!Number.isNaN(date.getTime())) {
    const dd = String(date.getDate()).padStart(2, "0");
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const yyyy = date.getFullYear() + 543;
    const hh = String(date.getHours()).padStart(2, "0");
    const min = String(date.getMinutes()).padStart(2, "0");
    return `${dd}/${mm}/${yyyy} ${hh}.${min} น.`;
  }
  return String(value).replace("T", " ").split("+")[0].replace(/([0-9]{1,2}):([0-9]{2})/, "$1.$2");
}

function formatDateOnlyThai(value) {
  if (!value) return "";
  const text = String(value);
  if (/^[0-9]{2}\/[0-9]{2}\/[0-9]{4}$/.test(text)) return text;
  const parts = text.split("-");
  if (parts.length === 3) {
    let y = Number(parts[0]);
    const m = parts[1];
    const d = parts[2].slice(0, 2);
    if (y < 2400) y += 543;
    return `${d}/${m}/${y}`;
  }
  return text;
}

function shortThaiDate(value) {
  const text = String(value || "").trim();
  if (!text) return "-";

  if (text.includes("/")) {
    const parts = text.split("/");
    const dd = String(parts[0] || "").padStart(2, "0");
    const mm = String(parts[1] || "").padStart(2, "0");
    const yy = String(parts[2] || "").slice(-2);
    return `${dd}/${mm}/${yy}`;
  }

  if (text.includes("-")) {
    const parts = text.split("-");
    const yyyy = String(parts[0] || "");
    const mm = String(parts[1] || "").padStart(2, "0");
    const dd = String(parts[2] || "").slice(0, 2).padStart(2, "0");
    const yy = yyyy.slice(-2);
    return `${dd}/${mm}/${yy}`;
  }

  return text;
}

function sessionHasAnyData(s) {
  if (!s) return false;
  const inbodyValues = Object.values(s.inbody || {});
  const fitnessValues = Object.values(s.fitness || {});
  const ohsValues = Array.isArray(s.ohs) ? s.ohs : [];
  return Boolean(
    s.note ||
    inbodyValues.some((v) => v !== "" && v !== null && v !== undefined) ||
    fitnessValues.some((v) => v !== "" && v !== null && v !== undefined) ||
    ohsValues.some((v) => v && v !== "ปกติ")
  );
}
const createAuditEntry = ({ adminUser, action, hn, detail = "" }) => ({
  id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
  at: todayThai(),
  adminId: adminUser?.id || "-",
  adminName: adminUser?.name || "-",
  role: adminUser?.role || "-",
  action,
  hn: hn || "-",
  detail,
});

function downloadTextFile(filename, content, mime = "text/plain;charset=utf-8") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function csvCell(value) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function exportRecordsCSV(records) {
  function listText(value) {
    if (Array.isArray(value)) return value.join(" / ");
    return String(value || "");
  }

  function jsonText(value) {
    if (value === null || value === undefined) return "";
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }

  function exerciseDaysText(days = {}) {
    const labels = {
      fullBody: "Full Body",
      upper: "Upper Day",
      lower: "Lower Day",
      push: "Push Day",
      pull: "Pull Day",
      legs: "Legs Day",
    };

    return Object.entries(days || {})
      .filter(([, list]) => Array.isArray(list) && list.length > 0)
      .map(([key, list]) => `${labels[key] || key}: ${list.join(", ")}`)
      .join(" | ");
  }

  function nutritionExport(record) {
    const plan = nutritionGoalPlan(record);

    if (!plan) {
      return {
        calories: "",
        tdee: "",
        bmr: "",
        carbG: "",
        fatG: "",
        proteinG: "",
        macroText: "",
      };
    }

    const carb = plan.pieData.find((x) => x.shortName === "Carb");
    const fat = plan.pieData.find((x) => x.shortName === "Fat");
    const protein = plan.pieData.find((x) => x.shortName === "Protein");

    return {
      calories: plan.targetCalories,
      tdee: plan.tdee,
      bmr: plan.bmr,
      carbG: carb?.grams || "",
      fatG: fat?.grams || "",
      proteinG: protein?.grams || "",
      macroText: plan.pieData
        .map((x) => `${x.name} ${x.percent}% ${x.grams}g`)
        .join(" / "),
    };
  }

  const header = [
    "HN",
    "ชื่อ",
    "เพศ",
    "อายุ",
    "ส่วนสูง",
    "เป้าหมาย",
    "โรคประจำตัว",
    "ยา",
    "การบาดเจ็บ",
    "PAR-Q",
    "จำนวนครั้งที่บันทึก",
    "วันที่ล่าสุด",

    "น้ำหนักล่าสุด",
    "BMI ล่าสุด",
    "Body Fat ล่าสุด",
    "Fat Mass ล่าสุด",
    "Muscle ล่าสุด",
    "Visceral Fat ล่าสุด",
    "Visceral Fat Area ล่าสุด",

    "Program Type",
    "Strength วัน/สัปดาห์",
    "Sets × Reps",
    "Intensity",
    "Cardio Type",
    "Cardio วัน/สัปดาห์",
    "Cardio นาที/ครั้ง",
    "RPE",
    "Talk Test",
    "Target HR",
    "Focus",
    "ข้อควรระวัง",
    "คำแนะนำเพิ่มเติม",
    "Program Note",

    "Trainer Split",
    "Trainer วัน/สัปดาห์",
    "Trainer คำอธิบาย",
    "Trainer รายการท่า",
    "Trainer แก้ล่าสุดจาก",
    "Trainer แก้ล่าสุดเป็น",
    "Trainer แก้โดย",
    "Trainer วันที่แก้",
    "Trainer เหตุผล",

    "Nutrition Calories",
    "Nutrition TDEE",
    "Nutrition BMR",
    "Carb g/day",
    "Fat g/day",
    "Protein g/day",
    "Macro Summary",

    "Sessions JSON",
    "Program JSON",
    "ExerciseLog JSON",
  ];

  const rows = Object.values(records).map((record) => {
    const sessions = completedSessions(record);
    const latest = sessions[sessions.length - 1] || session(1);
    const program = record.program || {};
    const exerciseLog = record.exerciseLog || {};
    const latestHistory =
      Array.isArray(exerciseLog.history) && exerciseLog.history.length
        ? exerciseLog.history[0]
        : {};
    const nutrition = nutritionExport(record);

    return [
      record.hn,
      record.name,
      record.sex,
      record.age,
      record.height,
      record.goal,
      record.disease,
      record.medication,
      record.injury,
      Array.isArray(record.parq) && record.parq.some(Boolean)
        ? "ควรประเมินเพิ่ม"
        : "ผ่าน",
      sessions.length,
      latest.date,

      latest.inbody?.weight,
      latest.inbody?.bmi,
      latest.inbody?.bodyFat,
      latest.inbody?.fatMass,
      latest.inbody?.muscle,
      latest.inbody?.visceral,
      latest.inbody?.waist,

      program.type,
      program.strengthFrequency,
      program.strengthDose ||
        program.setsReps ||
        program.strengthSetsReps ||
        program.strengthPlan,
      program.intensity,
      program.cardioType,
      program.cardioFrequency,
      program.cardioDuration,
      program.rpe,
      program.talk,
      targetHrText(record.age, program.intensity),
      listText(program.focus),
      program.precaution,
      program.followUp,
      program.note,

      exerciseLog.split,
      exerciseLog.daysPerWeek,
      exerciseLog.description,
      exerciseDaysText(exerciseLog.days),
      latestHistory.from || exerciseLog.updatedFrom || "",
      latestHistory.to || exerciseLog.updatedTo || "",
      latestHistory.by || exerciseLog.updatedBy || "",
      latestHistory.at || exerciseLog.updatedAt || "",
      latestHistory.reason || exerciseLog.updateReason || "",

      nutrition.calories,
      nutrition.tdee,
      nutrition.bmr,
      nutrition.carbG,
      nutrition.fatG,
      nutrition.proteinG,
      nutrition.macroText,

      jsonText(record.sessions),
      jsonText(program),
      jsonText(exerciseLog),
    ];
  });

  const csv = [header, ...rows]
    .map((row) => row.map(csvCell).join(","))
    .join("\n");

  downloadTextFile(
    `health-assessment-detailed-${new Date().toISOString().slice(0, 10)}.csv`,
    `\uFEFF${csv}`,
    "text/csv;charset=utf-8"
  );
}

function printPage() {
  window.print();
}

function loadJsonFromStorage(key, fallback) {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (error) {
    console.warn(`Cannot load ${key} from localStorage`, error);
    return fallback;
  }
}

function saveJsonToStorage(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (error) {
    console.warn(`Cannot save ${key} to localStorage`, error);
    return false;
  }
}

function exportFullBackup(records, auditLogs) {
  const payload = {
    app: "HPC9 LM Health Assessment",
    version: 1,
    exportedAt: todayThai(),
    records,
    auditLogs,
  };
  downloadTextFile(`hpc9-lm-health-backup-${Date.now()}.json`, JSON.stringify(payload, null, 2), "application/json;charset=utf-8");
}

function validateBackupPayload(payload) {
  if (!payload || typeof payload !== "object" || !payload.records || typeof payload.records !== "object") return false;
  return Object.values(payload.records).every((record) => record && typeof record === "object" && typeof record.hn === "string" && Array.isArray(record.sessions));
}

function normalizeRecord(record) {
  const merged = { ...clone(blankRecord), ...clone(record) };

  merged.parq = Array.isArray(merged.parq)
    ? [...blankRecord.parq.map((x, i) => merged.parq[i] ?? x)]
    : clone(blankRecord.parq);

  merged.program = { ...clone(blankRecord.program), ...(record.program || {}) };
  merged.lmAssessments = [0, 1, 2, 3].map((i) => ({
    ...blankLmAssessment(i + 1),
    ...(record.lmAssessments?.[i] || {}),
    no: i + 1,
    answers: {
      ...blankLmAssessment(i + 1).answers,
      ...(record.lmAssessments?.[i]?.answers || {}),
    },
    scores: {
      ...blankLmAssessment(i + 1).scores,
      ...(record.lmAssessments?.[i]?.scores || {}),
    },
  }));

  const defaultExerciseLog = {
    ...clone(blankRecord.exerciseLog),
    split: record.exerciseLog?.split || merged.program?.type || "Full Body",
    daysPerWeek:
      record.exerciseLog?.daysPerWeek ||
      merged.program?.strengthFrequency ||
      "3",
  };

  merged.exerciseLog = {
    ...defaultExerciseLog,
    ...(record.exerciseLog || {}),
    days: {
      ...defaultExerciseLog.days,
      ...(record.exerciseLog?.days || {}),
    },
    history: Array.isArray(record.exerciseLog?.history)
      ? record.exerciseLog.history
      : [],
  };

  merged.sessions = [0, 1, 2, 3].map((i) => ({
    ...session(i + 1),
    ...(record.sessions?.[i] || {}),
    no: i + 1,
  }));

  return merged;
}

function normalizeRecords(records) {
  return Object.fromEntries(Object.entries(records || {}).map(([hn, record]) => [hn, normalizeRecord(record)]));
}

function fieldToneClass(tone) {
  if (tone === "fat") return "border-amber-200 bg-amber-50 focus:border-amber-500";
  if (tone === "muscle") return "border-rose-200 bg-rose-50 focus:border-rose-500";
  return "border-slate-200 bg-white focus:border-slate-700";
}

function panelToneClass(tone) {
  if (tone === "fat") return "border-amber-200 bg-amber-50";
  if (tone === "muscle") return "border-rose-200 bg-rose-50";
  if (tone === "good") return "border-emerald-200 bg-emerald-50";
  if (tone === "admin") return "border-sky-200 bg-sky-50";
  return "border-slate-200 bg-slate-50";
}

function metricTone(key) {
  if (["bodyFat", "fatMass", "visceral"].includes(key)) return "fat";
  if (key === "muscle") return "muscle";
  return "default";
}

function checkRange(label, value, min, max, issues) {
  if (value === "" || value === null || value === undefined) return;
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max) issues.push(`${label} ควรอยู่ประมาณ ${min}–${max}`);
}

function recordQuality(record) {
  const issues = [];
  if (!record.hn) issues.push("ยังไม่มี HN");
  if (!record.name) issues.push("ยังไม่มีชื่อ-สกุล");
  checkRange("อายุ", record.age, 1, 120, issues);
  checkRange("ส่วนสูง", record.height, 80, 230, issues);

  completedSessions(record).forEach((s) => {
    const prefix = `ครั้งที่ ${s.no}`;
    const sessionDate = formatDateOnlyThai(s.date || (sessionHasAnyData(s) ? todayThaiDateText() : ""));
    if (sessionHasAnyData(s) && !sessionDate) issues.push(`${prefix}: ยังไม่มีวันที่ประเมิน`);
    checkRange(`${prefix}: น้ำหนัก`, s.inbody.weight, 20, 250, issues);
    checkRange(`${prefix}: Body Fat %`, s.inbody.bodyFat, 3, 70, issues);
    checkRange(`${prefix}: Muscle Mass`, s.inbody.muscle, 5, 80, issues);
    checkRange(`${prefix}: Fat Mass`, s.inbody.fatMass, 1, 150, issues);
    checkRange(`${prefix}: Visceral Fat`, s.inbody.visceral, 1, 30, issues);
    checkRange(`${prefix}: พื้นที่ไขมันในช่องท้อง (Visceral Fat Area)`, s.inbody.waist, 1, 300, issues);
    checkRange(`${prefix}: Step Test HR`, s.fitness.step, 40, 220, issues);
    checkRange(`${prefix}: Handgrip`, s.fitness.grip, 1, 100, issues);
    checkRange(`${prefix}: Sit to Stand`, s.fitness.sitstand, 0, 100, issues);
    checkRange(`${prefix}: Sit and Reach`, s.fitness.sitreach, -40, 60, issues);
    checkRange(`${prefix}: TUG`, s.fitness.tug, 1, 60, issues);
  });

  const filled = completedSessions(record).length;
  const latest = completedSessions(record).slice(-1)[0];
  const missingLatest = [];
  if (latest) {
    if (!latest.inbody.weight || !latest.inbody.fatMass || !latest.inbody.muscle) missingLatest.push("InBody สำคัญยังไม่ครบ");
    if (metrics.fitness.some(([key]) => !latest.fitness[key])) missingLatest.push("Fitness Test ยังไม่ครบ");
  }
  return { issues, filled, missingLatest, complete: issues.length === 0 && missingLatest.length === 0 };
}

const metrics = {
  inbody: [
    ["weight", "น้ำหนัก", "kg", "lower"],
    ["bmi", "ดัชนีมวลกาย (BMI)", "kg/m²", "lower"],
    ["bodyFat", "เปอร์เซ็นต์ไขมัน (Body Fat %)", "%", "lower"],
    ["muscle", "มวลกล้ามเนื้อโครงร่าง (Skeletal Muscle Mass)", "kg", "higher"],
    ["fatMass", "มวลไขมัน (Fat Mass)", "kg", "lower"],
    ["visceral", "ไขมันในช่องท้อง (Visceral Fat)", "level", "lower"],
    ["waist", "พื้นที่ไขมันในช่องท้อง (Visceral Fat Area)", "cm²", "lower"],
  ],
  fitness: [
    ["step", "ก้าวขึ้นลง 3 นาที (Step Test)", "bpm", "lower"],
    ["grip", "แรงบีบมือ (Handgrip)", "kg", "higher"],
    ["sitstand", "ลุก-นั่ง 1 นาที (Sit to Stand)", "ครั้ง", "higher"],
    ["sitreach", "นั่งงอตัวแตะปลายเท้า (Sit and Reach)", "cm", "higher"],
    ["tug", "ลุกเดินไป-กลับ (Timed Up and Go)", "วินาที", "lower"],
  ],
};

const ohsItems = [
  "ลำตัวตั้งตรง",
  "เข่าอยู่แนวเดียวกับปลายเท้า",
  "สะโพกลดต่ำได้",
  "ส้นเท้าติดพื้น",
  "แขนอยู่เหนือศีรษะ",
  "ควบคุมสมดุลได้",
];

const parqQuestions = [
  "มีโรคหัวใจหรือโรคประจำตัวที่มีผลต่อการออกกำลังกาย",
  "เจ็บแน่นหน้าอกขณะออกแรงหรือออกกำลังกาย",
  "เวียนศีรษะ หน้ามืด เป็นลม หรือเสียการทรงตัว",
  "มีปัญหากระดูก ข้อ หรือกล้ามเนื้อ",
  "ใช้ยารักษาโรคหัวใจ ความดัน หรือโรคเรื้อรัง",
  "มีอาการเจ็บป่วยหรือข้อจำกัดที่ไม่ควรเริ่มออกกำลังกาย",
  "ตั้งครรภ์ เพิ่งคลอด หรือยังไม่ได้รับคำแนะนำ",
];

const focusOptions = [
  "Shoulder Mobility",
  "Thoracic Mobility",
  "Core Stability",
  "Hip Mobility",
  "Glute Control",
  "Ankle Mobility",
  "Balance Control",
  "Knee Control",
];

const exerciseOptions = {
  push: ["Push-up", "Chest Press", "Shoulder Press", "Lateral Raise", "Triceps Pushdown"],
  pull: ["Lat Pulldown", "Seated Row", "Dumbbell Row", "Face Pull", "Biceps Curl"],
  legs: ["Goblet Squat", "Leg Press", "Lunge", "Leg Curl", "Calf Raise"],
  hip: ["Romanian Deadlift", "Deadlift", "Hip Thrust", "Glute Bridge", "Step-up"],
  core: ["Plank", "Side Plank", "Dead Bug", "Bird Dog", "Leg Raise"],
  cardio: ["Walking", "Cycling", "Rowing", "HIIT"],
};

function groupsForExerciseDay(day) {
  if (day === "Full Body") return ["legs", "hip", "push", "pull", "core", "cardio"];
  if (day === "Upper Day") return ["push", "pull", "cardio"];
  if (day === "Lower Day") return ["legs", "hip", "core", "cardio"];
  if (day === "Push Day") return ["push", "cardio"];
  if (day === "Pull Day") return ["pull", "cardio"];
  if (day === "Legs Day") return ["legs", "hip", "core", "cardio"];
  return ["legs", "hip", "push", "pull", "core", "cardio"];
}

function dayKeyFromLabel(day) {
  if (day === "Full Body") return "fullBody";
  if (day === "Upper Day") return "upper";
  if (day === "Lower Day") return "lower";
  if (day === "Push Day") return "push";
  if (day === "Pull Day") return "pull";
  if (day === "Legs Day") return "legs";
  return "fullBody";
}

function toggleExercise(list = [], exercise) {
  return list.includes(exercise)
    ? list.filter((x) => x !== exercise)
    : [...list, exercise];
}

function sortExercisesByDay(day, list = []) {
  const dayOrder = {
    "Full Body": [
      "Goblet Squat", "Leg Press", "Lunge", "Romanian Deadlift", "Deadlift",
      "Hip Thrust", "Glute Bridge", "Step-up", "Chest Press", "Push-up",
      "Shoulder Press", "Lat Pulldown", "Seated Row", "Dumbbell Row",
      "Plank", "Dead Bug", "Walking", "Cycling"
    ],
    "Upper Day": [
      "Chest Press", "Push-up", "Shoulder Press", "Lat Pulldown",
      "Seated Row", "Dumbbell Row", "Lateral Raise", "Face Pull",
      "Biceps Curl", "Triceps Pushdown"
    ],
    "Lower Day": [
      "Goblet Squat", "Leg Press", "Lunge", "Romanian Deadlift",
      "Deadlift", "Hip Thrust", "Glute Bridge", "Leg Curl",
      "Calf Raise", "Plank", "Side Plank"
    ],
    "Push Day": [
      "Chest Press", "Shoulder Press", "Push-up",
      "Lateral Raise", "Triceps Pushdown"
    ],
    "Pull Day": [
      "Lat Pulldown", "Seated Row", "Dumbbell Row",
      "Face Pull", "Biceps Curl"
    ],
    "Legs Day": [
      "Goblet Squat", "Leg Press", "Lunge",
      "Romanian Deadlift", "Deadlift", "Hip Thrust",
      "Glute Bridge", "Leg Curl", "Calf Raise",
      "Plank", "Side Plank"
    ],
  };

  const order = dayOrder[day] || dayOrder["Full Body"];

  return [...list].sort((a, b) => {
    const indexA = order.indexOf(a);
    const indexB = order.indexOf(b);

    return (indexA === -1 ? 999 : indexA) - (indexB === -1 ? 999 : indexB);
  });
}

function exerciseMuscleText(exercise) {
  const muscles = {
    "Goblet Squat": "ต้นขา / ก้น / แกนกลาง",
    "Leg Press": "ต้นขา / ก้น",
    "Lunge": "ต้นขา / ก้น / การทรงตัว",
    "Leg Curl": "หลังต้นขา",
    "Calf Raise": "น่อง",

    "Romanian Deadlift": "หลังต้นขา / ก้น / หลังล่าง",
    "Deadlift": "หลังล่าง / ก้น / หลังขา",
    "Hip Thrust": "ก้น / หลังต้นขา",
    "Glute Bridge": "ก้น / หลังต้นขา",
    "Step-up": "ต้นขา / ก้น / การทรงตัว",

    "Push-up": "อก / ไหล่ / หลังแขน",
    "Chest Press": "อก / ไหล่ / หลังแขน",
    "Shoulder Press": "ไหล่ / หลังแขน",
    "Lateral Raise": "ไหล่ด้านข้าง",
    "Triceps Pushdown": "หลังแขน",

    "Lat Pulldown": "ปีก / หลังบน / หน้าแขน",
    "Seated Row": "หลังกลาง / ปีก / หน้าแขน",
    "Dumbbell Row": "หลังกลาง / ปีก / หน้าแขน",
    "Face Pull": "หลังไหล่ / หลังบน",
    "Biceps Curl": "หน้าแขน",

    "Plank": "แกนกลาง",
    "Side Plank": "แกนกลางด้านข้าง",
    "Dead Bug": "แกนกลาง / ควบคุมลำตัว",
    "Bird Dog": "แกนกลาง / หลังล่าง",
    "Leg Raise": "หน้าท้องส่วนล่าง",

    "Walking": "หัวใจและปอด / ขา",
    "Cycling": "หัวใจและปอด / ต้นขา",
    "Rowing": "หัวใจและปอด / หลัง / ขา",
    "HIIT": "หัวใจและปอด / เผาผลาญพลังงาน",
  };

  return muscles[exercise] || "";
}

function exercisePlanDescription(split, daysPerWeek, daysMap = {}) {
  const days = Number(daysPerWeek) || 0;

  const labels = {
    fullBody: "Full Body",
    upper: "Upper Day",
    lower: "Lower Day",
    push: "Push Day",
    pull: "Pull Day",
    legs: "Legs Day",
  };

  const order = ["fullBody", "upper", "lower", "push", "pull", "legs"];

  function formatCounts(counts) {
    return order
      .filter((key) => counts[key] > 0)
      .map((key) => `${labels[key]} ${counts[key]} วัน`)
      .join(" + ");
  }

  if (split === "Full Body") {
    return `Full Body ${days || "-"} วัน`;
  }

  if (split === "Upper / Lower") {
    const upper = Math.ceil(days / 2);
    const lower = Math.floor(days / 2);

    return `Upper Day ${upper || "-"} วัน + Lower Day ${lower || "-"} วัน`;
  }

  if (split === "PPL") {
    if (days < 3) {
      return `PPL ควรเริ่มที่ 3 วัน/สัปดาห์ขึ้นไป`;
    }

    const counts = {
      push: 1,
      pull: 1,
      legs: 1,
    };

    let remain = days - 3;
    const pplOrder = ["push", "pull", "legs"];
    let i = 0;

    while (remain > 0) {
      const key = pplOrder[i % pplOrder.length];
      counts[key] += 1;
      remain -= 1;
      i += 1;
    }

    return formatCounts(counts);
  }

  if (split === "Hybrid / Mixed") {
    const selected = Object.entries(daysMap || {})
      .filter(([, list]) => Array.isArray(list) && list.length > 0)
      .map(([key]) => key)
      .sort((a, b) => order.indexOf(a) - order.indexOf(b));

    if (!selected.length) {
      return `ผสมหลายรูปแบบ รวม ${days || "-"} วัน/สัปดาห์`;
    }

    if (days < selected.length) {
      return `เลือก ${selected.length} รูปแบบ แต่กำหนด ${days} วัน/สัปดาห์`;
    }

    const counts = {};
    selected.forEach((key) => {
      counts[key] = 1;
    });

    let remain = days - selected.length;

    if (selected.includes("fullBody")) {
      counts.fullBody += remain;
    } else {
      let i = 0;
      while (remain > 0) {
        const key = selected[i % selected.length];
        counts[key] += 1;
        remain -= 1;
        i += 1;
      }
    }

    return formatCounts(counts);
  }

  return "";
}

function exercisePlanWarning(split, daysPerWeek, daysMap = {}) {
  const days = Number(daysPerWeek) || 0;

  if (split === "PPL" && days < 3) {
    return "PPL ควรมีอย่างน้อย 3 วัน/สัปดาห์ เพื่อให้ครบ Push / Pull / Legs";
  }

  if (split === "Upper / Lower" && days < 2) {
    return "Upper / Lower ควรมีอย่างน้อย 2 วัน/สัปดาห์";
  }

  if (split === "Hybrid / Mixed") {
    const selectedCount = Object.values(daysMap || {}).filter(
      (list) => Array.isArray(list) && list.length > 0
    ).length;

    if (selectedCount > 0 && days < selectedCount) {
      return `จำนวนวัน/สัปดาห์น้อยกว่ารูปแบบวันที่เลือก: เลือก ${selectedCount} รูปแบบ แต่กำหนด ${days} วัน`;
    }
  }

  return "";
}

function dayPillClass(dayKey) {
  const styles = {
    fullBody: "border-sky-200 bg-sky-50 text-sky-800",
    upper: "border-violet-200 bg-violet-50 text-violet-800",
    lower: "border-emerald-200 bg-emerald-50 text-emerald-800",
    push: "border-orange-200 bg-orange-50 text-orange-800",
    pull: "border-blue-200 bg-blue-50 text-blue-800",
    legs: "border-lime-200 bg-lime-50 text-lime-800",
  };

  return styles[dayKey] || "border-slate-200 bg-slate-50 text-slate-700";
}

function exercisePlanPills(description = "") {
  const labels = [
    "Full Body",
    "Upper Day",
    "Lower Day",
    "Push Day",
    "Pull Day",
    "Legs Day",
  ];

  const dayOrder = ["fullBody", "upper", "lower", "push", "pull", "legs"];

  return String(description)
    .split("+")
    .map((text) => text.trim())
    .filter(Boolean)
    .map((text) => {
      const matchedLabel = labels.find((label) => text.includes(label));

      const dayKey = matchedLabel
        ? dayKeyFromLabel(matchedLabel)
        : "fullBody";

      return {
        text,
        dayKey,
      };
    })
    .sort(
      (a, b) =>
        dayOrder.indexOf(a.dayKey) - dayOrder.indexOf(b.dayKey)
    );
}

function session(no, v = {}) {
  return {
    no,
    date: v.date || "",
    inbody: {
      weight: v.weight || "",
      bmi: v.bmi || "",
      bodyFat: v.bodyFat || "",
      muscle: v.muscle || "",
      fatMass: v.fatMass || "",
      visceral: v.visceral || "",
      waist: v.waist || "",
      bmr: v.bmr || "",
    },
    fitness: {
      step: v.step || "",
      grip: v.grip || "",
      sitstand: v.sitstand || "",
      sitreach: v.sitreach || "",
      tug: v.tug || "",
    },
    ohs: v.ohs || ["ปกติ", "ปกติ", "ปกติ", "ปกติ", "ปกติ", "ปกติ"],
    note: v.note || "",
    attachment: v.attachment || "",
  };
}

const blankRecord = {
  hn: "",
  name: "",
  sex: "ชาย",
  age: "",
  height: "",
  goal: "",
  disease: "",
  medication: "",
  injury: "",
  parq: [false, false, false, false, false, false, false],
  program: {
    type: "",
    cardioType: "",
    cardioFrequency: "",
    cardioDuration: "",
    strengthFrequency: "",
    strengthDose: "",
    intensity: "",
    rpe: "",
    talk: "",
    focus: "",
    precaution: "",
    followUp: "",
    note: "",
  },
  exerciseLog: {
    split: "",
    daysPerWeek: "",
    updateReason: "",
    description: "",
    updatedFrom: "",
    updatedTo: "",
    updatedBy: "",
    updatedAt: "",
    days: {
      fullBody: [],
      upper: [],
      lower: [],
      push: [],
      pull: [],
      legs: [],
    },
    history: [],
  },
    lmAssessments: [
    blankLmAssessment(1),
    blankLmAssessment(2),
    blankLmAssessment(3),
    blankLmAssessment(4),
  ],
  
  sessions: [session(1), session(2), session(3), session(4)],
};

const initialRecords = {
  "68000123": {
    ...blankRecord,
    hn: "68000123",
    name: "นายตัวอย่าง สุขภาพดี",
    age: "26",
    height: "170",
    goal: "ลดไขมัน / เพิ่มกล้ามเนื้อ",
    disease: "ไม่มี",
    medication: "ไม่มี",
    injury: "ปวดหลังส่วนล่างเล็กน้อย",
    program: {
      type: "Upper/Lower",
      cardioType: "เดินเร็ว / Zone 2",
      cardioFrequency: "2–3",
      cardioDuration: "30–45",
      strengthFrequency: "4",
      strengthDose: "เพิ่มกล้ามเนื้อ: 3–4 เซต × 8–12 ครั้ง",
      intensity: "Individualized",
      rpe: "4–6",
      talk: "พูดเป็นประโยค",
      focus: "Core Stability / Hip Mobility / Ankle Mobility / Glute Control",
      precaution: "หลีกเลี่ยงท่าที่กระตุ้นปวดหลังส่วนล่าง และไม่กลั้นหายใจขณะออกแรง",
      followUp: "ติดตามครั้งถัดไปตามรอบประเมิน",
      note: "เวท 4 วัน/สัปดาห์ + เดิน Zone 2 2–3 วัน/สัปดาห์ เน้นแกนกลาง สะโพก และข้อเท้า",
    },
    sessions: [
      session(1, { date: "2569-04-01", weight: "63.0", bmi: "21.8", bodyFat: "22.0", muscle: "29.5", fatMass: "13.9", visceral: "6", waist: "82", bmr: "1450", step: "132", grip: "34", sitstand: "32", sitreach: "7", tug: "8.9", ohs: ["ต้องระวัง", "ควรปรับแก้", "ต้องระวัง", "ควรปรับแก้", "ปกติ", "ต้องระวัง"] }),
      session(2, { date: "2569-04-15", weight: "62.5", bmi: "21.6", bodyFat: "20.8", muscle: "29.9", fatMass: "13.0", visceral: "6", waist: "80", bmr: "1470", step: "128", grip: "35", sitstand: "34", sitreach: "8", tug: "8.4", ohs: ["ต้องระวัง", "ต้องระวัง", "ปกติ", "ต้องระวัง", "ปกติ", "ปกติ"] }),
      session(3, { date: "2569-04-30", weight: "62.2", bmi: "21.5", bodyFat: "19.8", muscle: "30.2", fatMass: "12.3", visceral: "5", waist: "79", bmr: "1485", step: "126", grip: "37", sitstand: "36", sitreach: "10", tug: "8.0", ohs: ["ปกติ", "ต้องระวัง", "ปกติ", "ต้องระวัง", "ปกติ", "ปกติ"] }),
      session(4, { date: "2569-05-15", weight: "61.8", bmi: "21.4", bodyFat: "18.9", muscle: "30.5", fatMass: "11.7", visceral: "5", waist: "77", bmr: "1500", step: "123", grip: "39", sitstand: "39", sitreach: "12", tug: "7.5", ohs: ["ปกติ", "ปกติ", "ปกติ", "ปกติ", "ปกติ", "ปกติ"] }),
    ],
  },
  "68000456": {
    ...blankRecord,
    hn: "68000456",
    name: "นางสาวตัวอย่าง ต้องติดตาม",
    sex: "หญิง",
    age: "31",
    height: "160",
    goal: "ลดไขมัน / ควบคุมน้ำหนัก",
    disease: "ความดันโลหิตสูง",
    medication: "ยาความดัน",
    program: {
      type: "Home Program",
      cardioType: "เดินสะสม",
      cardioFrequency: "5",
      cardioDuration: "30",
      strengthFrequency: "2–3",
      strengthDose: "เริ่มต้น/ผู้สูงอายุ: 1–2 เซต × 10–15 ครั้ง",
      intensity: "Moderate",
      rpe: "4–6",
      talk: "พูดเป็นประโยค",
      focus: "Knee Control / Core Stability / Balance Control",
      precaution: "ติดตามอาการเหนื่อยผิดปกติ เวียนศีรษะ และค่าความดัน",
      followUp: "ติดตามภายใน 2–4 สัปดาห์",
      note: "เน้นเดินสะสม 7,000 ก้าว/วัน และฝึกแรงต้านเบื้องต้น",
    },
    parq: [false, false, false, false, true, false, false],
    sessions: [
      session(1, { date: "2569-04-05", weight: "70.0", bmi: "27.3", bodyFat: "34.0", muscle: "23.0", fatMass: "23.8", visceral: "9", waist: "91", step: "138", grip: "26", sitstand: "25", sitreach: "5", tug: "9.4", ohs: ["ต้องระวัง", "ต้องระวัง", "ต้องระวัง", "ควรปรับแก้", "ปกติ", "ต้องระวัง"] }),
      session(2, { date: "2569-04-25", weight: "71.2", bmi: "27.8", bodyFat: "35.5", muscle: "22.5", fatMass: "25.3", visceral: "10", waist: "94", step: "144", grip: "24", sitstand: "23", sitreach: "4", tug: "10.1", ohs: ["ต้องระวัง", "ควรปรับแก้", "ต้องระวัง", "ควรปรับแก้", "ต้องระวัง", "ต้องระวัง"] }),
      session(3),
      session(4),
    ],
  },
  "68000789": {
    ...blankRecord,
    hn: "68000789",
    name: "นายตัวอย่าง รอติดตาม",
    age: "45",
    height: "172",
    goal: "สุขภาพทั่วไป",
    sessions: [
      session(1, { date: "2569-04-10", weight: "68.0", bmi: "23.0", bodyFat: "25.0", muscle: "28.0", waist: "86", step: "135", grip: "32", sitstand: "28", sitreach: "6", tug: "8.8" }),
      session(2),
      session(3),
      session(4),
    ],
  },
  "68000999": {
    ...blankRecord,
    hn: "68000999",
    name: "นางสาวจำลอง พัฒนาการดี",
    sex: "หญิง",
    age: "38",
    height: "158",
    goal: "ลดไขมัน / เพิ่มความแข็งแรง",
    disease: "ไม่มี",
    medication: "ไม่มี",
    injury: "ปวดเข่าเล็กน้อยเวลาเดินขึ้นบันได",
    program: {
      type: "Full Body",
      cardioType: "เดินเร็ว",
      cardioFrequency: "4",
      cardioDuration: "30",
      strengthFrequency: "3",
      strengthDose: "สุขภาพทั่วไป: 2–3 เซต × 10–15 ครั้ง",
      intensity: "Moderate",
      rpe: "4–6",
      talk: "พูดเป็นประโยค",
      focus: "Knee Control / Core Stability / Glute Control",
      precaution: "หลีกเลี่ยงแรงกระแทกสูง หากปวดเข่าให้ลดระยะก้าวและลดความเร็ว",
      followUp: "ติดตามภายใน 4 สัปดาห์",
      note: "เน้นเดินเร็วและฝึกกล้ามเนื้อขาแบบควบคุมแนวเข่า",
    },
    parq: [false, false, false, true, false, false, false],
    sessions: [
      session(1, { date: "2569-05-02", weight: "64.0", bmi: "25.6", bodyFat: "31.0", muscle: "22.8", fatMass: "19.8", visceral: "8", waist: "84", step: "130", grip: "27", sitstand: "27", sitreach: "4", tug: "9.2", ohs: ["ต้องระวัง", "ควรปรับแก้", "ต้องระวัง", "ปกติ", "ปกติ", "ต้องระวัง"] }),
      session(2, { date: "2569-05-16", weight: "63.4", bmi: "25.4", bodyFat: "30.1", muscle: "23.1", fatMass: "19.1", visceral: "8", waist: "82", step: "126", grip: "28", sitstand: "30", sitreach: "6", tug: "8.8", ohs: ["ต้องระวัง", "ต้องระวัง", "ปกติ", "ปกติ", "ปกติ", "ปกติ"] }),
      session(3, { date: "2569-05-30", weight: "62.8", bmi: "25.2", bodyFat: "29.2", muscle: "23.6", fatMass: "18.3", visceral: "7", waist: "80", step: "122", grip: "30", sitstand: "32", sitreach: "8", tug: "8.3", ohs: ["ปกติ", "ต้องระวัง", "ปกติ", "ปกติ", "ปกติ", "ปกติ"] }),
      session(4),
    ],
  },
};

function blankLmAssessment(no) {
  return {
    no,
    date: "",
    answers: {},
    scores: {
      nutrition: null,
      physical: null,
      sleep: null,
      stress: null,
      substances: null,
      relationship: null,
    },
    total: null,
    updatedAt: "",
    updatedBy: "",
  };
}

function valueOf(s, key) {
  if (!s) return null;

  // OHS: นับจำนวนข้อที่เป็น "ปกติ" จาก array ของ OHS
  // เช่น ปกติ 5 ข้อ = 5/6
  if (key === "ohs") {
    if (!Array.isArray(s.ohs)) return null;
    return s.ohs.filter((x) => x === "ปกติ").length;
  }

  const raw = s.inbody?.[key] ?? s.fitness?.[key];

  // ค่าว่างต้องเป็น null ไม่ใช่ 0
  // เพื่อไม่ให้กราฟเข้าใจผิดว่ายังไม่ได้กรอก = 0
  if (raw === "" || raw === null || raw === undefined) return null;

  const n = Number(raw);

  return Number.isFinite(n) ? n : null;
}

function closeYAxisDomain(values) {
  const clean = values.filter((v) => Number.isFinite(v));
  if (clean.length === 0) return ["auto", "auto"];
  const min = Math.min(...clean);
  const max = Math.max(...clean);
  if (min === max) {
    const pad = Math.max(Math.abs(max) * 0.05, 1);
    return [Number((min - pad).toFixed(1)), Number((max + pad).toFixed(1))];
  }
  const range = max - min;
  const pad = Math.max(range * 0.18, 0.2);
  return [Number((min - pad).toFixed(1)), Number((max + pad).toFixed(1))];
}

function completedSessions(record) {
  return (record.sessions || []).filter((s) => sessionHasAnyData(s));
}

function latestCompletedSession(record) {
  const sessions = completedSessions(record);
  return sessions.length ? sessions[sessions.length - 1] : null;
}

function deltaFromSessions(sessions, item) {
  const [key, , unit, better] = item;
  const usableSessions = (sessions || []).filter((s) => {
    const v = valueOf(s, key);
    return v !== null && v !== undefined && Number.isFinite(Number(v));
  });

  if (usableSessions.length < 2) return { text: "ข้อมูลไม่พอ", tone: "gray", raw: 0, valid: false };

  const first = usableSessions[0];
  const last = usableSessions[usableSessions.length - 1];
  const a = valueOf(first, key);
  const b = valueOf(last, key);

  const d = b - a;
  const good = better === "higher" ? d > 0 : d < 0;
  const sign = d > 0 ? "+" : "";

  return {
    text: `${sign}${Number.isInteger(d) ? d : d.toFixed(1)} ${unit}`,
    tone: good ? "good" : d === 0 ? "gray" : "bad",
    raw: d,
    valid: true,
  };
}

function delta(record, item) {
  const sessions = completedSessions(record);
  return deltaFromSessions(sessions, item);
}

function bmi(weight, height) {
  const w = num(weight);
  const h = num(height) / 100;
  return w && h ? (w / (h * h)).toFixed(1) : "";
}

function hrTargets(age) {
  const max = 220 - num(age);
  if (!max || max <= 0) return null;
  const range = (low, high) => `${Math.round(max * low)}–${Math.round(max * high)} bpm`;
  return {
    max,
    light: range(0.5, 0.63),
    moderate: range(0.64, 0.76),
    vigorous: range(0.77, 0.93),
  };
}

function targetHrText(age, intensity) {
  const hr = hrTargets(age);
  if (!hr) return "กรอกอายุก่อน";
  if (intensity === "Light") return `${hr.light} (50–63%)`;
  if (intensity === "Vigorous") return `${hr.vigorous} (77–93%)`;
  if (intensity === "Individualized") return `ปรับรายบุคคล • อ้างอิง Moderate ${hr.moderate}`;
  return `${hr.moderate} (64–76%)`;
}

function ageGroup(age) {
  const a = num(age);
  if (a <= 25) return "18-25";
  if (a <= 35) return "26-35";
  if (a <= 45) return "36-45";
  if (a <= 55) return "46-55";
  if (a <= 65) return "56-65";
  return "66+";
}

function adminAgeGroup(age) {
  const a = num(age);
  if (!a) return "unknown";
  if (a < 20) return "under20";
  if (a <= 29) return "20-29";
  if (a <= 39) return "30-39";
  if (a <= 49) return "40-49";
  if (a <= 59) return "50-59";
  if (a <= 69) return "60-69";
  if (a <= 79) return "70-79";
  return "80+";
}

function sexKey(sex) {
  return String(sex || "").includes("หญิง") ? "female" : "male";
}

function resultTone(label) {
  if (label === "ดีมาก") return "good";
  if (label === "ต่ำกว่าเกณฑ์") return "bad";
  return "gray";
}

function makeInterpret(label, detail = "") {
  return { label, tone: resultTone(label), detail };
}

const stepNorms = {
  male: {
    "18-25": [[77, "ดีมาก"], [120, "ตามเกณฑ์"], [999, "ต่ำกว่าเกณฑ์"]],
    "26-35": [[77, "ดีมาก"], [121, "ตามเกณฑ์"], [999, "ต่ำกว่าเกณฑ์"]],
    "36-45": [[77, "ดีมาก"], [122, "ตามเกณฑ์"], [999, "ต่ำกว่าเกณฑ์"]],
    "46-55": [[84, "ดีมาก"], [125, "ตามเกณฑ์"], [999, "ต่ำกว่าเกณฑ์"]],
    "56-65": [[81, "ดีมาก"], [128, "ตามเกณฑ์"], [999, "ต่ำกว่าเกณฑ์"]],
    "66+": [[83, "ดีมาก"], [128, "ตามเกณฑ์"], [999, "ต่ำกว่าเกณฑ์"]],
  },
  female: {
    "18-25": [[82, "ดีมาก"], [121, "ตามเกณฑ์"], [999, "ต่ำกว่าเกณฑ์"]],
    "26-35": [[82, "ดีมาก"], [124, "ตามเกณฑ์"], [999, "ต่ำกว่าเกณฑ์"]],
    "36-45": [[86, "ดีมาก"], [127, "ตามเกณฑ์"], [999, "ต่ำกว่าเกณฑ์"]],
    "46-55": [[92, "ดีมาก"], [129, "ตามเกณฑ์"], [999, "ต่ำกว่าเกณฑ์"]],
    "56-65": [[94, "ดีมาก"], [130, "ตามเกณฑ์"], [999, "ต่ำกว่าเกณฑ์"]],
    "66+": [[93, "ดีมาก"], [134, "ตามเกณฑ์"], [999, "ต่ำกว่าเกณฑ์"]],
  },
};

function expectedGrip(age, sex) {
  const a = num(age);
  const female = sexKey(sex) === "female";
  if (a < 30) return female ? 29 : 47;
  if (a < 40) return female ? 30 : 49;
  if (a < 50) return female ? 28 : 46;
  if (a < 60) return female ? 25 : 41;
  if (a < 70) return female ? 22 : 35;
  return female ? 19 : 30;
}

function expectedSitStand(age, sex, bmiValue) {
  const female = sexKey(sex) === "female" ? 1 : 0;
  const useBmi = num(bmiValue) || 23;
  return Math.max(8, 61.53 - (0.34 * num(age)) - (3.57 * female) - (0.33 * useBmi));
}

function sitReachThreshold(age, sex) {
  const a = num(age);
  const female = sexKey(sex) === "female";
  if (a <= 35) return female ? { good: 12, standard: 2 } : { good: 10, standard: 0 };
  if (a <= 55) return female ? { good: 10, standard: 0 } : { good: 8, standard: -2 };
  return female ? { good: 7, standard: -3 } : { good: 5, standard: -5 };
}

function tugThreshold(age) {
  // TUG: เวลายิ่งน้อยยิ่งดี
  // ใช้เกณฑ์คัดกรองแบบใช้งานง่ายในคลินิก: ≤10 วินาที = ดีมาก, >10–12 วินาที = ตามเกณฑ์/เฝ้าระวัง, >12 วินาที = ต่ำกว่าเกณฑ์
  return { good: 10, standard: 12 };
}

function classifyHigher(value, expected, detail) {
  const v = num(value);
  if (!v) return makeInterpret("รอข้อมูล", "");
  if (v >= expected * 1.1) return makeInterpret("ดีมาก", detail);
  if (v >= expected * 0.85) return makeInterpret("ตามเกณฑ์", detail);
  return makeInterpret("ต่ำกว่าเกณฑ์", detail);
}

function classifyFitness(record, key, value, sessionData) {
  const age = record.age;
  const sex = record.sex;
  const v = num(value);
  if (!v || !num(age) || !sex) return makeInterpret("รอข้อมูล", "กรอกอายุ/เพศและค่าทดสอบให้ครบ");

  if (key === "step") {
    const group = ageGroup(age);
    const rules = stepNorms[sexKey(sex)][group];
    const found = rules.find(([max]) => v <= max);
    return makeInterpret(found?.[1] || "ต่ำกว่าเกณฑ์", `YMCA 3-min Step Test • ${group}`);
  }

  if (key === "grip") {
    const expected = expectedGrip(age, sex);
    return classifyHigher(v, expected, `อ้างอิงค่าเฉลี่ยแรงบีบมือตามอายุ/เพศ ≈ ${expected} kg`);
  }

  if (key === "sitstand") {
    const expected = expectedSitStand(age, sex, sessionData?.inbody?.bmi);
    return classifyHigher(v, expected, `คาดการณ์ตามอายุ/เพศ/BMI ≈ ${expected.toFixed(0)} ครั้ง`);
  }

  if (key === "sitreach") {
    const t = sitReachThreshold(age, sex);
    if (v >= t.good) return makeInterpret("ดีมาก", `สมมติ 0 cm = แตะปลายเท้า`);
    if (v >= t.standard) return makeInterpret("ตามเกณฑ์", `สมมติ 0 cm = แตะปลายเท้า`);
    return makeInterpret("ต่ำกว่าเกณฑ์", `สมมติ 0 cm = แตะปลายเท้า`);
  }

  if (key === "tug") {
    const t = tugThreshold(age);
    if (v <= t.good) return makeInterpret("ดีมาก", `TUG ≤10 วินาที`);
    if (v <= t.standard) return makeInterpret("ตามเกณฑ์", `TUG >10–12 วินาที`);
    return makeInterpret("ต่ำกว่าเกณฑ์", `TUG >12 วินาที ควรติดตามความเสี่ยงการล้ม/การทรงตัว`);
  }

  return makeInterpret("รอข้อมูล", "");
}

function ohsSummary(s) {
  const normal = s.ohs.filter((x) => x === "ปกติ").length;
  if (normal >= 5) return { text: "Normal", normal, tone: "good" };
  if (normal >= 3) return { text: "Caution", normal, tone: "warn" };
  return { text: "ควรปรับแก้", normal, tone: "bad" };
}

function setDeep(obj, path, val) {
  const next = clone(obj);
  let cur = next;

  path.slice(0, -1).forEach((p) => {
    if (!cur[p] || typeof cur[p] !== "object") {
      cur[p] = {};
    }
    cur = cur[p];
  });

  cur[path[path.length - 1]] = val;
  return next;
}

function focusStringToArray(value) {
  const text = String(value || "");
  return focusOptions.filter((option) => text.split(" / ").includes(option));
}

function toggleFocusValue(currentValue, option) {
  const selected = focusStringToArray(currentValue);
  const next = selected.includes(option)
    ? selected.filter((x) => x !== option)
    : [...selected, option];
  return next.join(" / ");
}

function runSelfTests() {
  const r = initialRecords["68000123"];
  const poor = initialRecords["68000456"];
  const single = initialRecords["68000789"];
  const dWeight = delta(r, metrics.inbody[0]);
  const dMuscle = delta(r, metrics.inbody[3]);
  const poorFat = delta(poor, metrics.inbody[2]);
  const singleWeight = delta(single, metrics.inbody[0]);
  const o4 = ohsSummary(r.sessions[3]);
  console.assert(dWeight.text === "-1.2 kg" && dWeight.tone === "good", "delta weight should compare first to latest filled session");
  console.assert(dMuscle.text === "+1.0 kg" && dMuscle.tone === "good", "delta muscle should compare first to latest filled session");
  console.assert(poorFat.tone === "bad", "worsened body fat should be red/bad");
  console.assert(singleWeight.valid === false, "single-session record should not be compared in admin summary");
  console.assert(o4.normal === 6 && o4.text === "Normal", "OHS session 4 should be Normal 6/6");
  console.assert(bmi("63", "170") === "21.8", "BMI calculation should be correct");
  console.assert(hrTargets("26").max === 194, "HRmax should be 220-age");
  console.assert(targetHrText("26", "Moderate").includes("124–147"), "Moderate target HR should use 64–76% HRmax");
  console.assert(classifyFitness(r, "step", "123", r.sessions[3]).label === "ต่ำกว่าเกณฑ์", "Step test interpretation should use YMCA age/sex rules");
  console.assert(classifyFitness(r, "sitstand", "39", r.sessions[3]).label !== "รอข้อมูล", "Sit-to-stand interpretation should return a valid label");
  const domain = closeYAxisDomain([63, 62.5, 62.2, 61.8]);
  console.assert(domain[0] > 50 && domain[1] < 70, "chart domain should zoom close to the actual data range");
}
// runSelfTests(); // ใช้เฉพาะตอนพัฒนาเว็บจริง ควรย้ายไป test file แยก

function Pill({ children, tone = "gray" }) {
  const cls = {
    gray: "border-slate-200 bg-slate-50 text-slate-700",
    dark: "border-slate-900 bg-slate-900 text-white",
    good: "border-emerald-200 bg-emerald-50 text-emerald-700",
    warn: "border-amber-200 bg-amber-50 text-amber-700",
    bad: "border-rose-200 bg-rose-50 text-rose-700",
  }[tone] || "border-slate-200 bg-slate-50 text-slate-700";

  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-bold leading-none ${cls}`}>
      {children}
    </span>
  );
}

function Card({ title, icon: Icon, right, children }) {
  return (
    <section className="rounded-2xl border border-slate-300 bg-white p-5 shadow-md">
      <div className="mb-4 flex items-center justify-between gap-3 border-b border-slate-100 pb-3">
        <div className="flex items-center gap-2">
          {Icon && <Icon className="h-6 w-6 text-slate-500" />}
          <h2 className="text-xl font-bold tracking-tight text-slate-900">{title}</h2>
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}

function Field({ label, value, onChange, type = "text", tone = "default" }) {
  return (
    <label className="flex h-full flex-col">
      <span className="mb-1 flex min-h-[2.6rem] items-end text-sm font-semibold text-slate-500">{label}</span>
      <input
        value={value || ""}
        type={type}
        onChange={(e) => onChange(e.target.value)}
        className={`h-12 w-full rounded-xl border px-3 py-3 text-base outline-none ${fieldToneClass(tone)}`}
      />
    </label>
  );
}

function Select({ label, value, onChange, options }) {
  return (
    <label className="flex h-full flex-col">
      <span className="mb-1 flex min-h-[2.6rem] items-end text-sm font-semibold text-slate-500">{label}</span>
      <select value={value || ""} onChange={(e) => onChange(e.target.value)} className="h-12 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-base outline-none focus:border-slate-700">
        {options.map((opt) => {
          const item = typeof opt === "string" ? { value: opt, label: opt } : opt;
          return <option key={item.value} value={item.value}>{item.label}</option>;
        })}
      </select>
    </label>
  );
}

function Header({ mode, setMode, isAdmin, adminUser, onLogout }) {
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50"><HeartIcon className="h-6 w-6 text-slate-700" /></div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">คลินิกเวชศาสตร์วิถีชีวิต ศูนย์อนามัยที่ 9 นครราชสีมา</h1>
            <p className="text-sm text-slate-500">ระบบติดตามสุขภาพและสมรรถภาพรายบุคคล • 4 ครั้ง • HN Login</p>
          </div>
        </div>
        {isAdmin && (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-1 text-base font-semibold">
            <button onClick={() => setMode("client")} className={`rounded-lg px-4 py-3 ${mode === "client" ? "bg-white shadow-sm" : "text-slate-500"}`}>ดูผลด้วย HN</button>
            <button onClick={() => setMode("admin")} className={`rounded-lg px-4 py-3 ${mode === "admin" ? "bg-white shadow-sm" : "text-slate-500"}`}>สรุปแอดมิน</button>
            <button onClick={() => setMode("staff")} className={`rounded-lg px-4 py-3 ${mode === "staff" ? "bg-white shadow-sm" : "text-slate-500"}`}>บันทึกข้อมูล</button>
            {adminUser && (
              <div className="rounded-xl border border-sky-200 bg-white px-4 py-2 shadow-sm">
                <div className="text-xs font-bold uppercase tracking-wide text-sky-600">Logged in admin</div>
                <div className="text-base font-bold text-slate-900">{adminUser.name}</div>
                <div className="text-xs text-slate-500">ID: {adminUser.id} • {adminUser.role}</div>
              </div>
            )}
            <button onClick={onLogout} className="rounded-lg px-4 py-3 text-rose-600 hover:bg-white">ออกจากระบบ</button>
          </div>
        )}
      </div>
    </header>
  );
}

function Login({ records, openRecord, openAdminLogin }) {
  const [hn, setHn] = useState("");
  const [error, setError] = useState("");

  function submit(e) {
    e.preventDefault();
    const key = String(hn || "").trim();

    if (!key) {
      setError("กรุณากรอก HN");
      return;
    }

    if (!records[key]) {
      setError("ไม่พบข้อมูล HN นี้");
      return;
    }

    setError("");
    openRecord(key);
  }

  return (
    <main className="mx-auto flex min-h-[calc(100vh-120px)] w-full max-w-7xl items-center justify-center px-4 py-10">
      <div className="w-full max-w-xl">
        <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm md:p-10">
          <div className="mb-6 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-slate-500">
              <SearchIcon />
            </div>
            <div>
              <h2 className="text-3xl font-bold text-slate-900">ดูผลสุขภาพด้วย HN</h2>
              <p className="mt-1 text-base text-slate-500">ค้นหาผลการประเมินรายบุคคล</p>
            </div>
          </div>

          <div className="mb-6 border-t border-slate-100" />

          <form onSubmit={submit} className="space-y-5">
            <div>
              <label className="mb-2 block text-lg font-semibold text-slate-700">
                HN
              </label>
              <input
                value={hn}
                onChange={(e) => {
                  setHn(e.target.value);
                  if (error) setError("");
                }}
                placeholder="กรอกเลข HN"
                className="h-16 w-full rounded-2xl border border-slate-300 bg-white px-5 text-2xl font-medium text-slate-900 outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
              />
              {error && (
                <p className="mt-3 text-base font-medium text-rose-600">{error}</p>
              )}
            </div>

            <button
              type="submit"
              className="flex h-16 w-full items-center justify-center gap-3 rounded-2xl bg-slate-950 px-6 text-xl font-bold text-white transition hover:bg-slate-800"
            >
              <SearchIcon />
              ดูผลการประเมิน
            </button>
          </form>

          <div className="mt-6 text-center">
            <button
              type="button"
              onClick={openAdminLogin}
              className="text-base font-medium text-slate-400 transition hover:text-slate-600"
            >
              สำหรับผู้ดูแลระบบ
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}

function AdminLogin({ onSuccess, onCancel }) {
  const [username, setUsername] = useState("admin1");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function login() {
    setLoading(true);
    setError("");
    try {
      const admin = await signInAdminWithSupabase(username.trim(), password);
      onSuccess(admin);
    } catch (err) {
      console.error(err);
      setError("Admin ID หรือรหัสผ่านไม่ถูกต้อง หรือยังไม่ได้ผูกผู้ใช้ใน Supabase");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-xl px-4 py-10">
      <Card title="เข้าสู่ระบบผู้ดูแล" icon={UserIcon} right={<Pill tone="dark">Admin only</Pill>}>
        <div className="space-y-4">
          <Field label="Username / Admin ID" value={username} onChange={(v) => { setUsername(v); setError(""); }} />
          <label className="flex h-full flex-col">
            <span className="mb-1 flex min-h-[2.6rem] items-end text-sm font-semibold text-slate-500">Password</span>
            <input
              value={password}
              type="password"
              onChange={(e) => { setPassword(e.target.value); setError(""); }}
              onKeyDown={(e) => { if (e.key === "Enter") login(); }}
              className="h-12 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-base outline-none focus:border-slate-700"
            />
          </label>
          {error && <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-base font-semibold text-rose-700">{error}</div>}
          <button onClick={login} disabled={loading} className="w-full rounded-xl bg-slate-900 px-4 py-3 text-lg font-bold text-white hover:bg-slate-800 disabled:opacity-50">{loading ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบ"}</button>
          <button onClick={onCancel} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-base font-semibold text-slate-600 hover:bg-slate-50">กลับหน้ากรอก HN</button>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
            <div className="font-semibold text-slate-800">ผู้ดูแลระบบ</div>
            <div>admin1 — ชัยวัฒน์</div>
            <div>admin2 — ธนาวุฒิ</div>
          </div>
        </div>
      </Card>
    </main>
  );
}

function Summary({ record }) {
  const latestFor = (key) => {
    const sessions = completedSessions(record).filter((s) => {
      const v = valueOf(s, key);
      return v !== null && v !== undefined && Number.isFinite(Number(v));
    });
    return sessions.length ? sessions[sessions.length - 1] : null;
  };

  const weight = delta(record, metrics.inbody[0]);
  const bodyFat = delta(record, metrics.inbody[2]);
  const fatMass = delta(record, metrics.inbody[4]);
  const muscle = delta(record, metrics.inbody[3]);
  const latestOhs = latestCompletedSession(record) || record.sessions[3];
  const ohs = ohsSummary(latestOhs);

  const latestWeight = latestFor("weight");
  const latestBodyFat = latestFor("bodyFat");
  const latestFatMass = latestFor("fatMass");
  const latestMuscle = latestFor("muscle");

  const items = [
    ["น้ำหนัก 1→ล่าสุด", weight.text, `ล่าสุด ${show(latestWeight?.inbody?.weight)} kg`, weight.tone],
    ["Body Fat 1→ล่าสุด", bodyFat.text, `ล่าสุด ${show(latestBodyFat?.inbody?.bodyFat)} %`, bodyFat.tone],
    ["Fat Mass 1→ล่าสุด", fatMass.text, `ล่าสุด ${show(latestFatMass?.inbody?.fatMass)} kg`, fatMass.tone],
    ["Muscle 1→ล่าสุด", muscle.text, `ล่าสุด ${show(latestMuscle?.inbody?.muscle)} kg`, muscle.tone],
    ["OHS ล่าสุด", ohs.text, `ปกติ ${ohs.normal}/6 ข้อ`, ohs.tone],
  ];

  return (
    <div className="grid gap-4 md:grid-cols-5">
      {items.map(([a, b, c, t]) => (
        <div key={a} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-2">
            <Pill tone={t}>{a}</Pill>
          </div>
          <div className="text-3xl font-bold text-slate-900">{b}</div>
          <div className="mt-1 text-sm font-semibold text-slate-500">{c}</div>
        </div>
      ))}
    </div>
  );
}

function Trend({ record }) {
  const all = [...metrics.inbody, ...metrics.fitness, ["ohs", "คะแนน OHS ปกติ", "/6", "higher"]];
  const [key, setKey] = useState("weight");
  const item = all.find((m) => m[0] === key) || all[0];
  const filledSessions = completedSessions(record);
  const data = filledSessions.map((s) => ({ name: `ครั้งที่ ${s.no}`, date: s.date, value: valueOf(s, item[0]) }));
  const values = data.map((d) => d.value).filter((v) => Number.isFinite(v));
  const yDomain = closeYAxisDomain(values);
  const d = delta(record, item);
  return (
    <Card title="กราฟแนวโน้ม ครั้งที่ 1–4" icon={ActivityIcon} right={<div className="flex flex-wrap gap-2"><Pill>Auto zoom scale</Pill><Pill tone={d.tone}>เปลี่ยนแปลง {d.text}</Pill></div>}>
      <div className="mb-4 max-w-sm"><Select label="เลือกตัวชี้วัด" value={key} onChange={setKey} options={all.map((m) => ({ value: m[0], label: m[1] }))} /></div>
      <div className="h-80">
        <ResponsiveContainer>
          <LineChart data={data} margin={{ top: 12, right: 18, left: 8, bottom: 6 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="name" tick={{ fontSize: 14 }} />
            <YAxis tick={{ fontSize: 14 }} domain={yDomain} allowDecimals={true} tickFormatter={(v) => Number(v).toFixed(Number.isInteger(v) ? 0 : 1)} />
            <Tooltip formatter={(v) => [`${v} ${item[2]}`, item[1]]} labelFormatter={(label, payload) => `${label}${payload?.[0]?.payload?.date ? ` • ${payload[0].payload.date}` : ""}`} />
            <Line type="monotone" dataKey="value" stroke="#0f172a" strokeWidth={4} dot={{ r: 6 }} activeDot={{ r: 8 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-2 text-sm text-slate-500">หมายเหตุ: กราฟนี้ใช้สเกลอัตโนมัติแบบใกล้ข้อมูล เพื่อให้เห็นแนวโน้มการเปลี่ยนแปลงชัดขึ้น</p>
    </Card>
  );
}

function CompareTable({ record, title, icon, list, withFitnessInterpretation = false }) {
  const latestSession = completedSessions(record).slice(-1)[0] || record.sessions[3];
  return (
    <Card title={title} icon={icon}>
      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full min-w-[780px] text-left text-base">
          <thead className="bg-slate-50 text-sm text-slate-500">
            <tr>
              <th className="p-3">รายการ</th>
              {record.sessions.map((s) => <th key={s.no} className="p-3">ครั้งที่ {s.no}<br /><span className="font-normal">{s.date || "-"}</span></th>)}
              <th className="p-3">สรุป 1→ล่าสุด</th>
              {withFitnessInterpretation && <th className="p-3">แปลผลล่าสุด</th>}
            </tr>
          </thead>
          <tbody>
            {list.map((m) => {
              const d = delta(record, m);
              const rowTone = metricTone(m[0]);
              const rowClass = rowTone === "fat" ? "bg-amber-50/55" : rowTone === "muscle" ? "bg-rose-50/55" : "";
              const interpret = withFitnessInterpretation ? classifyFitness(record, m[0], valueOf(latestSession, m[0]), latestSession) : null;
              return (
                <tr key={m[0]} className={`border-t border-slate-100 ${rowClass}`}>
                  <td className="p-3 font-semibold text-slate-900">{m[1]} <span className="font-normal text-slate-400">({m[2]})</span></td>
                  {record.sessions.map((s) => <td key={s.no} className="p-3">{show(valueOf(s, m[0]))}</td>)}
                  <td className="p-3"><Pill tone={d.tone}>{d.text}</Pill></td>
                  {withFitnessInterpretation && <td className="p-3"><Pill tone={interpret.tone}>{interpret.label}</Pill><div className="mt-1 text-sm text-slate-500">{interpret.detail}</div></td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {withFitnessInterpretation && <p className="mt-3 text-sm leading-6 text-slate-500">การแปลผลนี้เทียบตามอายุ/เพศและ protocol ที่กำหนด ใช้เพื่อคัดกรองและติดตามแนวโน้ม ไม่ใช่การวินิจฉัยโรค</p>}
    </Card>
  );
}

function OhsTable({ record }) {
  const chart = record.sessions.map((s) => ({ name: `ครั้งที่ ${s.no}`, normal: ohsSummary(s).normal }));
  return (
    <Card title="Overhead Deep Squat ครั้งที่ 1–4" icon={ClipboardIcon}>
      <div className="grid gap-6 lg:grid-cols-[1.3fr_.7fr]">
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-inner">
          <table className="w-full min-w-[900px] text-left text-xs">
            <thead className="bg-slate-50 text-sm text-slate-500"><tr><th className="p-3">รายการ</th>{record.sessions.map((s) => <th key={s.no} className="p-3">ครั้งที่ {s.no}</th>)}</tr></thead>
            <tbody>
              {ohsItems.map((x, i) => <tr key={x} className="border-t border-slate-100"><td className="p-3 font-semibold text-slate-900">{x}</td>{record.sessions.map((s) => <td key={s.no} className="p-3"><Pill tone={s.ohs[i] === "ปกติ" ? "good" : s.ohs[i] === "ต้องระวัง" ? "warn" : "bad"}>{s.ohs[i]}</Pill></td>)}</tr>)}
              <tr className="border-t border-slate-100 bg-slate-50"><td className="p-3 font-bold">สรุป</td>{record.sessions.map((s) => { const o = ohsSummary(s); return <td key={s.no} className="p-3"><Pill tone={o.tone}>{o.text} {o.normal}/6</Pill></td>; })}</tr>
            </tbody>
          </table>
        </div>
        <div className="h-72">
          <ResponsiveContainer>
            <BarChart
              data={chart}
              barCategoryGap="45%"
              margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            
              <XAxis
                dataKey="name"
                tick={{ fontSize: 14, fill: "#64748b" }}
                axisLine={{ stroke: "#cbd5e1" }}
                tickLine={false}
              />
            
              <YAxis
                domain={[0, 6]}
                tick={{ fontSize: 12, fill: "#64748b" }}
                axisLine={{ stroke: "#cbd5e1" }}
                tickLine={false}
              />
            
              <Tooltip />
            
              <Bar
                dataKey="normal"
                fill="#0f172a"
                barSize={28}
                radius={[8, 8, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </Card>
  );
}

function parseFrequencyNumber(value) {
  const text = String(value || "").replace(/[–—]/g, "-");
  const nums = text.match(/\d+(\.\d+)?/g)?.map(Number) || [];

  if (nums.length >= 2) return (nums[0] + nums[1]) / 2;
  if (nums.length === 1) return nums[0];

  return 0;
}

function latestWeightKg(record) {
  const sessions = completedSessions(record);

  for (let i = sessions.length - 1; i >= 0; i -= 1) {
    const weight = valueOf(sessions[i], "weight");

    if (Number.isFinite(Number(weight)) && Number(weight) > 0) {
      return Number(weight);
    }
  }

  return null;
}

function activityFactorFromProgram(program = {}) {
  const cardioDays = parseFrequencyNumber(program.cardioFrequency);
  const strengthDays = parseFrequencyNumber(program.strengthFrequency);
  const weeklyDays = Math.min(7, cardioDays + strengthDays);

  if (weeklyDays <= 1) {
    return { factor: 1.2, label: "กิจกรรมน้อย" };
  }

  if (weeklyDays <= 3) {
    return { factor: 1.375, label: "เบาถึงปานกลาง" };
  }

  if (weeklyDays <= 5) {
    return { factor: 1.55, label: "ปานกลาง" };
  }

  return { factor: 1.725, label: "ค่อนข้างมาก" };
}

function bmrMifflin(record) {
  const weight = latestWeightKg(record);
  const height = num(record.height);
  const age = num(record.age);

  if (!weight || !height || !age) return null;

  const female = sexKey(record.sex) === "female";

  const bmr =
    10 * weight +
    6.25 * height -
    5 * age +
    (female ? -161 : 5);

  return Math.round(bmr);
}

function tdeeEstimate(record) {
  const bmr = bmrMifflin(record);
  if (!bmr) return null;

  const activity = activityFactorFromProgram(record.program);
  const tdee = Math.round(bmr * activity.factor);

  return {
    bmr,
    tdee,
    factor: activity.factor,
    activityLabel: activity.label,
    weight: latestWeightKg(record),
  };
}

function goalNutritionConfig(goal) {
  switch (goal) {
    case "ลดไขมัน / ควบคุมน้ำหนัก":
      return {
        goalLabel: "ลดไขมัน / ควบคุมน้ำหนัก",
        calorieAdjust: -500,
        macro: { carb: 40, protein: 35, fat: 25 },
      };

    case "เพิ่มกล้ามเนื้อ":
      return {
        goalLabel: "เพิ่มกล้ามเนื้อ",
        calorieAdjust: 250,
        macro: { carb: 45, protein: 30, fat: 25 },
      };

    case "เพิ่มความแข็งแรง":
      return {
        goalLabel: "เพิ่มความแข็งแรง",
        calorieAdjust: 0,
        macro: { carb: 45, protein: 30, fat: 25 },
      };

    case "เพิ่มความทนทานของหัวใจและปอด":
      return {
        goalLabel: "เพิ่มความทนทานของหัวใจและปอด",
        calorieAdjust: 0,
        macro: { carb: 50, protein: 25, fat: 25 },
      };

    case "ลดปวด / ฟื้นฟูการเคลื่อนไหว":
      return {
        goalLabel: "ลดปวด / ฟื้นฟูการเคลื่อนไหว",
        calorieAdjust: 0,
        macro: { carb: 45, protein: 25, fat: 30 },
      };

    case "สุขภาพทั่วไป":
    default:
      return {
        goalLabel: "สุขภาพทั่วไป",
        calorieAdjust: 0,
        macro: { carb: 45, protein: 25, fat: 30 },
      };
  }
}

function nutritionGoalPlan(record) {
  const estimate = tdeeEstimate(record);
  if (!estimate) return null;

  const config = goalNutritionConfig(record.goal);
  const targetCalories = Math.max(
    1200,
    Math.round(estimate.tdee + config.calorieAdjust)
  );

  const carbKcal = Math.round((targetCalories * config.macro.carb) / 100);
  const proteinKcal = Math.round((targetCalories * config.macro.protein) / 100);
  const fatKcal = Math.round((targetCalories * config.macro.fat) / 100);

  const carbGram = Math.round(carbKcal / 4);
  const proteinGram = Math.round(proteinKcal / 4);
  const fatGram = Math.round(fatKcal / 9);

  const pieData = [
    {
      name: "คาร์โบไฮเดรต",
      shortName: "Carb",
      percent: config.macro.carb,
      kcal: carbKcal,
      grams: carbGram,
      color: "#E8C1A0",
    },
    {
      name: "ไขมัน",
      shortName: "Fat",
      percent: config.macro.fat,
      kcal: fatKcal,
      grams: fatGram,
      color: "#F5D76E",
    },
    {
      name: "โปรตีน",
      shortName: "Protein",
      percent: config.macro.protein,
      kcal: proteinKcal,
      grams: proteinGram,
      color: "#F4A6A6",
    },
  ];

  return {
    bmr: estimate.bmr,
    tdee: estimate.tdee,
    factor: estimate.factor,
    activityLabel: estimate.activityLabel,
    targetCalories,
    calorieAdjust: config.calorieAdjust,
    goalLabel: config.goalLabel,
    pieData,
  };
}

function calorieAdjustText(value) {
  if (!Number.isFinite(Number(value))) return "-";
  if (value > 0) return `+${value} kcal/day`;
  if (value < 0) return `${value} kcal/day`;
  return "±0 kcal/day";
}

function NutritionPlanCard({ record }) {
  const plan = nutritionGoalPlan(record);

  if (!plan) {
    return (
      <Card title="พลังงานและสารอาหารที่แนะนำ" icon={HeartIcon}>
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold leading-7 text-amber-800">
          ยังแสดงผลไม่ได้ กรุณากรอกข้อมูลให้ครบก่อน:
          อายุ + เพศ + ส่วนสูง + น้ำหนักล่าสุดจาก InBody
        </div>
      </Card>
    );
  }

  const macroColors = {
    Carb: "#E7C29A",
    Protein: "#E8A2A2",
    Fat: "#E8C95F",
  };

  const chartData = plan.pieData.map((item) => ({
    ...item,
    color: macroColors[item.shortName] || item.color,
  }));

  const adjustText = calorieAdjustText(plan.calorieAdjust);
  const shouldShowAdjust = plan.calorieAdjust !== 0;

  return (
    <Card title="พลังงานและสารอาหารที่แนะนำ" icon={HeartIcon}>
      <div className="grid gap-5 lg:grid-cols-[0.95fr_1.05fr]">
        <div className="rounded-3xl border border-slate-200 bg-slate-50/70 p-4">
          <div className="mb-3">
            <div className="text-sm font-bold text-slate-900">สัดส่วนสารอาหาร</div>
            <div className="text-xs text-slate-500">
              คำนวณจากแคลอรีเป้าหมายต่อวัน
            </div>
          </div>

          <div className="h-[280px]">
            <ResponsiveContainer>
              <PieChart>
                <Pie
                  data={chartData}
                  dataKey="kcal"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={72}
                  outerRadius={108}
                  paddingAngle={3}
                  cornerRadius={8}
                  stroke="#ffffff"
                  strokeWidth={3}
                  label={false}
                  labelLine={false}
                >
                  {chartData.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Pie>

                <text
                  x="50%"
                  y="46%"
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill="#0F172A"
                  fontSize="24"
                  fontWeight="800"
                >
                  {plan.targetCalories.toLocaleString()}
                </text>

                <text
                  x="50%"
                  y="57%"
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill="#64748B"
                  fontSize="12"
                  fontWeight="600"
                >
                  kcal/day
                </text>

                <Tooltip
                  formatter={(value, name, props) => [
                    `${props.payload.grams} g/day • ${props.payload.kcal} kcal • ${props.payload.percent}%`,
                    name,
                  ]}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-2 grid gap-2">
            {chartData.map((item) => (
              <div
                key={item.name}
                className="flex items-center justify-between rounded-2xl border border-white bg-white px-3 py-2 shadow-sm"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span
                    className="h-3 w-3 rounded-full"
                    style={{ backgroundColor: item.color }}
                  />

                  <div className="min-w-0">
                    <div className="text-sm font-bold text-slate-900">
                      {item.name}
                    </div>
                    <div className="text-xs text-slate-500">
                      {item.percent}% • {item.kcal.toLocaleString()} kcal
                    </div>
                  </div>
                </div>

                <div className="text-sm font-extrabold text-slate-900">
                  {item.grams.toLocaleString()} g
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-4">
              <div className="text-xs font-bold uppercase tracking-wide text-emerald-700">
                Recommended Calories
              </div>

              <div className="mt-2 text-2xl font-extrabold text-slate-900">
                {plan.targetCalories.toLocaleString()} kcal/day
              </div>

              <div className="mt-1 text-xs font-semibold text-emerald-700">
                แคลอรีที่ควรกินตามเป้าหมาย
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-4">
              <div className="text-xs font-bold uppercase tracking-wide text-slate-500">
                Goal
              </div>

              <div className="mt-2 text-lg font-extrabold leading-7 text-slate-900">
                {plan.goalLabel}
              </div>

              {shouldShowAdjust && (
                <div className="mt-1 text-xs font-semibold text-slate-500">
                  ปรับจาก TDEE {adjustText}
                </div>
              )}
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-4">
              <div className="text-xs font-bold uppercase tracking-wide text-slate-500">
                TDEE
              </div>

              <div className="mt-2 text-xl font-extrabold text-slate-900">
                {plan.tdee.toLocaleString()} kcal/day
              </div>

              <div className="mt-1 text-xs font-semibold text-slate-500">
                Activity Factor {plan.factor}
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-4">
              <div className="text-xs font-bold uppercase tracking-wide text-slate-500">
                BMR
              </div>

              <div className="mt-2 text-xl font-extrabold text-slate-900">
                {plan.bmr.toLocaleString()} kcal/day
              </div>

              <div className="mt-1 text-xs font-semibold text-slate-500">
                Mifflin-St Jeor
              </div>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            {chartData.map((item) => (
              <div
                key={item.shortName}
                className="rounded-3xl border bg-white p-4 shadow-sm"
                style={{
                  borderColor: item.color,
                  backgroundColor: `${item.color}26`,
                }}
              >
                <div className="text-xs font-bold uppercase tracking-wide text-slate-500">
                  {item.shortName}
                </div>

                <div className="mt-1 text-base font-bold text-slate-900">
                  {item.name}
                </div>

                <div className="mt-3 text-2xl font-extrabold text-slate-900">
                  {item.grams.toLocaleString()} g
                </div>

                <div className="mt-1 text-xs font-semibold text-slate-600">
                  {item.percent}% • {item.kcal.toLocaleString()} kcal/day
                </div>
              </div>
            ))}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs leading-6 text-slate-600">
            <b>วิธีคำนวณ:</b> BMR ใช้สูตร Mifflin-St Jeor แล้วคูณ Activity Factor
            เพื่อหา TDEE จากนั้นปรับแคลอรีตามเป้าหมาย และแบ่งคาร์บ/โปรตีน/ไขมันเป็นกรัมต่อวัน
          </div>
        </div>
      </div>
    </Card>
  );
}

function defaultSetsRepsSummaryByGoal(goal) {
  return "";
}

function getSetsRepsText(program = {}, goal = "") {
  return (
    program.strengthDose ||
    program.setsReps ||
    program.strengthSetsReps ||
    program.strengthSets ||
    program.strengthReps ||
    program.sets ||
    program.reps ||
    program.volume ||
    program.strengthVolume ||
    program.strengthPlan ||
    ""
  );
}

function shortSetsRepsText(text) {
  const value = String(text || "").trim();
  if (!value) return "";
  return value.includes(":") ? value.split(":").slice(1).join(":").trim() : value;
}

function ExercisePlanCard({ record }) {
  const log = record.exerciseLog || {};
  const days = log.days || {};
  const program = record.program || {};
  const latestUpdate =
    Array.isArray(log.history) && log.history.length ? log.history[0] : null;

  const dayNames = {
    fullBody: "Full Body",
    upper: "Upper Day",
    lower: "Lower Day",
    push: "Push Day",
    pull: "Pull Day",
    legs: "Legs Day",
  };

  const allowedDaysBySplit = {
    "Full Body": ["fullBody"],
    "Upper / Lower": ["upper", "lower"],
    PPL: ["push", "pull", "legs"],
    "Hybrid / Mixed": ["fullBody", "upper", "lower", "push", "pull", "legs"],
  };

  const allowedDays = allowedDaysBySplit[log.split] || ["fullBody"];

  const activeDays = Object.entries(days).filter(
    ([dayKey, list]) =>
      allowedDays.includes(dayKey) &&
      Array.isArray(list) &&
      list.length > 0
  );

  const dayDisplayOrder = ["fullBody", "upper", "lower", "push", "pull", "legs"];

  activeDays.sort(
    ([a], [b]) => dayDisplayOrder.indexOf(a) - dayDisplayOrder.indexOf(b)
  );

  const planText =
    log.description ||
    exercisePlanDescription(log.split, log.daysPerWeek, log.days);
  const setsRepsSummary = shortSetsRepsText(
    getSetsRepsText(program, record.goal)
  );
  
  const cardioSummary = program.cardioDuration
    ? `${program.cardioDuration} นาที/ครั้ง`
    : "";
  return (
    <Card title="โปรแกรมออกกำลังกายของฉัน" icon={ActivityIcon}>
      <div className="rounded-3xl border border-blue-200 bg-blue-50 p-4 md:p-5">
        <div className="grid gap-4 lg:grid-cols-[1fr_250px]">
          <div>
            <div className="text-sm font-bold text-slate-500">
              My Exercise Plan
            </div>

            <div className="mt-1 text-2xl font-black text-slate-900 md:text-3xl">
              {log.split || "ยังไม่ได้กำหนดโปรแกรม"}{" "}
              {log.daysPerWeek ? `${log.daysPerWeek} วัน/สัปดาห์` : ""}
            </div>

            {(setsRepsSummary || cardioSummary) && (
              <div className="mt-3 inline-block w-fit max-w-full rounded-xl border border-slate-200 bg-white/70 px-2.5 py-1.5 shadow-sm">
                <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                  สรุปแผน / Plan Summary
                </div>
            
                <div className="flex flex-wrap gap-1.5">
                  {setsRepsSummary && (
                    <span className="inline-flex items-center rounded-full border border-blue-100 bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-700">
                      <span className="mr-1 text-blue-500">Strength:</span>
                      <span className="text-slate-900">{setsRepsSummary}</span>
                    </span>
                  )}
                
                  {cardioSummary && (
                    <span className="inline-flex items-center rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700">
                      <span className="mr-1 text-emerald-600">Cardio:</span>
                      <span className="text-slate-900">{cardioSummary}</span>
                    </span>
                  )}
                </div>
              </div>
            )}
            
            <div className="mt-4 border-t border-slate-200 pt-3">
              <div className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">
                วันฝึก / Training Days
              </div>
            
              <div className="flex flex-wrap gap-2">
                {exercisePlanPills(planText).map((item, index) => (
                  <span
                    key={`${item.text}-${index}`}
                    className={`inline-flex rounded-full border px-3 py-1.5 text-sm font-bold ${dayPillClass(item.dayKey)}`}
                  >
                    {item.text}
                  </span>
                ))}
              </div>
            </div>

            <div className="mt-2 text-sm font-semibold text-slate-500">
              ให้ทำตามลำดับท่าที่แสดงจากบนลงล่าง
            </div>
          </div>

          <div className="self-start rounded-2xl border border-sky-100 bg-white p-3 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs font-bold text-sky-700">
                อัปเดตล่าสุด
              </div>

              {Array.isArray(log.history) && log.history.length > 1 && (
                <details className="relative">
                  <summary className="cursor-pointer list-none text-xs font-bold text-slate-400 hover:text-slate-700">
                    ดูประวัติ
                  </summary>

                  <div className="absolute right-0 z-20 mt-2 w-80 rounded-2xl border border-slate-200 bg-white p-3 shadow-lg">
                    <div className="mb-2 text-xs font-bold text-slate-500">
                      ประวัติการเปลี่ยนโปรแกรม
                    </div>

                    <div className="space-y-2">
                      {log.history.slice(1, 4).map((item, index) => (
                        <div
                          key={`${item.at}-${index}`}
                          className="rounded-xl bg-slate-50 p-2"
                        >
                          <div className="text-[11px] font-semibold text-slate-500">
                            {formatDateTimeThai(item.at)} • โดย {show(item.by)}
                          </div>

                          <div className="mt-1 text-xs font-bold text-slate-800">
                            {show(item.from)}
                            <span className="mx-1 text-sky-600">→</span>
                            {show(item.to)}
                          </div>

                          {item.reason && (
                            <div className="mt-1 text-[11px] font-bold text-emerald-700">
                              เหตุผล: {item.reason}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </details>
              )}
            </div>

            {latestUpdate ? (
              <div className="mt-2">
                <div className="text-[11px] font-semibold text-slate-500">
                  {formatDateTimeThai(latestUpdate.at)}
                </div>

                <div className="mt-0.5 text-[11px] font-bold text-slate-600">
                  โดย {show(latestUpdate.by)}
                </div>

                <div className="mt-2 rounded-xl bg-slate-50 px-2 py-2 text-xs font-black leading-5 text-slate-900">
                  <div>{show(latestUpdate.from)}</div>
                  <div className="text-center text-sky-600">↓</div>
                  <div>{show(latestUpdate.to)}</div>
                </div>

                {latestUpdate.reason && (
                  <div className="mt-1 text-[11px] font-bold text-emerald-700">
                    เหตุผล: {latestUpdate.reason}
                  </div>
                )}
              </div>
            ) : (
              <div className="mt-2 rounded-xl bg-slate-50 p-2 text-xs font-semibold text-slate-600">
                ยังไม่มีข้อมูลการอัปเดต
              </div>
            )}
          </div>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {activeDays.length ? (
            activeDays.map(([dayKey, list]) => (
              <div
                key={dayKey}
                className="rounded-2xl border border-slate-200 bg-white p-3 shadow-md md:p-4"
              >
                <div className="mb-3 text-lg font-black text-slate-900">
                  {dayNames[dayKey] || dayKey}
                </div>

                <ol className="space-y-2">
                  {sortExercisesByDay(dayNames[dayKey], list).map(
                    (exercise, index) => (
                      <li
                        key={exercise}
                        className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-100 px-3 py-2.5 text-sm text-slate-800"
                      >
                        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white">
                          {String(index + 1).padStart(2, "0")}
                        </span>
                      
                        <div className="min-w-0">
                          <div className="font-bold text-slate-900">
                            {exercise}
                          </div>
                      
                          {exerciseMuscleText(exercise) && (
                            <div className="mt-0.5 text-xs font-medium leading-5 text-slate-400">
                              {exerciseMuscleText(exercise)}
                            </div>
                          )}
                        </div>
                      </li>
                    )
                  )}
                </ol>
              </div>
            ))
          ) : (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-base font-semibold text-amber-800">
              ยังไม่มีโปรแกรมออกกำลังกาย
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

function ProgramReceivedCard({ record }) {
  const program = record.program || {};
  const emptyProgramValues = ["", "-", "ยังไม่มีข้อมูล", "ไม่ระบุ", "null", "undefined"];

function hasRealProgramValue(value) {
  const text = String(value ?? "").trim();
  return !emptyProgramValues.includes(text);
}

const coreProgramFields = [
  program.type,
  program.cardioType,
  program.cardioFrequency,
  program.cardioDuration,
  program.strengthFrequency,
  program.strengthDose,
  program.intensity,
  program.rpe,
  program.talk,
  program.focus,
];

const hasProgramData = coreProgramFields.some(hasRealProgramValue);

if (!hasProgramData) {
  return (
    <Card title="โปรแกรมที่ได้รับ" icon={FileIcon}>
      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-5 text-center">
        <div className="text-lg font-black text-amber-900">
          ยังไม่ได้เข้าพบเทรนเนอร์ / ผู้ดูแล / นักวิทยาศาสตร์การกีฬา
        </div>

        <div className="mt-2 text-sm font-semibold leading-6 text-amber-800">
          ยังไม่มีการกำหนดโปรแกรมออกกำลังกายรายบุคคลในระบบ
          กรุณาเข้าพบเจ้าหน้าที่เพื่อรับคำแนะนำก่อนเริ่มโปรแกรม
        </div>
      </div>
    </Card>
  );
}
  
  const focusItems = Array.isArray(program.focus)
    ? program.focus
    : String(program.focus || "")
        .split("/")
        .map((x) => x.trim())
        .filter(Boolean);

  const setsReps =
    program.strengthDose ||
    program.setsReps ||
    program.strengthSetsReps ||
    program.strengthSets ||
    program.strengthReps ||
    program.sets ||
    program.reps ||
    program.volume ||
    program.strengthVolume ||
    program.strengthPlan ||
    "";

return (
  <Card title="โปรแกรมที่ได้รับ" icon={ClipboardIcon}>
    <div className="space-y-5">
      <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-5">
        <div className="text-sm font-bold text-slate-500">
          โปรแกรมหลัก
        </div>

        <div className="mt-1 flex flex-wrap items-center gap-2">
          <div className="text-3xl font-black tracking-tight text-slate-900">
            {show(program.type)}
          </div>

          {program.strengthFrequency && (
            <span className="text-2xl font-black text-slate-400">
              •
            </span>
          )}

          {program.strengthFrequency && (
            <div className="text-2xl font-black text-slate-600">
              {program.strengthFrequency} วัน/สัปดาห์
            </div>
          )}
        </div>

        {record.goal && (
          <div className="mt-3 inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">
            เป้าหมาย: {record.goal}
          </div>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-blue-200 bg-blue-50/70 p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-black text-blue-700">
                Strength Plan
              </div>

              <div className="mt-1 text-xl font-black text-slate-900">
                {program.strengthFrequency
                  ? `${program.strengthFrequency} วัน/สัปดาห์`
                  : "ยังไม่กำหนดวันฝึก"}
              </div>
            </div>
          </div>

          <div className="mt-4 rounded-2xl border border-blue-100 bg-white px-4 py-3 text-sm font-bold leading-6 text-slate-800 shadow-sm">
            {setsReps || "-"}
          </div>

          <div className="mt-3">
            <span className="inline-flex rounded-full border border-blue-200 bg-white px-3 py-1 text-xs font-bold text-blue-700">
              {show(program.intensity)}
            </span>
          </div>
        </div>

        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-5">
          <div>
            <div className="text-sm font-black text-emerald-700">
              Cardio Plan
            </div>

            <div className="mt-1 text-xl font-black text-slate-900">
              {show(program.cardioType)}
              {program.cardioDuration && (
                <span className="text-slate-600">
                  {" "}• {program.cardioDuration} นาที/ครั้ง
                </span>
              )}
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <span className="inline-flex rounded-full border border-emerald-200 bg-white px-3 py-1 text-xs font-bold text-emerald-700">
              {show(program.intensity)}
            </span>

            <span className="inline-flex rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-bold text-slate-700">
              RPE {show(program.rpe)}
            </span>
          </div>

          <div className="mt-4 grid gap-2 text-sm font-bold text-slate-700">
            <div className="rounded-2xl border border-emerald-100 bg-white px-4 py-3 shadow-sm">
              Talk Test: {show(program.talk)}
            </div>

            <div className="rounded-2xl border border-emerald-100 bg-white px-4 py-3 shadow-sm">
              Target HR: {program.intensity ? targetHrText(record.age, program.intensity) : "-"}
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="text-sm font-black text-slate-500">
          Focus / จุดเน้น
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {focusItems.length ? (
            focusItems.map((item) => (
              <span
                key={item}
                className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm font-bold text-slate-700"
              >
                {item}
              </span>
            ))
          ) : (
            <span className="text-sm font-semibold text-slate-400">
              -
            </span>
          )}
        </div>
      </div>

      {(program.precaution || program.followUp) && (
        <div className="grid gap-4 md:grid-cols-2">
          {program.precaution && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
              <div className="text-sm font-black text-amber-700">
                ข้อควรระวัง
              </div>

              <div className="mt-2 text-base font-bold leading-7 text-slate-800">
                {program.precaution}
              </div>
            </div>
          )}

          {program.followUp && (
            <div className="rounded-2xl border border-sky-200 bg-sky-50 p-5">
              <div className="text-sm font-black text-sky-700">
                คำแนะนำเพิ่มเติม
              </div>

              <div className="mt-2 text-base font-bold leading-7 text-slate-800">
                {program.followUp}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  </Card>
);
}

function LmHnSummaryStrip({ record }) {
  const categories = [
    { key: "nutrition", thai: "โภชนาการ", max: 10 },
    { key: "physical", thai: "กิจกรรมทางกาย", max: 10 },
    { key: "sleep", thai: "การนอน", max: 10 },
    { key: "stress", thai: "ความเครียด", max: 5 },
    { key: "substances", thai: "สุรา/บุหรี่", max: 10 },
    { key: "relationship", thai: "ความสัมพันธ์", max: 5 },
  ];

  const assessments = Array.isArray(record.lmAssessments)
    ? record.lmAssessments
    : [];

  const rows = [0, 1, 2, 3].map((index) => {
    const assessment = assessments[index] || blankLmAssessment(index + 1);

    const answered = LM_QUESTIONS.filter(
      (question) =>
        assessment.answers?.[question.id] !== undefined &&
        assessment.answers?.[question.id] !== null &&
        assessment.answers?.[question.id] !== ""
    ).length;

    const calculated = calculateLmAssessment(assessment, record);

    return {
      no: index + 1,
      assessment,
      answered,
      total: answered > 0 ? calculated.total : null,
      scores: calculated.scores,
    };
  });

  const latest =
    [...rows].reverse().find((item) => item.answered > 0) || null;

  const isComplete = latest?.answered === LM_QUESTIONS.length;

  const interpretation =
    latest && isComplete
      ? lmScoreInterpret(latest.total)
      : latest
        ? { label: "ยังไม่ครบ", tone: "warn" }
        : { label: "ยังไม่มีข้อมูล", tone: "gray" };

  function categoryAnsweredCount(categoryKey, assessment) {
    return LM_QUESTIONS.filter(
      (question) =>
        question.category === categoryKey &&
        assessment.answers?.[question.id] !== undefined &&
        assessment.answers?.[question.id] !== null &&
        assessment.answers?.[question.id] !== ""
    ).length;
  }

  function categoryQuestionCount(categoryKey) {
    return LM_QUESTIONS.filter((question) => question.category === categoryKey)
      .length;
  }

  const categorySummary = latest
    ? categories.map((item) => {
        const score = latest.scores?.[item.key] ?? 0;
        const answered = categoryAnsweredCount(item.key, latest.assessment);
        const totalQuestions = categoryQuestionCount(item.key);
        const percent = (score / item.max) * 100;

        let tone = "bad";
        if (percent >= 80) tone = "good";
        else if (percent >= 60) tone = "warn";

        return {
          ...item,
          score,
          answered,
          totalQuestions,
          tone,
        };
      })
    : [];

  const strengths = categorySummary
    .filter(
      (item) =>
        item.answered === item.totalQuestions && item.tone === "good"
    )
    .sort((a, b) => b.score / b.max - a.score / a.max);

  const improvements = categorySummary
    .filter(
      (item) =>
        item.answered === item.totalQuestions && item.tone === "bad"
    )
    .sort((a, b) => a.score / a.max - b.score / b.max);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="text-sm font-black text-slate-500">
            พฤติกรรมสุขภาพ LM
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-2">
            <div className="text-2xl font-black text-slate-900">
              {latest ? `${latest.total}/50` : "-/50"}
            </div>

            <Pill tone={interpretation.tone}>
              {interpretation.label}
            </Pill>

            {latest && (
              <Pill>
                ล่าสุดครั้งที่ {latest.no} • ตอบแล้ว {latest.answered}/16 ข้อ
              </Pill>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {rows.map((item) => (
            <span
              key={item.no}
              className={`inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-black ${
                latest?.no === item.no
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-200 bg-slate-50 text-slate-600"
              }`}
            >
              ครั้ง {item.no}:{" "}
              <span className="ml-1">
                {item.total === null ? "-/50" : `${item.total}/50`}
              </span>
            </span>
          ))}
        </div>
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3">
          <div className="text-sm font-black text-emerald-800">
            จุดเด่น
          </div>

          <div className="mt-2 flex flex-wrap gap-2">
            {strengths.length ? (
              strengths.map((item) => (
                <Pill key={item.key} tone="good">
                  {item.thai} {item.score}/{item.max}
                </Pill>
              ))
            ) : (
              <span className="text-sm font-semibold text-emerald-800/70">
                ยังไม่มีข้อมูลจุดเด่น
              </span>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3">
          <div className="text-sm font-black text-rose-800">
            ควรปรับ
          </div>

          <div className="mt-2 flex flex-wrap gap-2">
            {improvements.length ? (
              improvements.map((item) => (
                <Pill key={item.key} tone="bad">
                  {item.thai} {item.score}/{item.max}
                </Pill>
              ))
            ) : (
              <span className="text-sm font-semibold text-rose-800/70">
                ยังไม่มีข้อมูลที่ควรปรับ
              </span>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function Dashboard({ record, back }) {
  const risk = record.parq.some(Boolean);

  return (
    <main className="mx-auto max-w-7xl space-y-5 px-4 py-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
          <div>
            <div className="mb-2 flex flex-wrap gap-2">
              <Pill tone="dark">HN {record.hn}</Pill>
              <Pill>บันทึก {completedSessions(record).length}/4 ครั้ง</Pill>
              <Pill tone={risk ? "bad" : "good"}>
                {risk ? "PAR-Q ควรประเมินเพิ่ม" : "PAR-Q ผ่าน"}
              </Pill>
            </div>

            <h2 className="text-3xl font-bold text-slate-900">
              {record.name || "ไม่ระบุชื่อ"}
            </h2>

            <p className="mt-1 text-base text-slate-500">
              {record.sex} • อายุ {show(record.age)} ปี • ส่วนสูง {show(record.height)} ซม. • เป้าหมาย: {record.goal}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={printPage}
              className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-base font-semibold text-slate-700 hover:bg-slate-50"
            >
              พิมพ์ / PDF รายบุคคล
            </button>

            <button
              onClick={back}
              className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-base font-semibold text-slate-700 hover:bg-slate-100"
            >
              กลับไปกรอก HN
            </button>
          </div>
        </div>
      </section>

      <Summary record={record} />

      <LmHnSummaryStrip record={record} />

      <div className="grid gap-5 lg:grid-cols-[1.2fr_.8fr]">
        <Trend record={record} />
      
        <div className="self-start">
          <ProgramReceivedCard record={record} />
        </div>
      </div>
      
      <NutritionPlanCard record={record} />

      <ExercisePlanCard record={record} />
      
      <CompareTable record={record} title="ตารางเปรียบเทียบ InBody / Body Composition" icon={HeartIcon} list={metrics.inbody} />
      
      <CompareTable record={record} title="ตารางเปรียบเทียบ Fitness Test 5 ด้าน" icon={ActivityIcon} list={metrics.fitness} withFitnessInterpretation />

      <OhsTable record={record} />
    </main>
  );
}

function Info({ label, value, tone = "default" }) {
  return (
    <div className={`rounded-2xl border p-4 shadow-sm ${panelToneClass(tone)}`}>
      <div className="text-[11px] font-bold text-slate-500">{label}</div>
      <div className="mt-2 text-2xl font-black text-slate-900">{value}</div>
    </div>
  );
}

function InsightListPanel({ title, rows, tone = "default" }) {
  const wrapClass =
    tone === "good"
      ? "border-emerald-200 bg-emerald-50"
      : tone === "bad"
        ? "border-rose-200 bg-rose-50"
        : "border-slate-200 bg-slate-50";

  const titleClass =
    tone === "good"
      ? "text-emerald-900"
      : tone === "bad"
        ? "text-rose-900"
        : "text-slate-900";

  const badgeClass =
    tone === "good"
      ? "border-emerald-200 bg-white text-emerald-700"
      : tone === "bad"
        ? "border-rose-200 bg-white text-rose-700"
        : "border-slate-200 bg-white text-slate-600";

  const safeRows = Array.isArray(rows) ? rows : [];

  return (
    <div className={`rounded-xl border p-3 shadow-sm ${wrapClass}`}>
      <h3 className={`mb-2 truncate text-sm font-black leading-tight ${titleClass}`}>
        {title}
      </h3>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        {safeRows.length ? (
          safeRows.map((row, index) => {
            const label = row.label || row.nameTh || row.name || "-";
            const sub = row.sub || row.nameEn || "";
            const count = row.count ?? row.value ?? 0;

            return (
              <div
                key={`${label}-${index}`}
                className={`grid grid-cols-[minmax(0,1fr)_48px] items-center gap-2 px-3 py-2 ${
                  index !== 0 ? "border-t border-slate-100" : ""
                }`}
              >
                <div className="min-w-0">
                  <div
                    title={label}
                    className="truncate whitespace-nowrap text-[11px] font-bold leading-tight text-slate-800"
                  >
                    {label}
                  </div>

                  {sub && (
                    <div
                      title={sub}
                      className="mt-0.5 truncate whitespace-nowrap text-[10px] leading-tight text-slate-400"
                    >
                      {sub}
                    </div>
                  )}
                </div>

                <div className="flex justify-end">
                  <span
                    className={`inline-flex items-center whitespace-nowrap rounded-full border px-1.5 py-0.5 text-[9px] font-bold leading-none ${badgeClass}`}
                  >
                    {count} คน
                  </span>
                </div>
              </div>
            );
          })
        ) : (
          <div className="px-3 py-3 text-center text-xs font-semibold text-slate-400">
            ไม่มีข้อมูล
          </div>
        )}
      </div>
    </div>
  );
}

function AuditLogPanel({ auditLogs }) {
  return (
    <Card title="Audit Log / ประวัติการบันทึกและแก้ไข" icon={ClipboardIcon}>
      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full min-w-[760px] text-left text-base">
          <thead className="bg-slate-50 text-sm text-slate-500">
            <tr><th className="p-3">เวลา</th><th className="p-3">ผู้ดำเนินการ</th><th className="p-3">Action</th><th className="p-3">HN</th><th className="p-3">รายละเอียด</th></tr>
          </thead>
          <tbody>
            {auditLogs.slice(0, 10).map((log) => (
              <tr key={log.id} className="border-t border-slate-100">
                <td className="p-3 text-sm text-slate-600">{formatDateTimeThai(log.at)}</td>
                <td className="p-3"><div className="font-bold text-slate-900">{log.adminName}</div><div className="text-sm text-slate-500">{log.adminId} • {log.role}</div></td>
                <td className="p-3"><Pill tone={log.action.includes("ลบ") ? "bad" : log.action.includes("สร้าง") || log.action.includes("กู้คืน") ? "good" : "gray"}>{log.action}</Pill></td>
                <td className="p-3 font-semibold text-slate-900">{log.hn}</td>
                <td className="p-3 text-slate-600">{show(log.detail)}</td>
              </tr>
            ))}
            {auditLogs.length === 0 && <tr><td className="p-4 text-center text-slate-500" colSpan="5">ยังไม่มีประวัติการบันทึก/แก้ไขในรอบการใช้งานนี้</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-sm text-slate-500">Prototype นี้เก็บ Audit Log ระหว่างเปิดหน้าเว็บเท่านั้น เว็บจริงควรบันทึกลงฐานข้อมูลถาวร</p>
    </Card>
  );
}

function AdminSummary({ records, auditLogs, onFullBackup, onRestoreBackup }) {
  const restoreInputRef = useRef(null);

  function handleRestoreFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();

    reader.onload = () => {
      try {
        const payload = JSON.parse(String(reader.result || "{}"));

        if (!validateBackupPayload(payload)) {
          alert("ไฟล์สำรองข้อมูลไม่ถูกต้อง");
          return;
        }

        const ok = window.confirm(`ยืนยันการนำเข้าข้อมูลสำรอง

ข้อมูลในหน้าจอปัจจุบันจะถูกแทนที่ด้วยข้อมูลจากไฟล์ backup

ต้องการดำเนินการต่อหรือไม่?`);

        if (!ok) return;

        onRestoreBackup(
          normalizeRecords(payload.records),
          Array.isArray(payload.auditLogs) ? payload.auditLogs : []
        );
      } catch (error) {
        alert("อ่านไฟล์สำรองข้อมูลไม่สำเร็จ");
      } finally {
        event.target.value = "";
      }
    };

    reader.readAsText(file);
  }

  const thaiMonths = [
    "มกราคม",
    "กุมภาพันธ์",
    "มีนาคม",
    "เมษายน",
    "พฤษภาคม",
    "มิถุนายน",
    "กรกฎาคม",
    "สิงหาคม",
    "กันยายน",
    "ตุลาคม",
    "พฤศจิกายน",
    "ธันวาคม",
  ];

  function parseSessionDate(dateText) {
    const text = String(dateText || "").trim();
    if (!text) return null;

    if (text.includes("/")) {
      const parts = text.split("/");
      if (parts.length !== 3) return null;

      const d = Number(parts[0]);
      const m = Number(parts[1]);
      const y = Number(parts[2]);

      if (!d || !m || !y) return null;

      return {
        yearBE: y < 2400 ? y + 543 : y,
        month: m,
      };
    }

    if (text.includes("-")) {
      const parts = text.split("-");
      if (parts.length !== 3) return null;

      const y = Number(parts[0]);
      const m = Number(parts[1]);

      if (!y || !m) return null;

      return {
        yearBE: y < 2400 ? y + 543 : y,
        month: m,
      };
    }

    return null;
  }

  function sessionsInPeriod(record, yearFilter, monthFilter) {
    return completedSessions(record).filter((s) => {
      if (yearFilter === "all" && monthFilter === "all") return true;

      const parsed = parseSessionDate(s.date);
      if (!parsed) return false;

      const yearOk = yearFilter === "all" || parsed.yearBE === Number(yearFilter);
      const monthOk = monthFilter === "all" || parsed.month === Number(monthFilter);

      return yearOk && monthOk;
    });
  }

  function summaryTone(goodCount, badCount) {
    if (goodCount > badCount) return "good";
    if (badCount > goodCount) return "bad";
    return "gray";
  }

  function summaryText(goodCount, badCount) {
    if (goodCount > badCount) return `ดีขึ้น ${goodCount} ตัวชี้วัด`;
    if (badCount > goodCount) return `แย่ลง ${badCount} ตัวชี้วัด`;
    return "คงเดิม";
  }

  const all = Object.values(records);

  const availableYears = Array.from(
    new Set(
      all.flatMap((record) =>
        completedSessions(record)
          .map((s) => parseSessionDate(s.date)?.yearBE)
          .filter(Boolean)
      )
    )
  ).sort((a, b) => b - a);

  const [yearFilter, setYearFilter] = useState("all");
  const [monthFilter, setMonthFilter] = useState("all");
  const [ageFilter, setAgeFilter] = useState("all");
  const [adminSearch, setAdminSearch] = useState("");
  const [page, setPage] = useState(1);

  const ageOptions = [
    { value: "all", label: "ทุกช่วงอายุ" },
    { value: "unknown", label: "ไม่ระบุอายุ" },
    { value: "under20", label: "ต่ำกว่า 20 ปี" },
    { value: "20-29", label: "20–29 ปี" },
    { value: "30-39", label: "30–39 ปี" },
    { value: "40-49", label: "40–49 ปี" },
    { value: "50-59", label: "50–59 ปี" },
    { value: "60-69", label: "60–69 ปี" },
    { value: "70-79", label: "70–79 ปี" },
    { value: "80+", label: "80 ปีขึ้นไป" },
  ];

  const agerows = all.filter(
    (record) => ageFilter === "all" || adminAgeGroup(record.age) === ageFilter
  );

  const rows = agerows.map((record) => {
    const sessions = sessionsInPeriod(record, yearFilter, monthFilter);
    const first = sessions[0];
    const last = sessions[sessions.length - 1];

    const bodyFat = deltaFromSessions(sessions, metrics.inbody[2]);
    const fatMass = deltaFromSessions(sessions, metrics.inbody[4]);
    const weight = deltaFromSessions(sessions, metrics.inbody[0]);
    const muscle = deltaFromSessions(sessions, metrics.inbody[3]);

    const step = deltaFromSessions(sessions, metrics.fitness[0]);
    const grip = deltaFromSessions(sessions, metrics.fitness[1]);
    const sitstand = deltaFromSessions(sessions, metrics.fitness[2]);
    const sitreach = deltaFromSessions(sessions, metrics.fitness[3]);
    const tug = deltaFromSessions(sessions, metrics.fitness[4]);

    const ohsDelta =
      sessions.length >= 2
        ? {
            text: `${ohsSummary(first).normal}→${ohsSummary(last).normal}/6`,
            tone:
              ohsSummary(last).normal > ohsSummary(first).normal
                ? "good"
                : ohsSummary(last).normal < ohsSummary(first).normal
                  ? "bad"
                  : "gray",
          }
        : {
            text: "ข้อมูลไม่พอ",
            tone: "gray",
          };

    const badCount = [
      bodyFat,
      fatMass,
      weight,
      muscle,
      step,
      grip,
      sitstand,
      sitreach,
      tug,
      ohsDelta,
    ].filter((x) => x.tone === "bad").length;

    const goodCount = [
      bodyFat,
      fatMass,
      weight,
      muscle,
      step,
      grip,
      sitstand,
      sitreach,
      tug,
      ohsDelta,
    ].filter((x) => x.tone === "good").length;

    return {
      record,
      sessions,
      first,
      last,
      bodyFat,
      fatMass,
      weight,
      muscle,
      step,
      grip,
      sitstand,
      sitreach,
      tug,
      ohsDelta,
      badCount,
      goodCount,
    };
  });

  const comparable = rows.filter((r) => r.sessions.length >= 2);
  const notEnough = rows.filter((r) => r.sessions.length < 2);

  const improved = comparable.filter((r) => r.goodCount > r.badCount).length;
  const needFollow = comparable.filter((r) => r.badCount > r.goodCount).length;
  const noChange = comparable.filter((r) => r.goodCount === r.badCount).length;

  const ageLabel = ageOptions.find((x) => x.value === ageFilter)?.label || "ทุกช่วงอายุ";

  const periodLabel = `${yearFilter === "all" ? "ทุกปี" : `พ.ศ. ${yearFilter}`} • ${
    monthFilter === "all" ? "ทุกเดือน" : thaiMonths[Number(monthFilter) - 1]
  } • ${ageLabel}`;

  const searchText = adminSearch.trim().toLowerCase();

  const filteredComparable = comparable.filter((r) => {
    if (!searchText) return true;
    return `${r.record.hn} ${r.record.name}`.toLowerCase().includes(searchText);
  });

  const pageCount = Math.max(1, Math.ceil(filteredComparable.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);

  const pagedComparable = filteredComparable.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE
  );

  const ageSummaryRows = ageOptions
    .filter((x) => x.value !== "all")
    .map((ageOption) => {
      const groupRecords = all.filter(
        (record) => adminAgeGroup(record.age) === ageOption.value
      );

      const groupRows = groupRecords.map((record) => {
        const sessions = sessionsInPeriod(record, yearFilter, monthFilter);

        const bodyFat = deltaFromSessions(sessions, metrics.inbody[2]);
        const fatMass = deltaFromSessions(sessions, metrics.inbody[4]);
        const weight = deltaFromSessions(sessions, metrics.inbody[0]);
        const muscle = deltaFromSessions(sessions, metrics.inbody[3]);

        const step = deltaFromSessions(sessions, metrics.fitness[0]);
        const grip = deltaFromSessions(sessions, metrics.fitness[1]);
        const sitstand = deltaFromSessions(sessions, metrics.fitness[2]);
        const sitreach = deltaFromSessions(sessions, metrics.fitness[3]);
        const tug = deltaFromSessions(sessions, metrics.fitness[4]);

        const first = sessions[0];
        const last = sessions[sessions.length - 1];

        const ohsDelta =
          sessions.length >= 2
            ? {
                tone:
                  ohsSummary(last).normal > ohsSummary(first).normal
                    ? "good"
                    : ohsSummary(last).normal < ohsSummary(first).normal
                      ? "bad"
                      : "gray",
              }
            : {
                tone: "gray",
              };

        const badCount = [
          bodyFat,
          fatMass,
          weight,
          muscle,
          step,
          grip,
          sitstand,
          sitreach,
          tug,
          ohsDelta,
        ].filter((x) => x.tone === "bad").length;

        const goodCount = [
          bodyFat,
          fatMass,
          weight,
          muscle,
          step,
          grip,
          sitstand,
          sitreach,
          tug,
          ohsDelta,
        ].filter((x) => x.tone === "good").length;

        return {
          sessions,
          badCount,
          goodCount,
        };
      });

      const groupComparable = groupRows.filter((r) => r.sessions.length >= 2);

      return {
        age: ageOption.label,
        total: groupRecords.length,
        comparable: groupComparable.length,
        ดีขึ้น: groupComparable.filter((r) => r.goodCount > r.badCount).length,
        แย่ลง: groupComparable.filter((r) => r.badCount > r.goodCount).length,
        คงเดิม: groupComparable.filter((r) => r.goodCount === r.badCount).length,
        ข้อมูลไม่พอ: groupRows.filter((r) => r.sessions.length < 2).length,
      };
    });

  const urgentRows = comparable.filter((r) => {
    const latest = r.last;

    const fitnessBelow = metrics.fitness.some(
      ([key]) =>
        classifyFitness(r.record, key, valueOf(latest, key), latest).label ===
        "ต่ำกว่าเกณฑ์"
    );

    return (
      r.badCount > r.goodCount ||
      r.record.parq.some(Boolean) ||
      r.bodyFat.tone === "bad" ||
      r.fatMass.tone === "bad" ||
      r.muscle.tone === "bad" ||
      r.sitstand.tone === "bad" ||
      r.sitreach.tone === "bad" ||
      r.tug.tone === "bad" ||
      fitnessBelow
    );
  });

  const issueRows = [
    { name: "Body Fat เพิ่ม", count: comparable.filter((r) => r.bodyFat.tone === "bad").length },
    { name: "Fat Mass เพิ่ม", count: comparable.filter((r) => r.fatMass.tone === "bad").length },
    { name: "Muscle ลด", count: comparable.filter((r) => r.muscle.tone === "bad").length },
    { name: "Step Test แย่ลง", count: comparable.filter((r) => r.step.tone === "bad").length },
    { name: "Grip ลด", count: comparable.filter((r) => r.grip.tone === "bad").length },
    { name: "Sit to Stand ลด", count: comparable.filter((r) => r.sitstand.tone === "bad").length },
    { name: "Sit and Reach ลด", count: comparable.filter((r) => r.sitreach.tone === "bad").length },
    { name: "TUG แย่ลง", count: comparable.filter((r) => r.tug.tone === "bad").length },
    { name: "OHS ลดลง", count: comparable.filter((r) => r.ohsDelta.tone === "bad").length },
  ]
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const improvedRows = [
    { name: "Body Fat ลด", count: comparable.filter((r) => r.bodyFat.tone === "good").length },
    { name: "Fat Mass ลด", count: comparable.filter((r) => r.fatMass.tone === "good").length },
    { name: "Muscle เพิ่ม", count: comparable.filter((r) => r.muscle.tone === "good").length },
    { name: "Step Test ดีขึ้น", count: comparable.filter((r) => r.step.tone === "good").length },
    { name: "Grip เพิ่ม", count: comparable.filter((r) => r.grip.tone === "good").length },
    { name: "Sit to Stand เพิ่ม", count: comparable.filter((r) => r.sitstand.tone === "good").length },
    { name: "Sit and Reach เพิ่ม", count: comparable.filter((r) => r.sitreach.tone === "good").length },
    { name: "TUG ดีขึ้น", count: comparable.filter((r) => r.tug.tone === "good").length },
    { name: "OHS ดีขึ้น", count: comparable.filter((r) => r.ohsDelta.tone === "good").length },
  ]
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const incompleteSummary = [
    { label: "มีข้อมูล < 2 ครั้ง", value: notEnough.length },
    { label: "ไม่มีอายุ/เพศ", value: rows.filter((r) => !r.record.age || !r.record.sex).length },
    {
      label: "InBody ไม่ครบ",
      value: rows.filter((r) => {
        const latest = r.sessions.slice(-1)[0];
        return !latest || !latest.inbody.weight || !latest.inbody.fatMass || !latest.inbody.muscle;
      }).length,
    },
    {
      label: "Fitness ไม่ครบ",
      value: rows.filter((r) => {
        const latest = r.sessions.slice(-1)[0];
        return !latest || metrics.fitness.some(([key]) => !latest.fitness[key]);
      }).length,
    },
  ];

  const sexSummaryRows = ["ชาย", "หญิง", "อื่น ๆ"]
    .map((sexLabel) => {
      const groupRows = rows.filter((r) =>
        sexLabel === "อื่น ๆ"
          ? !["ชาย", "หญิง"].includes(r.record.sex)
          : r.record.sex === sexLabel
      );

      const groupComparable = groupRows.filter((r) => r.sessions.length >= 2);

      return {
        sex: sexLabel,
        total: groupRows.length,
        comparable: groupComparable.length,
        improved: groupComparable.filter((r) => r.goodCount > r.badCount).length,
        worsened: groupComparable.filter((r) => r.badCount > r.goodCount).length,
        unchanged: groupComparable.filter((r) => r.goodCount === r.badCount).length,
        incomplete: groupRows.filter((r) => r.sessions.length < 2).length,
      };
    })
    .filter((r) => r.total > 0);

  const fitnessBelowRows = metrics.fitness
    .map(([key, label]) => {
      const count = comparable.filter(
        (r) =>
          classifyFitness(r.record, key, valueOf(r.last, key), r.last).label ===
          "ต่ำกว่าเกณฑ์"
      ).length;

      const nameTh = label.split(" (")[0];
      const nameEn = label.includes("(")
        ? label.match(/\((.*?)\)/)?.[1] || ""
        : "";

      return {
        key,
        nameTh,
        nameEn,
        count,
      };
    })
    .sort((a, b) => b.count - a.count);

  const summaryChartRows = [
    { name: "ดีขึ้น", value: improved },
    { name: "ต้องติดตาม", value: needFollow },
    { name: "คงเดิม", value: noChange },
    { name: "ข้อมูลไม่พอ", value: notEnough.length },
  ];

  useEffect(() => {
    setPage(1);
  }, [yearFilter, monthFilter, ageFilter, adminSearch]);

  return (
    <main className="mx-auto max-w-7xl space-y-5 px-4 py-6">
      <Card title="สรุปภาพรวมแอดมิน" icon={ClipboardIcon}>
        <div className="mb-4 flex flex-nowrap items-center gap-2 overflow-x-auto whitespace-nowrap rounded-2xl border border-slate-200 bg-gradient-to-r from-slate-50 via-white to-slate-50 p-2 shadow-sm">
          <select
            value={yearFilter}
            onChange={(e) => setYearFilter(e.target.value)}
            className="h-10 w-[105px] shrink-0 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 outline-none"
          >
            <option value="all">ทุกปี</option>
            {availableYears.map((year) => (
              <option key={year} value={year}>
                พ.ศ. {year}
              </option>
            ))}
          </select>
        
          <select
            value={monthFilter}
            onChange={(e) => setMonthFilter(e.target.value)}
            className="h-10 w-[120px] shrink-0 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 outline-none"
          >
            <option value="all">ทุกเดือน</option>
            {thaiMonths.map((month, index) => (
              <option key={month} value={index + 1}>
                {month}
              </option>
            ))}
          </select>
        
          <select
            value={ageFilter}
            onChange={(e) => setAgeFilter(e.target.value)}
            className="h-10 w-[130px] shrink-0 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 outline-none"
          >
            {ageOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        
          <input
            value={adminSearch}
            onChange={(e) => setAdminSearch(e.target.value)}
            placeholder="ค้นหา HN / ชื่อ"
            className="h-10 w-[180px] shrink-0 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-700"
          />
        
          <button
            onClick={() => exportRecordsCSV(records)}
            className="h-10 shrink-0 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 hover:bg-slate-50"
          >
            Export Excel/CSV
          </button>
        
          <button
            onClick={onFullBackup}
            className="h-10 shrink-0 rounded-xl border border-emerald-200 bg-emerald-50 px-3 text-sm font-bold text-emerald-700 hover:bg-emerald-100"
          >
            Backup JSON
          </button>
        
          <button
            onClick={() => restoreInputRef.current?.click()}
            className="h-10 shrink-0 rounded-xl border border-amber-200 bg-amber-50 px-3 text-sm font-bold text-amber-700 hover:bg-amber-100"
          >
            Restore JSON
          </button>
        
          <button
            onClick={printPage}
            className="h-10 shrink-0 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 hover:bg-slate-50"
          >
            พิมพ์ / PDF
          </button>
        
          <input
            ref={restoreInputRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={handleRestoreFile}
          />
        </div>

        <div className="mb-4">
          <Pill tone="dark">{periodLabel}</Pill>
        </div>

        <div className="grid gap-3 md:grid-cols-5">
          <Info label="ทั้งหมด" value={`${rows.length} คน`} />
          <Info label="เทียบได้ ≥2 ครั้ง" value={`${comparable.length} คน`} />
          <Info label="ดีขึ้น" value={`${improved} คน`} tone="good" />
          <Info label="ต้องติดตาม" value={`${needFollow} คน`} tone={needFollow ? "fat" : "default"} />
          <Info label="คงเดิม" value={`${noChange} คน`} />
        </div>
        <div className="mt-5 rounded-3xl border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-slate-100 p-4 shadow-[0_12px_35px_rgba(15,23,42,0.08)] ring-1 ring-white/70">
        <div className="mb-3 flex items-center justify-between gap-3 border-b border-slate-200 pb-3">
          <div>
            <h3 className="text-base font-black text-slate-900">
              ตารางสรุปทุกคน สำหรับแอดมิน
            </h3>
            <p className="mt-0.5 text-xs font-medium text-slate-500">
              ภาพรวมรายบุคคลตามตัวกรองที่เลือก
            </p>
          </div>
      
          <span className="rounded-full border border-slate-200 bg-slate-900 px-3 py-1 text-xs font-bold text-white shadow-sm">
            Admin table
          </span>
        </div>
      
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-inner">
          <table className="w-full table-fixed text-left text-[10px]">
            <thead className="bg-slate-900 text-[10px] font-black uppercase tracking-wide text-white">
              <tr>
                <th className="px-1.5 py-2">HN / ชื่อ</th>
                <th className="px-1.5 py-2">ครั้ง</th>
                <th className="px-1.5 py-2">เทียบ</th>
                <th className="px-1.5 py-2">WT</th>
                <th className="px-1.5 py-2">BF%</th>
                <th className="px-1.5 py-2">FM</th>
                <th className="px-1.5 py-2">SMM</th>
                <th className="px-1.5 py-2">STEP</th>
                <th className="px-1.5 py-2">GRIP</th>
                <th className="px-1.5 py-2">STS</th>
                <th className="px-1.5 py-2">SAR</th>
                <th className="px-1.5 py-2">TUG</th>
                <th className="px-1.5 py-2">OHS</th>
                <th className="px-1.5 py-2">สรุป</th>
              </tr>
            </thead>
      
            <tbody>
              {pagedComparable.map((r) => (
                <tr
                  key={r.record.hn}
                  className={`border-t border-slate-100 transition hover:bg-slate-50 ${
                    r.badCount > r.goodCount ? "bg-rose-50/45" : ""
                  }`}
                >
                  <td className="px-2.5 py-2">
                    <div className="whitespace-nowrap font-bold text-slate-900">
                      HN {r.record.hn}
                    </div>
                    <div className="max-w-[130px] truncate text-[11px] text-slate-500">
                      {r.record.name || "-"}
                    </div>
                  </td>
      
                  <td className="px-2.5 py-2">
                    <Pill>{r.sessions.length} ครั้ง</Pill>
                  </td>
      
                  <td className="px-1.5 py-2 text-center text-[10px] font-bold leading-tight text-slate-700">
                    <div className="whitespace-nowrap">
                      {r.first?.no || "-"} → {r.last?.no || "-"}
                    </div>
                    <div className="mt-0.5 whitespace-nowrap text-[9px] font-semibold text-slate-500">
                      {shortThaiDate(r.first?.date)}
                    </div>
                    <div className="whitespace-nowrap text-[9px] font-semibold text-slate-500">
                      {shortThaiDate(r.last?.date)}
                    </div>
                  </td>
      
                  <td className="px-2.5 py-2">
                    <Pill tone={r.weight.tone}>{r.weight.text}</Pill>
                  </td>
      
                  <td className="px-2.5 py-2">
                    <Pill tone={r.bodyFat.tone}>{r.bodyFat.text}</Pill>
                  </td>
      
                  <td className="px-2.5 py-2">
                    <Pill tone={r.fatMass.tone}>{r.fatMass.text}</Pill>
                  </td>
      
                  <td className="px-2.5 py-2">
                    <Pill tone={r.muscle.tone}>{r.muscle.text}</Pill>
                  </td>
      
                  <td className="px-2.5 py-2">
                    <Pill tone={r.step.tone}>{r.step.text}</Pill>
                  </td>
      
                  <td className="px-2.5 py-2">
                    <Pill tone={r.grip.tone}>{r.grip.text}</Pill>
                  </td>
      
                  <td className="px-2.5 py-2">
                    <Pill tone={r.sitstand.tone}>{r.sitstand.text}</Pill>
                  </td>
      
                  <td className="px-2.5 py-2">
                    <Pill tone={r.sitreach.tone}>{r.sitreach.text}</Pill>
                  </td>
      
                  <td className="px-2.5 py-2">
                    <Pill tone={r.tug.tone}>{r.tug.text}</Pill>
                  </td>
      
                  <td className="px-2.5 py-2">
                    <Pill tone={r.ohsDelta.tone}>{r.ohsDelta.text}</Pill>
                  </td>
      
                  <td className="px-2.5 py-2">
                    <Pill tone={summaryTone(r.goodCount, r.badCount)}>
                      {summaryText(r.goodCount, r.badCount)}
                    </Pill>
                  </td>
                </tr>
              ))}
      
              {pagedComparable.length === 0 && (
                <tr>
                  <td colSpan="14" className="px-4 py-5 text-center text-sm text-slate-500">
                    ไม่มีข้อมูลที่เทียบได้ในช่วงที่เลือก
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500">
          <div>
            แสดง {pagedComparable.length} รายการต่อหน้า จากทั้งหมด {filteredComparable.length} รายการ • หน้า {safePage}/{pageCount}
          </div>
      
          <div className="flex gap-2">
            <button
              disabled={safePage <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40"
            >
              ก่อนหน้า
            </button>
      
            <button
              disabled={safePage >= pageCount}
              onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
              className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40"
            >
              ถัดไป
            </button>
          </div>
        </div>
      </div>
      </Card>

      <Card title="ภาพรวมผลลัพธ์" icon={ActivityIcon}>
        <div className="h-48">
          <ResponsiveContainer>
            <BarChart
              data={summaryChartRows}
              barCategoryGap="15%"
              margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" tick={{ fontSize: 14 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
              <Tooltip />
              <Bar dataKey="value" barSize={48} radius={[10, 10, 0, 0]}>
                {summaryChartRows.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={outcomeColor(entry.name)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card title="Key Insights / ผลลัพธ์เด่นและจุดที่ควรติดตาม" icon={ClipboardIcon}>

        <div className="grid gap-3 lg:grid-cols-4">
          <InsightListPanel
            title="ตัวชี้วัดที่ดีขึ้นบ่อย"
            tone="good"
            rows={improvedRows.map((row) => ({ label: row.name, count: row.count }))}
          />

          <InsightListPanel
            title="ตัวชี้วัดที่แย่ลงบ่อย"
            tone="bad"
            rows={issueRows.map((row) => ({ label: row.name, count: row.count }))}
          />

          <InsightListPanel
            title="Fitness ต่ำกว่าเกณฑ์"
            tone="bad"
            rows={fitnessBelowRows.map((row) => ({
              label: row.nameTh,
              sub: row.nameEn,
              count: row.count,
            }))}
          />

          <InsightListPanel
            title="ข้อมูลไม่ครบ"
            rows={incompleteSummary.map((row) => ({
              label: row.label,
              count: row.value,
            }))}
          />
        </div>
      </Card>

      <Card title="สรุปตามเพศและช่วงอายุ" icon={UserIcon}>
        <div className="grid gap-3 lg:grid-cols-[0.8fr_1.2fr]">
          <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-3 shadow-sm">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-black text-slate-900">เพศ</h3>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">
                Sex
              </span>
            </div>
      
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <table className="w-full text-left text-[11px]">
                <thead className="bg-slate-50 text-[10px] font-bold text-slate-500">
                  <tr>
                    <th className="px-2 py-1.5">กลุ่ม</th>
                    <th className="px-2 py-1.5 text-center">ทั้งหมด</th>
                    <th className="px-2 py-1.5 text-center">เทียบ</th>
                    <th className="px-2 py-1.5 text-center">ดี</th>
                    <th className="px-2 py-1.5 text-center">แย่</th>
                    <th className="px-2 py-1.5 text-center">นิ่ง</th>
                    <th className="px-2 py-1.5 text-center">ไม่พอ</th>
                  </tr>
                </thead>
      
                <tbody>
                  {sexSummaryRows.map((row) => (
                    <tr key={row.sex} className="border-t border-slate-100">
                      <td className="px-2 py-1.5 font-black text-slate-900">
                        {row.sex}
                      </td>
                      <td className="px-2 py-1.5 text-center font-semibold">{row.total}</td>
                      <td className="px-2 py-1.5 text-center font-semibold">{row.comparable}</td>
                      <td className="px-2 py-1.5 text-center">
                        <span className="inline-flex min-w-6 justify-center rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700 ring-1 ring-emerald-200">
                          {row.improved}
                        </span>
                      </td>
                      <td className="px-2 py-1.5 text-center">
                        <span className="inline-flex min-w-6 justify-center rounded-full bg-rose-50 px-1.5 py-0.5 text-[10px] font-bold text-rose-700 ring-1 ring-rose-200">
                          {row.worsened}
                        </span>
                      </td>
                      <td className="px-2 py-1.5 text-center">
                        <span className="inline-flex min-w-6 justify-center rounded-full bg-slate-50 px-1.5 py-0.5 text-[10px] font-bold text-slate-600 ring-1 ring-slate-200">
                          {row.unchanged}
                        </span>
                      </td>
                      <td className="px-2 py-1.5 text-center font-semibold text-slate-600">
                        {row.incomplete}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
      
          <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-3 shadow-sm">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-black text-slate-900">ช่วงอายุ</h3>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">
                Age group
              </span>
            </div>
      
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <table className="w-full text-left text-[11px]">
                <thead className="bg-slate-50 text-[10px] font-bold text-slate-500">
                  <tr>
                    <th className="px-2 py-1.5">กลุ่ม</th>
                    <th className="px-2 py-1.5 text-center">ทั้งหมด</th>
                    <th className="px-2 py-1.5 text-center">เทียบ</th>
                    <th className="px-2 py-1.5 text-center">ดี</th>
                    <th className="px-2 py-1.5 text-center">แย่</th>
                    <th className="px-2 py-1.5 text-center">นิ่ง</th>
                    <th className="px-2 py-1.5 text-center">ไม่พอ</th>
                  </tr>
                </thead>
      
                <tbody>
                  {ageSummaryRows.map((row) => (
                    <tr key={row.age} className="border-t border-slate-100">
                      <td className="whitespace-nowrap px-2 py-1.5 font-black text-slate-900">
                        {row.age}
                      </td>
                      <td className="px-2 py-1.5 text-center font-semibold">{row.total}</td>
                      <td className="px-2 py-1.5 text-center font-semibold">{row.comparable}</td>
                      <td className="px-2 py-1.5 text-center">
                        <span className="inline-flex min-w-6 justify-center rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700 ring-1 ring-emerald-200">
                          {row.ดีขึ้น}
                        </span>
                      </td>
                      <td className="px-2 py-1.5 text-center">
                        <span className="inline-flex min-w-6 justify-center rounded-full bg-rose-50 px-1.5 py-0.5 text-[10px] font-bold text-rose-700 ring-1 ring-rose-200">
                          {row.แย่ลง}
                        </span>
                      </td>
                      <td className="px-2 py-1.5 text-center">
                        <span className="inline-flex min-w-6 justify-center rounded-full bg-slate-50 px-1.5 py-0.5 text-[10px] font-bold text-slate-600 ring-1 ring-slate-200">
                          {row.คงเดิม}
                        </span>
                      </td>
                      <td className="px-2 py-1.5 text-center font-semibold text-slate-600">
                        {row.ข้อมูลไม่พอ}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </Card>
      
      <LmAdminDashboard records={records} />
      
      <AuditLogPanel auditLogs={auditLogs} />
    </main>
  );
}

function SidebarStatusBadge({ tone = "gray", children }) {
  const cls = {
    good: "border-emerald-200 bg-emerald-50 text-emerald-700",
    warn: "border-amber-200 bg-amber-50 text-amber-700",
    bad: "border-rose-200 bg-rose-50 text-rose-700",
    gray: "border-slate-200 bg-slate-50 text-slate-500",
    info: "border-sky-200 bg-sky-50 text-sky-700",
    dark: "border-slate-800 bg-slate-900 text-white",
  }[tone] || "border-slate-200 bg-slate-50 text-slate-500";

  return (
    <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-black ${cls}`}>
      {children}
    </span>
  );
}

function SidebarMenuButton({ active, icon, title, subtitle, badge, tone, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group flex w-full items-center gap-3 rounded-2xl border px-3 py-3 text-left transition ${
        active
          ? "border-slate-900 bg-slate-900 text-white shadow-sm"
          : "border-slate-200 bg-white text-slate-700 hover:border-sky-200 hover:bg-sky-50"
      }`}
    >
      <div
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border text-xs font-black ${
          active
            ? "border-white/20 bg-white/10 text-white"
            : "border-slate-200 bg-slate-50 text-slate-500 group-hover:border-sky-200 group-hover:bg-white group-hover:text-sky-700"
        }`}
      >
        {icon}
      </div>

      <div className="min-w-0 flex-1">
        <div className={`truncate text-sm font-black ${active ? "text-white" : "text-slate-900"}`}>
          {title}
        </div>

        {subtitle && (
          <div className={`mt-0.5 truncate text-xs font-semibold ${active ? "text-white/65" : "text-slate-400"}`}>
            {subtitle}
          </div>
        )}
      </div>

      {badge && (
        active ? (
          <span className="shrink-0 rounded-full border border-white/20 bg-white/10 px-2 py-0.5 text-[11px] font-black text-white">
            {badge}
          </span>
        ) : (
          <SidebarStatusBadge tone={tone}>{badge}</SidebarStatusBadge>
        )
      )}
    </button>
  );
}

function SidebarMenuGroup({ title, tone = "slate", children }) {
  const toneClass = {
    sky: {
      wrap: "border-sky-100 bg-sky-50/60",
      label: "text-sky-700",
      line: "bg-sky-300",
    },
    indigo: {
      wrap: "border-indigo-100 bg-indigo-50/50",
      label: "text-indigo-700",
      line: "bg-indigo-300",
    },
    emerald: {
      wrap: "border-emerald-100 bg-emerald-50/50",
      label: "text-emerald-700",
      line: "bg-emerald-300",
    },
    slate: {
      wrap: "border-slate-200 bg-slate-50/80",
      label: "text-slate-600",
      line: "bg-slate-300",
    },
  }[tone];

  return (
    <div className={`rounded-2xl border p-3 ${toneClass.wrap}`}>
      <div className="mb-3 flex items-center gap-2">
        <span className={`h-2 w-2 rounded-full ${toneClass.line}`} />

        <div
          className={`text-[11px] font-black uppercase tracking-wide ${toneClass.label}`}
        >
          {title}
        </div>
      </div>

      <div className="space-y-2">
        {children}
      </div>
    </div>
  );
}

const LM_ADMIN_PAGE_SIZE = 10;

const LM_ADMIN_CATEGORIES = [
  { key: "nutrition", thai: "โภชนาการ", max: 10 },
  { key: "physical", thai: "กิจกรรมทางกาย", max: 10 },
  { key: "sleep", thai: "การนอน", max: 10 },
  { key: "stress", thai: "ความเครียด", max: 5 },
  { key: "substances", thai: "สุรา/บุหรี่", max: 10 },
  { key: "relationship", thai: "ความสัมพันธ์", max: 5 },
];

function lmAnsweredCount(assessment = {}) {
  return LM_QUESTIONS.filter(
    (question) =>
      assessment.answers?.[question.id] !== undefined &&
      assessment.answers?.[question.id] !== null &&
      assessment.answers?.[question.id] !== ""
  ).length;
}

function lmRoundInfo(record, index) {
  const assessment =
    record.lmAssessments?.[index] || blankLmAssessment(index + 1);

  const answered = lmAnsweredCount(assessment);
  const calculated = calculateLmAssessment(assessment, record);

  return {
    no: index + 1,
    assessment,
    answered,
    complete: answered === LM_QUESTIONS.length,
    total: answered > 0 ? calculated.total : null,
    scores: calculated.scores,
  };
}

function lmCategoryQuestionCount(categoryKey) {
  return LM_QUESTIONS.filter((question) => question.category === categoryKey)
    .length;
}

function lmCategoryAnsweredCount(categoryKey, assessment = {}) {
  return LM_QUESTIONS.filter(
    (question) =>
      question.category === categoryKey &&
      assessment.answers?.[question.id] !== undefined &&
      assessment.answers?.[question.id] !== null &&
      assessment.answers?.[question.id] !== ""
  ).length;
}

function lmAdminRow(record) {
  const rounds = [0, 1, 2, 3].map((index) => lmRoundInfo(record, index));
  const hasAny = rounds.some((round) => round.answered > 0);
  const completeRounds = rounds.filter((round) => round.complete);

  const latestAny =
    [...rounds].reverse().find((round) => round.answered > 0) || null;

  const firstComplete = completeRounds[0] || null;
  const latestComplete = completeRounds[completeRounds.length - 1] || null;

  const comparable = completeRounds.length >= 2;

  const delta =
    comparable && firstComplete && latestComplete
      ? latestComplete.total - firstComplete.total
      : null;

  let status = "ยังไม่มีข้อมูล";
  let tone = "gray";

  if (hasAny && !latestAny?.complete) {
    status = "ยังไม่ครบ";
    tone = "warn";
  } else if (completeRounds.length === 1) {
    status = "รอติดตาม";
    tone = "warn";
  } else if (comparable && delta > 0) {
    status = "ดีขึ้น";
    tone = "good";
  } else if (comparable && delta < 0) {
    status = "ลดลง";
    tone = "bad";
  } else if (comparable && delta === 0) {
    status = "คงเดิม";
    tone = "gray";
  }

  const latestForCategory = latestComplete || latestAny;

  const categorySummary = latestForCategory
    ? LM_ADMIN_CATEGORIES.map((item) => {
        const score = latestForCategory.scores?.[item.key] ?? 0;
        const answered = lmCategoryAnsweredCount(
          item.key,
          latestForCategory.assessment
        );
        const totalQuestions = lmCategoryQuestionCount(item.key);
        const percent = (score / item.max) * 100;

        let catTone = "bad";
        if (percent >= 80) catTone = "good";
        else if (percent >= 60) catTone = "warn";

        return {
          ...item,
          score,
          answered,
          totalQuestions,
          tone: catTone,
        };
      })
    : [];

  const improvements = categorySummary
    .filter(
      (item) =>
        item.answered === item.totalQuestions && item.tone === "bad"
    )
    .sort((a, b) => a.score / a.max - b.score / b.max);

  return {
    hn: record.hn || "",
    name: record.name || "",
    hasAny,
    rounds,
    latestAny,
    latestComplete,
    firstComplete,
    completeRounds,
    comparable,
    delta,
    status,
    tone,
    improvements,
  };
}

  function LmAdminDashboard({ records }) {
    const [lmSearch, setLmSearch] = useState("");
      const [day, setDay] = useState("");
      const [month, setMonth] = useState("");
      const [year, setYear] = useState("");
  
    
    const [lmPage, setLmPage] = useState(1);
  
    const rows = useMemo(() => {
      return Object.values(records || {})
        .map((record) => lmAdminRow(record))
        .filter((row) => row.hasAny)
        .sort((a, b) => {
          if (a.comparable !== b.comparable) return a.comparable ? -1 : 1;
          return String(a.hn).localeCompare(String(b.hn));
        });
    }, [records]);
  
    const comparableRows = rows.filter((row) => row.comparable);
  
    const improvedCount = comparableRows.filter((row) => row.delta > 0).length;
    const worsenedCount = comparableRows.filter((row) => row.delta < 0).length;
    const unchangedCount = comparableRows.filter((row) => row.delta === 0).length;
  
    const latestCompleteRows = rows.filter((row) => row.latestComplete);
  
    const averageLatest =
      latestCompleteRows.length > 0
        ? (
            latestCompleteRows.reduce(
              (sum, row) => sum + row.latestComplete.total,
              0
            ) / latestCompleteRows.length
          ).toFixed(1)
        : "-";
  
    const averageDelta =
      comparableRows.length > 0
        ? (
            comparableRows.reduce((sum, row) => sum + row.delta, 0) /
            comparableRows.length
          ).toFixed(1)
        : "-";
  
    const chartData = [
      { name: "ดีขึ้น", value: improvedCount },
      { name: "คงเดิม", value: unchangedCount },
      { name: "ลดลง", value: worsenedCount },
    ];
  
    const searchText = lmSearch.trim().toLowerCase();
  
    function parseLmDate(value) {
    const text = String(value || "").trim();
    if (!text) return null;
  
    if (text.includes("/")) {
      const parts = text.split("/");
      const d = Number(parts[0]);
      const m = Number(parts[1]);
      const y = Number(parts[2]);
  
      if (!d || !m || !y) return null;
  
      return {
        day: d,
        month: m,
        yearBE: y < 2400 ? y + 543 : y,
        yearCE: y < 2400 ? y : y - 543,
      };
    }
  
    if (text.includes("-")) {
      const parts = text.split("-");
      const y = Number(parts[0]);
      const m = Number(parts[1]);
      const d = Number(String(parts[2] || "").slice(0, 2));
  
      if (!d || !m || !y) return null;
  
      return {
        day: d,
        month: m,
        yearBE: y < 2400 ? y + 543 : y,
        yearCE: y < 2400 ? y : y - 543,
      };
    }
  
    return null;
  }
  
  const filteredRows = rows.filter((row) => {
    const matchSearch =
      !searchText ||
      `${row.hn} ${row.name}`.toLowerCase().includes(searchText);
  
    const dateText =
      row.latestComplete?.assessment?.date ||
      row.latestAny?.assessment?.date ||
      "";
  
    const parsed = parseLmDate(dateText);
  
    const matchDay = !day || parsed?.day === Number(day);
    const matchMonth = !month || parsed?.month === Number(month);
    const matchYear =
      !year ||
      parsed?.yearBE === Number(year) ||
      parsed?.yearCE === Number(year);
  
    return matchSearch && matchDay && matchMonth && matchYear;
  });
    
    const filteredComparableRows = filteredRows.filter((row) => row.comparable);
    
    const filteredImprovedCount = filteredComparableRows.filter(
      (row) => row.delta > 0
    ).length;
    
    const filteredWorsenedCount = filteredComparableRows.filter(
      (row) => row.delta < 0
    ).length;
    
    const filteredUnchangedCount = filteredComparableRows.filter(
      (row) => row.delta === 0
    ).length;
    
    const filteredLatestCompleteRows = filteredRows.filter(
      (row) => row.latestComplete
    );
    
    const filteredAverageLatest =
      filteredLatestCompleteRows.length > 0
        ? (
            filteredLatestCompleteRows.reduce(
              (sum, row) => sum + row.latestComplete.total,
              0
            ) / filteredLatestCompleteRows.length
          ).toFixed(1)
        : "-";
    
    const filteredAverageDelta =
      filteredComparableRows.length > 0
        ? (
            filteredComparableRows.reduce((sum, row) => sum + row.delta, 0) /
            filteredComparableRows.length
          ).toFixed(1)
        : "-";
    
    const filteredChartData = [
      { name: "ดีขึ้น", value: filteredImprovedCount },
      { name: "คงเดิม", value: filteredUnchangedCount },
      { name: "ลดลง", value: filteredWorsenedCount },
    ];
  const pageCount = Math.max(
    1,
    Math.ceil(filteredRows.length / LM_ADMIN_PAGE_SIZE)
  );

  const safePage = Math.min(lmPage, pageCount);

  const pagedRows = filteredRows.slice(
    (safePage - 1) * LM_ADMIN_PAGE_SIZE,
    safePage * LM_ADMIN_PAGE_SIZE
  );

  useEffect(() => {
    setLmPage(1);
  }, [lmSearch, day, month, year]);

  function deltaText(row) {
    if (!row.comparable) return "-";
    if (row.delta > 0) return `+${row.delta}`;
    return `${row.delta}`;
  }

  function roundText(round) {
    if (round.total === null) return "-";
    return `${round.total}/50`;
  }

  return (
    <Card title="สรุปพฤติกรรมสุขภาพ LM สำหรับแอดมิน" icon={FileIcon}>
      <div className="space-y-5">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-sm font-bold text-slate-500">
              ผู้มีข้อมูล LM
            </div>
            <div className="mt-1 text-3xl font-black text-slate-900">
              {filteredRows.length}
            </div>
            <div className="mt-1 text-xs font-semibold text-slate-400">
              จากทั้งหมด {Object.values(records || {}).length} คน
            </div>
          </div>

          <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4">
            <div className="text-sm font-bold text-sky-700">
              มีข้อมูลครบ ≥2 ครั้ง
            </div>
            <div className="mt-1 text-3xl font-black text-sky-900">
              {filteredComparableRows.length}
            </div>
            <div className="mt-1 text-xs font-semibold text-sky-700/70">
              ใช้วิเคราะห์ดีขึ้น/ลดลง
            </div>
          </div>

          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
            <div className="text-sm font-bold text-emerald-700">
              คะแนนดีขึ้น
            </div>
            <div className="mt-1 text-3xl font-black text-emerald-900">
              {filteredImprovedCount}
            </div>
            <div className="mt-1 text-xs font-semibold text-emerald-700/70">
              เคส
            </div>
          </div>

          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4">
            <div className="text-sm font-bold text-rose-700">
              คะแนนลดลง
            </div>
            <div className="mt-1 text-3xl font-black text-rose-900">
              {filteredWorsenedCount}
            </div>
            <div className="mt-1 text-xs font-semibold text-rose-700/70">
              เคส
            </div>
          </div>

          <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-4">
            <div className="text-sm font-bold text-indigo-700">
              เฉลี่ยล่าสุด / เปลี่ยนแปลง
            </div>
            <div className="mt-1 text-2xl font-black text-indigo-900">
              {filteredAverageLatest}/50
            </div>
            <div className="mt-1 text-xs font-semibold text-indigo-700/70">
              เฉลี่ยเปลี่ยนแปลง {filteredAverageDelta === "-" ? "-" : `${filteredAverageDelta} คะแนน`}
            </div>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-[300px_minmax(0,1fr)]">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3">
              <div className="text-sm font-black text-slate-900">
                ผลการเปลี่ยนแปลงคะแนน LM
              </div>
              <div className="mt-0.5 text-xs font-semibold text-slate-400">
                นับเฉพาะเคสที่มีข้อมูลครบอย่างน้อย 2 ครั้ง
              </div>
            </div>

            <div className="h-64">
              <ResponsiveContainer>
                <BarChart data={filteredChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                  <Tooltip formatter={(value) => [`${value} เคส`, "จำนวน"]} />
                  <Bar dataKey="value" radius={[10, 10, 0, 0]} fill="#0f172a" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="text-sm font-black text-slate-900">
                  ตารางสรุป LM รายบุคคล
                </div>
                <div className="mt-0.5 text-xs font-semibold text-slate-400">
                  แสดง {LM_ADMIN_PAGE_SIZE} เคสต่อหน้า
                </div>
              </div>

              <div className="flex gap-2 items-center mb-3">
              
                <input
                  value={lmSearch}
                  onChange={(e) => setLmSearch(e.target.value)}
                  placeholder="ค้นหา HN / ชื่อ"
                  className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold outline-none focus:border-slate-700 lg:w-72"
                />
              
                <select
                  value={day}
                  onChange={(e) => setDay(e.target.value)}
                  className="h-11 w-20 rounded-xl border border-slate-200 bg-white px-2 text-sm font-semibold outline-none focus:border-slate-700"
                >
                  <option value="">ทุกวัน</option>
                  {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
                
                <select
                  value={month}
                  onChange={(e) => setMonth(e.target.value)}
                  className="h-11 w-28 rounded-xl border border-slate-200 bg-white px-2 text-sm font-semibold outline-none focus:border-slate-700"
                >
                  <option value="">ทุกเดือน</option>
                  <option value="1">มกราคม</option>
                  <option value="2">กุมภาพันธ์</option>
                  <option value="3">มีนาคม</option>
                  <option value="4">เมษายน</option>
                  <option value="5">พฤษภาคม</option>
                  <option value="6">มิถุนายน</option>
                  <option value="7">กรกฎาคม</option>
                  <option value="8">สิงหาคม</option>
                  <option value="9">กันยายน</option>
                  <option value="10">ตุลาคม</option>
                  <option value="11">พฤศจิกายน</option>
                  <option value="12">ธันวาคม</option>
                </select>
                
                <select
                  value={year}
                  onChange={(e) => setYear(e.target.value)}
                  className="h-11 w-24 rounded-xl border border-slate-200 bg-white px-2 text-sm font-semibold outline-none focus:border-slate-700"
                >
                  <option value="">ทุกปี</option>
                  {Array.from({ length: 15 }, (_, i) => 2566 + i).map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
                
             </div>
            </div>
              
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full min-w-[720px] text-left text-xs">
                <thead className="bg-slate-100/80 text-[11px] font-black uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-2 py-2 whitespace-nowrap">HN / ชื่อ</th>
                    <th className="px-2 py-2 whitespace-nowrap">ครั้งที่ 1</th>
                    <th className="px-2 py-2 whitespace-nowrap">ครั้งที่ 2</th>
                    <th className="px-2 py-2 whitespace-nowrap">ครั้งที่ 3</th>
                    <th className="px-2 py-2 whitespace-nowrap">ครั้งที่ 4</th>
                    <th className="px-2 py-2 whitespace-nowrap">เปลี่ยนแปลง</th>
                    <th className="px-2 py-2 whitespace-nowrap">สถานะ</th>
                    <th className="px-2 py-2 whitespace-nowrap">ควรปรับ</th>
                  </tr>
                </thead>
            
                <tbody>
                  {pagedRows.map((row) => (
                    <tr key={row.hn} className="border-t border-slate-100">
                      <td className="px-2 py-2 align-top">
                        <div className="whitespace-nowrap text-[11px] font-black leading-tight text-slate-900">
                          {row.hn}
                        </div>
                        <div className="max-w-[90px] truncate text-[10px] font-semibold leading-tight text-slate-500">
                          {row.name || "-"}
                        </div>
                      </td>
            
                      {row.rounds.map((round) => (
                        <td key={round.no} className="px-2 py-2 whitespace-nowrap align-top text-[11px]">
                          {roundText(round)}
                        </td>
                      ))}
            
                      <td className="px-2 py-2 whitespace-nowrap align-top">
                        <Pill tone={row.delta > 0 ? "good" : row.delta < 0 ? "bad" : "gray"}>
                          {deltaText(row)}
                        </Pill>
                      </td>
            
                      <td className="px-2 py-2 whitespace-nowrap align-top">
                        <Pill tone={row.tone}>{row.status}</Pill>
                      </td>
            
                      <td className="px-2 py-2 align-top">
                        <div className="flex flex-wrap gap-1">
                          {row.improvements.length ? (
                            row.improvements.map((item) => (
                              <Pill key={`${row.hn}-${item.key}`} tone="bad">
                                {item.thai} {item.score}/{item.max}
                              </Pill>
                            ))
                          ) : (
                            <span className="text-xs font-semibold text-slate-400">
                              -
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-500">
              <div>
                แสดง {pagedRows.length} รายการ จากทั้งหมด {filteredRows.length} รายการ • หน้า {safePage}/{pageCount}
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={safePage <= 1}
                  onClick={() => setLmPage((p) => Math.max(1, p - 1))}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                >
                  ก่อนหน้า
                </button>

                <button
                  type="button"
                  disabled={safePage >= pageCount}
                  onClick={() => setLmPage((p) => Math.min(pageCount, p + 1))}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                >
                  ถัดไป
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}

function Staff({ records, setRecords, adminUser, addAuditLog, refreshData }) {
  const first = Object.keys(records || {})[0] || "";
  
  const [hn, setHn] = useState("");
  const [draft, setDraft] = useState(() => normalizeRecord(blankRecord));

  const isCreatingNewRecord = !hn && !draft.hn;
  
  const [tab, setTab] = useState("general");
  const [idx, setIdx] = useState(0);
  const [exerciseDay, setExerciseDay] = useState("Full Body");
  const [staffSearch, setStaffSearch] = useState("");
  const [staffPage, setStaffPage] = useState(1);
  const [deletedBackup, setDeletedBackup] = useState(null);
  const staffSearchText = staffSearch.trim().toLowerCase();
  const filteredPatients = Object.values(records).filter((r) => {
    if (!staffSearchText) return true;
    return `${r.hn} ${r.name}`.toLowerCase().includes(staffSearchText);
  });
  const staffPageCount = Math.max(1, Math.ceil(filteredPatients.length / PAGE_SIZE));
  const safeStaffPage = Math.min(staffPage, staffPageCount);
  const pagedPatients = filteredPatients.slice((safeStaffPage - 1) * PAGE_SIZE, safeStaffPage * PAGE_SIZE);

  function selectRecord(x) {
    const selected = normalizeRecord(records[x]);
  
    setHn(x);
    setDraft(clone(selected));
    setIdx(0);
    setTab("general");
  }

  function update(path, value) {
    let next = setDeep(draft, path, value);
    if (path[0] === "sessions" && path[2] === "inbody" && path[3] === "weight") {
      next.sessions[path[1]].inbody.bmi = bmi(value, next.height);
    }
    if (path[0] === "height") {
      next.sessions = next.sessions.map((s) => ({ ...s, inbody: { ...s.inbody, bmi: bmi(s.inbody.weight, value) || s.inbody.bmi } }));
    }
    setDraft(next);
  }
  
  function updateProgramAndExerciseLog(path, value) {
    setDraft((old) => {
      const next = clone(old);
  
      let target = next;
      for (let i = 0; i < path.length - 1; i += 1) {
        target = target[path[i]];
      }
      target[path[path.length - 1]] = value;
  
      if (path.join(".") === "program.type") {
        next.exerciseLog = {
          ...(next.exerciseLog || {}),
          split: value,
        };
      }
  
      if (path.join(".") === "program.strengthFrequency") {
        next.exerciseLog = {
          ...(next.exerciseLog || {}),
          daysPerWeek: value,
        };
      }
  
      return next;
    });
  }
  
  async function save() {
    if (!draft.hn) return alert("กรุณากรอก HN");
    const quality = recordQuality(draft);
    if (quality.issues.length > 0) {
      const ok = window.confirm(`พบข้อมูลที่ควรตรวจสอบ ${quality.issues.length} รายการ

${quality.issues.slice(0, 8).join("\n")}

ต้องการบันทึกต่อหรือไม่?`);
      if (!ok) return;
    }
    const existed = Boolean(records[draft.hn]);
    const preparedDraft = {
      ...clone(draft),
      sessions: draft.sessions.map((s) => ({
        ...s,
        date: s.date || (sessionHasAnyData(s) ? todayThaiDateText() : ""),
      })),
    };
    const saved = { ...preparedDraft, updatedBy: adminUser?.name || "admin", updatedById: adminUser?.id || "admin", updatedAt: todayThai() };
    try {
      await saveRecordToSupabase(saved, adminUser);
      setRecords((old) => ({ ...old, [saved.hn]: saved }));
      addAuditLog(existed ? "แก้ไขข้อมูล" : "สร้าง HN ใหม่", saved.hn, existed ? "บันทึกการแก้ไขข้อมูลสุขภาพ" : "เพิ่มผู้รับบริการใหม่");
      setDraft(saved);
      setHn(saved.hn);
      await refreshData?.();
      alert("บันทึกข้อมูลลง Supabase แล้ว");
    } catch (error) {
      console.error(error);
      alert(`บันทึกข้อมูลไม่สำเร็จ: ${error.message || error}`);
    }
  }

  function createNew() {
    setHn("");
    setDraft(clone(blankRecord));
    setTab("general");
    setIdx(0);
  }

  async function deleteCurrentRecord() {
    const targetHN = String(draft.hn || hn || "").trim();
    if (!targetHN) return alert("ยังไม่มี HN ให้ลบ");
    if (!records[targetHN]) {
      alert("HN นี้ยังไม่ได้ถูกบันทึกในระบบ จึงไม่มีข้อมูลให้ลบ");
      createNew();
      return;
    }

    const ok = window.confirm(`ยืนยันการลบข้อมูล HN ${targetHN}

การลบนี้จะลบข้อมูลทั่วไป, PAR-Q, โปรแกรม และผลประเมินทั้ง 4 ครั้งของ HN นี้ออกจากระบบ

ต้องการลบจริงหรือไม่?`);
    if (!ok) return;

    const nextRecords = { ...records };
    const deletedRecord = clone(nextRecords[targetHN]);
    delete nextRecords[targetHN];

    try {
      await deleteRecordFromSupabase(targetHN, adminUser);
      setRecords(nextRecords);
      setDeletedBackup(deletedRecord);
      addAuditLog("ลบ HN", targetHN, "ลบข้อมูลผู้รับบริการทั้งชุดแบบ soft delete ใน Supabase");
      setHn("");
      setDraft(clone(blankRecord));
      setTab("general");
      setIdx(0);
      await refreshData?.();
      alert(`ลบข้อมูล HN ${targetHN} แล้ว`);
    } catch (error) {
      console.error(error);
      alert(`ลบข้อมูลไม่สำเร็จ: ${error.message || error}`);
    }
  }

  function restoreDeletedRecord() {
    if (!deletedBackup) return;
    setRecords((old) => ({ ...old, [deletedBackup.hn]: clone(deletedBackup) }));
    setHn(deletedBackup.hn);
    setDraft(clone(deletedBackup));
    addAuditLog("กู้คืน HN", deletedBackup.hn, "กู้คืนข้อมูลที่เพิ่งลบใน Prototype");
    setDeletedBackup(null);
    alert(`กู้คืนข้อมูล HN ${deletedBackup.hn} แล้ว`);
  }

  const generalComplete = Boolean(
  draft.hn &&
  draft.name &&
  draft.sex &&
  draft.age &&
  draft.height &&
  draft.goal
);

const parqRisk = Array.isArray(draft.parq) && draft.parq.some(Boolean);

const programComplete = Boolean(
  draft.program?.type &&
  draft.program?.strengthFrequency &&
  draft.program?.cardioDuration &&
  draft.program?.intensity
);

const exerciseDays = draft.exerciseLog?.days || {};
const exerciseDayCount = Object.values(exerciseDays).filter(
  (list) => Array.isArray(list) && list.length > 0
).length;

const exerciseLogComplete = Boolean(
  draft.exerciseLog?.split &&
  draft.exerciseLog?.daysPerWeek &&
  exerciseDayCount > 0
);

const lmRounds = Array.isArray(draft.lmAssessments)
  ? draft.lmAssessments
  : [];

const lmRoundStats = [0, 1, 2, 3].map((index) => {
  const assessment = lmRounds[index] || blankLmAssessment(index + 1);

  const answered = LM_QUESTIONS.filter(
    (question) =>
      assessment.answers?.[question.id] !== undefined &&
      assessment.answers?.[question.id] !== null &&
      assessment.answers?.[question.id] !== ""
  ).length;

  const calculated = calculateLmAssessment(assessment, draft);

  return {
    answered,
    total: answered > 0 ? calculated.total : null,
  };
});

const latestLmRound =
  [...lmRoundStats].reverse().find((item) => item.answered > 0) || {
    answered: 0,
    total: null,
  };

const lmMenuTone =
  latestLmRound.answered === 0
    ? "gray"
    : latestLmRound.answered < 16
      ? "warn"
      : "good";

const lmMenuBadge =
  latestLmRound.answered === 0
    ? "รอกรอก"
    : latestLmRound.answered < 16
      ? `${latestLmRound.answered}/16`
      : `${latestLmRound.total}/50`;
  
const sessionDone = [0, 1, 2, 3].map((index) =>
  sessionHasAnyData(draft.sessions?.[index])
);

const screeningMenuItems = [
  {
    key: "general",
    icon: "ID",
    title: "ข้อมูลทั่วไป",
    subtitle: "HN / ประวัติพื้นฐาน",
    badge: generalComplete ? "ครบ" : "ยังไม่ครบ",
    tone: generalComplete ? "good" : "warn",
    active: tab === "general",
    done: generalComplete,
    onClick: () => setTab("general"),
  },
  {
    key: "lm",
    icon: "LM",
    title: "แบบประเมิน LM",
    subtitle: "พฤติกรรมสุขภาพ 6 หมวด",
    badge: lmMenuBadge,
    tone: lmMenuTone,
    active: tab === "lm",
    done: latestLmRound.answered === 16,
    onClick: () => setTab("lm"),
  },
  {
    key: "parq",
    icon: "PQ",
    title: "PAR-Q",
    subtitle: "คัดกรองก่อนออกกำลังกาย",
    badge: parqRisk ? "ต้องประเมิน" : "ผ่าน",
    tone: parqRisk ? "bad" : "good",
    active: tab === "parq",
    done: !parqRisk,
    onClick: () => setTab("parq"),
  },
];

const carePlanMenuItems = [
  {
    key: "program",
    icon: "PG",
    title: "โปรแกรม",
    subtitle: "Exercise Prescription",
    badge: programComplete ? "ครบ" : "ยังไม่ครบ",
    tone: programComplete ? "good" : "warn",
    active: tab === "program",
    done: programComplete,
    onClick: () => setTab("program"),
  },
  {
    key: "exerciseLog",
    icon: "EX",
    title: "Trainer Exercise Log",
    subtitle: exerciseDayCount ? `${exerciseDayCount} รูปแบบวันฝึก` : "ยังไม่เลือกท่า",
    badge: exerciseLogComplete ? "ครบ" : "ยังไม่ครบ",
    tone: exerciseLogComplete ? "good" : "warn",
    active: tab === "exerciseLog",
    done: exerciseLogComplete,
    onClick: () => setTab("exerciseLog"),
  },
];

const sessionMenuItems = [0, 1, 2, 3].map((index) => ({
  key: `session-${index}`,
  icon: `${index + 1}`,
  title: `บันทึกครั้งที่ ${index + 1}`,
  subtitle: sessionDone[index] ? "มีข้อมูลแล้ว" : "ยังไม่เริ่ม",
  badge: sessionDone[index] ? "มีข้อมูล" : "ว่าง",
  tone: sessionDone[index] ? "good" : "gray",
  active: tab === "session" && idx === index,
  done: sessionDone[index],
  onClick: () => {
    setIdx(index);
    setTab("session");
  },
}));

const allMenuItems = [
  ...screeningMenuItems,
  ...carePlanMenuItems,
  ...sessionMenuItems,
];
const menuDoneCount = allMenuItems.filter((item) => item.done).length;
const menuProgress = Math.round((menuDoneCount / allMenuItems.length) * 100);
  
  return (
    <main className="mx-auto grid max-w-7xl gap-5 px-4 py-6 lg:grid-cols-[280px_1fr]">
      <aside className="space-y-4">
        <Card title="รายชื่อ HN" icon={UserIcon}>
          <button
            type="button"
            onClick={createNew}
            className={`mb-4 w-full rounded-xl border px-4 py-3 text-base font-bold transition ${
              isCreatingNewRecord
                ? "border-sky-300 bg-sky-600 text-white shadow-sm hover:bg-sky-700"
                : "border-sky-200 bg-sky-50 text-sky-800 hover:border-sky-300 hover:bg-sky-100"
            }`}
          >
            + เพิ่ม HN ใหม่
          </button>
          <div className="mb-3"><Field label="ค้นหา HN / ชื่อ" value={staffSearch} onChange={(v) => { setStaffSearch(v); setStaffPage(1); }} /></div>
          <div className="space-y-2">{pagedPatients.map((r) => <button key={r.hn} onClick={() => selectRecord(r.hn)} className={`w-full rounded-xl border px-3 py-3 text-left text-base ${hn === r.hn ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}><div className="font-bold">HN {r.hn}</div><div className="truncate text-sm opacity-70">{r.name}</div></button>)}</div>
          <div className="mt-3 flex items-center justify-between gap-2 text-sm text-slate-500">
            <span>{filteredPatients.length} รายการ • หน้า {safeStaffPage}/{staffPageCount}</span>
            <div className="flex gap-1">
              <button onClick={() => setStaffPage(Math.max(1, safeStaffPage - 1))} disabled={safeStaffPage <= 1} className="rounded-lg border border-slate-200 bg-white px-3 py-1 font-semibold disabled:opacity-40">ก่อนหน้า</button>
              <button onClick={() => setStaffPage(Math.min(staffPageCount, safeStaffPage + 1))} disabled={safeStaffPage >= staffPageCount} className="rounded-lg border border-slate-200 bg-white px-3 py-1 font-semibold disabled:opacity-40">ถัดไป</button>
            </div>
          </div>
        </Card>
        <Card
          title="เมนู"
          icon={ClipboardIcon}
          right={
            <SidebarStatusBadge tone={menuDoneCount === allMenuItems.length ? "good" : "info"}>
              {menuDoneCount}/{allMenuItems.length}
            </SidebarStatusBadge>
          }
        >
          <div className="space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="text-xs font-black text-slate-500">
                  ความครบถ้วนข้อมูล
                </div>
        
                <div className="text-xs font-black text-slate-700">
                  {menuProgress}%
                </div>
              </div>
        
              <div className="h-2 overflow-hidden rounded-full bg-white">
                <div
                  className="h-full rounded-full bg-slate-900 transition-all"
                  style={{ width: `${menuProgress}%` }}
                />
              </div>
            </div>
        
            <SidebarMenuGroup title="ข้อมูลและการคัดกรอง" tone="sky">
              {screeningMenuItems.map((item) => (
                <SidebarMenuButton
                  key={item.key}
                  active={item.active}
                  icon={item.icon}
                  title={item.title}
                  subtitle={item.subtitle}
                  badge={item.badge}
                  tone={item.tone}
                  onClick={item.onClick}
                />
              ))}
            </SidebarMenuGroup>
            
            <SidebarMenuGroup title="แผนการดูแล / ออกกำลังกาย" tone="indigo">
              {carePlanMenuItems.map((item) => (
                <SidebarMenuButton
                  key={item.key}
                  active={item.active}
                  icon={item.icon}
                  title={item.title}
                  subtitle={item.subtitle}
                  badge={item.badge}
                  tone={item.tone}
                  onClick={item.onClick}
                />
              ))}
            </SidebarMenuGroup>
        
            <SidebarMenuGroup title="การติดตามผล" tone="emerald">
              {sessionMenuItems.map((item) => (
                <SidebarMenuButton
                  key={item.key}
                  active={item.active}
                  icon={item.icon}
                  title={item.title}
                  subtitle={item.subtitle}
                  badge={item.badge}
                  tone={item.tone}
                  onClick={item.onClick}
                />
              ))}
            </SidebarMenuGroup>
        
            <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold leading-5 text-slate-500">
              ดู badge ด้านขวาเพื่อเช็กว่าส่วนไหนกรอกครบแล้วหรือยังต้องตรวจ
            </div>
          </div>
        </Card>
      </aside>

      <section className="space-y-5">
        <section className="rounded-2xl border border-slate-300 bg-white px-4 py-3 shadow-md">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <h2 className="text-2xl font-black tracking-tight text-slate-900">
                  บันทึกข้อมูลสุขภาพ
                </h2>
        
                <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-bold text-slate-500">
                  ระบบบันทึกและติดตาม 4 ครั้ง
                </span>
              </div>
        
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm font-semibold text-slate-500">
                <span>
                  ผู้บันทึก:{" "}
                  <span className="font-bold text-slate-700">
                    {show(adminUser?.name)}
                  </span>
                </span>
        
                <span className="hidden text-slate-300 md:inline">•</span>
        
                <span>
                  Admin ID:{" "}
                  <span className="font-bold text-slate-700">
                    {show(adminUser?.id)}
                  </span>
                </span>
        
                <span className="hidden text-slate-300 md:inline">•</span>
        
                <span>
                  แก้ไขล่าสุด:{" "}
                  <span className="font-bold text-slate-700">
                    {formatDateTimeThai(draft.updatedAt)}
                  </span>
                </span>
        
                <span className="hidden text-slate-300 md:inline">•</span>
        
                <span>
                  โดย{" "}
                  <span className="font-bold text-slate-700">
                    {show(draft.updatedBy)}
                  </span>
                </span>
              </div>
            </div>
        
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              {deletedBackup && (
                <button
                  type="button"
                  onClick={restoreDeletedRecord}
                  className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-bold text-amber-700 transition hover:bg-amber-100"
                >
                  กู้คืน HN ที่ลบล่าสุด
                </button>
              )}
        
              <button
                type="button"
                onClick={deleteCurrentRecord}
                className="rounded-xl border border-rose-200 bg-white px-4 py-2 text-sm font-bold text-rose-600 transition hover:bg-rose-50"
              >
                ลบ HN นี้
              </button>
        
              <button
                type="button"
                onClick={save}
                className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-700"
              >
                บันทึกข้อมูล
              </button>
            </div>
          </div>
        </section>
        <DataQualityPanel record={draft} />
        {tab === "general" && <GeneralForm draft={draft} update={update} />}     
        {tab === "lm" && <LmAssessmentForm draft={draft} update={update} />}
        {tab === "parq" && <ParqForm draft={draft} update={update} />}
        {tab === "program" && (
          <ProgramForm draft={draft} update={updateProgramAndExerciseLog} />
        )}
        
        {tab === "exerciseLog" && (
          <Card title="Trainer Exercise Log" icon={ActivityIcon}>
            <div className="grid gap-4 md:grid-cols-3">
              <Select
                label="Split"
                value={draft.exerciseLog?.split || "Full Body"}
                onChange={(v) => update(["exerciseLog", "split"], v)}
                options={["Full Body", "Upper / Lower", "PPL", "Hybrid / Mixed"]}
              />
        
              <Select
                label="วัน/สัปดาห์"
                value={draft.exerciseLog?.daysPerWeek || "3"}
                onChange={(v) => update(["exerciseLog", "daysPerWeek"], v)}
                options={["2", "3", "4", "5", "6"]}
              />
        
              <Select
                label="เหตุผลการปรับ"
                value={draft.exerciseLog?.updateReason || ""}
                onChange={(v) => update(["exerciseLog", "updateReason"], v)}
                options={["", "เพิ่มระดับการฝึก", "ลดระดับการฝึก", "เปลี่ยนตามเวลา", "มีอาการเจ็บ", "เปลี่ยนเป้าหมาย"]}
              />
            </div>
              <div className="mt-5 rounded-2xl border border-sky-200 bg-sky-50 p-4">
                <div className="text-sm font-bold text-sky-700">
                  คำอธิบายโปรแกรมอัตโนมัติ
                </div>
                  {exercisePlanWarning(
                    draft.exerciseLog?.split || "Full Body",
                    draft.exerciseLog?.daysPerWeek || "3",
                    draft.exerciseLog?.days
                  ) && (
                    <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800">
                      {exercisePlanWarning(
                        draft.exerciseLog?.split || "Full Body",
                        draft.exerciseLog?.daysPerWeek || "3",
                        draft.exerciseLog?.days
                      )}
                    </div>
                  )}
                <div className="mt-1 text-lg font-black text-slate-900">
                  {exercisePlanDescription(
                    draft.exerciseLog?.split || "Full Body",
                    draft.exerciseLog?.daysPerWeek || "3",
                    draft.exerciseLog?.days
                  )}
                </div>
              
                <div className="mt-2 text-sm font-semibold text-slate-500">
                  ระบบจะนำข้อความนี้ไปแสดงในหน้า HN เพื่อให้ผู้รับบริการเข้าใจง่าย
                </div>
              </div>
            <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="mb-3 text-base font-bold text-slate-700">
                เลือกวันฝึก
              </div>
        
              <div className="flex flex-wrap gap-2">
                {(draft.exerciseLog?.split === "Full Body"
                  ? ["Full Body"]
                  : draft.exerciseLog?.split === "Upper / Lower"
                  ? ["Upper Day", "Lower Day"]
                  : draft.exerciseLog?.split === "PPL"
                  ? ["Push Day", "Pull Day", "Legs Day"]
                  : ["Full Body", "Upper Day", "Lower Day", "Push Day", "Pull Day", "Legs Day"]
                ).map((day) => (
                  <button
                    key={day}
                    type="button"
                    onClick={() => setExerciseDay(day)}
                    className={`rounded-xl px-4 py-3 text-base font-bold shadow-sm ${
                      exerciseDay === day
                        ? "bg-slate-900 text-white"
                        : "bg-white text-slate-700 hover:bg-slate-100"
                    }`}
                  >
                    {day}
                  </button>
                ))}
              </div>
            </div>
              <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-4">
                <div className="mb-3 text-base font-bold text-slate-700">
                  เลือกท่าออกกำลังกาย
                </div>
              
                <div className="grid gap-4 md:grid-cols-2">
                  {groupsForExerciseDay(exerciseDay).map((group) => (
                    <div key={group} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <div className="mb-3 text-sm font-black uppercase text-slate-500">
                        {group}
                      </div>
              
                      <div className="flex flex-wrap gap-2">
                        {exerciseOptions[group].map((exercise) => {
                          const dayKey = dayKeyFromLabel(exerciseDay);
                          const selectedExercises = draft.exerciseLog?.days?.[dayKey] || [];
                          const isSelected = selectedExercises.includes(exercise);
                        
                          return (
                            <button
                              key={exercise}
                              type="button"
                              onClick={() =>
                                update(
                                  ["exerciseLog", "days", dayKey],
                                  toggleExercise(selectedExercises, exercise)
                                )
                              }
                              className={`rounded-full border px-4 py-2 text-sm font-semibold ${
                                isSelected
                                  ? "border-slate-900 bg-slate-900 text-white"
                                  : "border-slate-200 bg-white text-slate-700 hover:bg-slate-100"
                              }`}
                            >
                              {exercise}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                  <div className="mb-3 text-base font-bold text-emerald-800">
                    ลำดับท่าที่เลือก
                  </div>
                
                  <ol className="list-decimal space-y-1 pl-5 text-base font-semibold text-slate-800">
                    {(draft.exerciseLog?.days?.[dayKeyFromLabel(exerciseDay)] || []).length ? (
                      (draft.exerciseLog?.days?.[dayKeyFromLabel(exerciseDay)] || []).map((exercise) => (
                        <li key={exercise}>{exercise}</li>
                      ))
                    ) : (
                      <li>ยังไม่ได้เลือกท่า</li>
                    )}
                  </ol>
                </div>
              </div>
            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => {
                  const currentLog = draft.exerciseLog || {};
                  const warning = exercisePlanWarning(
                    currentLog.split || "Full Body",
                    currentLog.daysPerWeek || "3",
                    currentLog.days
                  );
                
                  if (warning) {
                    alert(warning);
                    return;
                  }
                  
                  const oldProgram =
                    currentLog.updatedTo ||
                    `${currentLog.split || "Full Body"} ${currentLog.daysPerWeek || "3"} วัน/สัปดาห์`;

                  const planDescription = exercisePlanDescription(
                    currentLog.split || "Full Body",
                    currentLog.daysPerWeek || "3",
                    currentLog.days || {}
                  );
                  
                  const newProgram =
                    `${currentLog.split || "Full Body"} ${currentLog.daysPerWeek || "3"} วัน/สัปดาห์`;
                  
                  const historyItem = {
                    from: oldProgram,
                    to: newProgram,
                    by: adminUser?.name || draft.updatedBy || "Trainer",
                    at: new Date().toISOString(),
                    reason: currentLog.updateReason || "",
                  };
                  
                  update(["exerciseLog"], {
                    ...currentLog,
                    description: planDescription,
                    updatedFrom: oldProgram,
                    updatedTo: newProgram,
                    updatedBy: historyItem.by,
                    updatedAt: historyItem.at,
                    history: [historyItem, ...(currentLog.history || [])].slice(0, 4),
                  });
            
                  alert("บันทึกโปรแกรมแล้ว");
                }}
                className="rounded-xl bg-emerald-600 px-5 py-3 text-base font-bold text-white hover:bg-emerald-700"
              >
                บันทึกโปรแกรม
              </button>
            </div>
          </Card>
        )}
        
        {tab === "session" && <SessionForm draft={draft} update={update} idx={idx} />}
      </section>
    </main>
  );
}

const LM_SCORE_OPTIONS = {
  count0to10: ["<1", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10+"],
  aerobicTime: [
    "<30 นาที",
    "30 นาที",
    "45 นาที",
    "1 ชม.",
    "1.5 ชม.",
    "2 ชม.",
    "2.5 ชม.",
    "3 ชม.",
    "3.5 ชม.",
    "4 ชม.",
    "4.5 ชม.",
    "5+ ชม.",
  ],
  yesNo: ["ใช่", "ไม่ใช่"],
};

const LM_QUESTIONS = [
  {
    id: "n1",
    category: "nutrition",
    categoryLabel: "Nutrition / โภชนาการ",
    maxCategoryScore: 10,
    text: "จำนวนมื้ออาหารนอกบ้านหรืออาหารกล่อง/ถุงนอกบ้าน ใน 1 สัปดาห์",
    options: LM_SCORE_OPTIONS.count0to10,
    scores: [1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0],
  },
  {
    id: "n2",
    category: "nutrition",
    categoryLabel: "Nutrition / โภชนาการ",
    maxCategoryScore: 10,
    text: "จำนวนแก้วที่ดื่มเครื่องดื่มรสหวานใน 1 สัปดาห์",
    options: LM_SCORE_OPTIONS.count0to10,
    scores: [3, 3, 1, 0, 0, 0, 0, 0, 0, 0, 0],
  },
  {
    id: "n3",
    category: "nutrition",
    categoryLabel: "Nutrition / โภชนาการ",
    maxCategoryScore: 10,
    text: "กินผลไม้กี่ส่วนต่อวัน",
    options: LM_SCORE_OPTIONS.count0to10,
    scores: [0, 0, 0, 2, 3, 2, 2, 0, 0, 0, 0],
  },
  {
    id: "n4",
    category: "nutrition",
    categoryLabel: "Nutrition / โภชนาการ",
    maxCategoryScore: 10,
    text: "กินผักกี่ส่วนต่อวัน",
    options: LM_SCORE_OPTIONS.count0to10,
    scores: [0, 0, 1, 1, 2, 2, 3, 3, 3, 2, 2],
  },

  {
    id: "pa5",
    category: "physical",
    categoryLabel: "Physical Activity / กิจกรรมทางกาย",
    maxCategoryScore: 10,
    text: "จำนวนวันที่ออกกำลังกายแบบแรงต้านใน 1 สัปดาห์",
    options: LM_SCORE_OPTIONS.count0to10,
    scores: [0, 1, 2, 2, 2, 2, 2, 2, null, null, null],
  },
  {
    id: "pa6",
    category: "physical",
    categoryLabel: "Physical Activity / กิจกรรมทางกาย",
    maxCategoryScore: 10,
    text: "จำนวนชั่วโมงที่นั่งอยู่กับที่ต่อวัน",
    options: LM_SCORE_OPTIONS.count0to10,
    scores: [3, 3, 3, 3, 3, 3, 1, 1, 0, 0, 0],
  },
  {
    id: "pa7",
    category: "physical",
    categoryLabel: "Physical Activity / กิจกรรมทางกาย",
    maxCategoryScore: 10,
    text: "จำนวนชั่วโมงต่อสัปดาห์ที่ออกกำลังกายชนิดแอโรบิก",
    options: LM_SCORE_OPTIONS.aerobicTime,
    scores: [0, 1, 1, 2, 3, 4, 5, 5, 5, 5, 5, 5],
  },

  {
    id: "s8",
    category: "sleep",
    categoryLabel: "Sleep / การนอน",
    maxCategoryScore: 10,
    text: "จำนวนชั่วโมงการนอนต่อวัน",
    options: LM_SCORE_OPTIONS.count0to10,
    scores: [0, 0, 0, 0, 0, 0, 0, 5, 6, 6, 6],
  },
  {
    id: "s9",
    category: "sleep",
    categoryLabel: "Sleep / การนอน",
    maxCategoryScore: 10,
    text: "ส่วนใหญ่ตื่นเช้ามาด้วยความรู้สึกสดชื่นกระปรี้กระเปร่า",
    options: LM_SCORE_OPTIONS.yesNo,
    scores: [2, 1],
  },
  {
    id: "s10",
    category: "sleep",
    categoryLabel: "Sleep / การนอน",
    maxCategoryScore: 10,
    text: "มักมีอาการหลับ ๆ ตื่น ๆ",
    options: LM_SCORE_OPTIONS.yesNo,
    scores: [1, 2],
  },

  {
    id: "st11",
    category: "stress",
    categoryLabel: "Stress / ความเครียด",
    maxCategoryScore: 5,
    text: "มีกิจกรรมส่งเสริม ฝึกจิตใจ ฝึกสมาธิ อย่างน้อย 2 ครั้ง",
    options: LM_SCORE_OPTIONS.yesNo,
    scores: [2, 0],
  },
  {
    id: "st12",
    category: "stress",
    categoryLabel: "Stress / ความเครียด",
    maxCategoryScore: 5,
    text: "รู้สึกว่าโดยปกติสามารถจัดการความเครียดได้อย่างดี",
    options: LM_SCORE_OPTIONS.yesNo,
    scores: [3, 0],
  },

  {
    id: "sub13",
    category: "substances",
    categoryLabel: "Substances / สุรา บุหรี่ และสารเสพติด",
    maxCategoryScore: 10,
    text: "จำนวนดื่มมาตรฐานของเครื่องดื่มแอลกอฮอล์ต่อวัน",
    options: LM_SCORE_OPTIONS.count0to10,
    scores: [4, 4, "sexBased", 0, 0, 0, 0, 0, 0, 0, 0],
  },
  {
    id: "sub14",
    category: "substances",
    categoryLabel: "Substances / สุรา บุหรี่ และสารเสพติด",
    maxCategoryScore: 10,
    text: "สูบบุหรี่ บุหรี่ไฟฟ้า หรือสารเสพติด",
    options: LM_SCORE_OPTIONS.yesNo,
    scores: [0, 6],
  },

  {
    id: "rel15",
    category: "relationship",
    categoryLabel: "Relationship & Health Literacy / ความสัมพันธ์และความรอบรู้สุขภาพ",
    maxCategoryScore: 5,
    text: "สามารถรับฟังความเห็นต่างของผู้อื่นเป็นส่วนใหญ่",
    options: LM_SCORE_OPTIONS.yesNo,
    scores: [2, 0],
  },
  {
    id: "rel16",
    category: "relationship",
    categoryLabel: "Relationship & Health Literacy / ความสัมพันธ์และความรอบรู้สุขภาพ",
    maxCategoryScore: 5,
    text: "พูดคุย หรือพบปะกับเพื่อนสนิท คนในครอบครัว ≥ 3 ครั้ง",
    options: LM_SCORE_OPTIONS.yesNo,
    scores: [3, 0],
  },
];

function lmQuestionScore(question, answerIndex, record = {}) {
  if (answerIndex === "" || answerIndex === null || answerIndex === undefined) {
    return null;
  }

  const index = Number(answerIndex);
  const rawScore = question.scores?.[index];

  if (rawScore === null || rawScore === undefined) return null;

  if (rawScore === "sexBased") {
    const isFemale = String(record.sex || "").includes("หญิง");
    return isFemale ? 0 : 4;
  }

  const score = Number(rawScore);
  return Number.isFinite(score) ? score : null;
}

function calculateLmAssessment(assessment = {}, record = {}) {
  const answers = assessment.answers || {};

  const scores = {
    nutrition: 0,
    physical: 0,
    sleep: 0,
    stress: 0,
    substances: 0,
    relationship: 0,
  };

  LM_QUESTIONS.forEach((question) => {
    const score = lmQuestionScore(question, answers[question.id], record);
    if (score !== null) {
      scores[question.category] += score;
    }
  });

  const total = Object.values(scores).reduce((sum, value) => sum + value, 0);

  return {
    scores,
    total,
  };
}

function lmScoreInterpret(total) {
  const score = Number(total);

  if (!Number.isFinite(score)) {
    return {
      label: "ยังไม่มีข้อมูล",
      tone: "gray",
      text: "ยังไม่มีข้อมูลเพียงพอสำหรับแปลผล",
    };
  }

  if (score <= 20) {
    return {
      label: "ต่ำกว่าค่าเฉลี่ย",
      tone: "bad",
      text: "เป็นโอกาสดีที่จะได้รับคำแนะนำเพื่อปรับวิถีชีวิตให้ดีขึ้น",
    };
  }

  if (score <= 30) {
    return {
      label: "เท่าค่าเฉลี่ย",
      tone: "warn",
      text: "มีวิถีชีวิตที่เหมาะสมในบางเรื่อง และยังมีบางส่วนที่ปรับเพิ่มได้",
    };
  }

  if (score <= 40) {
    return {
      label: "ดีมาก",
      tone: "good",
      text: "มีพฤติกรรมสุขภาพที่ดีหลายด้าน แต่ยังมีบางเรื่องที่พัฒนาเพิ่มได้",
    };
  }

  return {
    label: "ดีเยี่ยม",
    tone: "good",
    text: "มีวิถีชีวิตที่ดีเยี่ยม มีเพียงจุดเล็กน้อยที่อาจเพิ่มเติมให้ดียิ่งขึ้น",
  };
}

function LmAssessmentForm({ draft, update }) {
  const [round, setRound] = useState(0);
  const [openSection, setOpenSection] = useState("nutrition");

  const rounds = [1, 2, 3, 4];

  const sections = [
    {
      key: "nutrition",
      label: "Nutrition",
      thai: "โภชนาการ",
      max: 10,
      tone: "emerald",
      desc: "อาหารนอกบ้าน เครื่องดื่มหวาน ผัก และผลไม้",
    },
    {
      key: "physical",
      label: "Physical Activity",
      thai: "กิจกรรมทางกาย",
      max: 10,
      tone: "sky",
      desc: "แรงต้าน การนั่งนาน และแอโรบิกต่อสัปดาห์",
    },
    {
      key: "sleep",
      label: "Sleep",
      thai: "การนอน",
      max: 10,
      tone: "indigo",
      desc: "ชั่วโมงนอน ความสดชื่น และคุณภาพการนอน",
    },
    {
      key: "stress",
      label: "Stress",
      thai: "ความเครียด",
      max: 5,
      tone: "violet",
      desc: "สมาธิ/ฝึกจิตใจ และการจัดการความเครียด",
    },
    {
      key: "substances",
      label: "Substances",
      thai: "สุรา บุหรี่ และสารเสพติด",
      max: 10,
      tone: "amber",
      desc: "แอลกอฮอล์ บุหรี่ บุหรี่ไฟฟ้า หรือสารเสพติด",
    },
    {
      key: "relationship",
      label: "Relationship & Health Literacy",
      thai: "ความสัมพันธ์และความรอบรู้สุขภาพ",
      max: 5,
      tone: "rose",
      desc: "การรับฟังผู้อื่น และการพบปะคนใกล้ชิด",
    },
  ];

  const toneClass = {
    emerald: {
      dot: "bg-emerald-500",
      button: "border-emerald-600 bg-emerald-600 text-white",
      panel: "border-emerald-200 bg-emerald-50",
      panelText: "text-emerald-700",
    },
    sky: {
      dot: "bg-sky-500",
      button: "border-sky-600 bg-sky-600 text-white",
      panel: "border-sky-200 bg-sky-50",
      panelText: "text-sky-700",
    },
    indigo: {
      dot: "bg-indigo-500",
      button: "border-indigo-600 bg-indigo-600 text-white",
      panel: "border-indigo-200 bg-indigo-50",
      panelText: "text-indigo-700",
    },
    violet: {
      dot: "bg-violet-500",
      button: "border-violet-600 bg-violet-600 text-white",
      panel: "border-violet-200 bg-violet-50",
      panelText: "text-violet-700",
    },
    amber: {
      dot: "bg-amber-500",
      button: "border-amber-600 bg-amber-600 text-white",
      panel: "border-amber-200 bg-amber-50",
      panelText: "text-amber-700",
    },
    rose: {
      dot: "bg-rose-500",
      button: "border-rose-600 bg-rose-600 text-white",
      panel: "border-rose-200 bg-rose-50",
      panelText: "text-rose-700",
    },
  };
  
  const lmAssessments = Array.isArray(draft.lmAssessments)
    ? draft.lmAssessments
    : [
        blankLmAssessment(1),
        blankLmAssessment(2),
        blankLmAssessment(3),
        blankLmAssessment(4),
      ];

  const currentAssessment =
    lmAssessments[round] || blankLmAssessment(round + 1);

  const currentCalculated = calculateLmAssessment(currentAssessment, draft);

  const answeredCount = LM_QUESTIONS.filter(
    (question) =>
      currentAssessment.answers?.[question.id] !== undefined &&
      currentAssessment.answers?.[question.id] !== null &&
      currentAssessment.answers?.[question.id] !== ""
  ).length;

  const isComplete = answeredCount === LM_QUESTIONS.length;
  const totalForDisplay = answeredCount > 0 ? currentCalculated.total : null;

  const interpretation = isComplete
    ? lmScoreInterpret(totalForDisplay)
    : {
        label: answeredCount > 0 ? "ยังไม่ครบ" : "รอกรอก",
        tone: answeredCount > 0 ? "warn" : "gray",
        text: "ตอบให้ครบ 16 ข้อก่อนแปลผลคะแนนรวม",
      };

  const roundScores = rounds.map((item, index) => {
    const assessment = lmAssessments[index] || blankLmAssessment(index + 1);

    const answered = LM_QUESTIONS.filter(
      (question) =>
        assessment.answers?.[question.id] !== undefined &&
        assessment.answers?.[question.id] !== null &&
        assessment.answers?.[question.id] !== ""
    ).length;

    const calculated = calculateLmAssessment(assessment, draft);

    return {
      no: item,
      answered,
      total: answered > 0 ? calculated.total : null,
    };
  });

  function categoryQuestions(categoryKey) {
    return LM_QUESTIONS.filter((question) => question.category === categoryKey);
  }

  function categoryAnsweredCount(categoryKey) {
    return categoryQuestions(categoryKey).filter(
      (question) =>
        currentAssessment.answers?.[question.id] !== undefined &&
        currentAssessment.answers?.[question.id] !== null &&
        currentAssessment.answers?.[question.id] !== ""
    ).length;
  }

  function categoryScore(categoryKey) {
    return currentCalculated.scores?.[categoryKey] ?? 0;
  }

  function categoryTone(score, max, answered) {
    if (!answered) return "gray";

    const percent = (Number(score) / max) * 100;

    if (percent >= 80) return "good";
    if (percent >= 60) return "warn";
    return "bad";
  }

  function categoryStatus(answered, total) {
    if (answered === 0) return { text: "รอกรอก", tone: "gray" };
    if (answered < total) return { text: "ยังไม่ครบ", tone: "warn" };
    return { text: "ครบแล้ว", tone: "good" };
  }

  function scoreLabel(question, optionIndex) {
    const raw = question.scores?.[optionIndex];

    if (raw === null || raw === undefined) return "-";
    if (raw === "sexBased") return "หญิง 0 / ชาย 4";

    return `${raw}`;
  }

  function chooseAnswer(question, optionIndex) {
    const base = currentAssessment || blankLmAssessment(round + 1);

    const nextAnswers = {
      ...(base.answers || {}),
      [question.id]: optionIndex,
    };

    const nextBase = {
      ...base,
      no: round + 1,
      date: base.date || todayThaiDateText(),
      answers: nextAnswers,
      updatedAt: todayThai(),
      updatedBy: draft.updatedBy || "",
    };

    const nextCalculated = calculateLmAssessment(nextBase, draft);

    const nextAssessment = {
      ...nextBase,
      scores: nextCalculated.scores,
      total: nextCalculated.total,
    };

    update(["lmAssessments", round], nextAssessment);
  }

  const categorySummary = sections.map((section) => {
    const score = categoryScore(section.key);
    const answered = categoryAnsweredCount(section.key);
    const totalQuestions = categoryQuestions(section.key).length;
    const status = categoryStatus(answered, totalQuestions);

    return {
      ...section,
      score,
      answered,
      totalQuestions,
      tone: categoryTone(score, section.max, answered > 0),
      status,
    };
  });

  const strengths = categorySummary
    .filter(
      (item) =>
        item.answered === item.totalQuestions && item.tone === "good"
    )
    .sort((a, b) => (b.score / b.max) - (a.score / a.max));
  
  const improvements = categorySummary
    .filter(
      (item) =>
        item.answered === item.totalQuestions && item.tone === "bad"
    )
    .sort((a, b) => (a.score / a.max) - (b.score / b.max));

  return (
    <Card title="แบบประเมินพฤติกรรมสุขภาพ LM" icon={FileIcon}>
      <div className="space-y-4">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <div className="text-sm font-bold text-slate-500">
                Lifestyle Medicine Assessment
              </div>

              <div className="mt-1 text-2xl font-black text-slate-900">
                ครั้งที่ {round + 1}
              </div>

              <div className="mt-1 text-sm font-semibold text-slate-500">
                เลือกคำตอบตามพฤติกรรมจริง ระบบจะคำนวณคะแนนให้อัตโนมัติ
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {rounds.map((item, index) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setRound(index)}
                  className={`rounded-xl border px-4 py-2.5 text-sm font-black transition ${
                    round === index
                      ? "border-slate-900 bg-slate-900 text-white shadow-sm"
                      : "border-slate-200 bg-white text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  ครั้งที่ {item}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="text-sm font-bold text-slate-500">
                คะแนนครั้งนี้
              </div>
        
              <div className="mt-1 flex flex-wrap items-end gap-2">
                <div className="text-3xl font-black text-slate-900">
                  {totalForDisplay === null ? "-" : totalForDisplay} / 50
                </div>
        
                <div className="pb-1 text-xs font-bold text-slate-400">
                  คะแนน
                </div>
        
                <div className="pb-0.5">
                  <Pill tone={interpretation.tone}>{interpretation.label}</Pill>
                </div>
              </div>
            </div>
        
            <div className="shrink-0">
              <Pill tone={isComplete ? "good" : "warn"}>
                ตอบแล้ว {answeredCount}/16 ข้อ
              </Pill>
            </div>
          </div>
        
          <div className="mt-3 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-xs font-semibold leading-5 text-slate-500">
            {interpretation.text}
          </div>
        
          <div className="mt-3 border-t border-slate-100 pt-3">
            <div className="mb-2 text-xs font-black uppercase tracking-wide text-slate-400">
              ประวัติคะแนน 4 ครั้ง
            </div>
        
            <div className="flex flex-wrap gap-2">
              {roundScores.map((item) => (
                <span
                  key={item.no}
                  className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-600"
                >
                  <span className="mr-1 text-slate-400">
                    ครั้ง {item.no}:
                  </span>
                  <span className="text-slate-900">
                    {item.total === null ? "-/50" : `${item.total}/50`}
                  </span>
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-black text-emerald-800">
                  จุดเด่น
                </div>
                <div className="text-xs font-semibold text-emerald-700/80">
                  ด้านที่ทำได้ดี
                </div>
              </div>
        
              <span className="rounded-full border border-emerald-200 bg-white/80 px-2.5 py-1 text-xs font-black text-emerald-700">
                ดี
              </span>
            </div>
        
            <div className="flex flex-wrap gap-2">
              {strengths.length ? (
                strengths.map((item) => (
                  <span
                    key={`strength-${item.key}`}
                    className="inline-flex items-center rounded-full border border-emerald-300 bg-white px-3 py-1.5 text-sm font-bold text-emerald-800"
                  >
                    {item.thai} {item.score}/{item.max}
                  </span>
                ))
              ) : (
                <div className="text-sm font-semibold text-emerald-800/70">
                  รอกรอกครบหมวด
                </div>
              )}
            </div>
          </div>
        
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-black text-rose-800">
                  ควรปรับ
                </div>
                <div className="text-xs font-semibold text-rose-700/80">
                  ด้านที่ควรให้คำแนะนำเพิ่มเติม
                </div>
              </div>
        
              <span className="rounded-full border border-rose-200 bg-white/80 px-2.5 py-1 text-xs font-black text-rose-700">
                ปรับเพิ่ม
              </span>
            </div>
        
            <div className="flex flex-wrap gap-2">
              {improvements.length ? (
                improvements.map((item) => (
                  <span
                    key={`improve-${item.key}`}
                    className="inline-flex items-center rounded-full border border-rose-300 bg-white px-3 py-1.5 text-sm font-bold text-rose-800"
                  >
                    {item.thai} {item.score}/{item.max}
                  </span>
                ))
              ) : (
                <div className="text-sm font-semibold text-rose-800/70">
                  ยังไม่มีข้อมูลที่ควรปรับ
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-4 rounded-2xl border border-slate-100 bg-gradient-to-r from-slate-50 to-white px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-black text-slate-900">
                  หมวดแบบประเมิน
                </div>
          
                <div className="mt-0.5 text-xs font-semibold text-slate-400">
                </div>
              </div>
          
              <Pill tone={answeredCount === 16 ? "good" : "gray"}>
                {answeredCount}/16 ข้อ
              </Pill>
            </div>
          </div>

          <div className="space-y-2">
            {sections.map((section) => {
              const isOpen = openSection === section.key;
              const color = toneClass[section.tone];
              const questions = categoryQuestions(section.key);
              const score = categoryScore(section.key);
              const answered = categoryAnsweredCount(section.key);
              const sectionTone = categoryTone(
                score,
                section.max,
                answered > 0
              );
              const status = categoryStatus(answered, questions.length);

              return (
                <div
                  key={section.key}
                  className={`overflow-hidden rounded-2xl border transition ${
                    isOpen
                      ? "border-slate-300 bg-white shadow-sm ring-1 ring-slate-100"
                      : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/60"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() =>
                      setOpenSection(isOpen ? "" : section.key)
                    }
                    className={`flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition ${
                      isOpen ? "bg-slate-50" : "bg-white"
                    }`}
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span
                        className={`h-10 w-1.5 shrink-0 rounded-full ${color.dot}`}
                      />

                      <div className="min-w-0">
                        <div className="truncate text-base font-black text-slate-900">
                          {section.thai}
                        </div>
                        <div className="truncate text-xs font-bold text-slate-400">
                          {section.label}
                        </div>
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      <Pill tone={sectionTone}>
                        {answered > 0
                          ? `${score}/${section.max}`
                          : `-/${section.max}`}
                      </Pill>

                      <Pill tone={status.tone}>{status.text}</Pill>

                      <span className="text-lg font-black text-slate-400">
                        {isOpen ? "−" : "+"}
                      </span>
                    </div>
                  </button>

                  {isOpen && (
                    <div className="border-t border-slate-200 px-4 py-4">
                      <div className={`mb-4 rounded-xl border p-4 ${color.panel}`}>
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <div className={`text-sm font-black ${color.panelText}`}>
                              รายละเอียดหมวด
                            </div>
                      
                            <div className="mt-1 text-base font-black text-slate-900">
                              {section.desc}
                            </div>
                          </div>
                      
                          <div className="flex flex-wrap gap-2">
                            <Pill>{answered}/{questions.length} ข้อ</Pill>
                            <Pill>เต็ม {section.max}</Pill>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-4">
                        {questions.map((question) => {
                          const questionNo =
                            LM_QUESTIONS.findIndex(
                              (item) => item.id === question.id
                            ) + 1;

                          const selectedAnswer =
                            currentAssessment.answers?.[question.id];

                          const selectedScore = lmQuestionScore(
                            question,
                            selectedAnswer,
                            draft
                          );

                          return (
                            <div
                              key={question.id}
                              className="rounded-2xl border border-slate-200 bg-white p-4"
                            >
                              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                                <div>
                                  <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-black text-slate-500">
                                    ข้อ {questionNo}
                                  </div>

                                  <div className="mt-1 text-base font-bold leading-6 text-slate-900">
                                    {question.text}
                                  </div>
                                </div>

                                <Pill>
                                  คะแนน{" "}
                                  {selectedScore === null
                                    ? "-"
                                    : selectedScore}
                                </Pill>
                              </div>

                              <div className="mt-4 flex flex-wrap gap-2">
                                {question.options.map(
                                  (option, optionIndex) => {
                                    const optionScore =
                                      question.scores?.[optionIndex];

                                    const disabled =
                                      optionScore === null ||
                                      optionScore === undefined;

                                    const selected =
                                      Number(selectedAnswer) === optionIndex;

                                    return (
                                      <button
                                        key={`${question.id}-${option}`}
                                        type="button"
                                        disabled={disabled}
                                        onClick={() =>
                                          chooseAnswer(
                                            question,
                                            optionIndex
                                          )
                                        }
                                        className={`min-w-[64px] rounded-2xl border px-3.5 py-2.5 text-center transition ${
                                          disabled
                                            ? "cursor-not-allowed border-slate-100 bg-slate-50 text-slate-300"
                                            : selected
                                              ? `${color.button} shadow-sm`
                                              : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                                        }`}
                                      >
                                        <div className="text-sm font-black leading-5">
                                          {option}
                                        </div>

                                        <div
                                          className={`mt-0.5 text-[9px] font-semibold leading-3 ${
                                            selected
                                              ? "text-white/60"
                                              : "text-slate-300"
                                          }`}
                                        >
                                          {disabled
                                            ? "-"
                                            : `${scoreLabel(
                                                question,
                                                optionIndex
                                              )} คะแนน`}
                                        </div>
                                      </button>
                                    );
                                  }
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-500">
          เลือกคำตอบให้ครบ แล้วกด “บันทึกข้อมูล” ด้านบนขวา
        </div>
      </div>
    </Card>
  );
}

function DataQualityPanel({ record }) {
  const safeRecord = record || blankRecord;

  const safeSessions = Array.isArray(safeRecord.sessions)
    ? safeRecord.sessions
    : [session(1), session(2), session(3), session(4)];

  const normalizedRecord = {
    ...safeRecord,
    sessions: safeSessions.map((s) => ({
      ...s,
      date: s.date || (sessionHasAnyData(s) ? todayThaiDateText() : ""),
    })),
  };

  const quality = recordQuality(normalizedRecord);

  const issueList = Array.isArray(quality.issues) ? quality.issues : [];
  const missingLatest = Array.isArray(quality.missingLatest)
    ? quality.missingLatest
    : [];

  const warningList = [...issueList, ...missingLatest].slice(0, 6);

  const latestText =
    quality.filled === 0
      ? "ยังไม่มีข้อมูล"
      : missingLatest.length > 0
        ? missingLatest.join(" / ")
        : "ครบสำหรับสรุปหลัก";

  const statusTone =
    quality.filled === 0
      ? "gray"
      : warningList.length > 0
        ? "warn"
        : "good";

  const statusText =
    statusTone === "good"
      ? "ครบพร้อมใช้"
      : statusTone === "warn"
        ? "ควรตรวจสอบ"
        : "ยังไม่มีข้อมูล";

  const statusClass = {
    good: "border-emerald-200 bg-emerald-50 text-emerald-700",
    warn: "border-amber-200 bg-amber-50 text-amber-700",
    gray: "border-slate-200 bg-slate-50 text-slate-600",
  }[statusTone];

  return (
    <Card
      title="สถานะข้อมูล"
      icon={ClipboardIcon}
      right={
        <span
          className={`inline-flex rounded-full border px-3 py-1 text-xs font-black ${statusClass}`}
        >
          {statusText}
        </span>
      }
    >
      <div className="rounded-2xl border border-slate-200 bg-gradient-to-r from-slate-50 to-white px-4 py-3">
        <div className="grid gap-3 md:grid-cols-3">
          <div className="min-w-0">
            <div className="text-xs font-black text-slate-400">
              จำนวนครั้งที่มีข้อมูล
            </div>
            <div className="mt-1 text-lg font-black text-slate-900">
              {quality.filled}/4 ครั้ง
            </div>
          </div>

          <div className="min-w-0 border-t border-slate-200 pt-3 md:border-l md:border-t-0 md:pl-4 md:pt-0">
            <div className="text-xs font-black text-slate-400">
              ข้อมูลล่าสุด
            </div>
            <div
              className={`mt-1 truncate text-lg font-black ${
                missingLatest.length > 0 ? "text-amber-800" : "text-slate-900"
              }`}
              title={latestText}
            >
              {latestText}
            </div>
          </div>

          <div className="min-w-0 border-t border-slate-200 pt-3 md:border-l md:border-t-0 md:pl-4 md:pt-0">
            <div className="text-xs font-black text-slate-400">
              ค่าที่ควรตรวจสอบ
            </div>
            <div
              className={`mt-1 text-lg font-black ${
                warningList.length > 0 ? "text-amber-800" : "text-slate-900"
              }`}
            >
              {warningList.length} รายการ
            </div>
          </div>
        </div>

        {warningList.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-200 pt-3">
            {warningList.map((item, index) => (
              <span
                key={`${item}-${index}`}
                className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-bold text-amber-800"
              >
                • {item}
              </span>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}

function GeneralForm({ draft, update }) {
  return <Card title="ข้อมูลทั่วไป" icon={UserIcon}><div className="grid gap-4 md:grid-cols-3"><Field label="HN" value={draft.hn} onChange={(v) => update(["hn"], v)} /><Field label="ชื่อ-สกุล" value={draft.name} onChange={(v) => update(["name"], v)} /><Select label="เพศ" value={draft.sex} onChange={(v) => update(["sex"], v)} options={["ชาย", "หญิง", "อื่น ๆ"]} /><Field label="อายุ" value={draft.age} onChange={(v) => update(["age"], v)} type="number" /><Field label="ส่วนสูง (ซม.)" value={draft.height} onChange={(v) => update(["height"], v)} type="number" /><Select label="เป้าหมาย" value={draft.goal} onChange={(v) => update(["goal"], v)} options={["ลดไขมัน / ควบคุมน้ำหนัก", "เพิ่มกล้ามเนื้อ", "เพิ่มความแข็งแรง", "เพิ่มความทนทานของหัวใจและปอด", "ลดปวด / ฟื้นฟูการเคลื่อนไหว", "สุขภาพทั่วไป"]} /><Field label="โรคประจำตัว" value={draft.disease} onChange={(v) => update(["disease"], v)} /><Field label="ยาที่ใช้ประจำ" value={draft.medication} onChange={(v) => update(["medication"], v)} /><Field label="ประวัติบาดเจ็บ/ผ่าตัด" value={draft.injury} onChange={(v) => update(["injury"], v)} /></div></Card>;
}

function ParqForm({ draft, update }) {
  const risk = draft.parq.some(Boolean);
  return <Card title="PAR-Q แบบย่อ" icon={FileIcon} right={<Pill tone={risk ? "bad" : "good"}>{risk ? "ควรประเมินเพิ่มเติม" : "ผ่านการคัดกรอง"}</Pill>}><div className="space-y-2">{parqQuestions.map((q, i) => <div key={q} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3"><p className="text-base font-semibold text-slate-700">{i + 1}. {q}</p><div className="flex rounded-lg border border-slate-200 bg-white p-1"><button onClick={() => update(["parq", i], true)} className={`rounded-md px-3 py-2 text-base font-bold ${draft.parq[i] ? "bg-slate-900 text-white" : "text-slate-500"}`}>ใช่</button><button onClick={() => update(["parq", i], false)} className={`rounded-md px-3 py-2 text-base font-bold ${!draft.parq[i] ? "bg-slate-900 text-white" : "text-slate-500"}`}>ไม่ใช่</button></div></div>)}</div></Card>;
}

function ProgramForm({ draft, update }) {
  const program = draft.program || {};

  return (
    <div className="space-y-5">
      <Card title="Exercise Prescription" icon={FileIcon}>
        <div className="grid gap-4 md:grid-cols-2">
          <Select
            label="Program Type"
            value={draft.program.type}
            onChange={(v) => {
              update(["program", "type"], v);
            }}
            options={[{ value: "", label: "ยังไม่มีข้อมูล" },"Full Body", "Upper / Lower", "PPL", "Hybrid / Mixed"]}
          />

          <Select
            label="Intensity"
            value={program.intensity || ""}
            onChange={(v) => update(["program", "intensity"], v)}
            options={[{ value: "", label: "ยังไม่มีข้อมูล" },"Light", "Moderate", "Vigorous", "Individualized"]}
          />
        </div>
      </Card>

      <div className="grid items-stretch gap-5 lg:grid-cols-2">
        <Card title="Cardio Plan" icon={ActivityIcon}>
          <div className="grid gap-4 md:grid-cols-2">
            <Select
              label="ประเภท"
              value={program.cardioType || ""}
              onChange={(v) => update(["program", "cardioType"], v)}
              options={[{ value: "", label: "ยังไม่มีข้อมูล" },"เดินเร็ว", "เดินสะสม", "ปั่นจักรยาน", "วิ่งเบา", "ว่ายน้ำ", "อื่น ๆ"]}
            />

            <Field
              label="นาที/ครั้ง"
              value={program.cardioDuration || ""}
              onChange={(v) => update(["program", "cardioDuration"], v)}
            />
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <Select
              label="RPE"
              value={program.rpe || ""}
              onChange={(v) => update(["program", "rpe"], v)}
              options={[{ value: "", label: "ยังไม่มีข้อมูล" },"2–3", "4–6", "7–8"]}
            />

            <Select
              label="Talk Test"
              value={program.talk || ""}
              onChange={(v) => update(["program", "talk"], v)}
              options={[{ value: "", label: "ยังไม่มีข้อมูล" },"พูดสบาย", "พูดเป็นประโยค", "พูดเป็นคำ ๆ"]}
            />
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <Info label="HRmax" value={draft.age ? `${220 - num(draft.age)} bpm` : "กรอกอายุก่อน"} />
            <Info label="Target HR" value={targetHrText(draft.age, program.intensity || "")} />
          </div>
        </Card>

        <Card title="Strength Plan" icon={ActivityIcon}>
          <div className="grid gap-4 md:grid-cols-2">
            <Field
              label="วันฝึกกล้ามเนื้อ/สัปดาห์"
              value={draft.program.strengthFrequency}
              onChange={(v) => {
                update(["program", "strengthFrequency"], v);
              }}
            />

            <Select
              label="Sets × Reps"
              value={program.strengthDose || ""}
              onChange={(v) => update(["program", "strengthDose"], v)}
              options={[
                { value: "", label: "ยังไม่มีข้อมูล" },
                "เริ่มต้น/ผู้สูงอายุ: 1–2 เซต × 10–15 ครั้ง",
                "สุขภาพทั่วไป: 2–3 เซต × 10–15 ครั้ง",
                "สุขภาพทั่วไป: 2–3 เซต × 8–12 ครั้ง",
                "เพิ่มกล้ามเนื้อ: 3–4 เซต × 8–12 ครั้ง",
                "ความทนทานกล้ามเนื้อ: 2–3 เซต × 12–20 ครั้ง",
                "เพิ่มความแข็งแรง: 3–5 เซต × 3–6 ครั้ง",
                "Corrective/Mobility: 1–2 เซต × 8–12 ครั้ง/ข้าง",
                "ตามรายบุคคล",
              ]}
            />
          </div>

          <div className="mt-4">
            <span className="mb-2 block text-sm font-semibold text-slate-500">
              Focus / จุดเน้น
            </span>

            <div className="flex flex-wrap gap-2">
              {focusOptions.map((option) => {
                const selected = focusStringToArray(program.focus).includes(option);

                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => update(["program", "focus"], toggleFocusValue(program.focus, option))}
                    className={`rounded-full border px-4 py-2 text-sm font-semibold ${
                      selected
                        ? "border-slate-900 bg-slate-900 text-white"
                        : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    {option}
                  </button>
                );
              })}
            </div>
          </div>
        </Card>
      </div>

      <Card title="ข้อควรระวังและคำแนะนำเพิ่มเติม" icon={ClipboardIcon}>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-slate-500">
              Precaution / ข้อควรระวัง
            </span>

            <textarea
              value={program.precaution || ""}
              onChange={(e) => update(["program", "precaution"], e.target.value)}
              placeholder="เช่น หลีกเลี่ยงแรงกระแทก / ปวดเข่า / ความดันสูง / ไม่กลั้นหายใจ"
              className="min-h-24 w-full rounded-xl border border-slate-200 p-3 text-base outline-none focus:border-slate-700"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-slate-500">
              คำแนะนำเพิ่มเติม
            </span>

            <textarea
              value={program.followUp || ""}
              onChange={(e) => update(["program", "followUp"], e.target.value)}
              placeholder="เช่น เพิ่มกิจกรรมทางกายในชีวิตประจำวัน / ติดตามอาการ / ประเมินครั้งถัดไป"
              className="min-h-24 w-full rounded-xl border border-slate-200 p-3 text-base outline-none focus:border-slate-700"
            />
          </label>
        </div>
      </Card>
    </div>
  );
}

function SessionForm({ draft, update, idx }) {
  const s = draft.sessions[idx];
  const base = ["sessions", idx];

  return (
    <div className="space-y-5">
      <Card
        title={`ข้อมูลครั้งที่ ${idx + 1}`}
        icon={ClipboardIcon}
        right={
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                const ok = window.confirm(`ยืนยันการลบข้อมูลครั้งที่ ${idx + 1}

ข้อมูล InBody, Fitness Test, OHS, วันที่ประเมิน และหมายเหตุของครั้งนี้จะถูกล้างออก

ต้องการลบจริงหรือไม่?`);

                if (ok) update(["sessions", idx], session(idx + 1));
              }}
              className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-sm font-semibold text-rose-700 hover:bg-rose-100"
            >
              ลบครั้งนี้
            </button>

            <Pill tone="dark">ครั้งที่ {idx + 1}/4</Pill>
          </div>
        }
      >
        <div className="grid gap-4 md:grid-cols-2">
          <Field
            label="วันที่ประเมินอัตโนมัติ (วัน/เดือน/ปี พ.ศ.)"
            value={formatDateOnlyThai(s.date || todayThaiDateText())}
            onChange={(v) => update([...base, "date"], v)}
          />

          <Field
            label="หมายเหตุสั้น ๆ"
            value={s.note}
            onChange={(v) => update([...base, "note"], v)}
          />
        </div>
      </Card>

      <Card title="InBody / Body Composition" icon={HeartIcon}>
        <div className="grid items-stretch gap-4 md:grid-cols-4">
          <Info label="BMI คำนวณอัตโนมัติ" value={s.inbody.bmi || "กรอกน้ำหนักและส่วนสูง"} />

          {metrics.inbody
            .filter(([key]) => key !== "bmi")
            .map(([key, label, unit]) => (
              <Field
                key={key}
                label={`${label} (${unit})`}
                value={s.inbody[key]}
                onChange={(v) => update([...base, "inbody", key], v)}
                type="number"
                tone={metricTone(key)}
              />
            ))}
        </div>
      </Card>

      <Card title="Fitness Test 5 ด้าน" icon={ActivityIcon}>
        <div className="grid gap-4 md:grid-cols-5">
          {metrics.fitness.map(([key, label, unit]) => (
            <Field
              key={key}
              label={`${label} (${unit})`}
              value={s.fitness[key]}
              onChange={(v) => update([...base, "fitness", key], v)}
              type="number"
            />
          ))}
        </div>
      </Card>

      <Card title="Overhead Deep Squat" icon={ClipboardIcon}>
        <div className="grid gap-3 md:grid-cols-2">
          {ohsItems.map((x, i) => (
            <Select
              key={x}
              label={x}
              value={s.ohs[i]}
              onChange={(v) => update([...base, "ohs", i], v)}
              options={["ปกติ", "ต้องระวัง", "ควรปรับแก้"]}
            />
          ))}
        </div>
      </Card>
    </div>
  );
}

export default function App() {
  const [records, setRecords] = useState(() => normalizeRecords(loadJsonFromStorage(RECORDS_STORAGE_KEY, initialRecords)));
  const [mode, setMode] = useState("client");
  const [activeHN, setActiveHN] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminUser, setAdminUser] = useState(null);
  const [auditLogs, setAuditLogs] = useState(() => loadJsonFromStorage(AUDIT_STORAGE_KEY, []));
  const [syncStatus, setSyncStatus] = useState("local");

  useEffect(() => {
    saveJsonToStorage(RECORDS_STORAGE_KEY, records);
  }, [records]);

  useEffect(() => {
    saveJsonToStorage(AUDIT_STORAGE_KEY, auditLogs);
  }, [auditLogs]);

  const active = activeHN ? records[activeHN] : null;
  const total = useMemo(() => Object.keys(records).length, [records]);

  function addAuditLog(action, hn, detail = "") {
    setAuditLogs((old) => [createAuditEntry({ adminUser, action, hn, detail }), ...old].slice(0, 200));
  }

  async function refreshData(options = {}) {
    const { includeAuditLogs = false, silent = false } = options;

    setSyncStatus("loading");

    try {
      const dbRecords = await loadAllRecords();
      const normalized = normalizeRecords(dbRecords);

      setRecords(normalized);
      setSyncStatus("online");

      if (includeAuditLogs) {
        try {
          const dbAuditLogs = await loadAuditLogs();
          setAuditLogs(dbAuditLogs || []);
        } catch (auditError) {
          console.warn("โหลด Audit Logs ไม่สำเร็จ แต่โหลดข้อมูล HN ได้แล้ว", auditError);
        }
      }
    } catch (error) {
      console.error(error);
      setSyncStatus("error");

      if (!silent) {
        alert(`โหลดข้อมูลจาก Supabase ไม่สำเร็จ: ${error.message || error}`);
      }
    }
  }

  useEffect(() => {
    refreshData({ includeAuditLogs: false, silent: true });
  }, []);

  useEffect(() => {
    if (isAdmin) {
      refreshData({ includeAuditLogs: true, silent: false });
    }
  }, [isAdmin]);

  function restoreFullBackup(nextRecords, nextAuditLogs = []) {
    setRecords(nextRecords);
    setAuditLogs([
      createAuditEntry({ adminUser, action: "Restore Backup", hn: "-", detail: "นำเข้าข้อมูลจากไฟล์ JSON backup" }),
      ...nextAuditLogs,
    ].slice(0, 200));
    setActiveHN(null);
    setMode("admin");
    alert("นำเข้าข้อมูลสำรองสำเร็จ");
  }

  function goMode(nextMode) {
    if ((nextMode === "admin" || nextMode === "staff") && !isAdmin) {
      setMode("adminLogin");
      setActiveHN(null);
      return;
    }
    setMode(nextMode);
    setActiveHN(null);
  }

  async function logout() {
    try {
      await signOutAdminFromSupabase();
    } catch (error) {
      console.warn(error);
    }
    setIsAdmin(false);
    setAdminUser(null);
    setMode("client");
    setActiveHN(null);
    setSyncStatus("local");
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 antialiased" style={{ fontFamily: '"Noto Sans Thai", "Sarabun", "Tahoma", "Segoe UI", Arial, sans-serif', lineHeight: 1.65 }}>
      <Header mode={mode} setMode={goMode} isAdmin={isAdmin} adminUser={adminUser} onLogout={logout} />
      {mode === "client" && !active && <Login records={records} openRecord={setActiveHN} openAdminLogin={() => goMode("admin")} />}
      {mode === "client" && active && <Dashboard record={active} back={() => setActiveHN(null)} />}
      {mode === "adminLogin" && <AdminLogin onSuccess={(admin) => { setIsAdmin(true); setAdminUser(admin); setMode("admin"); }} onCancel={() => setMode("client")} />}
      {mode === "admin" && isAdmin && <AdminSummary records={records} auditLogs={auditLogs} onFullBackup={() => exportFullBackup(records, auditLogs)} onRestoreBackup={restoreFullBackup} />}
      {mode === "staff" && isAdmin && (
        <>
          <div className="mx-auto max-w-7xl px-4 pt-6">
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm font-semibold text-slate-500">
                <span>
                  HN ทั้งหมด:{" "}
                  <span className="font-black text-slate-900">
                    {total}
                  </span>
                </span>
          
                <span className="hidden text-slate-300 md:inline">•</span>
          
                <span>
                  ฐานข้อมูล:{" "}
                  <span className="font-black text-slate-900">
                    {syncStatus === "online"
                      ? "Supabase Database"
                      : syncStatus === "loading"
                        ? "กำลังโหลด Supabase"
                        : syncStatus === "error"
                          ? "เชื่อมต่อผิดพลาด"
                          : "Local fallback"}
                  </span>
                </span>
              </div>
            </div>
          </div>
          <Staff records={records} setRecords={setRecords} adminUser={adminUser} addAuditLog={addAuditLog} refreshData={refreshData} />
        </>
      )}
    </div>
  );
}
