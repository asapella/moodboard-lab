/* Moodboard Lab V1 — plain JS + Supabase */
const cfg = window.MOODBOARD_CONFIG || {};
const configured = cfg.SUPABASE_URL && !cfg.SUPABASE_URL.includes('YOUR_PROJECT') && cfg.SUPABASE_PUBLISHABLE_KEY && !cfg.SUPABASE_PUBLISHABLE_KEY.includes('YOUR_KEY');
const supabaseClient = configured ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_PUBLISHABLE_KEY, { auth:{ persistSession:true, autoRefreshToken:true, detectSessionInUrl:true }}) : null;

const $ = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => [...r.querySelectorAll(s)];
const app = $('#app');
const state = { session:null, profile:null, route:'home', project:null, moodboard:null, items:[], selectedItem:null, teacherViewing:false, saveTimer:null, urls:new Map(), classId:null };
const CATEGORIES = ['Forma','Materiale','Colore','Atmosfera','Texture','Riferimento','Altro'];
const LAYOUTS = ['editoriale','griglia','collage','architettura'];

function esc(v=''){return String(v).replace(/[&<>"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]));}
function toast(msg){const t=$('#toast');t.textContent=msg;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2200)}
function setLoading(){app.innerHTML=$('#loadingTemplate').innerHTML}
function showNav(on=true){$('#logoutBtn').classList.toggle('hidden',!on);$('#homeBtn').classList.toggle('hidden',!on)}
function saveStatus(txt=''){ $('#saveStatus').textContent=txt; }
function fmtDate(v){ if(!v)return '—'; return new Intl.DateTimeFormat('it-IT',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}).format(new Date(v)); }
function uid(){return state.session?.user?.id}
function isTeacher(){return state.profile?.role==='teacher'}

window.addEventListener('click', async e=>{
  const el=e.target.closest('[data-action]'); if(!el)return;
  const a=el.dataset.action;
  if(a==='logout') return logout();
  if(a==='home') return renderHome();
  if(a==='auth-tab') return switchAuthTab(el.dataset.tab);
  if(a==='new-project') return openNewProjectModal();
  if(a==='open-project') return openProject(el.dataset.id, el.dataset.owner || null);
  if(a==='delete-project') return deleteProject(el.dataset.id);
  if(a==='create-class') return openCreateClassModal();
  if(a==='teacher-class') {state.classId=el.dataset.id; return renderTeacherDashboard();}
  if(a==='teacher-student') return renderTeacherStudent(el.dataset.id, el.dataset.classId);
  if(a==='new-moodboard') return createMoodboard(el.dataset.project);
  if(a==='open-moodboard') return openMoodboard(el.dataset.id, el.dataset.readonly==='1');
  if(a==='layout') return generateLayout(el.dataset.layout);
  if(a==='submit') return toggleSubmit();
  if(a==='delete-item') return deleteSelectedItem();
  if(a==='export') return exportBoard();
  if(a==='close-modal') return closeModal();
});

async function init(){
  if(!configured){showNav(false);return renderSetup();}
  setLoading();
  const {data:{session}}=await supabaseClient.auth.getSession(); state.session=session;
  supabaseClient.auth.onAuthStateChange((_ev,s)=>{state.session=s});
  if(!session){showNav(false);return renderAuth();}
  await loadProfile(); showNav(true); renderHome();
}

function renderSetup(){
  app.innerHTML=`<section class="auth-shell"><div class="auth-hero"><div><div class="eyebrow">Prima configurazione</div><h1>MOOD<br>BOARD<br>LAB</h1></div><p>La webapp è pronta. Collega il tuo progetto Supabase per attivare autenticazione, classi, storage e salvataggi.</p></div><div class="card auth-panel stack"><h2>Collega Supabase</h2><div class="setup-warning">Apri <strong>config.js</strong> e sostituisci i due valori segnaposto con Project URL e <strong>Publishable key</strong>.</div><ol class="muted" style="line-height:1.8"><li>Esegui <strong>supabase.sql</strong> nel SQL Editor.</li><li>Crea un bucket Storage privato chiamato <strong>moodboard-images</strong>.</li><li>Imposta URL e publishable key in <strong>config.js</strong>.</li><li>Ricarica questa pagina.</li></ol><p class="muted">Trovi tutti i passaggi nel file README.md.</p></div></section>`;
}

function renderAuth(){
  app.innerHTML=`<section class="auth-shell"><div class="auth-hero"><div><div class="eyebrow">CFP · progettazione</div><h1>MOOD<br>BOARD<br>LAB</h1></div><p>Carica riferimenti, assegna un peso, costruisci la gerarchia visiva e conserva tutto il processo progettuale.</p></div><div class="card auth-panel"><div class="auth-tabs"><button class="btn" data-action="auth-tab" data-tab="login">Accedi</button><button class="ghost" data-action="auth-tab" data-tab="signup">Studente: registrati</button></div><div id="authForm"></div></div></section>`;
  switchAuthTab('login');
}
function switchAuthTab(tab){
  $$('.auth-tabs button').forEach(b=>{b.className=b.dataset.tab===tab?'btn':'ghost'});
  const host=$('#authForm');
  if(tab==='login') host.innerHTML=`<form id="loginForm" class="stack"><label>Email<input class="input" name="email" type="email" required autocomplete="email"></label><label>Password<input class="input" name="password" type="password" required autocomplete="current-password"></label><button class="btn accent">Accedi</button></form>`;
  else host.innerHTML=`<form id="signupForm" class="stack"><label>Nome e cognome<input class="input" name="name" required></label><label>Email<input class="input" name="email" type="email" required></label><label>Password<input class="input" name="password" type="password" minlength="6" required></label><label>Codice classe<input class="input" name="classcode" required maxlength="12" style="text-transform:uppercase"></label><button class="btn accent">Crea account studente</button><p class="muted" style="font-size:12px">L'account docente viene promosso a ruolo <strong>teacher</strong> dal database, come descritto nel README.</p></form>`;
  $('#loginForm')?.addEventListener('submit',login);
  $('#signupForm')?.addEventListener('submit',signup);
}
async function login(e){e.preventDefault();const f=new FormData(e.target);const {error}=await supabaseClient.auth.signInWithPassword({email:f.get('email'),password:f.get('password')});if(error)return toast(error.message);state.session=(await supabaseClient.auth.getSession()).data.session;await loadProfile();showNav(true);renderHome();}
async function signup(e){e.preventDefault();const f=new FormData(e.target);const email=f.get('email'),password=f.get('password'),name=f.get('name').trim(),classcode=f.get('classcode').trim().toUpperCase();
  const {data,error}=await supabaseClient.auth.signUp({email,password,options:{data:{full_name:name,class_code:classcode}}}); if(error)return toast(error.message);
  if(!data.session){toast('Account creato: conferma l’email e poi accedi.');return switchAuthTab('login')}
  state.session=data.session; await loadProfile();
  const {error:joinErr}=await supabaseClient.rpc('join_class_by_code',{p_code:classcode}); if(joinErr)toast('Account creato, ma codice classe non valido.');
  showNav(true);renderHome();
}
async function logout(){await supabaseClient.auth.signOut();state.session=null;state.profile=null;state.project=null;showNav(false);renderAuth();}
async function loadProfile(){
  let {data}=await supabaseClient.from('profiles').select('*').eq('id',uid()).maybeSingle();
  if(!data){await new Promise(r=>setTimeout(r,250));({data}=await supabaseClient.from('profiles').select('*').eq('id',uid()).maybeSingle())}
  state.profile=data||{id:uid(),full_name:state.session.user.email,role:'student'};
}
async function renderHome(){state.project=null;state.moodboard=null;state.items=[];state.teacherViewing=false;saveStatus('');setLoading();if(isTeacher())return renderTeacherDashboard();return renderStudentDashboard();}

async function renderStudentDashboard(){
  const {data:projects,error}=await supabaseClient.from('projects').select('*, moodboards(id,status,thumbnail_path,updated_at)').eq('owner_id',uid()).order('updated_at',{ascending:false});if(error)return fatal(error);
  app.innerHTML=`<div class="page-head"><div><div class="eyebrow">Area studente</div><h1>${esc(state.profile.full_name||'I tuoi progetti')}</h1><div class="muted">Tu vedi solo i tuoi lavori. Il docente della classe può consultarli.</div></div><button class="btn accent" data-action="new-project">+ Nuovo progetto</button></div><div class="grid" id="projectGrid"></div>`;
  const g=$('#projectGrid'); if(!projects?.length){g.innerHTML='<div class="empty-state">Non hai ancora progetti.<br>Crea il primo progetto per iniziare.</div>';return}
  for(const p of projects) g.append(await projectCard(p,false));
}
async function projectCard(p,readonly){
  const div=document.createElement('article');div.className='card project-card';
  const mb=(p.moodboards||[]).sort((a,b)=>new Date(b.updated_at)-new Date(a.updated_at))[0];let thumb='';
  if(mb?.thumbnail_path) thumb=await signedUrl(mb.thumbnail_path);
  div.innerHTML=`<div class="project-thumb ${thumb?'':'empty'}">${thumb?`<img src="${thumb}">`:'M'}</div><div class="project-body"><div class="row"><h3 class="grow">${esc(p.title)}</h3>${p.moodboards?.some(m=>m.status==='submitted')?'<span class="status submitted">consegna</span>':''}</div><p class="muted" style="font-size:13px;min-height:34px">${esc(p.description||'')}</p><div class="meta"><span>${p.moodboards?.length||0} moodboard</span><span>${fmtDate(p.updated_at)}</span></div><div class="row" style="margin-top:12px"><button class="btn grow" data-action="open-project" data-id="${p.id}" data-owner="${p.owner_id}">${readonly?'Apri':'Continua'}</button>${!readonly?`<button class="danger" data-action="delete-project" data-id="${p.id}">×</button>`:''}</div></div>`;return div;
}
function openNewProjectModal(){modal(`<h2>Nuovo progetto</h2><form id="newProjectForm" class="stack"><label>Titolo<input class="input" name="title" required placeholder="es. Rifugio alpino"></label><label>Descrizione<textarea name="description" placeholder="Tema, obiettivo o parole chiave…"></textarea></label><div class="row"><button type="button" class="ghost grow" data-action="close-modal">Annulla</button><button class="btn accent grow">Crea</button></div></form>`);$('#newProjectForm').addEventListener('submit',createProject)}
async function createProject(e){e.preventDefault();const f=new FormData(e.target);const {data,error}=await supabaseClient.from('projects').insert({owner_id:uid(),title:f.get('title').trim(),description:f.get('description').trim()}).select().single();if(error)return toast(error.message);closeModal();openProject(data.id)}
async function deleteProject(id){if(!confirm('Eliminare questo progetto e tutte le sue moodboard?'))return;const {error}=await supabaseClient.from('projects').delete().eq('id',id);if(error)return toast(error.message);renderHome()}

async function openProject(id, owner=null){setLoading();const {data:p,error}=await supabaseClient.from('projects').select('*, moodboards(*)').eq('id',id).single();if(error)return fatal(error);state.project=p;state.teacherViewing=isTeacher()&&p.owner_id!==uid();
  app.innerHTML=`<div class="page-head"><div><div class="eyebrow">${state.teacherViewing?'Visione docente':'Progetto'}</div><h1>${esc(p.title)}</h1><div class="muted">${esc(p.description||'')}</div></div>${state.teacherViewing?'':`<button class="btn accent" data-action="new-moodboard" data-project="${p.id}">+ Nuova moodboard</button>`}</div><div class="grid" id="mbGrid"></div>`;
  const g=$('#mbGrid');if(!p.moodboards?.length){g.innerHTML='<div class="empty-state">Nessuna moodboard in questo progetto.</div>';return}
  for(const m of p.moodboards.sort((a,b)=>new Date(b.updated_at)-new Date(a.updated_at))){let thumb=m.thumbnail_path?await signedUrl(m.thumbnail_path):'';const d=document.createElement('article');d.className='card project-card';d.innerHTML=`<div class="project-thumb ${thumb?'':'empty'}">${thumb?`<img src="${thumb}">`:'M'}</div><div class="project-body"><div class="row"><h3 class="grow">${esc(m.title)}</h3><span class="status ${m.status==='submitted'?'submitted':''}">${m.status==='submitted'?'consegnato':'bozza'}</span></div><div class="meta"><span>${esc(m.layout_type)}</span><span>${fmtDate(m.updated_at)}</span></div><button style="margin-top:12px;width:100%" class="btn" data-action="open-moodboard" data-id="${m.id}" data-readonly="${state.teacherViewing?'1':'0'}">${state.teacherViewing?'Visualizza':'Modifica'}</button></div>`;g.append(d)}
}
async function createMoodboard(projectId){const {data,error}=await supabaseClient.from('moodboards').insert({project_id:projectId,owner_id:uid(),title:'Moodboard 01',layout_type:'editoriale'}).select().single();if(error)return toast(error.message);openMoodboard(data.id,false)}

async function renderTeacherDashboard(){
  const {data:classes,error}=await supabaseClient.from('classes').select('*').eq('teacher_id',uid()).order('name');if(error)return fatal(error);if(!state.classId&&classes?.length)state.classId=classes[0].id;
  let members=[]; if(state.classId){const r=await supabaseClient.from('class_members').select('student_id, joined_at, profiles!class_members_student_id_fkey(id,full_name,email), classes!inner(id,name)').eq('class_id',state.classId);if(r.error)return fatal(r.error);members=r.data||[]}
  app.innerHTML=`<div class="page-head"><div><div class="eyebrow">Area docente</div><h1>Classi e progetti</h1><div class="muted">Puoi consultare i lavori degli studenti delle tue classi in sola lettura.</div></div><button class="btn accent" data-action="create-class">+ Crea classe</button></div><div class="teacher-layout"><aside class="card sidebar"><strong>Le tue classi</strong><div style="margin-top:10px">${classes?.map(c=>`<button class="class-button ${c.id===state.classId?'active':''}" data-action="teacher-class" data-id="${c.id}">${esc(c.name)}<br><small class="muted">codice ${esc(c.code)}</small></button>`).join('')||'<p class="muted">Nessuna classe.</p>'}</div></aside><section class="card"><div class="pad"><h2 style="margin:0">${esc(classes?.find(c=>c.id===state.classId)?.name||'Crea la prima classe')}</h2></div><div id="studentList"></div></section></div>`;
  const list=$('#studentList');if(!members.length){list.innerHTML='<div class="empty-state" style="margin:0 20px 20px">Nessuno studente ancora iscritto con il codice classe.</div>';return}
  for(const m of members){const {count}=await supabaseClient.from('projects').select('*',{count:'exact',head:true}).eq('owner_id',m.student_id).eq('class_id',state.classId);const d=document.createElement('div');d.className='student-row';d.innerHTML=`<div class="row"><div class="avatar">${esc((m.profiles?.full_name||'?').trim()[0]||'?')}</div><div><strong>${esc(m.profiles?.full_name||'Studente')}</strong><div class="muted" style="font-size:12px">${esc(m.profiles?.email||'')}</div></div></div><span class="muted">${count||0} progetti</span><span class="muted">${fmtDate(m.joined_at)}</span><button class="btn" data-action="teacher-student" data-id="${m.student_id}" data-class-id="${state.classId}">Apri</button>`;list.append(d)}
}
function openCreateClassModal(){modal(`<h2>Crea classe</h2><form id="classForm" class="stack"><label>Nome classe<input class="input" name="name" required placeholder="es. 1 Design"></label><label>Codice di accesso<input class="input" name="code" required maxlength="12" placeholder="1DESIGN26" style="text-transform:uppercase"></label><div class="row"><button type="button" class="ghost grow" data-action="close-modal">Annulla</button><button class="btn accent grow">Crea</button></div></form>`);$('#classForm').addEventListener('submit',createClass)}
async function createClass(e){e.preventDefault();const f=new FormData(e.target);const {data,error}=await supabaseClient.from('classes').insert({teacher_id:uid(),name:f.get('name').trim(),code:f.get('code').trim().toUpperCase()}).select().single();if(error)return toast(error.message);state.classId=data.id;closeModal();renderTeacherDashboard()}
async function renderTeacherStudent(studentId,classId){setLoading();const {data:profile}=await supabaseClient.from('profiles').select('*').eq('id',studentId).single();const {data:projects,error}=await supabaseClient.from('projects').select('*, moodboards(id,status,thumbnail_path,updated_at)').eq('owner_id',studentId).eq('class_id',classId).order('updated_at',{ascending:false});if(error)return fatal(error);app.innerHTML=`<div class="page-head"><div><div class="eyebrow">Studente</div><h1>${esc(profile?.full_name||'Studente')}</h1><div class="muted">Vista docente · sola lettura</div></div></div><div class="grid" id="projectGrid"></div>`;const g=$('#projectGrid');if(!projects?.length)g.innerHTML='<div class="empty-state">Nessun progetto.</div>';for(const p of projects||[])g.append(await projectCard(p,true))}

async function openMoodboard(id,readonly=false){
  setLoading();const {data:m,error}=await supabaseClient.from('moodboards').select('*, projects(title,description,owner_id,class_id)').eq('id',id).single();if(error)return fatal(error);state.moodboard=m;state.teacherViewing=readonly||m.owner_id!==uid();
  const r=await supabaseClient.from('moodboard_items').select('*').eq('moodboard_id',id).order('created_at');if(r.error)return fatal(r.error);state.items=r.data||[];await Promise.all(state.items.map(ensureItemUrl));renderEditor();
}
function renderEditor(){const m=state.moodboard;app.innerHTML=`<div class="page-head"><div><div class="eyebrow">${state.teacherViewing?'Vista docente':'Editor moodboard'}</div><h1>${esc(m.title)}</h1><div class="muted">${esc(m.projects?.title||'')}</div></div><div class="row wrap">${state.teacherViewing?'':`<button class="ghost" data-action="submit">${m.status==='submitted'?'Riapri consegna':'Consegna al docente'}</button><button class="btn" data-action="export">Esporta PNG</button>`}</div></div><div class="editor-shell"><aside class="card editor-panel">${state.teacherViewing?'<div class="teacher-readonly">Sola lettura: non puoi modificare il lavoro dello studente.</div>':''}<div class="stack"><div><strong>Immagini</strong><p class="muted" style="font-size:12px">Peso 1–5 = importanza visiva.</p></div>${state.teacherViewing?'':`<div id="dropzone" class="dropzone"><strong>+ Aggiungi immagini</strong><div class="muted" style="font-size:11px;margin-top:4px">clic o trascina JPG/PNG/WebP</div><input id="fileInput" type="file" accept="image/*" multiple hidden></div>`}<div id="imageList" class="image-list"></div></div></aside><section class="card board-wrap"><div id="board" class="board"><div class="board-title">${esc(m.title)}</div></div></section><aside class="card editor-panel"><div class="stack"><div><strong>Composizione</strong></div><div class="layout-options">${LAYOUTS.map(x=>`<button class="layout-btn ${m.layout_type===x?'active':''}" data-action="layout" data-layout="${x}" ${state.teacherViewing?'disabled':''}>${x}</button>`).join('')}</div><label>Titolo<input id="mbTitle" class="input" value="${esc(m.title)}" ${state.teacherViewing?'disabled':''}></label><label>Sfondo<input id="bgColor" type="color" value="${esc(m.background_color||'#ffffff')}" ${state.teacherViewing?'disabled':''}></label><div><strong>Palette immagini</strong><div id="palette" class="palette" style="margin-top:7px"></div></div><div id="selectedControls"></div></div></aside></div>`;
  renderImageList();renderBoard();renderPalette();
  if(!state.teacherViewing){setupUploads();$('#mbTitle').addEventListener('change',async e=>{state.moodboard.title=e.target.value;await updateMoodboard({title:e.target.value})});$('#bgColor').addEventListener('input',e=>{$('#board').style.background=e.target.value;scheduleMoodboardSave({background_color:e.target.value})})}
}
function renderImageList(){const list=$('#imageList');list.innerHTML='';for(const it of state.items){const d=document.createElement('div');d.className='image-card';d.innerHTML=`<img src="${it._url||''}"><div><div class="row"><strong class="grow" style="font-size:12px">${esc(it.file_name||'immagine')}</strong><div class="weight-dots">${[1,2,3,4,5].map(n=>`<i class="${n<=it.weight?'on':''}"></i>`).join('')}</div></div>${state.teacherViewing?`<div class="muted" style="font-size:11px;margin-top:7px">${esc(it.category)} · peso ${it.weight}</div>`:`<div class="mini-controls"><select data-item-weight="${it.id}">${[1,2,3,4,5].map(n=>`<option value="${n}" ${n===it.weight?'selected':''}>Peso ${n}</option>`).join('')}</select><select data-item-cat="${it.id}">${CATEGORIES.map(c=>`<option ${c===it.category?'selected':''}>${c}</option>`).join('')}</select></div>`}</div>`;list.append(d)}
  if(!state.teacherViewing){$$('[data-item-weight]').forEach(s=>s.addEventListener('change',e=>updateItemField(e.target.dataset.itemWeight,'weight',+e.target.value,true)));$$('[data-item-cat]').forEach(s=>s.addEventListener('change',e=>updateItemField(e.target.dataset.itemCat,'category',e.target.value,false)))}
}
async function setupUploads(){const dz=$('#dropzone'),inp=$('#fileInput');dz.addEventListener('click',()=>inp.click());inp.addEventListener('change',()=>uploadFiles(inp.files));['dragenter','dragover'].forEach(x=>dz.addEventListener(x,e=>{e.preventDefault();dz.classList.add('dragover')}));['dragleave','drop'].forEach(x=>dz.addEventListener(x,e=>{e.preventDefault();dz.classList.remove('dragover')}));dz.addEventListener('drop',e=>uploadFiles(e.dataTransfer.files))}
async function uploadFiles(files){for(const file of [...files].filter(f=>f.type.startsWith('image/'))){saveStatus('Caricamento…');const ext=(file.name.split('.').pop()||'jpg').toLowerCase();const path=`${uid()}/${state.moodboard.project_id}/${crypto.randomUUID()}.${ext}`;const {error}=await supabaseClient.storage.from('moodboard-images').upload(path,file,{upsert:false,contentType:file.type});if(error){toast(error.message);continue}const {data:item,error:ie}=await supabaseClient.from('moodboard_items').insert({moodboard_id:state.moodboard.id,owner_id:uid(),storage_path:path,file_name:file.name,weight:3,category:'Riferimento'}).select().single();if(ie){toast(ie.message);continue}await ensureItemUrl(item);state.items.push(item)}if(state.items.length) await generateLayout(state.moodboard.layout_type); else {renderImageList();renderBoard()}saveStatus('Salvato')}
async function ensureItemUrl(it){if(it._url)return it._url;it._url=await signedUrl(it.storage_path);return it._url}
async function signedUrl(path){if(!path)return '';if(state.urls.has(path))return state.urls.get(path);const {data,error}=await supabaseClient.storage.from('moodboard-images').createSignedUrl(path,3600);if(error)return '';state.urls.set(path,data.signedUrl);return data.signedUrl}

function renderBoard(){const b=$('#board');const title=$('.board-title',b);$$('.board-item',b).forEach(n=>n.remove());b.style.background=state.moodboard.background_color||'#fff';for(const [idx,it] of state.items.entries()){const el=document.createElement('div');el.className='board-item'+(state.selectedItem===it.id?' selected':'');el.dataset.id=it.id;el.style.left=`${it.x??5}%`;el.style.top=`${it.y??5}%`;el.style.width=`${it.w??25}%`;el.style.height=`${it.h??25}%`;el.style.transform=`rotate(${it.rotation||0}deg)`;el.style.zIndex=it.z_index??idx;el.innerHTML=`<img src="${it._url||''}">`;b.insertBefore(el,title);el.addEventListener('click',e=>{e.stopPropagation();selectItem(it.id)});if(!state.teacherViewing)makeDraggable(el,it)}b.onclick=()=>{state.selectedItem=null;renderBoard();renderSelectedControls()}}
function makeDraggable(el,it){let start=null;el.addEventListener('pointerdown',e=>{if(e.button!==0)return;el.setPointerCapture(e.pointerId);start={px:e.clientX,py:e.clientY,x:it.x||0,y:it.y||0};selectItem(it.id)});el.addEventListener('pointermove',e=>{if(!start)return;const r=$('#board').getBoundingClientRect();it.x=Math.max(-5,Math.min(95,(start.x+(e.clientX-start.px)/r.width*100)));it.y=Math.max(-5,Math.min(95,(start.y+(e.clientY-start.py)/r.height*100)));el.style.left=it.x+'%';el.style.top=it.y+'%'});el.addEventListener('pointerup',()=>{if(!start)return;start=null;scheduleItemSave(it)})}
function selectItem(id){state.selectedItem=id;$$('.board-item').forEach(e=>e.classList.toggle('selected',e.dataset.id===id));renderSelectedControls()}
function renderSelectedControls(){const host=$('#selectedControls');if(!host)return;const it=state.items.find(x=>x.id===state.selectedItem);if(!it){host.innerHTML='<p class="muted" style="font-size:12px">Seleziona un’immagine sulla tavola per modificarne dimensione e rotazione.</p>';return}host.innerHTML=`<div class="stack"><strong>Immagine selezionata</strong><label>Larghezza <input id="selW" type="range" min="8" max="80" value="${it.w||25}" ${state.teacherViewing?'disabled':''}></label><label>Altezza <input id="selH" type="range" min="8" max="80" value="${it.h||25}" ${state.teacherViewing?'disabled':''}></label><label>Rotazione <input id="selR" type="range" min="-15" max="15" value="${it.rotation||0}" ${state.teacherViewing?'disabled':''}></label>${state.teacherViewing?'':`<button class="danger" data-action="delete-item">Rimuovi immagine</button>`}</div>`;if(!state.teacherViewing){[['selW','w'],['selH','h'],['selR','rotation']].forEach(([id,k])=>$('#'+id).addEventListener('input',e=>{it[k]=+e.target.value;renderBoard();scheduleItemSave(it)}))}}
async function updateItemField(id,field,value,regen){const it=state.items.find(x=>x.id===id);if(!it)return;it[field]=value;await supabaseClient.from('moodboard_items').update({[field]:value}).eq('id',id);if(regen)generateLayout(state.moodboard.layout_type);else renderBoard();renderImageList()}
async function deleteSelectedItem(){const it=state.items.find(x=>x.id===state.selectedItem);if(!it)return;if(!confirm('Rimuovere questa immagine dalla moodboard?'))return;await supabaseClient.from('moodboard_items').delete().eq('id',it.id);await supabaseClient.storage.from('moodboard-images').remove([it.storage_path]);state.items=state.items.filter(x=>x.id!==it.id);state.selectedItem=null;renderImageList();renderBoard();renderSelectedControls()}

async function generateLayout(type){if(state.teacherViewing)return;state.moodboard.layout_type=type;const items=[...state.items].sort((a,b)=>b.weight-a.weight);if(!items.length)return;const placed=type==='griglia'?layoutGrid(items):type==='collage'?layoutCollage(items):type==='architettura'?layoutArchitecture(items):layoutEditorial(items);placed.forEach((p,i)=>Object.assign(p.item,p.box,{z_index:i+1}));renderEditor();saveStatus('Salvataggio…');await Promise.all(placed.map(p=>supabaseClient.from('moodboard_items').update({...p.box,z_index:p.item.z_index}).eq('id',p.item.id)));await updateMoodboard({layout_type:type});saveStatus('Salvato')}
function areaScale(w){return 0.65+Math.pow(w/5,1.5)*1.1}
function layoutGrid(items){const n=items.length,cols=Math.ceil(Math.sqrt(n*1.4)),rows=Math.ceil(n/cols),gap=1.8,cw=(100-gap*(cols+1))/cols,ch=(100-gap*(rows+1))/rows;return items.map((item,i)=>({item,box:{x:gap+(i%cols)*(cw+gap),y:gap+Math.floor(i/cols)*(ch+gap),w:cw,h:ch,rotation:0}}))}
function layoutEditorial(items){const out=[];let y=4;items.forEach((item,i)=>{if(i===0){out.push({item,box:{x:4,y:4,w:56,h:61,rotation:0}});return}const k=i-1,col=k%2,row=Math.floor(k/2),w=17+item.weight*2.4,h=15+item.weight*1.8;out.push({item,box:{x:64+col*17,y:5+row*20,w:Math.min(w,31),h:Math.min(h,26),rotation:0}})});return normalizeBoxes(out)}
function layoutArchitecture(items){const out=[];let slots=[{x:3,y:3,w:58,h:44},{x:63,y:3,w:34,h:25},{x:63,y:30,w:34,h:28},{x:3,y:49,w:28,h:48},{x:33,y:49,w:28,h:48},{x:63,y:61,w:34,h:36}];items.forEach((item,i)=>{const s=slots[i%slots.length],cycle=Math.floor(i/slots.length);out.push({item,box:{x:s.x+(cycle%3)*1.2,y:s.y+(cycle%2)*1.2,w:s.w/(1+cycle*.25),h:s.h/(1+cycle*.25),rotation:0}})});return out}
function layoutCollage(items){const centers=[[8,8],[52,6],[18,47],[57,48],[35,25],[5,68],[70,70],[42,64],[72,28]];return items.map((item,i)=>{const [x,y]=centers[i%centers.length],s=areaScale(item.weight),w=Math.min(42,18*s),h=Math.min(38,15*s);return{item,box:{x:Math.min(95-w,x+(i%3)*2),y:Math.min(95-h,y+(i%2)*2),w,h,rotation:(i%2?-1:1)*(2+(i%4)*1.4)}}})}
function normalizeBoxes(arr){return arr.map(p=>{p.box.x=Math.max(1,Math.min(98-p.box.w,p.box.x));p.box.y=Math.max(1,Math.min(98-p.box.h,p.box.y));return p})}
function scheduleItemSave(it){saveStatus('Salvataggio…');clearTimeout(state.saveTimer);state.saveTimer=setTimeout(async()=>{await supabaseClient.from('moodboard_items').update({x:it.x,y:it.y,w:it.w,h:it.h,rotation:it.rotation,z_index:it.z_index}).eq('id',it.id);saveStatus('Salvato')},650)}
function scheduleMoodboardSave(obj){saveStatus('Salvataggio…');clearTimeout(state.saveTimer);state.saveTimer=setTimeout(()=>updateMoodboard(obj),600)}
async function updateMoodboard(obj){const {error}=await supabaseClient.from('moodboards').update(obj).eq('id',state.moodboard.id);if(error)return toast(error.message);Object.assign(state.moodboard,obj);saveStatus('Salvato')}
async function toggleSubmit(){const next=state.moodboard.status==='submitted'?'draft':'submitted';await updateMoodboard({status:next,submitted_at:next==='submitted'?new Date().toISOString():null});toast(next==='submitted'?'Moodboard consegnata al docente':'Consegna riaperta');renderEditor()}

function renderPalette(){const host=$('#palette');if(!host)return;const colors=['#202020','#d8d3c7','#a98968','#7a8175','#e6b45c'];host.innerHTML=colors.map(c=>`<span style="background:${c}"></span>`).join('')}
async function exportBoard(){
  // Export senza dipendenze esterne: ricostruisce la tavola su canvas.
  const board=$('#board'),r=board.getBoundingClientRect(),scale=2,cv=document.createElement('canvas');cv.width=Math.round(r.width*scale);cv.height=Math.round(r.height*scale);const ctx=cv.getContext('2d');ctx.scale(scale,scale);ctx.fillStyle=state.moodboard.background_color||'#fff';ctx.fillRect(0,0,r.width,r.height);
  for(const it of [...state.items].sort((a,b)=>(a.z_index||0)-(b.z_index||0))){try{const img=await loadImage(it._url);const x=(it.x||0)/100*r.width,y=(it.y||0)/100*r.height,w=(it.w||25)/100*r.width,h=(it.h||25)/100*r.height;ctx.save();ctx.translate(x+w/2,y+h/2);ctx.rotate((it.rotation||0)*Math.PI/180);drawCover(ctx,img,-w/2,-h/2,w,h);ctx.restore()}catch{}}
  ctx.fillStyle='#111';ctx.font=`900 ${Math.max(20,r.width*.035)}px Arial`;ctx.fillText(state.moodboard.title, r.width*.04, r.height*.93, r.width*.58);const a=document.createElement('a');a.download=(state.moodboard.title||'moodboard').replace(/[^a-z0-9_-]+/gi,'_')+'.png';a.href=cv.toDataURL('image/png');a.click();
}
function loadImage(src){return new Promise((res,rej)=>{const i=new Image();i.crossOrigin='anonymous';i.onload=()=>res(i);i.onerror=rej;i.src=src})}
function drawCover(ctx,img,x,y,w,h){const ir=img.width/img.height,br=w/h;let sx=0,sy=0,sw=img.width,sh=img.height;if(ir>br){sw=img.height*br;sx=(img.width-sw)/2}else{sh=img.width/br;sy=(img.height-sh)/2}ctx.drawImage(img,sx,sy,sw,sh,x,y,w,h)}

function modal(html){const d=document.createElement('div');d.className='modal-backdrop';d.id='modal';d.innerHTML=`<div class="card modal pad">${html}</div>`;document.body.append(d)}function closeModal(){$('#modal')?.remove()}
function fatal(err){console.error(err);app.innerHTML=`<div class="card pad"><h2>Errore</h2><p>${esc(err.message||String(err))}</p><button class="btn" data-action="home">Torna alla home</button></div>`}
init();
