/* CareTrack browser core. All data comes from the server. This file handles sign-in,
   registration, the app shell, live updates and the shared helpers used by every dashboard. */
const TOK='caretrack_token', THM='caretrack_theme';
const SLOTS=[['morning','Morning','08:00'],['afternoon','Afternoon','13:00'],['night','Night','21:00']];
const STATUSES=['Pending','Approved','Rescheduled','Completed','Rejected','Cancelled'];
const SPECS=['General Physician','Cardiologist','Dermatologist','Neurologist','Pediatrician','Orthopedic Specialist','Gynecologist','Ophthalmologist','ENT Specialist','Psychiatrist','Endocrinologist','Dentist'];
const PAL=['#168C91','#FF7A59','#7B61FF','#FFC145','#3BA7F5','#22A06B','#E5484D'];
const CC={green:'#22A06B',yellow:'#F5B800',red:'#E5484D'};
const MENU={
  admin:[['overview','Overview','🏠'],['patients','Patients','👥'],['doctors','Doctors','🩺'],['accounts','Accounts','🔐'],['medicines','Medicine stock','💊'],['bloodbank','Blood bank','🩸'],['appointments','Appointments','📅'],['reports','Monthly reports','📈'],['notes','Notifications','🔔'],['settings','Settings','⚙️']],
  doctor:[['overview','Overview','🏠'],['patients','My patients','👥'],['appointments','Appointments','📅'],['medicines','Medicine stock','💊'],['bloodbank','Blood bank','🩸'],['chat','Patient messages','💬'],['notes','Notifications','🔔'],['settings','Settings','⚙️']],
  patient:[['overview','Overview','🏠'],['care','My care','📋'],['medicines','Medicine search','🔎'],['bloodbank','Blood bank','🩸'],['appointments','Appointments','📅'],['chat','Chat with doctor','💬'],['notes','Notifications','🔔'],['settings','Settings','⚙️']]
};
let DB=null, ME=null, ROUTE='home', ROLE_SEL='patient', VIEW='overview', PSEL=null, CHATP=null;
let lastSig='', seenNotes=new Set(), primed=false, dirty=false, pollTimer=null, CAL_MONTH=new Date();

/* ---------- helpers ---------- */
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pad=n=>String(n).padStart(2,'0');
const iso=d=>d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
const today=()=>iso(new Date());
const addDays=(s,n)=>{const d=new Date(s+'T00:00');d.setDate(d.getDate()+n);return iso(d)};
const nowHM=()=>{const d=new Date();return pad(d.getHours())+':'+pad(d.getMinutes())};
const fmt=s=>s?new Date(s+'T00:00').toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}):'—';
const fmtT=v=>{const d=new Date(v);return isNaN(d)?'':d.toLocaleString('en-GB',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})};
const L=a=>a.map(s=>[s,s]);
const opts=(list,cur)=>list.map(([v,l])=>`<option value="${esc(v)}"${v===cur?' selected':''}>${esc(l)}</option>`).join('');
const field=(id,l,type='text')=>`<label>${l}<input id="${id}" type="${type}" required></label>`;
const pName=id=>DB.patients.find(p=>p.id===id)?.name||'—';
const dName=id=>DB.doctors.find(d=>d.id===id)?.name||'—';
const mName=id=>DB.medicines.find(m=>m.id===id)?.name||'—';
const specOf=a=>DB.doctors.find(d=>d.id===a.doctorId)?.spec||'';
const myP=()=>DB.patients.find(p=>p.id===ME.linkId);
const myD=()=>DB.doctors.find(d=>d.id===ME.linkId);
const stockOf=m=>m.qty<=0?['red','Red – Out of Stock']:m.qty<=m.min?['yellow','Yellow – Low Stock']:['green','Green – Available'];
const chip=m=>{const[c,t]=stockOf(m);return `<span class="chip ${c}"><i class="sd"></i>${t}</span>`};
const apChip=s=>`<span class="chip ${({Approved:'green',Completed:'teal',Rescheduled:'yellow',Rejected:'red',Cancelled:'red'})[s]||''}">${s}</span>`;
const isActiveRx=r=>r.start<=today()&&r.end>=today();
const byDate=(a,b)=>(a.date+a.time).localeCompare(b.date+b.time);
const greet=()=>{const h=new Date().getHours();return h>=5&&h<12?'Good Morning':h>=12&&h<17?'Good Afternoon':h>=17&&h<21?'Good Evening':'Good Night'};
const myName=()=>ME.role==='patient'?myP()?.name:ME.role==='doctor'?myD()?.name:'Administrator';
const bars=items=>{const mx=Math.max(1,...items.map(i=>i[1]));return items.map(([l,v,c])=>`<div class="bar-row"><span>${esc(l)}</span><div class="bar-track"><i style="width:${v/mx*100}%;background:${c}"></i></div><b>${v}</b></div>`).join('')};
const donut=items=>{const tot=items.reduce((a,b)=>a+b[1],0);if(!tot)return '<p class="muted">No data yet.</p>';let acc=0;const g=items.map(([,v,c])=>{const s=acc;acc+=v/tot*100;return `${c} ${s}% ${acc}%`}).join(',');return `<div class="donut" style="background:conic-gradient(${g})"><span>${tot}</span></div><ul class="legend">${items.map(([l,v,c])=>`<li><i style="background:${c}"></i>${esc(l)} <b>${v}</b></li>`).join('')}</ul>`};
const statCards=s=>`<div class="stats">${s.map(([l,v,c])=>`<div class="stat tilt c-${c}"><small>${l}</small><b>${v}</b></div>`).join('')}</div>`;
const filterRows=(id,q)=>{const s=q.trim().toLowerCase();document.querySelectorAll('#'+id+' tbody tr').forEach(r=>r.style.display=r.textContent.toLowerCase().includes(s)?'':'none')};
function toast(msg,type='info'){const t=document.createElement('div');t.className='toast '+type;t.textContent=msg;$('#toasts').appendChild(t);setTimeout(()=>t.classList.add('out'),3400);setTimeout(()=>t.remove(),3900)}

/* ---------- server connection ---------- */
/* api() sends the device's login token and turns server errors into readable messages. */
async function api(path,body){
  const t=localStorage.getItem(TOK),headers={'Content-Type':'application/json'};
  if(t)headers.Authorization='Bearer '+t;
  let r;
  try{r=await fetch(path,{method:body?'POST':'GET',headers,body:body?JSON.stringify(body):undefined,cache:'no-store'})}
  catch(e){throw new Error('Cannot reach the CareTrack server. Check that it is running.')}
  const j=await r.json().catch(()=>({}));
  if(!r.ok){
    if(r.status===401&&t){localStorage.removeItem(TOK);location.reload()}
    const err=new Error(j.error||'Something went wrong. Please try again.');err.status=r.status;throw err;
  }
  return j;
}
/* act() sends one change to the server. The server answers with the updated view for this user. */
async function act(op,args={}){
  try{const r=await api('/api/op',{op,args});setState(r.state);if(r.msg)toast(r.msg,'ok');return true}
  catch(e){toast(e.message,'bad');return false}
}
function setState(s){
  DB=s;ME=s.me;lastSig=JSON.stringify(s);dirty=false;
  s.notifications.forEach(n=>seenNotes.add(n.id));
  render();
}
async function loadState(){
  seenNotes=new Set();primed=false;VIEW='overview';
  setState((await api('/api/state')).state);
  clearInterval(pollTimer);pollTimer=setInterval(refresh,3000);
}
/* refresh() checks the server every 3 seconds. New notifications pop up at once on this device. */
const safeToRender=()=>$('#modal').classList.contains('hidden')&&!/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName||'');
async function refresh(){
  if(!ME)return;
  try{
    const s=(await api('/api/state')).state,sig=JSON.stringify(s);
    if(primed)s.notifications.filter(n=>!seenNotes.has(n.id)&&!n.read).reverse().forEach(n=>alertUser(n.msg));
    s.notifications.forEach(n=>seenNotes.add(n.id));primed=true;
    if(sig!==lastSig){lastSig=sig;DB=s;ME=s.me;dirty=true}
    if(dirty&&safeToRender()){dirty=false;render()}else updBell();
  }catch(e){}
}
function alertUser(msg){
  toast(msg);
  if('Notification' in window&&Notification.permission==='granted'){try{new Notification('CareTrack',{body:msg})}catch(e){}}
}
function updBell(){const b=$('#bell');if(!b||!DB)return;const n=DB.notifications.filter(x=>!x.read).length;b.innerHTML='🔔'+(n?`<b class="dot">${n}</b>`:'')}

/* ---------- medicine doses (the server records them; this only works out what is due) ---------- */
function doseRows(pid){
  const t=today(),now=nowHM(),out=[];
  DB.prescriptions.filter(r=>r.patientId===pid).forEach(rx=>{
    for(let d=rx.start;d<=rx.end&&d<=t;d=addDays(d,1))
      SLOTS.forEach(([k,label,time])=>{
        if(+rx[k])out.push({rx,date:d,slot:k,label,time,rec:DB.doses.find(x=>x.rxId===rx.id&&x.date===d&&x.slot===k),due:d<t||(d===t&&now>=time)});
      });
  });
  return out;
}
function adherence(pid){
  const rows=doseRows(pid),due=rows.filter(r=>r.due),taken=due.filter(r=>r.rec?.status==='Taken').length,missed=due.filter(r=>r.rec?.status==='Missed').length;
  return {rows,taken,missed,pending:rows.length-taken-missed,pct:due.length?Math.round(taken/due.length*100):100};
}

/* ---------- theme, tilt and navigation ---------- */
function toggleTheme(){const d=document.documentElement,n=d.dataset.theme==='dark'?'light':'dark';d.dataset.theme=n;localStorage.setItem(THM,n);render()}
function tiltMove(e){const el=e.target.closest?.('.tilt');if(!el)return;const r=el.getBoundingClientRect(),x=(e.clientX-r.left)/r.width-.5,y=(e.clientY-r.top)/r.height-.5;el.style.transform=`perspective(900px) rotateX(${-y*10}deg) rotateY(${x*12}deg)`}
function tiltOut(e){const el=e.target.closest?.('.tilt');if(el&&!el.contains(e.relatedTarget))el.style.transform=''}
const go=(r,role)=>{ROUTE=r;if(role)ROLE_SEL=role;render();window.scrollTo(0,0)};
async function logout(){try{await api('/api/logout',{})}catch(e){}localStorage.removeItem(TOK);location.reload()}
async function setView(v){
  VIEW=v;
  if(v==='notes'&&DB.notifications.some(n=>!n.read))await act('markRead');else render();
  window.scrollTo(0,0);
}

/* ---------- sign-in and registration screens ---------- */
const authShell=(inner,wide)=>`<section class="auth"><div class="auth-hero"><div class="cube"><div class="f1">✚</div><div class="f2">💊</div><div class="f3">🩺</div><div class="f4">❤️</div><div class="f5">📅</div><div class="f6">✔️</div></div><h1>CareTrack</h1><p>Track patients, doctors, appointments and medicine stock in one shared place, with reminders that keep every dose on schedule.</p><ul class="perks"><li>Live green, yellow and red medicine status</li><li>Doctor approvals, reschedules and notifications</li><li>Patient chat and dose reminders</li></ul></div><div class="auth-form"><header class="public-nav"><b>CareTrack</b><nav><button class="link" onclick="go('home')">Home</button><button class="link" onclick="go('about')">About</button><button class="link" onclick="go('contact')">Contact</button></nav></header><div class="panel ${wide?'lg':''}">${inner}</div></div></section>`;
const roleBtn=(fn,ico,t,d,c)=>`<button class="role tilt c-${c}" onclick="${fn}"><span class="ico">${ico}</span><b>${t}</b><small>${d}</small></button>`;
function home(){return authShell(`<h2>Welcome to CareTrack</h2><p class="muted">Choose how you want to continue.</p><div class="roles">${roleBtn("go('pchoice')",'🧑','Patient','Book visits, track medicines','teal')}${roleBtn("go('login','doctor')",'🩺','Doctor','Consult and manage patients','violet')}${roleBtn("go('login','admin')",'🛡️','Admin','Run the whole system','coral')}</div>`)}
function infoPage(which){const about=which==='about';return authShell(`<h2>${about?'About CareTrack':'Contact'}</h2><p>${about?'CareTrack helps patients manage appointments, prescriptions and medication reminders while giving care teams a shared view of their work.':'For help with this demonstration, contact your CareTrack administrator. For account access, use the sign-in options on the home page.'}</p><p class="small muted">Academic demonstration · Sample records are fictional.</p><button class="btn btn-primary" onclick="go('home')">Back to home</button>`)}
function pchoice(){return authShell(`<h2>Patient</h2><p class="muted">Do you already have an account?</p><div class="roles two">${roleBtn("go('login','patient')",'🔑','Already registered','Sign in from any device','teal')}${roleBtn("go('register')",'✨','New registration','Create your patient profile','coral')}</div><p><button class="link" onclick="go('home')">← Back</button></p>`)}
function loginView(){const r=ROLE_SEL;return authShell(`<h2>${{admin:'Admin',doctor:'Doctor',patient:'Patient'}[r]} sign in</h2><p class="muted">Use the username and password for your account.</p><form onsubmit="doLogin(event)">${field('lu','Username')}${field('lp','Password','password')}<button class="btn btn-primary wide">Sign in</button></form><p class="small muted">Forgot your password? Ask the admin to reset it.</p><p><button class="link" onclick="go('${r==='patient'?'pchoice':'home'}')">← Back</button></p>`)}
function registerView(){return authShell(`<h2>New patient registration</h2><p class="muted small">Fields marked * are required. Your details are saved on the server, so you can sign in from any device.</p>
<form class="reg" onsubmit="doRegister(event)">
<fieldset><legend>Personal details</legend>${field('rn','Full name *')}${field('ra','Age *','number')}${field('rdob','Date of birth *','date')}
<label>Gender<select id="rg">${opts(L(['Female','Male','Other']))}</select></label>${field('rph','Phone (10 digits) *','tel')}${field('rem','Email *','email')}${field('raddr','Address *')}
<label>Blood group<select id="rbg">${opts(L(['A+','A-','B+','B-','O+','O-','AB+','AB-']))}</select></label>${field('ral','Allergies (write None) *')}${field('rcond','Existing conditions (write None) *')}${field('rec','Emergency contact name *')}${field('recp','Emergency contact number *','tel')}</fieldset>
<fieldset><legend>Doctor and appointment</legend><label>Preferred specialization<select id="rs" onchange="fillDocs()">${opts(L([...new Set(DB.doctors.map(d=>d.spec))]))}</select></label><label>Preferred doctor<select id="rd" onchange="fillSlots()"></select></label>${field('rappd','Appointment date *','date')}<label>Appointment time<select id="rt"></select></label><label class="span2">Reason for appointment<textarea id="rr" rows="2"></textarea></label></fieldset>
<fieldset><legend>Account</legend>${field('ru','Username (3–20 letters, numbers . _) *')}${field('rp','Password (6+ characters) *','password')}${field('rp2','Confirm password *','password')}</fieldset>
<button class="btn btn-primary wide">Create my account</button></form>
<p><button class="link" onclick="go('pchoice')">← Back</button></p>`,true)}
function fillDocs(s='#rs',d='#rd',t='#rt'){const ds=DB.doctors.filter(x=>x.active&&x.spec===$(s).value);$(d).innerHTML=ds.map(x=>`<option value="${x.id}">${esc(x.name)} · ${x.exp} yrs</option>`).join('')||'<option value="">No doctor available</option>';fillSlots(d,t)}
function fillSlots(d='#rd',t='#rt'){const x=DB.doctors.find(y=>y.id===$(d).value);$(t).innerHTML=(x?x.slots:[]).map(s=>`<option>${s}</option>`).join('')}
async function doLogin(e){
  e.preventDefault();
  try{
    const j=await api('/api/login',{role:ROLE_SEL,username:$('#lu').value,password:$('#lp').value});
    localStorage.setItem(TOK,j.token);
    await loadState();toast('Welcome back!','ok');
  }catch(err){toast(err.message,'bad')}
}
async function doRegister(e){
  e.preventDefault();
  const g=i=>$('#'+i).value;
  const data={name:g('rn').trim(),age:g('ra'),dob:g('rdob'),gender:g('rg'),phone:g('rph').trim(),email:g('rem').trim(),address:g('raddr').trim(),blood:g('rbg'),allergies:g('ral').trim(),conditions:g('rcond').trim(),ecName:g('rec').trim(),ecPhone:g('recp').trim(),doctorId:g('rd'),date:g('rappd'),time:g('rt'),reason:g('rr').trim(),username:g('ru').trim(),password:g('rp'),password2:g('rp2')};
  try{const j=await api('/api/register',data);toast(j.msg,'ok');go('login','patient')}
  catch(err){toast(err.message,'bad')}
}

/* ---------- settings (every role) ---------- */
async function changePw(e){
  e.preventDefault();
  if($('#np').value!==$('#np2').value)return toast('New passwords do not match.','bad');
  if(await act('changePassword',{cur:$('#cp').value,next:$('#np').value}))e.target.reset();
}
async function resetDemo(){
  if(!confirm('Reset CareTrack to the demo data? Every saved change on the server will be lost, and everyone must sign in again.'))return;
  try{await api('/api/op',{op:'resetDemo',args:{}})}catch(e){}
  localStorage.removeItem(TOK);location.reload();
}
function askPerm(){
  if(!('Notification' in window))return toast('This browser does not support notifications.','bad');
  Notification.requestPermission().then(p=>{toast('Browser notifications: '+p,p==='granted'?'ok':'warn');render()});
}
function settingsView(){
  const perm='Notification' in window?Notification.permission:'not supported',dark=document.documentElement.dataset.theme==='dark';
  return `<div class="grid2"><div class="card"><h3>Change password</h3><p class="small muted">Set a new password for your ${ME.role} account.</p><form onsubmit="changePw(event)">${field('cp','Current password','password')}${field('np','New password (6+ characters)','password')}${field('np2','Confirm new password','password')}<button class="btn btn-primary">Update password</button></form></div>
<div class="card"><h3>Preferences</h3>
<div class="dose"><div><b>Theme</b><br><small>Switch between light and dark mode.</small></div><button class="btn" onclick="toggleTheme()">${dark?'☀️ Light mode':'🌙 Dark mode'}</button></div>
<div class="dose"><div><b>Browser notifications</b><br><small>Permission: ${perm}. Pop-ups appear while CareTrack is open in a tab.</small></div><button class="btn" onclick="askPerm()">Allow alerts</button></div>
${ME.role==='admin'?`<div class="dose"><div><b>Reset demo data</b><br><small>Restores the sample patients, doctors and medicines on the server.</small></div><button class="btn btn-danger" onclick="resetDemo()">Reset</button></div>`:''}
<div class="dose"><div><b>Sign out</b><br><small>Your data stays saved on the server.</small></div><button class="btn btn-danger" onclick="logout()">Log out</button></div></div></div>`;
}
function notesView(){
  return `<div class="card"><h3>Notifications</h3><p class="small muted">Approvals, rejections, reschedules, reminders and messages appear here.</p>${DB.notifications.map(n=>`<div class="note"><span class="ni">🔔</span><div>${esc(n.msg)}<br><small>${fmtT(n.at)}</small></div></div>`).join('')||'<p class="muted">No notifications yet.</p>'}</div>`;
}

/* ---------- app shell and render ---------- */
function dash(){
  const menu=MENU[ME.role],cur=menu.find(m=>m[0]===VIEW)||menu[0],nm=myName()||'',
    hi=ME.role==='patient'?`${greet()}, ${esc(nm.split(' ')[0])}!`:`Welcome, ${esc(nm)}`,
    kind={admin:'Admin console',doctor:'Doctor portal',patient:'Patient portal'}[ME.role];
  const view=(VIEWS[ME.role][VIEW]||VIEWS[ME.role].overview)();
  return `<div class="shell"><aside class="sidebar"><div class="brand"><span class="logo">✚</span><div><b>CareTrack</b><small>${kind}</small></div></div>
<nav class="nav">${menu.map(([k,l,i])=>`<button class="nav-btn ${k===cur[0]?'on':''}" onclick="setView('${k}')"><span class="ni">${i}</span>${l}</button>`).join('')}</nav>
<div class="side-card"><b>${esc(nm)}</b><small>${ME.linkId}</small></div></aside>
<main class="main"><header class="topbar"><div><h1>${cur[1]}</h1><p class="muted">${hi}</p></div>
<div class="tools"><button id="bell" class="icon-btn" title="Notifications" onclick="setView('notes')"></button><button class="icon-btn" title="Light or dark theme" onclick="toggleTheme()">🌓</button><button class="btn btn-ghost" onclick="logout()">Log out</button></div></header>
<section class="view">${view}</section>
<p class="demo-note">CareTrack demo: all people, doctors and medicines are fictional. Not medical advice.</p></main></div>`;
}
function render(){
  if(!DB)return;
  const app=$('#app');
  if(ME){app.innerHTML=dash();updBell();if(ME.role==='patient'&&VIEW==='appointments')fillDocs('#bs','#bd','#btm')}
  else{
    app.innerHTML=ROUTE==='home'?home():ROUTE==='about'||ROUTE==='contact'?infoPage(ROUTE):ROUTE==='pchoice'?pchoice():ROUTE==='register'?registerView():loginView();
    if(ROUTE==='register'){fillDocs();$('#rappd').min=addDays(today(),0);$('#rappd').value=addDays(today(),1);$('#rdob').max=today();$('#rdob').min='1900-01-01'}
  }
  const c=document.querySelector('.chat');if(c)c.scrollTop=c.scrollHeight;
}
