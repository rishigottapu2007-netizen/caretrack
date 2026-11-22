/* CareTrack dashboards for Admin, Doctor and Patient, plus browser startup. Loaded last. */

/* ---------- shared pieces ---------- */
function apptTable(list,mode){
  const act=mode==='doctor'||mode==='patient';
  return `<div class="table-wrap"><table id="appt"><thead><tr><th>Appointment</th><th>Patient</th><th>Doctor</th><th>Date and time</th><th>Reason</th><th>Status</th>${act?'<th>Actions</th>':''}</tr></thead><tbody>
${list.map(a=>`<tr><td><b>${a.id}</b><br><small>${esc(specOf(a))}</small></td><td>${esc(pName(a.patientId))}<br><small>${a.patientId}</small></td><td>${esc(dName(a.doctorId))}<br><small>${a.doctorId}</small></td><td>${fmt(a.date)}<br><small>${a.time}</small></td><td>${esc(a.reason)}${a.note?`<br><small class="muted">${esc(a.note)}</small>`:''}</td><td>${apChip(a.status)}</td>${act?`<td class="acts">${actsFor(a,mode)}</td>`:''}</tr>`).join('')||`<tr><td colspan="7" class="muted">No appointments yet.</td></tr>`}
</tbody></table></div>`;
}
function actsFor(a,mode){
  if(mode==='doctor'){
    return [
      a.status==='Pending'&&`<button class="btn btn-sm btn-ok" onclick="apStatus('${a.id}','Approved')">Approve</button><button class="btn btn-sm btn-danger" onclick="apStatus('${a.id}','Rejected')">Reject</button>`,
      ['Pending','Approved','Rescheduled'].includes(a.status)&&`<button class="btn btn-sm btn-ghost" onclick="reschedForm('${a.id}')">Reschedule</button>`,
      a.status==='Approved'&&`<button class="btn btn-sm btn-ghost" onclick="apStatus('${a.id}','Completed')">Complete</button>`,
      `<button class="btn btn-sm btn-ghost" onclick="notifyForm('${a.id}')">Notify patient</button>`
    ].filter(Boolean).join(' ');
  }
  if(mode==='patient'&&['Pending','Approved','Rescheduled'].includes(a.status))
    return `<button class="btn btn-sm btn-ghost" onclick="reqResched('${a.id}')">Request reschedule</button><button class="btn btn-sm btn-danger" onclick="cancelAppt('${a.id}')">Cancel</button>`;
  return '';
}
function rxCard(rx){
  const t=today(),st=rx.end<t?'Completed':rx.start>t?'Upcoming':'Active',cls={Active:'green',Upcoming:'teal',Completed:''}[st],
    days=Math.round((new Date(rx.end)-new Date(rx.start))/864e5)+1;
  return `<div class="rx tilt"><div class="rx-h"><b>${esc(mName(rx.medicineId))}</b><span class="chip ${cls}">${st}</span></div><p>${esc(rx.dosage)} · Morning ${rx.morning} · Afternoon ${rx.afternoon} · Night ${rx.night} · ${rx.food}</p><small>${fmt(rx.start)} to ${fmt(rx.end)} · ${days} days · Prescribed by ${esc(dName(rx.doctorId))}</small><p class="small muted">${esc(rx.instructions)}${rx.followUp?' · Follow-up '+fmt(rx.followUp):''}</p></div>`;
}
const timelineItem=r=>`<div class="tl"><b>${fmt(r.date)} · ${esc(r.diagnosis)}</b><p>${esc(r.symptoms)}<br><small>${esc(dName(r.doctorId))} · Observations: ${esc(r.observations)} · Treatment: ${esc(r.treatment)} · Follow-up: ${fmt(r.followUp)}</small></p></div>`;
function profileHTML(p){
  const rec=DB.records.filter(r=>r.patientId===p.id).sort((a,b)=>b.date.localeCompare(a.date));
  const rx=DB.prescriptions.filter(r=>r.patientId===p.id).sort((a,b)=>b.start.localeCompare(a.start));
  const ap=DB.appointments.filter(a=>a.patientId===p.id).sort(byDate).reverse();
  return `<div class="pgrid"><div><h4>Details</h4><dl class="dl">${[['Patient ID',p.id],['Age and gender',p.age+' · '+p.gender],...(p.dob?[['Date of birth',fmt(p.dob)]]:[]),['Blood group',p.blood],['Phone',p.phone],['Email',p.email],['Address',p.address],['Allergies',p.allergies],['Conditions',p.conditions],['Emergency contact',p.ecName+' · '+p.ecPhone],['Doctor',dName(p.doctorId)]].map(([a,b])=>`<dt>${a}</dt><dd>${esc(b)}</dd>`).join('')}</dl></div>
<div><h4>Medical history</h4>${rec.map(timelineItem).join('')||'<p class="muted">No consultations yet.</p>'}</div></div>
<h4>Prescriptions</h4>${rx.map(rxCard).join('')||'<p class="muted">No prescriptions yet.</p>'}
<h4>Appointment history</h4>${apptTable(ap,'admin')}`;
}
function doseRow(r){
  const taken=r.rec?.status==='Taken',missed=r.rec?.status==='Missed';
  const st=taken?'<span class="chip green"><i class="sd"></i>Taken</span>':missed?'<span class="chip red"><i class="sd"></i>Not taken</span>':r.due?'<span class="chip yellow"><i class="sd"></i>Due now</span>':`<span class="chip"><i class="sd"></i>Upcoming · ${r.time}</span>`;
  const acts=r.due&&!taken?`<button class="btn btn-sm btn-ok" onclick="doseAction('${r.rx.id}','${r.date}','${r.slot}','Taken')">Taken</button><button class="btn btn-sm btn-ghost" onclick="doseAction('${r.rx.id}','${r.date}','${r.slot}','Missed')">Not Taken</button>`:'';
  return `<div class="dose"><div><b>${esc(mName(r.rx.medicineId))}</b> · ${esc(r.rx.dosage)}<br><small>${r.label} · ${r.time} · ${r.rx.food}${r.rx.instructions?' · '+esc(r.rx.instructions):''}</small></div><div class="dose-r">${st}${acts}</div></div>`;
}
function chatBox(pid,did,side){
  const m=DB.messages.filter(x=>x.patientId===pid&&x.doctorId===did);
  return `<div class="chat">${m.map(x=>`<div class="bubble ${x.from===side?'me':''}">${esc(x.text)}<small>${fmtT(x.at)}</small></div>`).join('')||'<p class="muted">No messages yet. Say hello.</p>'}</div>
<form class="chat-form" onsubmit="sendMsg(event,'${pid}','${did}','${side}')"><input id="chatIn" placeholder="Type a message…" required autocomplete="off"><button class="btn btn-primary">Send</button></form>`;
}
/* Shared medicine availability: Green = available, Yellow = low stock, Red = out of stock. The count is always shown. */
function medsView(){
  const isPt=ME.role==='patient',mine=isPt?DB.prescriptions.filter(r=>r.patientId===ME.linkId&&isActiveRx(r)).map(r=>r.medicineId):[];
  return `<div class="card"><div class="toolbar"><input class="search" placeholder="Search by medicine name or category" oninput="filterRows('mq',this.value)"><span class="small muted">Green · Available &nbsp; Yellow · Low stock &nbsp; Red · Out of stock</span></div>
<div class="table-wrap"><table id="mq"><thead><tr><th>Medicine</th><th>Category</th><th>Availability</th><th>Available count</th>${isPt?'<th>Refill</th>':''}</tr></thead><tbody>
${DB.medicines.map(m=>`<tr><td><b>${esc(m.name)}</b>${mine.includes(m.id)?' <span class="chip teal">Prescribed to you</span>':''}</td><td>${esc(m.category)}</td><td>${chip(m)}</td><td><b class="count">${m.qty}</b></td>${isPt?`<td>${m.qty>m.min?'<small class="muted">In stock</small>':`<button class="btn btn-sm btn-primary" onclick="refill('${m.id}')">Request refill</button>`}</td>`:''}</tr>`).join('')}
</tbody></table></div><p class="small muted">Stock is shared live from the admin inventory. Changes appear in every dashboard.</p></div>`;
}
function bloodStats(people){
  const groups=['A+','A-','B+','B-','O+','O-','AB+','AB-'];
  return `<div class="blood-grid">${groups.map((g,i)=>`<div class="blood-item"><b>${g}</b><span>${people.filter(p=>p.blood===g).length}</span></div>`).join('')}</div>`;
}
function bloodBankView(){
  const admin=ME.role==='admin',patient=ME.role==='patient',groups=DB.bloodBank||[];
  return `<div class="card"><div class="toolbar"><h3>Hospital blood bank</h3><span class="small muted">Available units by blood group</span></div><div class="table-wrap"><table><thead><tr><th>Blood group</th><th>Available units</th><th>Stock status</th>${admin||patient?'<th>Action</th>':''}</tr></thead><tbody>${groups.map(b=>`<tr><td><b class="blood-type">${esc(b.group)}</b></td><td><b class="count">${b.units}</b></td><td><span class="chip ${b.units===0?'red':b.units<5?'yellow':'green'}"><i class="sd"></i>${b.units===0?'Unavailable':b.units<5?'Low stock':'Available'}</span></td>${admin?`<td class="acts"><button class="btn btn-sm btn-ok" onclick="act('updateBloodStock',{group:'${b.group}',delta:5})">+5 units</button><button class="btn btn-sm btn-ghost" onclick="act('updateBloodStock',{group:'${b.group}',delta:-1})">−1</button></td>`:patient?`<td><button class="btn btn-sm btn-primary" ${b.units<1?'disabled':''} onclick="act('requestBlood',{group:'${b.group}',units:1})">Request 1 unit</button></td>`:''}</tr>`).join('')}</tbody></table></div>${patient?'<p class="small muted">Requests are sent to hospital staff for approval. Blood group compatibility and clinical suitability must be confirmed by the treating team.</p>':''}</div>${patient?`<div class="card"><h3>My blood requests</h3>${bloodRequestTable(DB.bloodRequests||[])}</div>`:''}${admin?`<div class="card"><h3>Patient blood requests</h3>${bloodRequestTable(DB.bloodRequests||[],true)}</div>`:''}`;
}
function bloodRequestTable(list,admin=false){return `<div class="table-wrap"><table><thead><tr><th>Request</th><th>Patient</th><th>Blood group</th><th>Units</th><th>Requested</th><th>Status</th>${admin?'<th>Action</th>':''}</tr></thead><tbody>${list.map(r=>`<tr><td>${esc(r.id)}</td><td>${esc(pName(r.patientId))}</td><td><b>${esc(r.group)}</b></td><td>${r.units}</td><td>${fmtT(r.requestedAt)}</td><td><span class="chip ${r.status==='Approved'?'green':r.status==='Rejected'?'red':'yellow'}">${esc(r.status)}</span></td>${admin?`<td class="acts">${r.status==='Pending'?`<button class="btn btn-sm btn-ok" onclick="act('decideBloodRequest',{id:'${r.id}',status:'Approved'})">Approve</button><button class="btn btn-sm btn-danger" onclick="act('decideBloodRequest',{id:'${r.id}',status:'Rejected'})">Reject</button>`:'—'}</td>`:''}</tr>`).join('')||`<tr><td colspan="${admin?7:6}" class="muted">No blood requests yet.</td></tr>`}</tbody></table></div>`}
function monthCalendar(appointments,scope='patient'){
  const year=CAL_MONTH.getFullYear(),month=CAL_MONTH.getMonth(),first=new Date(year,month,1),start=(first.getDay()+6)%7,days=new Date(year,month+1,0).getDate(),title=first.toLocaleDateString('en-US',{month:'long',year:'numeric'});
  const padCells=Array.from({length:start},()=>'<div class="cal-cell empty"></div>').join('');
  const cells=Array.from({length:days},(_,i)=>{const date=year+'-'+String(month+1).padStart(2,'0')+'-'+String(i+1).padStart(2,'0'),items=appointments.filter(a=>a.date===date);return `<div class="cal-cell"><b class="cal-day">${i+1}</b>${items.map(a=>`<div class="cal-event" title="${esc(pName(a.patientId))} · ${esc(dName(a.doctorId))} · ${esc(a.time)}">${esc(a.time)} ${scope==='patient'?esc(dName(a.doctorId)):esc(pName(a.patientId))}</div>`).join('')}</div>`}).join('');
  return `<div class="card"><div class="toolbar"><h3>Appointment calendar</h3><div class="acts"><button class="btn btn-sm" onclick="CAL_MONTH=new Date(CAL_MONTH.getFullYear(),CAL_MONTH.getMonth()-1,1);render()">‹</button><b>${title}</b><button class="btn btn-sm" onclick="CAL_MONTH=new Date(CAL_MONTH.getFullYear(),CAL_MONTH.getMonth()+1,1);render()">›</button></div></div><div class="calendar"><div class="cal-head">${['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(x=>`<b>${x}</b>`).join('')}</div><div class="cal-grid">${padCells}${cells}</div></div><p class="small muted">${appointments.filter(a=>a.date.slice(0,7)===year+'-'+String(month+1).padStart(2,'0')).length} appointments this month</p></div>`;
}

/* ---------- admin ---------- */
function aOverview(){
  const A=DB.appointments,M=DB.medicines,low=M.filter(m=>m.qty<=m.min).length,specs=[...new Set(DB.doctors.map(d=>d.spec))];
  return statCards([['Total patients',DB.patients.length,'teal'],['Total doctors',DB.doctors.length,'violet'],['Appointments',A.length,'sky'],['Medicines',M.length,'sun'],['Pending appointments',A.filter(a=>a.status==='Pending').length,'coral'],['Low or out of stock',low,'red'],['Active prescriptions',DB.prescriptions.filter(isActiveRx).length,'green']])+`<div class="grid2"><div class="card"><h3>Patient blood groups</h3>${bloodStats(DB.patients)}</div><div class="card"><h3>Monthly appointment report</h3>${bars(monthCounts(A))}<button class="btn btn-sm btn-primary" onclick="setView('reports')">Open reports</button></div></div>`+
`<div class="grid2"><div class="card"><h3>Patients per doctor</h3>${bars(DB.doctors.map((d,i)=>[d.name.replace('Dr. ',''),DB.patients.filter(p=>p.doctorId===d.id).length,PAL[i]]))}</div>
<div class="card"><h3>Specialization mix</h3>${donut(specs.map((s,i)=>[s,DB.doctors.filter(d=>d.spec===s).length,PAL[i%PAL.length]]))}</div>
<div class="card"><h3>Medicine stock</h3>${bars(M.map(m=>[m.name,m.qty,CC[stockOf(m)[0]]]))}</div>
<div class="card"><h3>Appointment status</h3>${bars(STATUSES.map((s,i)=>[s,A.filter(a=>a.status===s).length,PAL[i]]))}</div></div>
<div class="card"><h3>Latest appointments</h3>${apptTable(A.slice().sort(byDate).reverse().slice(0,8),'admin')}</div>`;
}
function monthCounts(list){const labels=[];for(let i=5;i>=0;i--){const d=new Date(CAL_MONTH.getFullYear(),CAL_MONTH.getMonth()-i,1);labels.push([d.toLocaleDateString('en-US',{month:'short',year:'2-digit'}),d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')])}return labels.map(([label,key],i)=>[label,list.filter(a=>a.date.slice(0,7)===key).length,PAL[i%PAL.length]])}
function aReports(){const key=CAL_MONTH.getFullYear()+'-'+String(CAL_MONTH.getMonth()+1).padStart(2,'0'),list=DB.appointments.filter(a=>a.date.slice(0,7)===key).sort(byDate);return `<div class="card"><div class="toolbar"><h3>Monthly reports and statistics</h3><div class="acts"><button class="btn btn-sm" onclick="CAL_MONTH=new Date(CAL_MONTH.getFullYear(),CAL_MONTH.getMonth()-1,1);render()">‹</button><b>${CAL_MONTH.toLocaleDateString('en-US',{month:'long',year:'numeric'})}</b><button class="btn btn-sm" onclick="CAL_MONTH=new Date(CAL_MONTH.getFullYear(),CAL_MONTH.getMonth()+1,1);render()">›</button></div></div>${statCards([['Appointments',list.length,'teal'],['Approved',list.filter(a=>a.status==='Approved').length,'green'],['Completed',list.filter(a=>a.status==='Completed').length,'sky'],['Pending',list.filter(a=>a.status==='Pending').length,'sun'],['Cancelled / rejected',list.filter(a=>['Cancelled','Rejected'].includes(a.status)).length,'red']])}<div class="grid2"><div><h4>Appointments over six months</h4>${bars(monthCounts(DB.appointments))}</div><div><h4>Status breakdown</h4>${donut(STATUSES.map((s,i)=>[s,list.filter(a=>a.status===s).length,PAL[i%PAL.length]]))}</div><div><h4>Patients by blood group</h4>${bloodStats(DB.patients)}</div><div><h4>Specialist coverage</h4>${bars([...new Set(DB.doctors.map(d=>d.spec))].map((s,i)=>[s,DB.doctors.filter(d=>d.spec===s).length,PAL[i%PAL.length]]))}</div></div></div><div class="card"><h3>${key} appointment details</h3>${apptTable(list,'admin')}</div>`}
function aPatients(){
  return `<div class="card"><div class="toolbar"><input class="search" placeholder="Search by name or patient ID" oninput="filterRows('pt',this.value)"><button class="btn btn-primary" onclick="addPatient()">+ Add patient</button></div>
<div class="table-wrap"><table id="pt"><thead><tr><th>Patient ID</th><th>Name</th><th>Age and gender</th><th>Blood</th><th>Assigned doctor</th><th>Visits</th><th></th></tr></thead><tbody>
${DB.patients.map(p=>`<tr><td>${p.id}</td><td><b>${esc(p.name)}</b></td><td>${p.age} · ${p.gender}</td><td>${p.blood}</td><td><select onchange="reassign('${p.id}',this.value)">${opts(DB.doctors.map(d=>[d.id,d.name]),p.doctorId)}</select></td><td>${DB.appointments.filter(a=>a.patientId===p.id).length}</td><td><button class="btn btn-sm" onclick="openProfile('${p.id}')">View profile</button></td></tr>`).join('')}
</tbody></table></div></div>`;
}
function aDoctors(){
  return `<div class="card"><div class="toolbar"><h3>Doctors and availability</h3><button class="btn btn-primary" onclick="addDoctor()">+ Add doctor</button></div>
<div class="table-wrap"><table id="dt"><thead><tr><th>Doctor ID</th><th>Name</th><th>Specialization</th><th>Qualification</th><th>Experience</th><th>Contact</th><th>Availability</th><th>Patients</th><th></th></tr></thead><tbody>
${DB.doctors.map(d=>`<tr><td>${d.id}</td><td><b>${esc(d.name)}</b></td><td>${esc(d.spec)}</td><td>${esc(d.qual)}</td><td>${d.exp} yrs</td><td>${esc(d.email)}<br><small>${esc(d.phone)}</small></td><td>${esc(d.days)}<br><small>${d.slots.join(', ')}</small></td><td>${DB.patients.filter(p=>p.doctorId===d.id).length}</td><td><button class="btn btn-sm" onclick="editDoctor('${d.id}')">Edit</button></td></tr>`).join('')}
</tbody></table></div></div>`;
}
function aAccounts(){
  return `<div class="card"><h3>User accounts</h3><p class="small muted">Passwords are stored as salted hashes on the server and are never shown. Use Reset password to set a new one.</p>
<div class="table-wrap"><table id="acc"><thead><tr><th>User ID</th><th>Username</th><th>Role</th><th>Linked ID</th><th>Status</th><th>Actions</th></tr></thead><tbody>
${DB.users.map(u=>`<tr><td>${u.id}</td><td><b>${esc(u.username)}</b></td><td>${u.role}</td><td>${u.linkId}</td><td><span class="chip ${u.active?'green':'red'}"><i class="sd"></i>${u.active?'Active':'Inactive'}</span></td><td class="acts"><button class="btn btn-sm" onclick="resetPw('${u.id}')">Reset password</button><button class="btn btn-sm btn-ghost" onclick="renameUser('${u.id}')">Change username</button><button class="btn btn-sm btn-ghost" onclick="toggleUser('${u.id}')">${u.active?'Deactivate':'Activate'}</button></td></tr>`).join('')}
</tbody></table></div></div>`;
}
function aMeds(){
  return `<div class="card"><div class="toolbar"><input class="search" placeholder="Search medicine" oninput="filterRows('mt',this.value)"><button class="btn btn-primary" onclick="medForm()">+ Add medicine</button></div>
<div class="table-wrap"><table id="mt"><thead><tr><th>ID</th><th>Medicine</th><th>Category</th><th>Status</th><th>Count</th><th>Minimum</th><th>Expiry</th><th>Change stock</th></tr></thead><tbody>
${DB.medicines.map(m=>{const exp=m.expiry<today(),near=!exp&&m.expiry<addDays(today(),60);return `<tr><td>${m.id}</td><td><b>${esc(m.name)}</b></td><td>${esc(m.category)}</td><td>${chip(m)}</td><td><b class="count">${m.qty}</b></td><td>${m.min}</td><td>${fmt(m.expiry)} ${exp?'<span class="chip red">Expired</span>':near?'<span class="chip yellow">Expiring soon</span>':''}</td><td class="acts"><button class="btn btn-sm" onclick="stock('${m.id}',-10)">−10</button><button class="btn btn-sm" onclick="stock('${m.id}',-1)">−1</button><button class="btn btn-sm btn-ok" onclick="stock('${m.id}',1)">+1</button><button class="btn btn-sm btn-ok" onclick="stock('${m.id}',10)">+10</button><button class="btn btn-sm btn-ghost" onclick="medForm('${m.id}')">Edit</button><button class="btn btn-sm btn-danger" onclick="delMed('${m.id}')">Delete</button></td></tr>`}).join('')}
</tbody></table></div><p class="small muted">Each change updates the colour and count in the doctor and patient dashboards.</p></div>`;
}
function aAppts(){
  return `<div class="card"><div class="toolbar"><h3>All appointments</h3><input class="search" placeholder="Search patient, doctor or ID" oninput="filterRows('appt',this.value)"></div>${apptTable(DB.appointments.slice().sort(byDate).reverse(),'admin')}</div>`;
}

/* ---------- doctor ---------- */
function dOverview(){
  const me=myD(),A=DB.appointments.filter(a=>a.doctorId===me.id),t=today(),mine=DB.patients.filter(p=>p.doctorId===me.id),mix=[['Taken',0,CC.green],['Missed',0,CC.red],['Pending',0,CC.yellow]];
  mine.forEach(p=>{const a=adherence(p.id);mix[0][1]+=a.taken;mix[1][1]+=a.missed;mix[2][1]+=a.pending});
  return statCards([['Assigned patients',mine.length,'teal'],["Today’s appointments",A.filter(a=>a.date===t&&a.status!=='Rejected').length,'violet'],['Pending approvals',A.filter(a=>a.status==='Pending').length,'coral'],['Completed visits',A.filter(a=>a.status==='Completed').length,'green'],['Active prescriptions',DB.prescriptions.filter(r=>r.doctorId===me.id&&isActiveRx(r)).length,'sky']])+
`<div class="grid2"><div class="card"><h3>Appointments by status</h3>${bars(STATUSES.map((s,i)=>[s,A.filter(a=>a.status===s).length,PAL[i]]))}</div><div class="card"><h3>Adherence of my patients</h3>${donut(mix)}</div><div class="card"><h3>My patients by blood group</h3>${bloodStats(mine)}</div></div>
<div class="card"><h3>Approve or reject new requests</h3>${apptTable(A.filter(a=>a.status==='Pending').sort(byDate),'doctor')}</div>`;
}
function dPatients(){
  const mine=DB.patients.filter(p=>p.doctorId===myD().id),cur=mine.find(p=>p.id===PSEL)||mine[0];
  if(!cur)return '<div class="card"><p>No patients are assigned to you yet.</p></div>';
  return `<div class="split"><div class="card"><input class="search" style="max-width:none" placeholder="Search name or ID" oninput="filterRows('dpl',this.value)"><div class="table-wrap" style="margin-top:10px"><table id="dpl"><tbody>
${mine.map(p=>`<tr class="pick-row ${p.id===cur.id?'on':''}" onclick="PSEL='${p.id}';render()"><td><b>${esc(p.name)}</b><br><small>${p.id} · ${esc(p.conditions)}</small></td></tr>`).join('')}
</tbody></table></div></div>
<div class="card"><div class="toolbar"><h3>${esc(cur.name)} <small>${cur.id}</small></h3><div class="acts"><button class="btn btn-sm btn-ghost" onclick="consultForm('${cur.id}')">+ Consultation</button><button class="btn btn-sm btn-primary" onclick="rxForm('${cur.id}')">+ Prescription</button></div></div>${profileHTML(cur)}</div></div>`;
}
function dAppts(){
  const list=DB.appointments.filter(a=>a.doctorId===ME.linkId).sort(byDate);
  return `<div class="card"><div class="toolbar"><h3>My appointments</h3><input class="search" placeholder="Search patient name or ID" oninput="filterRows('appt',this.value)"></div>${apptTable(list,'doctor')}</div>`;
}
function dChat(){
  const me=myD(),mine=DB.patients.filter(p=>p.doctorId===me.id),cur=mine.find(p=>p.id===CHATP)||mine[0];
  if(!cur)return '<div class="card"><p>No patients yet.</p></div>';
  return `<div class="split"><div class="card">${mine.map(p=>`<button class="pick ${p.id===cur.id?'on':''}" onclick="CHATP='${p.id}';render()">${esc(p.name)}</button>`).join('')}</div>
<div class="card"><h3>${esc(cur.name)}</h3><p class="small muted">Messages reach the patient's device through the server.</p>${chatBox(cur.id,me.id,'doctor')}</div></div>`;
}

/* ---------- patient ---------- */
function pOverview(){
  const p=myP(),d=DB.doctors.find(x=>x.id===p.doctorId),t=today(),A=adherence(p.id),
    next=DB.appointments.filter(a=>a.patientId===p.id&&a.date>=t&&['Pending','Approved','Rescheduled'].includes(a.status)).sort(byDate)[0],
    todays=A.rows.filter(r=>r.date===t),active=DB.prescriptions.filter(r=>r.patientId===p.id&&isActiveRx(r)).length;
  return `<div class="hero tilt"><div><h2>${greet()}, ${esc(p.name.split(' ')[0])}!</h2><p>Your doctor: ${esc(d?.name||'—')} · ${esc(d?.spec||'')}</p><p class="small">Today you have ${todays.length} scheduled dose${todays.length===1?'':'s'}.</p></div><div class="ring" style="--p:${A.pct}"><div><b>${A.pct}%</b><small>Adherence</small></div></div></div>
${statCards([['Taken',A.taken,'green'],['Missed',A.missed,'red'],['Pending',A.pending,'sun'],['Active prescriptions',active,'teal']])}<div class="card"><h3>Your blood group</h3><p class="blood-highlight">${esc(p.blood||'Not recorded')}</p><button class="btn btn-sm btn-primary" onclick="setView('bloodbank')">View blood bank stock</button></div>${monthCalendar(DB.appointments.filter(a=>a.patientId===p.id&&['Pending','Approved','Rescheduled'].includes(a.status)))}
<div class="grid2"><div class="card"><h3>Today’s medication</h3>${todays.map(doseRow).join('')||'<p class="muted">No medicines scheduled today.</p>'}</div>
<div class="card"><h3>Next appointment</h3>${next?`<div class="rx"><b>${fmt(next.date)} at ${next.time}</b><p>${esc(dName(next.doctorId))} · ${apChip(next.status)}</p><small>${esc(next.reason)}</small></div>`:'<p class="muted">Nothing booked yet. Open Appointments to book a visit.</p>'}
<h3 class="mt">Adherence breakdown</h3>${bars([['Taken',A.taken,CC.green],['Missed',A.missed,CC.red],['Pending',A.pending,CC.yellow]])}</div></div>`;
}
function pCare(){
  const p=myP(),rx=DB.prescriptions.filter(r=>r.patientId===p.id).sort((a,b)=>b.start.localeCompare(a.start)),rec=DB.records.filter(r=>r.patientId===p.id).sort((a,b)=>b.date.localeCompare(a.date));
  return `<div class="card emg-card"><div class="toolbar"><h3>Emergency profile</h3><button class="btn btn-sm" onclick="editProfile()">Edit my details</button></div>
<div class="emg">${[['Patient ID',p.id],['Blood group',p.blood],['Allergies',p.allergies],['Medical conditions',p.conditions],['Emergency contact',p.ecName+' · '+p.ecPhone],['Assigned doctor',dName(p.doctorId)]].map(([a,b])=>`<div><small>${a}</small><b>${esc(b)}</b></div>`).join('')}</div></div>
<div class="card"><h3>Medical timeline</h3>${rec.map(timelineItem).join('')||'<p class="muted">No consultations yet.</p>'}</div>
<div class="card"><h3>Prescriptions</h3>${rx.map(rxCard).join('')||'<p class="muted">No prescriptions yet.</p>'}</div>`;
}
function pAppts(){
  const p=myP(),d=DB.doctors.find(x=>x.id===p.doctorId),specs=[...new Set(DB.doctors.map(x=>x.spec))];
  return `<div class="grid2"><div class="card"><h3>Book an appointment</h3><p class="small muted">Choose a specialization and doctor. Your doctor approves or rejects every request.</p>
<form class="reg" onsubmit="bookAppt(event)">
<label>Specialization<select id="bs" onchange="fillDocs('#bs','#bd','#btm')">${opts(L(specs),d?.spec)}</select></label>
<label>Doctor<select id="bd" onchange="fillSlots('#bd','#btm')"></select></label>
<label>Date<input type="date" id="bdt" min="${today()}" value="${addDays(today(),1)}" required></label>
<label>Time<select id="btm"></select></label>
<label>Reason<textarea id="brs" rows="2" required></textarea></label>
<button class="btn btn-primary wide">Request appointment</button></form></div>
<div class="card"><h3>My appointments</h3>${apptTable(DB.appointments.filter(a=>a.patientId===p.id).sort(byDate).reverse(),'patient')}</div></div>`;
}
function pChat(){
  const p=myP(),d=DB.doctors.find(x=>x.id===p.doctorId);
  return `<div class="card"><h3>Chat with ${esc(d?.name||'your doctor')}</h3><p class="small muted">${esc(d?.spec||'')} · Ask about medicines, symptoms or your next visit. Your doctor sees these messages.</p>${chatBox(p.id,p.doctorId,'patient')}</div>`;
}

/* ---------- role menus ---------- */
const VIEWS={
  admin:{overview:aOverview,patients:aPatients,doctors:aDoctors,accounts:aAccounts,medicines:aMeds,bloodbank:bloodBankView,appointments:aAppts,reports:aReports,notes:notesView,settings:settingsView},
  doctor:{overview:dOverview,patients:dPatients,appointments:dAppts,medicines:medsView,bloodbank:bloodBankView,chat:dChat,notes:notesView,settings:settingsView},
  patient:{overview:pOverview,care:pCare,medicines:medsView,bloodbank:bloodBankView,appointments:pAppts,chat:pChat,notes:notesView,settings:settingsView}
};

/* ---------- startup ---------- */
/* A signed-in device loads its view from the server. A new device loads only the doctor list
   that the registration form needs. */
async function boot(){
  document.documentElement.dataset.theme=localStorage.getItem(THM)||'light';
  document.addEventListener('pointermove',tiltMove);
  document.addEventListener('pointerout',tiltOut);
  $('#modal').addEventListener('click',e=>{if(e.target.id==='modal')closeModal()});
  try{
    if(localStorage.getItem(TOK)){await loadState();return}
    DB=await api('/api/public');
    render();
  }catch(e){
    $('#app').innerHTML=`<div class="panel" style="margin:40px auto">${esc(e.message)}<br><small>Start the server with <b>node server.js</b>, then open the link it prints.</small></div>`;
  }
}
boot();
