import { supabase } from "./supabaseClient";

function toIsoDate(dateText) {
  if (!dateText) return null;

  const text = String(dateText).trim();
  let d = "";
  let m = "";
  let y = "";

  // รับรูปแบบ วัน/เดือน/ปี พ.ศ. เช่น 25/04/2569
  if (text.includes("/")) {
    const parts = text.split("/");
    if (parts.length !== 3) return null;

    d = parts[0];
    m = parts[1];
    y = parts[2];
  }

  // รองรับรูปแบบเดิม ปี-เดือน-วัน เช่น 2569-04-25 หรือ 2026-04-25
  else if (text.includes("-")) {
    const parts = text.split("-");
    if (parts.length !== 3) return null;

    y = parts[0];
    m = parts[1];
    d = parts[2];
  } else {
    return null;
  }

  let year = Number(y);
  if (!year || !m || !d) return null;

  // ถ้าเป็น พ.ศ. ให้แปลงเป็น ค.ศ. ก่อนบันทึกลง Supabase
  if (year > 2400) year -= 543;

  const mm = String(m).padStart(2, "0");
  const dd = String(d).slice(0, 2).padStart(2, "0");

  return `${year}-${mm}-${dd}`;
}

function toThaiDateText(dateText) {
  if (!dateText) return "";

  const text = String(dateText).trim();

  // ถ้าเป็นรูปแบบ วัน/เดือน/ปี พ.ศ. อยู่แล้ว ให้ใช้เลย
  if (/^[0-9]{2}\/[0-9]{2}\/[0-9]{4}$/.test(text)) return text;

  // แปลงจาก ค.ศ. ใน Supabase เช่น 2026-04-25 → 25/04/2569
  const parts = text.split("-");
  if (parts.length !== 3) return "";

  let y = Number(parts[0]);
  const m = parts[1];
  const d = parts[2].slice(0, 2);

  if (y < 2400) y += 543;

  return `${d}/${m}/${y}`;
}

function focusToArray(focusText) {
  return String(focusText || "")
    .split(" / ")
    .map((x) => x.trim())
    .filter(Boolean);
}

function focusToText(focusArray) {
  return Array.isArray(focusArray) ? focusArray.join(" / ") : "";
}

export async function signInAdmin(adminCode, password) {
  const email = adminCode.includes("@") ? adminCode : `${adminCode}@hpc9.local`;

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) throw error;

  return getCurrentAdmin();
}

export async function signOutAdmin() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function getCurrentAdmin() {
  const { data, error } = await supabase
    .from("admin_users")
    .select("id, admin_code, display_name, role")
    .single();

  if (error) throw error;

  return {
    id: data.admin_code,
    dbId: data.id,
    name: data.display_name,
    role: data.role,
  };
}

export async function loadAllRecords() {
  const { data: patients, error: patientError } = await supabase
    .from("patients")
    .select("*")
    .is("deleted_at", null)
    .order("updated_at", { ascending: false });

  if (patientError) throw patientError;
  if (!patients || patients.length === 0) return {};

  const hns = patients.map((p) => p.hn);

  const [{ data: parq, error: parqError }, { data: programs, error: programError }, { data: sessions, error: sessionError }] =
    await Promise.all([
      supabase.from("parq_answers").select("*").in("hn", hns),
      supabase.from("exercise_programs").select("*").in("hn", hns),
      supabase
        .from("assessment_sessions")
        .select("*")
        .in("hn", hns)
        .order("session_no", { ascending: true }),
    ]);

  if (parqError) throw parqError;
  if (programError) throw programError;
  if (sessionError) throw sessionError;

  const parqMap = Object.fromEntries((parq || []).map((x) => [x.hn, x]));
  const programMap = Object.fromEntries((programs || []).map((x) => [x.hn, x]));

  const sessionMap = {};
  (sessions || []).forEach((s) => {
    if (!sessionMap[s.hn]) sessionMap[s.hn] = [];
    sessionMap[s.hn].push(s);
  });

  return Object.fromEntries(
    patients.map((p) => {
      const pParq = parqMap[p.hn];
      const pProgram = programMap[p.hn];
      const pSessions = sessionMap[p.hn] || [];

      const record = {
        hn: p.hn,
        name: p.full_name || "",
        sex: p.sex || "ชาย",
        age: p.age ? String(p.age) : "",
        height: p.height_cm ? String(p.height_cm) : "",
        goal: p.goal || "",
        disease: p.disease || "",
        medication: p.medication || "",
        injury: p.injury || "",
        updatedBy: "",
        updatedById: "",
        updatedAt: p.updated_at || "",
        parq: pParq
          ? [
              pParq.q1,
              pParq.q2,
              pParq.q3,
              pParq.q4,
              pParq.q5,
              pParq.q6,
              pParq.q7,
            ]
          : [false, false, false, false, false, false, false],
        program: {
          type: pProgram?.program_type || "Full Body",
          cardioType: pProgram?.cardio_type || "เดินเร็ว",
          cardioFrequency: pProgram?.cardio_frequency || "",
          cardioDuration: pProgram?.cardio_duration || "",
          strengthFrequency: pProgram?.strength_frequency || "",
          strengthDose: pProgram?.strength_dose || "สุขภาพทั่วไป: 2–3 เซต × 8–12 ครั้ง",
          intensity: pProgram?.intensity || "Moderate",
          rpe: pProgram?.rpe || "4–6",
          talk: pProgram?.talk_test || "พูดเป็นประโยค",
          focus: focusToText(pProgram?.focus),
          precaution: pProgram?.precaution || "",
          followUp: pProgram?.follow_up || "",
          note: pProgram?.note || "",
        },
        sessions: [1, 2, 3, 4].map((no) => {
          const s = pSessions.find((x) => x.session_no === no);

          return {
            no,
            date: toThaiDateText(s?.assessment_date),
            note: s?.note || "",
            inbody: {
              weight: s?.weight_kg ? String(s.weight_kg) : "",
              bmi: s?.bmi ? String(s.bmi) : "",
              bodyFat: s?.body_fat_percent ? String(s.body_fat_percent) : "",
              muscle: s?.skeletal_muscle_mass_kg ? String(s.skeletal_muscle_mass_kg) : "",
              fatMass: s?.fat_mass_kg ? String(s.fat_mass_kg) : "",
              visceral: s?.visceral_fat_level ? String(s.visceral_fat_level) : "",
              waist: s?.waist_cm ? String(s.waist_cm) : "",
            },
            fitness: {
              step: s?.step_test_bpm ? String(s.step_test_bpm) : "",
              grip: s?.handgrip_kg ? String(s.handgrip_kg) : "",
              sitstand: s?.sit_to_stand_reps ? String(s.sit_to_stand_reps) : "",
              sitreach: s?.sit_and_reach_cm ? String(s.sit_and_reach_cm) : "",
              tug: s?.tug_seconds ? String(s.tug_seconds) : "",
              ohs: "",
            },
            ohs: Array.isArray(s?.ohs)
              ? s.ohs
              : ["ปกติ", "ปกติ", "ปกติ", "ปกติ", "ปกติ", "ปกติ"],
          };
        }),
      };

      return [p.hn, record];
    })
  );
}

export async function saveRecord(record, adminUser) {
  const hn = record.hn;

  const patientRow = {
    hn,
    full_name: record.name || "",
    sex: record.sex || "ชาย",
    age: record.age ? Number(record.age) : null,
    height_cm: record.height ? Number(record.height) : null,
    goal: record.goal || "",
    disease: record.disease || "",
    medication: record.medication || "",
    injury: record.injury || "",
    updated_by: adminUser?.dbId || null,
  };

  const { error: patientError } = await supabase
    .from("patients")
    .upsert(patientRow);

  if (patientError) throw patientError;

  const parq = record.parq || [];

  const { error: parqError } = await supabase.from("parq_answers").upsert({
    hn,
    q1: Boolean(parq[0]),
    q2: Boolean(parq[1]),
    q3: Boolean(parq[2]),
    q4: Boolean(parq[3]),
    q5: Boolean(parq[4]),
    q6: Boolean(parq[5]),
    q7: Boolean(parq[6]),
  });

  if (parqError) throw parqError;

  const program = record.program || {};

  const { error: programError } = await supabase.from("exercise_programs").upsert({
    hn,
    program_type: program.type || "",
    cardio_type: program.cardioType || "",
    cardio_frequency: program.cardioFrequency || "",
    cardio_duration: program.cardioDuration || "",
    strength_frequency: program.strengthFrequency || "",
    strength_dose: program.strengthDose || "",
    intensity: program.intensity || "",
    rpe: program.rpe || "",
    talk_test: program.talk || "",
    focus: focusToArray(program.focus),
    precaution: program.precaution || "",
    follow_up: program.followUp || "",
    note: program.note || "",
  });

  if (programError) throw programError;

  const sessionRows = (record.sessions || []).map((s) => ({
    hn,
    session_no: s.no,
    assessment_date: toIsoDate(s.date),
    note: s.note || "",
    weight_kg: s.inbody?.weight ? Number(s.inbody.weight) : null,
    bmi: s.inbody?.bmi ? Number(s.inbody.bmi) : null,
    body_fat_percent: s.inbody?.bodyFat ? Number(s.inbody.bodyFat) : null,
    skeletal_muscle_mass_kg: s.inbody?.muscle ? Number(s.inbody.muscle) : null,
    fat_mass_kg: s.inbody?.fatMass ? Number(s.inbody.fatMass) : null,
    visceral_fat_level: s.inbody?.visceral ? Number(s.inbody.visceral) : null,
    waist_cm: s.inbody?.waist ? Number(s.inbody.waist) : null,
    step_test_bpm: s.fitness?.step ? Number(s.fitness.step) : null,
    handgrip_kg: s.fitness?.grip ? Number(s.fitness.grip) : null,
    sit_to_stand_reps: s.fitness?.sitstand ? Number(s.fitness.sitstand) : null,
    sit_and_reach_cm: s.fitness?.sitreach ? Number(s.fitness.sitreach) : null,
    tug_seconds: s.fitness?.tug ? Number(s.fitness.tug) : null,
    ohs: Array.isArray(s.ohs)
      ? s.ohs
      : ["ปกติ", "ปกติ", "ปกติ", "ปกติ", "ปกติ", "ปกติ"],
    updated_by: adminUser?.dbId || null,
  }));

  const { error: sessionError } = await supabase
    .from("assessment_sessions")
    .upsert(sessionRows, { onConflict: "hn,session_no" });

  if (sessionError) throw sessionError;

  await addAuditLog({
    adminUser,
    action: "บันทึกข้อมูล",
    hn,
    detail: "บันทึกข้อมูลผู้รับบริการ",
  });
}

export async function deleteRecord(hn, adminUser) {
  const { error } = await supabase
    .from("patients")
    .update({
      deleted_at: new Date().toISOString(),
      updated_by: adminUser?.dbId || null,
    })
    .eq("hn", hn);

  if (error) throw error;

  await addAuditLog({
    adminUser,
    action: "ลบ HN",
    hn,
    detail: "ลบแบบ soft delete",
  });
}

export async function addAuditLog({ adminUser, action, hn, detail }) {
  const { error } = await supabase.from("audit_logs").insert({
    admin_id: adminUser?.dbId || null,
    admin_code: adminUser?.id || "",
    admin_name: adminUser?.name || "",
    action,
    hn,
    detail,
  });

  if (error) throw error;
}

export async function loadAuditLogs() {
  const { data, error } = await supabase
    .from("audit_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) throw error;

  return (data || []).map((log) => ({
    id: log.id,
    at: log.created_at,
    adminId: log.admin_code,
    adminName: log.admin_name,
    role: "Admin",
    action: log.action,
    hn: log.hn,
    detail: log.detail,
  }));
}
