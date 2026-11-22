/* CareTrack server: the single shared database for every device.
   It keeps accounts with hashed passwords, issues a login token per device, checks the role of
   every request, and creates the notifications. Uses only built-in Node.js modules.
   Run:  node server.js   then open the links it prints. */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');

const ROOT = __dirname;
const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(process.env.DATA_DIR || path.join(ROOT, 'data'), 'caretrack-db.json');
const SEED_FILE = path.join(ROOT, 'data', 'sample-data.json');
const SLOTS = [['morning', 'Morning', '08:00'], ['afternoon', 'Afternoon', '13:00'], ['night', 'Night', '21:00']];
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml' };

let db = null;

/* ---------- helpers ---------- */
class Fail extends Error {}
const fail = msg => { throw new Fail(msg) };
const pad = n => String(n).padStart(2, '0');
const isoDay = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const today = () => isoDay(new Date());
const nowHM = () => new Date().toTimeString().slice(0, 5);
const addDays = (s, n) => { const d = new Date(s + 'T00:00'); d.setDate(d.getDate() + n); return isoDay(d) };
const rel = v => (/^[+-]\d+$/.test(String(v)) ? addDays(today(), +v) : v);
const fmtDay = s => new Date(s + 'T00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const phoneOk = p => /^[6-9]\d{9}$/.test(p);
const emailOk = e => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
const unameOk = u => /^[a-z0-9._]{3,20}$/.test(u);
const slotList = s => String(s || '').split(',').map(x => x.trim()).filter(Boolean);
const ageFrom = s => { const b = new Date(s + 'T00:00'), n = new Date(); let a = n.getFullYear() - b.getFullYear(); if (n.getMonth() < b.getMonth() || (n.getMonth() === b.getMonth() && n.getDate() < b.getDate())) a--; return a };
const nid = k => k + '-' + (db.seq[k] = (db.seq[k] || 0) + 1);
const findUser = id => db.users.find(x => x.id === id) || fail('User not found.');
const mineP = u => db.patients.find(p => p.id === u.linkId) || fail('Patient record not found.');
const mineD = u => db.doctors.find(d => d.id === u.linkId) || fail('Doctor record not found.');
const dn = id => db.doctors.find(d => d.id === id)?.name || '—';
const pn = id => db.patients.find(p => p.id === id)?.name || '—';
const mn = id => db.medicines.find(m => m.id === id)?.name || '—';
const notify = (uid, msg) => { db.notifications.unshift({ id: nid('NTF'), uid, msg, at: new Date().toISOString(), read: false }) };
const linkNotify = (linkId, msg) => { const u = db.users.find(x => x.linkId === linkId); if (u) notify(u.id, msg) };
const needRole = (u, role) => { if (u.role !== role) fail('Not allowed.') };

/* ---------- passwords: salted scrypt hashes, never stored or sent in plain text ---------- */
const hashPw = pw => { const salt = crypto.randomBytes(16).toString('hex'); return salt + ':' + crypto.scryptSync(String(pw), salt, 32).toString('hex') };
function checkPw(pw, stored) {
  const [salt, hex] = String(stored || '').split(':');
  if (!salt || !hex) return false;
  const a = crypto.scryptSync(String(pw), salt, 32), b = Buffer.from(hex, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/* ---------- storage ---------- */
function saveDB() {
  fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db));
  fs.renameSync(tmp, DB_FILE);
}
function seedDoses() {
  const t = today();
  db.prescriptions.forEach((rx, i) => {
    for (let d = rx.start; d < t && d <= rx.end; d = addDays(d, 1))
      SLOTS.forEach(([k], j) => {
        if (+rx[k]) db.doses.push({ id: nid('REC'), rxId: rx.id, patientId: rx.patientId, date: d, slot: k, status: (i + j + Number(d.slice(-2))) % 4 ? 'Taken' : 'Missed' });
      });
  });
}
function seedDB() {
  const s = JSON.parse(fs.readFileSync(SEED_FILE, 'utf8'));
  s.users.forEach(u => { u.passHash = hashPw(u.password); delete u.password });
  ['prescriptions', 'appointments', 'records', 'medicines'].forEach(t => s[t].forEach(o => ['date', 'start', 'end', 'followUp', 'expiry'].forEach(k => { if (o[k]) o[k] = rel(o[k]) })));
  const now = new Date().toISOString();
  s.messages.forEach(m => { m.at = now });
  s.notifications.forEach(n => { n.at = now });
  s.doses = [];
  s.sessions = {};
  s.reminded = {};
  db = s;
  seedDoses();
  saveDB();
}
function loadDB() {
  if (fs.existsSync(DB_FILE)) db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  else seedDB();
  // Merge newly added demo specialists into older saved databases without replacing user data.
  const seed = JSON.parse(fs.readFileSync(SEED_FILE, 'utf8'));
  if (!Array.isArray(db.bloodBank)) db.bloodBank = seed.bloodBank || [];
  if (!Array.isArray(db.bloodRequests)) db.bloodRequests = [];
  if (!db.seq.BR) db.seq.BR = 0;
  seed.doctors.filter(d => !db.doctors.some(x => x.id === d.id)).forEach(d => db.doctors.push(d));
  seed.users.filter(u => !db.users.some(x => x.id === u.id)).forEach(u => {
    const { password, ...account } = u;
    db.users.push({ ...account, passHash: hashPw(password) });
  });
  db.seq.DOC = Math.max(db.seq.DOC || 0, seed.seq.DOC || 0);
  saveDB();
}

/* ---------- reminders: one reminder per dose time, one follow-up 15 minutes after Not Taken ---------- */
function scheduler() {
  const t = today(), hm = nowHM(), now = Date.now();
  let changed = false;
  db.prescriptions.forEach(rx => {
    if (rx.start > t || rx.end < t) return;
    SLOTS.forEach(([k, label, time]) => {
      const key = rx.id + '|' + t + '|' + k;
      if (!+rx[k] || hm < time || db.reminded[key] || db.doses.some(d => d.rxId === rx.id && d.date === t && d.slot === k)) return;
      db.reminded[key] = true; changed = true;
      linkNotify(rx.patientId, `Time for ${mn(rx.medicineId)} (${label}). Open CareTrack and tap Taken or Not Taken.`);
    });
  });
  db.doses.forEach(d => {
    if (d.status === 'Missed' && d.followUpAt && !d.followed && now >= d.followUpAt) {
      d.followed = true; changed = true;
      linkNotify(d.patientId, 'Follow-up: please confirm whether you took your medicine.');
    }
  });
  if (changed) saveDB();
}

/* ---------- what each signed-in user is allowed to see ---------- */
const publicDoctors = () => db.doctors.map(d => ({ id: d.id, name: d.name, spec: d.spec, slots: d.slots, active: d.active }));
function viewFor(u) {
  const isA = u.role === 'admin', isD = u.role === 'doctor', isP = u.role === 'patient';
  const did = isD ? u.linkId : null, pid = isP ? u.linkId : null;
  const appts = isA ? db.appointments : db.appointments.filter(a => a.patientId === pid || a.doctorId === did);
  const mine = new Set(isA ? db.patients.map(p => p.id) : isP ? [pid] : [...db.patients.filter(p => p.doctorId === did).map(p => p.id), ...appts.map(a => a.patientId)]);
  const keep = list => (isA ? list : list.filter(x => mine.has(x.patientId)));
  return {
    me: { id: u.id, role: u.role, linkId: u.linkId },
    users: isA ? db.users.map(x => ({ id: x.id, username: x.username, role: x.role, linkId: x.linkId, active: x.active })) : [],
    doctors: isA ? db.doctors : db.doctors.map(d => ({ ...d, email: undefined, phone: undefined })),
    patients: isA ? db.patients : db.patients.filter(p => mine.has(p.id)),
    medicines: db.medicines,
    bloodBank: db.bloodBank,
    bloodRequests: isA ? db.bloodRequests : db.bloodRequests.filter(r => isP ? r.patientId === pid : mine.has(r.patientId)),
    appointments: appts,
    prescriptions: keep(db.prescriptions),
    records: keep(db.records),
    doses: keep(db.doses),
    messages: isA ? [] : db.messages.filter(m => (isP ? m.patientId === pid : m.doctorId === did)),
    notifications: db.notifications.filter(n => n.uid === u.id).slice(0, 150)
  };
}

/* ---------- ownership and booking rules ---------- */
function ownAppt(u, id) {
  const x = db.appointments.find(a => a.id === id) || fail('Appointment not found.');
  const mineDoc = u.role === 'doctor' && x.doctorId === u.linkId;
  const minePat = u.role === 'patient' && x.patientId === u.linkId;
  if (!mineDoc && !minePat) fail('That appointment is not yours.');
  return x;
}
function patientOfDoctor(u, pid) {
  const p = db.patients.find(x => x.id === pid) || fail('Patient not found.');
  if (p.doctorId !== u.linkId && !db.appointments.some(x => x.patientId === pid && x.doctorId === u.linkId)) fail('This patient is not assigned to you.');
  return p;
}
function slotTaken(did, date, time, selfId) {
  return db.appointments.some(a => a.id !== selfId && a.doctorId === did && a.date === date && a.time === time && !['Rejected', 'Cancelled'].includes(a.status));
}
function checkSlot(d, date, time, selfId) {
  if (!date || !time) fail('Choose a date and time.');
  if (date < today()) fail('Pick today or a future date.');
  if (date === today() && time <= nowHM()) fail('That time has already passed. Pick a later time.');
  if (!d.slots.includes(time)) fail('That time is not offered by this doctor.');
  if (slotTaken(d.id, date, time, selfId)) fail('That slot is already taken. Please pick another time.');
}

/* ---------- actions: each one checks the role and ownership before it changes anything ---------- */
const OPS = {
  changePassword(u, q) {
    const acc = findUser(u.id);
    if (!checkPw(q.cur, acc.passHash)) fail('Current password is incorrect.');
    if (String(q.next || '').length < 6) fail('New password needs 6+ characters.');
    acc.passHash = hashPw(q.next);
    return 'Password updated.';
  },
  resetPassword(u, q) {
    needRole(u, 'admin');
    if (String(q.pw || '').length < 6) fail('Use at least 6 characters.');
    findUser(q.uid).passHash = hashPw(q.pw);
    return 'Password reset. The old password no longer works.';
  },
  renameUser(u, q) {
    needRole(u, 'admin');
    const acc = findUser(q.uid), n = String(q.username || '').toLowerCase();
    if (!unameOk(n)) fail('Use 3–20 letters, numbers, dots or underscores.');
    if (db.users.some(x => x.username === n && x.id !== acc.id)) fail('That username is already taken.');
    acc.username = n;
    return 'Username updated.';
  },
  toggleUser(u, q) {
    needRole(u, 'admin');
    const acc = findUser(q.uid);
    if (acc.id === u.id) fail('You cannot deactivate your own admin account.');
    acc.active = !acc.active;
    if (!acc.active) Object.keys(db.sessions).forEach(t => { if (db.sessions[t].uid === acc.id) delete db.sessions[t] });
    return `${acc.username} is now ${acc.active ? 'active' : 'inactive'}.`;
  },
  resetDemo(u) {
    needRole(u, 'admin');
    seedDB();
    return 'Demo data reset. Everyone must sign in again.';
  },
  addPatient(u, q) {
    needRole(u, 'admin');
    const un = String(q.user || '').toLowerCase();
    if (!q.name || !unameOk(un)) fail('Name and a valid username are required.');
    if (String(q.pw || '').length < 6) fail('Temporary password needs 6+ characters.');
    if (db.users.some(x => x.username === un)) fail('That username already exists.');
    if (!db.doctors.some(d => d.id === q.did)) fail('Choose a valid doctor.');
    const pid = nid('PAT');
    db.patients.push({ id: pid, name: q.name, age: +q.age || 0, gender: q.gender, phone: q.phone, email: q.email, address: 'Not provided', allergies: 'None recorded', conditions: 'None recorded', blood: q.blood, ecName: 'Not provided', ecPhone: '—', doctorId: q.did, active: true });
    db.users.push({ id: nid('U'), username: un, role: 'patient', linkId: pid, active: true, passHash: hashPw(q.pw) });
    linkNotify(q.did, `New patient ${q.name} (${pid}) was assigned to you.`);
    return 'Patient added with a login account.';
  },
  reassignPatient(u, q) {
    needRole(u, 'admin');
    const p = db.patients.find(x => x.id === q.pid) || fail('Patient not found.');
    if (!db.doctors.some(d => d.id === q.did)) fail('Choose a valid doctor.');
    p.doctorId = q.did;
    linkNotify(p.id, `Your assigned doctor is now ${dn(q.did)}.`);
    linkNotify(q.did, `${p.name} (${p.id}) was assigned to you.`);
    return 'Doctor assignment updated.';
  },
  addDoctor(u, q) {
    needRole(u, 'admin');
    const un = String(q.user || '').toLowerCase();
    if (!q.name || !unameOk(un)) fail('Name and a valid username are required.');
    if (String(q.pw || '').length < 6) fail('Temporary password needs 6+ characters.');
    if (db.users.some(x => x.username === un)) fail('That username already exists.');
    const id = nid('DOC');
    db.doctors.push({ id, name: /^Dr\./.test(q.name) ? q.name : 'Dr. ' + q.name, spec: q.spec, qual: q.qual, exp: +q.exp || 0, email: q.email, phone: q.phone, days: q.days, slots: slotList(q.slots), active: true });
    db.users.push({ id: nid('U'), username: un, role: 'doctor', linkId: id, active: true, passHash: hashPw(q.pw) });
    return 'Doctor added with a login account.';
  },
  editDoctor(u, q) {
    needRole(u, 'admin');
    const d = db.doctors.find(x => x.id === q.id) || fail('Doctor not found.');
    Object.assign(d, { spec: q.spec, phone: q.phone, email: q.email, days: q.days, slots: slotList(q.slots) });
    return 'Doctor profile updated.';
  },
  saveMedicine(u, q) {
    needRole(u, 'admin');
    if (!q.name) fail('Medicine name is required.');
    const row = { name: q.name, category: q.category || '', qty: Math.max(0, +q.qty || 0), min: Math.max(0, +q.min || 0), expiry: q.expiry || addDays(today(), 365) };
    if (q.id) Object.assign(db.medicines.find(m => m.id === q.id) || fail('Medicine not found.'), row);
    else db.medicines.push({ id: nid('MED'), ...row });
    return 'Medicine saved. Colours update on every dashboard.';
  },
  stock(u, q) {
    needRole(u, 'admin');
    const m = db.medicines.find(x => x.id === q.id) || fail('Medicine not found.');
    m.qty = Math.max(0, m.qty + (+q.delta || 0));
    return `${m.name}: ${m.qty} in stock.`;
  },
  requestBlood(u, q) {
    needRole(u, 'patient');
    const group = String(q.group || ''), units = Math.max(1, Math.min(5, Math.floor(+q.units || 1)));
    const stock = db.bloodBank.find(x => x.group === group) || fail('Choose a valid blood group.');
    if (stock.units < units) fail(`Only ${stock.units} unit(s) of ${group} are currently available.`);
    const p = mineP(u), id = nid('BR');
    db.bloodRequests.unshift({ id, patientId: p.id, group, units, status: 'Pending', requestedAt: new Date().toISOString() });
    db.users.filter(x => x.role === 'admin').forEach(x => notify(x.id, `${p.name} requested ${units} unit(s) of ${group} blood (${id}).`));
    return 'Blood request sent to the hospital blood bank.';
  },
  updateBloodStock(u, q) {
    needRole(u, 'admin');
    const row = db.bloodBank.find(x => x.group === q.group) || fail('Blood group not found.');
    const delta = Math.floor(+q.delta || 0);
    if (!delta || Math.abs(delta) > 100) fail('Stock changes must be between 1 and 100 units.');
    if (row.units + delta < 0) fail('Stock cannot be reduced below zero.');
    row.units += delta;
    return `${row.group} blood stock updated to ${row.units} unit(s).`;
  },
  decideBloodRequest(u, q) {
    needRole(u, 'admin');
    const r = db.bloodRequests.find(x => x.id === q.id) || fail('Blood request not found.');
    if (r.status !== 'Pending') fail('This request has already been processed.');
    if (!['Approved', 'Rejected'].includes(q.status)) fail('Choose approve or reject.');
    if (q.status === 'Approved') {
      const stock = db.bloodBank.find(x => x.group === r.group) || fail('Blood group not found.');
      if (stock.units < r.units) fail(`Insufficient ${r.group} stock to approve this request.`);
      stock.units -= r.units;
    }
    r.status = q.status;
    r.processedAt = new Date().toISOString();
    const patient = db.patients.find(x => x.id === r.patientId);
    if (patient) linkNotify(patient.id, `Your ${r.group} blood request (${r.id}) was ${q.status.toLowerCase()}.`);
    return `Blood request ${q.status.toLowerCase()}.`;
  },
  deleteMedicine(u, q) {
    needRole(u, 'admin');
    db.medicines = db.medicines.filter(m => m.id !== q.id);
    return 'Medicine deleted.';
  },
  updateProfile(u, q) {
    needRole(u, 'patient');
    if (!phoneOk(q.phone)) fail('Enter a valid 10-digit phone number.');
    if (!emailOk(q.email)) fail('Enter a valid email address.');
    Object.assign(mineP(u), { phone: q.phone, email: q.email, address: q.address, allergies: q.allergies, conditions: q.conditions, ecName: q.ecName, ecPhone: q.ecPhone });
    return 'Your details were updated.';
  },
  bookAppointment(u, q) {
    needRole(u, 'patient');
    const p = mineP(u), d = db.doctors.find(x => x.id === q.did) || fail('Choose a doctor.');
    checkSlot(d, q.date, q.time);
    if (!q.reason) fail('Enter a reason for the visit.');
    const id = nid('APT');
    db.appointments.push({ id, patientId: p.id, doctorId: d.id, date: q.date, time: q.time, reason: q.reason, status: 'Pending' });
    linkNotify(d.id, `New appointment request ${id} from ${p.name} on ${fmtDay(q.date)} at ${q.time}. Approve or reject it.`);
    return 'Request sent. Your doctor will approve or reject it.';
  },
  setStatus(u, q) {
    needRole(u, 'doctor');
    const x = ownAppt(u, q.id);
    if (!['Approved', 'Rejected', 'Completed'].includes(q.status)) fail('Invalid status.');
    x.status = q.status;
    const word = { Approved: 'approved', Rejected: 'rejected', Completed: 'marked as completed' }[q.status];
    linkNotify(x.patientId, `${dn(x.doctorId)} has ${word} your appointment ${x.id} on ${fmtDay(x.date)} at ${x.time}.`);
    return `Appointment ${q.status.toLowerCase()}. The patient has been notified.`;
  },
  reschedule(u, q) {
    needRole(u, 'doctor');
    const x = ownAppt(u, q.id), d = mineD(u);
    checkSlot(d, q.date, q.time, x.id);
    Object.assign(x, { date: q.date, time: q.time, status: 'Rescheduled', note: 'Rescheduled by your doctor' });
    linkNotify(x.patientId, `${d.name} rescheduled ${x.id} to ${fmtDay(q.date)} at ${q.time}.`);
    return 'Rescheduled. The patient has been notified.';
  },
  notifyPatient(u, q) {
    needRole(u, 'doctor');
    const x = ownAppt(u, q.id);
    if (!q.msg) fail('Write a message first.');
    linkNotify(x.patientId, `${dn(x.doctorId)}: ${q.msg}`);
    return 'Notification sent to the patient.';
  },
  cancelAppointment(u, q) {
    needRole(u, 'patient');
    const x = ownAppt(u, q.id);
    x.status = 'Cancelled';
    linkNotify(x.doctorId, `${pn(x.patientId)} cancelled appointment ${x.id}.`);
    return 'Appointment cancelled.';
  },
  requestReschedule(u, q) {
    needRole(u, 'patient');
    const x = ownAppt(u, q.id);
    if (!q.pref) fail('Tell the doctor your preferred time.');
    x.note = 'Reschedule requested: ' + q.pref;
    linkNotify(x.doctorId, `${pn(x.patientId)} requested a new time for ${x.id}: ${q.pref}`);
    return 'Request sent to your doctor.';
  },
  addConsultation(u, q) {
    needRole(u, 'doctor');
    const p = patientOfDoctor(u, q.pid);
    if (!q.sym || !q.dx) fail('Symptoms and diagnosis are required.');
    db.records.push({ id: nid('CON'), patientId: p.id, doctorId: u.linkId, date: q.date || today(), symptoms: q.sym, diagnosis: q.dx, observations: q.obs || '', treatment: q.tx || '', followUp: q.fu || '' });
    linkNotify(p.id, `${dn(u.linkId)} added a consultation to your medical history.`);
    return 'Consultation saved to medical history.';
  },
  addPrescription(u, q) {
    needRole(u, 'doctor');
    const p = patientOfDoctor(u, q.pid);
    if (!db.medicines.some(m => m.id === q.med)) fail('Choose a medicine.');
    if (!q.start || !q.end) fail('Start and end dates are required.');
    if (q.end < q.start) fail('End date must be after the start date.');
    if ((+q.m || 0) + (+q.af || 0) + (+q.n || 0) === 0) fail('Add at least one dose (morning, afternoon or night).');
    db.prescriptions.push({ id: nid('RX'), patientId: p.id, doctorId: u.linkId, medicineId: q.med, dosage: q.dose, morning: +q.m || 0, afternoon: +q.af || 0, night: +q.n || 0, food: q.food, start: q.start, end: q.end, followUp: q.fu || '', instructions: q.ins || '' });
    linkNotify(p.id, `New prescription from ${dn(u.linkId)}: ${mn(q.med)} (${q.dose}).`);
    return 'Prescription saved. Reminders are now active for the patient.';
  },
  logDose(u, q) {
    needRole(u, 'patient');
    const rx = db.prescriptions.find(r => r.id === q.rxId && r.patientId === u.linkId) || fail('Prescription not found.');
    if (!['Taken', 'Missed'].includes(q.status)) fail('Invalid status.');
    if (!SLOTS.some(s => s[0] === q.slot)) fail('Unknown dose time.');
    if (!q.date || q.date > today()) fail('You can only log doses for today or earlier.');
    let rec = db.doses.find(d => d.rxId === rx.id && d.date === q.date && d.slot === q.slot);
    if (!rec) { rec = { id: nid('REC'), rxId: rx.id, patientId: u.linkId, date: q.date, slot: q.slot }; db.doses.push(rec) }
    Object.assign(rec, { status: q.status, at: new Date().toISOString(), followUpAt: q.status === 'Missed' ? Date.now() + 15 * 60000 : null, followed: false });
    return q.status === 'Taken' ? `${mn(rx.medicineId)} logged as taken. Well done!` : 'Saved as not taken. A follow-up reminder comes in 15 minutes.';
  },
  sendMessage(u, q) {
    const text = String(q.text || '').trim();
    if (!text) fail('Type a message first.');
    let pid, did;
    if (u.role === 'patient') { pid = u.linkId; did = mineP(u).doctorId }
    else if (u.role === 'doctor') { pid = patientOfDoctor(u, q.pid).id; did = u.linkId }
    else fail('Not allowed.');
    db.messages.push({ id: nid('MSG'), patientId: pid, doctorId: did, from: u.role, text, at: new Date().toISOString() });
    if (u.role === 'patient') linkNotify(did, `New message from ${pn(pid)}.`);
    else linkNotify(pid, `New message from ${dn(did)}.`);
    return '';
  },
  requestRefill(u, q) {
    needRole(u, 'patient');
    const m = db.medicines.find(x => x.id === q.id) || fail('Medicine not found.');
    linkNotify('ADM-01', `Refill request for ${m.name} (${m.qty} left) from ${mineP(u).name}.`);
    return 'Refill request sent to the admin.';
  },
  markRead(u) {
    db.notifications.forEach(n => { if (n.uid === u.id) n.read = true });
    return '';
  }
};

/* ---------- sign-in and registration ---------- */
function login(q) {
  const un = String(q.username ?? '').trim().toLowerCase();
  const u = db.users.find(x => x.username === un && x.role === q.role);
  if (!u) fail(`No ${q.role} account with that username.`);
  if (!checkPw(q.password, u.passHash)) fail('Incorrect password.');
  if (!u.active) fail('This account is inactive. Ask the admin.');
  const token = crypto.randomBytes(32).toString('hex');
  db.sessions[token] = { uid: u.id, at: Date.now() };
  return { token };
}
function register(q) {
  const g = k => String(q[k] ?? '').trim();
  const pw = String(q.password ?? '');
  const required = ['name', 'age', 'dob', 'phone', 'email', 'address', 'allergies', 'conditions', 'ecName', 'ecPhone', 'doctorId', 'date', 'time', 'username'];
  if (required.some(k => !g(k)) || !pw) fail('Fill in every required field.');
  if (!phoneOk(g('phone')) || !phoneOk(g('ecPhone'))) fail('Phone numbers need 10 digits, starting 6 to 9.');
  if (!emailOk(g('email'))) fail('Enter a valid email address.');
  const dob = g('dob');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dob) || dob < '1900-01-01') fail('Enter a valid date of birth.');
  if (dob > today()) fail('Date of birth cannot be in the future.');
  if (!(+g('age') > 0 && +g('age') < 120)) fail('Enter a valid age.');
  if (Math.abs(ageFrom(dob) - +g('age')) > 1) fail(`Age and date of birth do not match (that date gives age ${ageFrom(dob)}).`);
  if (pw.length < 6) fail('Password needs at least 6 characters.');
  if (pw !== String(q.password2 ?? '')) fail('Passwords do not match.');
  const un = g('username').toLowerCase();
  if (!unameOk(un)) fail('Username: 3–20 letters, numbers, dots or underscores.');
  if (db.users.some(x => x.username === un)) fail('That username is taken. Choose another.');
  const d = db.doctors.find(x => x.id === g('doctorId')) || fail('Choose a doctor.');
  checkSlot(d, g('date'), g('time'));
  const pid = nid('PAT');
  db.patients.push({ id: pid, name: g('name'), age: +g('age'), dob, gender: g('gender') || 'Other', phone: g('phone'), email: g('email'), address: g('address'), blood: g('blood') || 'Not known', allergies: g('allergies'), conditions: g('conditions'), ecName: g('ecName'), ecPhone: g('ecPhone'), doctorId: d.id, active: true });
  db.users.push({ id: nid('U'), username: un, role: 'patient', linkId: pid, active: true, passHash: hashPw(pw) });
  const aid = nid('APT');
  db.appointments.push({ id: aid, patientId: pid, doctorId: d.id, date: g('date'), time: g('time'), reason: g('reason') || 'General consultation', status: 'Pending' });
  linkNotify(d.id, `New patient ${g('name')} (${pid}) registered. Appointment ${aid} on ${fmtDay(g('date'))} at ${g('time')} needs your approval.`);
  linkNotify('ADM-01', `New patient registered: ${g('name')} (${pid}).`);
  return 'Registration complete. Sign in from any device with your new username.';
}

/* ---------- HTTP ---------- */
function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', c => { data += c; if (data.length > 200000) { reject(new Fail('Request too large.')); req.destroy() } });
    req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}) } catch (e) { reject(new Fail('Invalid request.')) } });
  });
}
function userFromReq(req) {
  const t = String(req.headers.authorization || '').replace(/^Bearer /, '');
  const s = t && Object.prototype.hasOwnProperty.call(db.sessions, t) ? db.sessions[t] : null;
  const u = s && db.users.find(x => x.id === s.uid);
  return u && u.active ? { u, t } : null;
}
function send(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}
async function api(req, res, url) {
  if (req.method === 'GET' && url === '/api/public') return send(res, 200, { doctors: publicDoctors() });
  if (req.method === 'GET' && url === '/api/state') {
    const s = userFromReq(req);
    return s ? send(res, 200, { state: viewFor(s.u) }) : send(res, 401, { error: 'Please sign in.' });
  }
  if (req.method !== 'POST') return send(res, 404, { error: 'Not found.' });
  const body = await readBody(req);
  if (url === '/api/login') { const out = login(body); saveDB(); return send(res, 200, out) }
  if (url === '/api/register') { const msg = register(body); saveDB(); return send(res, 200, { msg }) }
  if (url === '/api/logout') {
    const s = userFromReq(req);
    if (s) { delete db.sessions[s.t]; saveDB() }
    return send(res, 200, { ok: true });
  }
  if (url === '/api/op') {
    const s = userFromReq(req);
    if (!s) return send(res, 401, { error: 'Your session has ended. Please sign in again.' });
    if (!Object.prototype.hasOwnProperty.call(OPS, body.op)) return send(res, 400, { error: 'Unknown action.' });
    const msg = OPS[body.op](s.u, body.args || {});
    saveDB();
    return send(res, 200, { msg: msg || '', state: viewFor(s.u) });
  }
  send(res, 404, { error: 'Not found.' });
}
function serveStatic(url, res) {
  const file = path.join(ROOT, url === '/' ? 'index.html' : url);
  const allowed = file === path.join(ROOT, 'index.html') || [path.join(ROOT, 'css'), path.join(ROOT, 'js')].some(dir => file.startsWith(dir + path.sep));
  if (!allowed || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('Not found') }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
  fs.createReadStream(file).pipe(res);
}

const server = http.createServer(async (req, res) => {
  const url = req.url.split('?')[0];
  try {
    if (url.startsWith('/api/')) await api(req, res, url);
    else serveStatic(url, res);
  } catch (e) {
    if (e instanceof Fail) return send(res, 400, { error: e.message });
    console.error(e);
    if (!res.headersSent) send(res, 500, { error: 'Server error. Please try again.' });
  }
});

loadDB();
scheduler();
setInterval(scheduler, 30000);
server.listen(PORT, '0.0.0.0', () => {
  console.log('\nCareTrack server is running.');
  console.log('  This computer:  http://localhost:' + PORT);
  for (const l of Object.values(os.networkInterfaces()).flat()) if (l && l.family === 'IPv4' && !l.internal) console.log('  Other devices:  http://' + l.address + ':' + PORT + '   (same Wi-Fi)');
  console.log('\nPress Ctrl+C to stop.\n');
});
