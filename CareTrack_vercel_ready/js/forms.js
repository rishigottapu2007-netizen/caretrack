/* CareTrack forms. Each button sends one request to the server with act(). The server checks the
   user's role, saves the change and notifies everyone affected, then sends back the updated view. */

/* ---------- modal dialogs ---------- */
function openModal(title,body,onOk,okText='Save'){
  $('#modalCard').innerHTML=`<div class="mh"><h2>${esc(title)}</h2><button class="icon-btn" onclick="closeModal()">✕</button></div><div class="mt">${body}</div><div class="mf"><button class="btn btn-ghost" onclick="closeModal()">${onOk?'Cancel':'Close'}</button>${onOk?`<button class="btn btn-primary" id="mok">${okText}</button>`:''}</div>`;
  $('#modal').classList.remove('hidden');
  if(onOk){let busy=false;$('#mok').onclick=async()=>{if(busy)return;busy=true;try{await onOk()}finally{busy=false}}}
}
const closeModal=()=>$('#modal').classList.add('hidden');
const F=(k,l,type='text',val='',list=[])=>({k,l,type,val,list});
/* openForm builds the fields. submit(values) returns true when the server accepted the change. */
function openForm(title,fs,submit,okText){
  const body=`<div class="fgrid">${fs.map(f=>f.type==='select'?`<label>${f.l}<select id="m_${f.k}">${opts(f.list,f.val)}</select></label>`:f.type==='textarea'?`<label class="span2">${f.l}<textarea id="m_${f.k}" rows="3">${esc(f.val)}</textarea></label>`:`<label>${f.l}<input id="m_${f.k}" type="${f.type}" value="${esc(f.val)}"></label>`).join('')}</div>`;
  openModal(title,body,async()=>{
    const v={};fs.forEach(f=>v[f.k]=$('#m_'+f.k).value.trim());
    if(await submit(v))closeModal();
  },okText);
}

/* ---------- admin: patients, doctors, accounts, stock ---------- */
function addPatient(){
  openForm('Add patient',[F('name','Full name'),F('age','Age','number'),F('gender','Gender','select','Female',L(['Female','Male','Other'])),F('phone','Phone (10 digits)','tel'),F('email','Email','email'),F('blood','Blood group','select','O+',L(['A+','A-','B+','B-','O+','O-','AB+','AB-'])),F('did','Assigned doctor','select',DB.doctors[0]?.id,DB.doctors.map(d=>[d.id,d.name])),F('user','Login username'),F('pw','Temporary password','password')],v=>act('addPatient',v),'Add patient');
}
const reassign=(pid,did)=>act('reassignPatient',{pid,did});
function openProfile(pid){const p=DB.patients.find(x=>x.id===pid);openModal('Patient profile · '+p.name,profileHTML(p))}
function addDoctor(){
  openForm('Add doctor',[F('name','Full name'),F('spec','Specialization','select',SPECS[0],L(SPECS)),F('qual','Qualification'),F('exp','Experience (years)','number','5'),F('email','Email','email'),F('phone','Phone (10 digits)','tel'),F('days','Availability','text','Mon–Sat'),F('slots','Consultation times (comma separated)','text','09:00, 10:00, 11:00'),F('user','Login username'),F('pw','Temporary password','password')],v=>act('addDoctor',v),'Add doctor');
}
function editDoctor(id){
  const d=DB.doctors.find(x=>x.id===id);
  openForm('Edit '+d.name,[F('spec','Specialization','select',d.spec,L(SPECS)),F('phone','Phone','tel',d.phone),F('email','Email','email',d.email),F('days','Availability','text',d.days),F('slots','Consultation times','text',d.slots.join(', '))],v=>act('editDoctor',{id,...v}),'Save');
}
function medForm(id){
  const m=id?DB.medicines.find(x=>x.id===id):{name:'',category:'',qty:0,min:10,expiry:addDays(today(),365)};
  openForm(id?'Edit medicine':'Add medicine',[F('name','Medicine name','text',m.name),F('category','Category','text',m.category),F('qty','Available quantity','number',m.qty),F('min','Minimum stock (yellow below this)','number',m.min),F('expiry','Expiry date','date',m.expiry)],v=>act('saveMedicine',{id,...v}),'Save');
}
const stock=(id,delta)=>act('stock',{id,delta});
function delMed(id){if(confirm('Delete this medicine from the inventory?'))act('deleteMedicine',{id})}
function resetPw(id){
  const u=DB.users.find(x=>x.id===id);
  openForm('Reset password · '+u.username,[F('pw','New password (6+ characters)','password')],v=>act('resetPassword',{uid:id,pw:v.pw}),'Reset password');
}
function renameUser(id){
  const u=DB.users.find(x=>x.id===id);
  openForm('Change username',[F('name','New username','text',u.username)],v=>act('renameUser',{uid:id,username:v.name}),'Save username');
}
const toggleUser=id=>act('toggleUser',{uid:id});

/* ---------- appointments: doctor and patient ---------- */
const apStatus=(id,status)=>act('setStatus',{id,status});
function reschedForm(id){
  const a=DB.appointments.find(x=>x.id===id),d=DB.doctors.find(x=>x.id===a.doctorId);
  openForm('Reschedule '+id,[F('date','New date','date',a.date),F('time','New time','select',a.time,L(d.slots))],v=>act('reschedule',{id,...v}),'Reschedule and notify');
}
function notifyForm(id){
  openForm('Notify patient · '+id,[F('msg','Message','textarea','Please arrive 10 minutes early and bring your medicine list.')],v=>act('notifyPatient',{id,msg:v.msg}),'Send notification');
}
function cancelAppt(id){if(confirm('Cancel this appointment?'))act('cancelAppointment',{id})}
function reqResched(id){
  openForm('Request a new time · '+id,[F('pref','Preferred new date and time','textarea','Any weekday afternoon next week')],v=>act('requestReschedule',{id,pref:v.pref}),'Send request');
}
function bookAppt(e){
  e.preventDefault();
  act('bookAppointment',{did:$('#bd').value,date:$('#bdt').value,time:$('#btm').value,reason:$('#brs').value.trim()});
}

/* ---------- doctor: consultations and prescriptions ---------- */
function consultForm(pid){
  const p=DB.patients.find(x=>x.id===pid);
  openForm('Consultation · '+p.name,[F('date','Consultation date','date',today()),F('sym','Symptoms','textarea'),F('dx','Diagnosis'),F('obs','Observations','textarea'),F('tx','Treatment notes','textarea'),F('fu','Follow-up date','date',addDays(today(),14))],v=>act('addConsultation',{pid,...v}),'Save consultation');
}
function rxForm(pid){
  const p=DB.patients.find(x=>x.id===pid);
  openForm('New prescription · '+p.name,[F('med','Medicine','select',DB.medicines[0]?.id,DB.medicines.map(m=>[m.id,`${m.name} (${m.qty} in stock)`])),F('dose','Dosage','text','1 tablet'),F('m','Morning doses','number','1'),F('af','Afternoon doses','number','0'),F('n','Night doses','number','1'),F('food','Food instruction','select','After food',L(['After food','Before food'])),F('start','Start date','date',today()),F('end','End date','date',addDays(today(),6)),F('fu','Follow-up date','date',addDays(today(),14)),F('ins','Additional instructions','textarea','Take with a glass of water.')],v=>act('addPrescription',{pid,...v}),'Save prescription');
}

/* ---------- patient: doses, chat, details, refills ---------- */
const doseAction=(rxId,date,slot,status)=>act('logDose',{rxId,date,slot,status});
async function sendMsg(e,pid){
  e.preventDefault();
  const el=$('#chatIn'),text=el.value.trim();
  if(!text)return;
  if(await act('sendMessage',{pid,text}))el.value='';
}
const refill=id=>act('requestRefill',{id});
function editProfile(){
  const p=myP();
  openForm('Update my details',[F('phone','Phone (10 digits)','tel',p.phone),F('email','Email','email',p.email),F('address','Address','text',p.address),F('allergies','Allergies','text',p.allergies),F('conditions','Medical conditions','text',p.conditions),F('ecName','Emergency contact name','text',p.ecName),F('ecPhone','Emergency contact number','tel',p.ecPhone)],v=>act('updateProfile',v),'Save');
}
