/* Moodboard Lab V3 — category-aware layout, elastic reflow, title tools, real palette */
const cfg = window.MOODBOARD_CONFIG || {};
const configured = cfg.SUPABASE_URL && !cfg.SUPABASE_URL.includes('YOUR_PROJECT') && cfg.SUPABASE_PUBLISHABLE_KEY && !cfg.SUPABASE_PUBLISHABLE_KEY.includes('YOUR_KEY');
const supabaseClient = configured ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_PUBLISHABLE_KEY, { auth:{ persistSession:true, autoRefreshToken:true, detectSessionInUrl:true }}) : null;

const $ = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => [...r.querySelectorAll(s)];
const app = $('#app');
const state = { session:null, profile:null, route:'home', project:null, moodboard:null, items:[], selectedItem:null, teacherViewing:false, urls:new Map(), classId:null, itemSaveTimer:null, moodboardSaveTimer:null, pendingItemIds:new Set(), pendingMoodboardPatch:{} };
const CATEGORIES = ['Forma','Materiale','Colore','Atmosfera','Texture','Riferimento','Altro'];
const LAYOUTS = ['editoriale','griglia','collage','architettura'];
const CATEGORY_GROUP = {Forma:'struttura',Riferimento:'struttura',Materiale:'materia',Texture:'materia',Colore:'atmosfera',Atmosfera:'atmosfera',Altro:'altro'};
const CATEGORY_ORDER = ['Forma','Riferimento','Materiale','Texture','Colore','Atmosfera','Altro'];
const TITLE_FONTS = ['Arial','Georgia','Times New Roman','Verdana','Trebuchet MS','Courier New','system-ui'];

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
  if(a==='extract-palette') return extractPalette();
  if(a==='palette-bg') return usePaletteColor(el.dataset.color);
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
  app.innerHTML=`<section class="auth-shell"><div class="auth-hero"><div><div class="eyebrow">CFP · progettazione</div><h1>MOOD<br>BOARD<br>LAB</h1></div><p>Carica riferimenti, assegna un peso, costruisci la gerarchia visiva e conserva tutto il processo progettuale.</p></div><div class="card auth-panel"><div class="auth-tabs"><button class="btn" data-action="auth-tab" data-tab="student-login">Studente</button><button class="ghost" data-action="auth-tab" data-tab="signup">Registrati</button><button class="ghost" data-action="auth-tab" data-tab="teacher-login">Docente</button></div><div id="authForm"></div></div></section>`;
  switchAuthTab('student-login');
}
function safeStudentToken(v=''){return String(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9_-]/g,'').slice(0,24)}
function studentAuthEmail(username,classcode){return `${safeStudentToken(classcode)}.${safeStudentToken(username)}@students.moodboard.invalid`}
function switchAuthTab(tab){
  $$('.auth-tabs button').forEach(b=>{b.className=b.dataset.tab===tab?'btn':'ghost'});
  const host=$('#authForm');
  if(tab==='student-login') host.innerHTML=`<form id="studentLoginForm" class="stack"><label>Nome utente<input class="input" name="username" required minlength="3" maxlength="24" pattern="[A-Za-z0-9_-]+" autocomplete="username" placeholder="es. marco_rossi"></label><label>Codice classe<input class="input" name="classcode" required maxlength="12" pattern="[A-Za-z0-9_-]+" style="text-transform:uppercase" placeholder="es. 1DESIGN26"></label><label>Password<input class="input" name="password" type="password" minlength="6" required autocomplete="current-password"></label><button class="btn accent">Accedi come studente</button><p class="muted" style="font-size:12px">Non serve alcuna email personale.</p></form>`;
  else if(tab==='teacher-login') host.innerHTML=`<form id="teacherLoginForm" class="stack"><label>Email docente<input class="input" name="email" type="email" required autocomplete="email"></label><label>Password<input class="input" name="password" type="password" required autocomplete="current-password"></label><button class="btn accent">Accedi come docente</button></form>`;
  else host.innerHTML=`<form id="signupForm" class="stack"><label>Nome e cognome<input class="input" name="name" required></label><label>Nome utente<input class="input" name="username" required minlength="3" maxlength="24" pattern="[A-Za-z0-9_-]+" placeholder="es. marco_rossi"></label><label>Password<input class="input" name="password" type="password" minlength="6" required></label><label>Codice classe<input class="input" name="classcode" required maxlength="12" pattern="[A-Za-z0-9_-]+" style="text-transform:uppercase"></label><button class="btn accent">Crea account studente</button><p class="muted" style="font-size:12px">L'email non viene richiesta. Conserva nome utente, codice classe e password.</p></form>`;
  $('#studentLoginForm')?.addEventListener('submit',loginStudent);
  $('#teacherLoginForm')?.addEventListener('submit',loginTeacher);
  $('#signupForm')?.addEventListener('submit',signupStudent);
}
async function finishLogin(){state.session=(await supabaseClient.auth.getSession()).data.session;await loadProfile();showNav(true);renderHome();}
async function loginStudent(e){e.preventDefault();const f=new FormData(e.target);const username=f.get('username').trim(),classcode=f.get('classcode').trim().toUpperCase(),password=f.get('password');const email=studentAuthEmail(username,classcode);const {error}=await supabaseClient.auth.signInWithPassword({email,password});if(error)return toast('Dati di accesso non corretti');return finishLogin();}
async function loginTeacher(e){e.preventDefault();const f=new FormData(e.target);const {error}=await supabaseClient.auth.signInWithPassword({email:f.get('email'),password:f.get('password')});if(error)return toast(error.message);return finishLogin();}
async function signupStudent(e){e.preventDefault();const f=new FormData(e.target);const password=f.get('password'),name=f.get('name').trim(),username=f.get('username').trim(),classcode=f.get('classcode').trim().toUpperCase();
  if(!safeStudentToken(username)||!safeStudentToken(classcode))return toast('Nome utente o codice classe non validi');
  const email=studentAuthEmail(username,classcode);
  const {data,error}=await supabaseClient.auth.signUp({email,password,options:{data:{full_name:name,class_code:classcode,username:username}}}); if(error){if(String(error.message).toLowerCase().includes('already'))return toast('Nome utente già usato in questa classe');return toast(error.message)}
  if(!data.session){toast('Per gli studenti va disattivato Confirm email in Supabase.');return}
  state.session=data.session; await loadProfile();
  const {error:joinErr}=await supabaseClient.rpc('join_class_by_code',{p_code:classcode}); if(joinErr)return toast('Codice classe non valido.');
  showNav(true);renderHome();
}
async function logout(){await supabaseClient.auth.signOut();state.session=null;state.profile=null;state.project=null;showNav(false);renderAuth();}
async function loadProfile(){
  let {data}=await supabaseClient.from('profiles').select('*').eq('id',uid()).maybeSingle();
  if(!data){await new Promise(r=>setTimeout(r,250));({data}=await supabaseClient.from('profiles').select('*').eq('id',uid()).maybeSingle())}
  state.profile=data||{id:uid(),full_name:state.session.user.user_metadata?.full_name||state.session.user.user_metadata?.username||'Studente',role:'student'};
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
  let members=[]; if(state.classId){const r=await supabaseClient.from('class_members').select('student_id, joined_at, profiles!class_members_student_id_fkey(id,full_name,username), classes!inner(id,name)').eq('class_id',state.classId);if(r.error)return fatal(r.error);members=r.data||[]}
  app.innerHTML=`<div class="page-head"><div><div class="eyebrow">Area docente</div><h1>Classi e progetti</h1><div class="muted">Puoi consultare i lavori degli studenti delle tue classi in sola lettura.</div></div><button class="btn accent" data-action="create-class">+ Crea classe</button></div><div class="teacher-layout"><aside class="card sidebar"><strong>Le tue classi</strong><div style="margin-top:10px">${classes?.map(c=>`<button class="class-button ${c.id===state.classId?'active':''}" data-action="teacher-class" data-id="${c.id}">${esc(c.name)}<br><small class="muted">codice ${esc(c.code)}</small></button>`).join('')||'<p class="muted">Nessuna classe.</p>'}</div></aside><section class="card"><div class="pad"><h2 style="margin:0">${esc(classes?.find(c=>c.id===state.classId)?.name||'Crea la prima classe')}</h2></div><div id="studentList"></div></section></div>`;
  const list=$('#studentList');if(!members.length){list.innerHTML='<div class="empty-state" style="margin:0 20px 20px">Nessuno studente ancora iscritto con il codice classe.</div>';return}
  for(const m of members){const {count}=await supabaseClient.from('projects').select('*',{count:'exact',head:true}).eq('owner_id',m.student_id).eq('class_id',state.classId);const d=document.createElement('div');d.className='student-row';d.innerHTML=`<div class="row"><div class="avatar">${esc((m.profiles?.full_name||'?').trim()[0]||'?')}</div><div><strong>${esc(m.profiles?.full_name||'Studente')}</strong><div class="muted" style="font-size:12px">${m.profiles?.username?`@${esc(m.profiles.username)}`:''}</div></div></div><span class="muted">${count||0} progetti</span><span class="muted">${fmtDate(m.joined_at)}</span><button class="btn" data-action="teacher-student" data-id="${m.student_id}" data-class-id="${state.classId}">Apri</button>`;list.append(d)}
}
function openCreateClassModal(){modal(`<h2>Crea classe</h2><form id="classForm" class="stack"><label>Nome classe<input class="input" name="name" required placeholder="es. 1 Design"></label><label>Codice di accesso<input class="input" name="code" required minlength="3" maxlength="12" pattern="[A-Za-z0-9_-]+" placeholder="1DESIGN26" style="text-transform:uppercase"></label><div class="row"><button type="button" class="ghost grow" data-action="close-modal">Annulla</button><button class="btn accent grow">Crea</button></div></form>`);$('#classForm').addEventListener('submit',createClass)}
async function createClass(e){e.preventDefault();const f=new FormData(e.target);const {data,error}=await supabaseClient.from('classes').insert({teacher_id:uid(),name:f.get('name').trim(),code:f.get('code').trim().toUpperCase()}).select().single();if(error)return toast(error.message);state.classId=data.id;closeModal();renderTeacherDashboard()}
async function renderTeacherStudent(studentId,classId){setLoading();const {data:profile}=await supabaseClient.from('profiles').select('*').eq('id',studentId).single();const {data:projects,error}=await supabaseClient.from('projects').select('*, moodboards(id,status,thumbnail_path,updated_at)').eq('owner_id',studentId).eq('class_id',classId).order('updated_at',{ascending:false});if(error)return fatal(error);app.innerHTML=`<div class="page-head"><div><div class="eyebrow">Studente</div><h1>${esc(profile?.full_name||'Studente')}</h1><div class="muted">Vista docente · sola lettura</div></div></div><div class="grid" id="projectGrid"></div>`;const g=$('#projectGrid');if(!projects?.length)g.innerHTML='<div class="empty-state">Nessun progetto.</div>';for(const p of projects||[])g.append(await projectCard(p,true))}

async function openMoodboard(id,readonly=false){
  setLoading();
  const {data:m,error}=await supabaseClient.from('moodboards').select('*, projects(title,description,owner_id,class_id)').eq('id',id).single();
  if(error)return fatal(error);
  state.moodboard=m;state.teacherViewing=readonly||m.owner_id!==uid();
  const r=await supabaseClient.from('moodboard_items').select('*').eq('moodboard_id',id).order('created_at');
  if(r.error)return fatal(r.error);
  state.items=r.data||[];await Promise.all(state.items.map(ensureItemUrl));renderEditor();
}

function renderEditor(){
  const m=state.moodboard;
  const disabled=state.teacherViewing?'disabled':'';
  app.innerHTML=`<div class="page-head"><div><div class="eyebrow">${state.teacherViewing?'Vista docente':'Editor moodboard'}</div><h1>${esc(m.title)}</h1><div class="muted">${esc(m.projects?.title||'')}</div></div><div class="row wrap">${state.teacherViewing?`<button class="btn" data-action="export">Scarica PNG</button>`:`<button class="ghost" data-action="submit">${m.status==='submitted'?'Riapri consegna':'Consegna al docente'}</button><button class="btn" data-action="export">Esporta PNG</button>`}</div></div>
  <div class="editor-shell">
    <aside class="card editor-panel">${state.teacherViewing?'<div class="teacher-readonly">Sola lettura: non puoi modificare il lavoro dello studente.</div>':''}<div class="stack"><div><strong>Immagini</strong><p class="muted" style="font-size:12px"><strong>Peso</strong> = gerarchia/dimensione · <strong>Categoria</strong> = raggruppamento e zona della tavola.</p></div>${state.teacherViewing?'':`<div id="dropzone" class="dropzone"><strong>+ Aggiungi immagini</strong><div class="muted" style="font-size:11px;margin-top:4px">clic o trascina JPG/PNG/WebP</div><input id="fileInput" type="file" accept="image/*" multiple hidden></div>`}<div id="imageList" class="image-list"></div></div></aside>
    <section class="card board-wrap"><div id="board" class="board"><div class="board-title ${state.teacherViewing?'readonly':''}">${esc(m.title)}</div></div></section>
    <aside class="card editor-panel"><div class="stack">
      <div><strong>Composizione</strong><p class="muted" style="font-size:11px;margin:5px 0 0">Forma/Riferimento, Materia/Texture e Colore/Atmosfera vengono trattati come famiglie visive.</p></div>
      <div class="layout-options">${LAYOUTS.map(x=>`<button class="layout-btn ${m.layout_type===x?'active':''}" data-action="layout" data-layout="${x}" ${disabled}>${x}</button>`).join('')}</div>
      <label class="checkline"><input id="autoReflow" type="checkbox" ${m.auto_reflow!==false?'checked':''} ${disabled}><span>Adatta le altre immagini quando sposto o ridimensiono</span></label>
      <div class="panel-separator"></div>
      <strong>Titolo</strong>
      <label>Testo<input id="mbTitle" class="input" value="${esc(m.title)}" ${disabled}></label>
      <div class="control-grid two"><label>Font<select id="titleFont" ${disabled}>${TITLE_FONTS.map(f=>`<option value="${esc(f)}" ${String(m.title_font||'Arial')===f?'selected':''}>${esc(f)}</option>`).join('')}</select></label><label>Colore<input id="titleColor" type="color" value="${esc(m.title_color||'#111111')}" ${disabled}></label></div>
      <label>Dimensione <span id="titleSizeValue" class="value-badge">${Number(m.title_size||4).toFixed(1)}%</span><input id="titleSize" type="range" min="1.8" max="10" step="0.2" value="${m.title_size||4}" ${disabled}></label>
      <label>Larghezza <span id="titleWidthValue" class="value-badge">${Math.round(m.title_width||60)}%</span><input id="titleWidth" type="range" min="15" max="96" step="1" value="${m.title_width||60}" ${disabled}></label>
      <div class="control-grid two"><label>Posizione X<input id="titleX" type="range" min="0" max="90" step="1" value="${m.title_x??4}" ${disabled}></label><label>Posizione Y<input id="titleY" type="range" min="0" max="94" step="1" value="${m.title_y??84}" ${disabled}></label></div>
      <div class="control-grid two"><label>Allineamento<select id="titleAlign" ${disabled}><option value="left" ${(m.title_align||'left')==='left'?'selected':''}>Sinistra</option><option value="center" ${m.title_align==='center'?'selected':''}>Centro</option><option value="right" ${m.title_align==='right'?'selected':''}>Destra</option></select></label><label>Peso font<select id="titleWeight" ${disabled}><option value="400" ${+m.title_weight===400?'selected':''}>Normale</option><option value="700" ${+m.title_weight===700?'selected':''}>Bold</option><option value="900" ${+m.title_weight!==400&&+m.title_weight!==700?'selected':''}>Black</option></select></label></div>
      <div class="panel-separator"></div>
      <label>Sfondo<input id="bgColor" type="color" value="${esc(m.background_color||'#ffffff')}" ${disabled}></label>
      <div><div class="row"><strong class="grow">Palette immagini</strong>${state.teacherViewing?'':`<button class="ghost compact" data-action="extract-palette">Estrai palette</button>`}</div><p class="muted" style="font-size:11px;margin:5px 0 7px">Calcolata dalle foto e pesata anche in base alla loro importanza. Clicca un colore per usarlo come sfondo.</p><div id="palette" class="palette"></div></div>
      <div id="selectedControls"></div>
    </div></aside>
  </div>`;
  renderImageList();renderBoard();renderPalette();renderSelectedControls();
  if(!state.teacherViewing){
    setupUploads();setupTitleControls();setupTitleDrag();
    $('#bgColor').addEventListener('input',e=>{state.moodboard.background_color=e.target.value;$('#board').style.background=e.target.value;scheduleMoodboardSave({background_color:e.target.value})});
    $('#autoReflow').addEventListener('change',e=>{state.moodboard.auto_reflow=e.target.checked;scheduleMoodboardSave({auto_reflow:e.target.checked})});
  }
}

function setupTitleControls(){
  const binds=[
    ['mbTitle','title',v=>v],['titleFont','title_font',v=>v],['titleColor','title_color',v=>v],
    ['titleSize','title_size',Number],['titleWidth','title_width',Number],['titleX','title_x',Number],['titleY','title_y',Number],
    ['titleAlign','title_align',v=>v],['titleWeight','title_weight',Number]
  ];
  for(const [id,field,parse] of binds){
    const el=$('#'+id);if(!el)continue;
    const event=(el.tagName==='SELECT')?'change':'input';
    el.addEventListener(event,e=>{
      const v=parse(e.target.value);state.moodboard[field]=v;
      if(field==='title'){$('.page-head h1').textContent=v||'Moodboard';}
      if(field==='title_size')$('#titleSizeValue').textContent=Number(v).toFixed(1)+'%';
      if(field==='title_width')$('#titleWidthValue').textContent=Math.round(v)+'%';
      applyTitleStyle();scheduleMoodboardSave({[field]:v});
    });
  }
}

function applyTitleStyle(){
  const t=$('.board-title');if(!t)return;const m=state.moodboard;
  t.textContent=m.title||'';t.style.left=`${m.title_x??4}%`;t.style.top=`${m.title_y??84}%`;t.style.width=`${m.title_width||60}%`;
  t.style.color=m.title_color||'#111111';t.style.fontFamily=fontCss(m.title_font||'Arial');t.style.fontSize=`${m.title_size||4}cqw`;
  t.style.fontWeight=String(m.title_weight||900);t.style.textAlign=m.title_align||'left';
}
function fontCss(v){return v==='system-ui'?'system-ui, sans-serif':`"${String(v).replace(/"/g,'')}", sans-serif`}

function setupTitleDrag(){
  const el=$('.board-title');if(!el||state.teacherViewing)return;let start=null;
  el.addEventListener('pointerdown',e=>{e.stopPropagation();el.setPointerCapture(e.pointerId);start={px:e.clientX,py:e.clientY,x:+(state.moodboard.title_x??4),y:+(state.moodboard.title_y??84)};el.classList.add('dragging')});
  el.addEventListener('pointermove',e=>{if(!start)return;const r=$('#board').getBoundingClientRect();state.moodboard.title_x=clamp(start.x+(e.clientX-start.px)/r.width*100,0,95);state.moodboard.title_y=clamp(start.y+(e.clientY-start.py)/r.height*100,0,95);el.style.left=state.moodboard.title_x+'%';el.style.top=state.moodboard.title_y+'%';if($('#titleX'))$('#titleX').value=state.moodboard.title_x;if($('#titleY'))$('#titleY').value=state.moodboard.title_y});
  el.addEventListener('pointerup',()=>{if(!start)return;start=null;el.classList.remove('dragging');scheduleMoodboardSave({title_x:state.moodboard.title_x,title_y:state.moodboard.title_y})});
}

function renderImageList(){
  const list=$('#imageList');list.innerHTML='';
  for(const it of state.items){
    const d=document.createElement('div');d.className='image-card';
    d.innerHTML=`<img src="${it._url||''}"><div><div class="row"><strong class="grow" style="font-size:12px">${esc(it.file_name||'immagine')}</strong><div class="weight-dots">${[1,2,3,4,5].map(n=>`<i class="${n<=it.weight?'on':''}"></i>`).join('')}</div></div>${state.teacherViewing?`<div class="muted" style="font-size:11px;margin-top:7px">${esc(it.category)} · peso ${it.weight}</div>`:`<div class="mini-controls"><select data-item-weight="${it.id}">${[1,2,3,4,5].map(n=>`<option value="${n}" ${n===it.weight?'selected':''}>Peso ${n}</option>`).join('')}</select><select data-item-cat="${it.id}">${CATEGORIES.map(c=>`<option ${c===it.category?'selected':''}>${c}</option>`).join('')}</select></div>`}</div>`;list.append(d);
  }
  if(!state.teacherViewing){
    $$('[data-item-weight]').forEach(s=>s.addEventListener('change',e=>updateItemField(e.target.dataset.itemWeight,'weight',+e.target.value,true)));
    $$('[data-item-cat]').forEach(s=>s.addEventListener('change',e=>updateItemField(e.target.dataset.itemCat,'category',e.target.value,true)));
  }
}
async function setupUploads(){const dz=$('#dropzone'),inp=$('#fileInput');dz.addEventListener('click',()=>inp.click());inp.addEventListener('change',()=>uploadFiles(inp.files));['dragenter','dragover'].forEach(x=>dz.addEventListener(x,e=>{e.preventDefault();dz.classList.add('dragover')}));['dragleave','drop'].forEach(x=>dz.addEventListener(x,e=>{e.preventDefault();dz.classList.remove('dragover')}));dz.addEventListener('drop',e=>uploadFiles(e.dataTransfer.files))}
async function uploadFiles(files){
  for(const file of [...files].filter(f=>f.type.startsWith('image/'))){
    saveStatus('Caricamento…');const ext=(file.name.split('.').pop()||'jpg').toLowerCase();const path=`${uid()}/${state.moodboard.project_id}/${crypto.randomUUID()}.${ext}`;
    const {error}=await supabaseClient.storage.from('moodboard-images').upload(path,file,{upsert:false,contentType:file.type});if(error){toast(error.message);continue}
    const {data:item,error:ie}=await supabaseClient.from('moodboard_items').insert({moodboard_id:state.moodboard.id,owner_id:uid(),storage_path:path,file_name:file.name,weight:3,category:'Riferimento'}).select().single();if(ie){toast(ie.message);continue}
    await ensureItemUrl(item);state.items.push(item)
  }
  if(state.items.length){await generateLayout(state.moodboard.layout_type);await extractPalette(true)}else{renderImageList();renderBoard()}
  saveStatus('Salvato')
}
async function ensureItemUrl(it){if(it._url)return it._url;it._url=await signedUrl(it.storage_path);return it._url}
async function signedUrl(path){if(!path)return '';if(state.urls.has(path))return state.urls.get(path);const {data,error}=await supabaseClient.storage.from('moodboard-images').createSignedUrl(path,3600);if(error)return '';state.urls.set(path,data.signedUrl);return data.signedUrl}

function renderBoard(){
  const b=$('#board');const title=$('.board-title',b);$$('.board-item',b).forEach(n=>n.remove());b.style.background=state.moodboard.background_color||'#fff';
  for(const [idx,it] of state.items.entries()){
    const el=document.createElement('div');el.className='board-item'+(state.selectedItem===it.id?' selected':'');el.dataset.id=it.id;applyItemStyle(el,it,idx);el.innerHTML=`<img src="${it._url||''}">`;b.insertBefore(el,title);
    el.addEventListener('click',e=>{e.stopPropagation();selectItem(it.id)});if(!state.teacherViewing)makeDraggable(el,it)
  }
  applyTitleStyle();b.onclick=()=>{state.selectedItem=null;$$('.board-item',b).forEach(e=>e.classList.remove('selected'));renderSelectedControls()}
}
function applyItemStyle(el,it,idx=0){el.style.left=`${it.x??5}%`;el.style.top=`${it.y??5}%`;el.style.width=`${it.w??25}%`;el.style.height=`${it.h??25}%`;el.style.transform=`rotate(${it.rotation||0}deg)`;el.style.zIndex=it.z_index??idx}
function refreshBoardPositions(){for(const it of state.items){const el=$(`.board-item[data-id="${it.id}"]`);if(el)applyItemStyle(el,it)}}

function makeDraggable(el,it){
  let start=null;let changed=new Set();
  el.addEventListener('pointerdown',e=>{if(e.button!==0)return;e.stopPropagation();el.setPointerCapture(e.pointerId);start={px:e.clientX,py:e.clientY,x:+it.x||0,y:+it.y||0};changed=new Set([it.id]);el.classList.add('dragging');selectItem(it.id)});
  el.addEventListener('pointermove',e=>{if(!start)return;const r=$('#board').getBoundingClientRect();it.x=clamp(start.x+(e.clientX-start.px)/r.width*100,0,100-(+it.w||25));it.y=clamp(start.y+(e.clientY-start.py)/r.height*100,0,100-(+it.h||25));if(state.moodboard.auto_reflow!==false){for(const id of reflowAround(it))changed.add(id)}refreshBoardPositions()});
  el.addEventListener('pointerup',()=>{if(!start)return;start=null;el.classList.remove('dragging');queueItemsSave([...changed])});
}
function selectItem(id){state.selectedItem=id;$$('.board-item').forEach(e=>e.classList.toggle('selected',e.dataset.id===id));renderSelectedControls()}
function renderSelectedControls(){
  const host=$('#selectedControls');if(!host)return;const it=state.items.find(x=>x.id===state.selectedItem);
  if(!it){host.innerHTML='<p class="muted" style="font-size:12px">Seleziona un’immagine sulla tavola per modificarne dimensione e rotazione.</p>';return}
  host.innerHTML=`<div class="panel-separator"></div><div class="stack"><strong>Immagine selezionata</strong><label>Larghezza <span class="value-badge">${Math.round(it.w||25)}%</span><input id="selW" type="range" min="8" max="80" value="${it.w||25}" ${state.teacherViewing?'disabled':''}></label><label>Altezza <span class="value-badge">${Math.round(it.h||25)}%</span><input id="selH" type="range" min="8" max="80" value="${it.h||25}" ${state.teacherViewing?'disabled':''}></label><label>Rotazione <span class="value-badge">${Math.round(it.rotation||0)}°</span><input id="selR" type="range" min="-15" max="15" value="${it.rotation||0}" ${state.teacherViewing?'disabled':''}></label>${state.teacherViewing?'':`<button class="danger" data-action="delete-item">Rimuovi immagine</button>`}</div>`;
  if(!state.teacherViewing){
    [['selW','w'],['selH','h'],['selR','rotation']].forEach(([id,k])=>$('#'+id).addEventListener('input',e=>{it[k]=+e.target.value;let changed=new Set([it.id]);if(k!=='rotation'&&state.moodboard.auto_reflow!==false)changed=reflowAround(it);renderBoard();const badge=e.target.closest('label')?.querySelector('.value-badge');if(badge)badge.textContent=k==='rotation'?`${Math.round(it[k])}°`:`${Math.round(it[k])}%`;queueItemsSave([...changed])}))
  }
}
async function updateItemField(id,field,value,regen){const it=state.items.find(x=>x.id===id);if(!it)return;it[field]=value;await supabaseClient.from('moodboard_items').update({[field]:value}).eq('id',id);if(regen)await generateLayout(state.moodboard.layout_type);else{renderBoard();renderImageList()}}
async function deleteSelectedItem(){const it=state.items.find(x=>x.id===state.selectedItem);if(!it)return;if(!confirm('Rimuovere questa immagine dalla moodboard?'))return;await supabaseClient.from('moodboard_items').delete().eq('id',it.id);await supabaseClient.storage.from('moodboard-images').remove([it.storage_path]);state.items=state.items.filter(x=>x.id!==it.id);state.selectedItem=null;renderImageList();renderBoard();renderSelectedControls();if(state.items.length)extractPalette(true);else{state.moodboard.palette=[];await updateMoodboard({palette:[]});renderPalette()}}

async function generateLayout(type){
  if(state.teacherViewing)return;state.moodboard.layout_type=type;const items=[...state.items];if(!items.length)return;
  const placed=type==='griglia'?layoutGrid(items):type==='collage'?layoutCollage(items):type==='architettura'?layoutArchitecture(items):layoutEditorial(items);
  placed.forEach((p,i)=>Object.assign(p.item,p.box,{z_index:i+1}));renderEditor();saveStatus('Salvataggio…');
  await Promise.all(placed.map(p=>supabaseClient.from('moodboard_items').update({...p.box,z_index:p.item.z_index}).eq('id',p.item.id)));await updateMoodboard({layout_type:type});saveStatus('Salvato')
}
function categoryGroup(item){return CATEGORY_GROUP[item.category]||'altro'}
function orderedItems(items){return [...items].sort((a,b)=>CATEGORY_ORDER.indexOf(a.category)-CATEGORY_ORDER.indexOf(b.category)||b.weight-a.weight)}
function layoutGrid(items){
  items=orderedItems(items);const n=items.length,cols=Math.ceil(Math.sqrt(n*1.4)),rows=Math.ceil(n/cols),gap=1.8,cw=(100-gap*(cols+1))/cols,ch=(100-gap*(rows+1))/rows;
  return items.map((item,i)=>({item,box:{x:gap+(i%cols)*(cw+gap),y:gap+Math.floor(i/cols)*(ch+gap),w:cw,h:ch,rotation:0}}))
}
function layoutEditorial(items){return layoutCategoryZones(items,{struttura:{x:3,y:3,w:58,h:61},materia:{x:64,y:3,w:33,h:48},atmosfera:{x:3,y:68,w:58,h:29},altro:{x:64,y:54,w:33,h:43}},false)}
function layoutArchitecture(items){return layoutCategoryZones(items,{struttura:{x:3,y:3,w:59,h:55},materia:{x:64,y:3,w:33,h:55},atmosfera:{x:3,y:61,w:59,h:36},altro:{x:64,y:61,w:33,h:36}},false)}
function layoutCollage(items){
  const out=layoutCategoryZones(items,{struttura:{x:3,y:3,w:57,h:56},materia:{x:56,y:5,w:41,h:44},atmosfera:{x:4,y:56,w:68,h:41},altro:{x:68,y:49,w:29,h:48}},true);
  return out.map((p,i)=>{p.box.rotation=(i%2?-1:1)*(1.2+(i%4)*.9);p.box.x=clamp(p.box.x+((i%3)-1)*1.1,1,98-p.box.w);p.box.y=clamp(p.box.y+((i%2)?1.2:-.6),1,98-p.box.h);return p})
}
function layoutCategoryZones(items,zones,collage=false){
  const groups={struttura:[],materia:[],atmosfera:[],altro:[]};for(const it of items)groups[categoryGroup(it)].push(it);for(const g of Object.values(groups))g.sort((a,b)=>b.weight-a.weight);
  const present=Object.entries(groups).filter(([,v])=>v.length);
  if(present.length===1)return treemap(present[0][1],{x:3,y:3,w:94,h:94},collage);
  if(present.length===2){const a=present[0],b=present[1];return [...treemap(a[1],{x:3,y:3,w:59,h:94},collage),...treemap(b[1],{x:65,y:3,w:32,h:94},collage)]}
  const out=[];for(const [key,arr] of present){out.push(...treemap(arr,zones[key],collage))}return out
}
function treemap(items,zone,collage=false){
  if(!items.length)return[];const sorted=[...items].sort((a,b)=>b.weight-a.weight);
  function rec(arr,z,depth=0){
    if(arr.length===1){const pad=collage?.8:1.2;return[{item:arr[0],box:{x:z.x+pad,y:z.y+pad,w:Math.max(.8,z.w-pad*2),h:Math.max(.8,z.h-pad*2),rotation:0}}]}
    const vals=arr.map(x=>Math.pow(x.weight||3,1.45)),total=vals.reduce((a,b)=>a+b,0);let sum=0,cut=1;for(let i=0;i<vals.length-1;i++){sum+=vals[i];if(sum>=total/2){cut=i+1;break}}
    const left=arr.slice(0,cut),right=arr.slice(cut),leftWeight=left.reduce((s,x)=>s+Math.pow(x.weight||3,1.45),0),ratio=leftWeight/total,gap=1.2;
    if(z.w>=z.h){const w1=(z.w-gap)*ratio;return[...rec(left,{x:z.x,y:z.y,w:w1,h:z.h},depth+1),...rec(right,{x:z.x+w1+gap,y:z.y,w:z.w-w1-gap,h:z.h},depth+1)]}
    const h1=(z.h-gap)*ratio;return[...rec(left,{x:z.x,y:z.y,w:z.w,h:h1},depth+1),...rec(right,{x:z.x,y:z.y+h1+gap,w:z.w,h:z.h-h1-gap},depth+1)]
  }
  return rec(sorted,zone)
}

function rectOverlap(a,b,margin=1.2){return !(a.x+a.w+margin<=b.x||b.x+b.w+margin<=a.x||a.y+a.h+margin<=b.y||b.y+b.h+margin<=a.y)}
function moveAway(fixed,moving,margin=1.2){
  const fx=fixed.x+fixed.w/2,fy=fixed.y+fixed.h/2,mx=moving.x+moving.w/2,my=moving.y+moving.h/2;
  const pushR=fixed.x+fixed.w+margin-moving.x,pushL=moving.x+moving.w+margin-fixed.x,pushD=fixed.y+fixed.h+margin-moving.y,pushU=moving.y+moving.h+margin-fixed.y;
  const opts=[];if(mx>=fx)opts.push(['x',pushR]);else opts.push(['x',-pushL]);if(my>=fy)opts.push(['y',pushD]);else opts.push(['y',-pushU]);opts.sort((a,b)=>Math.abs(a[1])-Math.abs(b[1]));
  for(const [axis,d] of opts){const ox=moving.x,oy=moving.y;if(axis==='x')moving.x=clamp(moving.x+d,0,100-moving.w);else moving.y=clamp(moving.y+d,0,100-moving.h);if(!rectOverlap(fixed,moving,margin*.45))return ox!==moving.x||oy!==moving.y;moving.x=ox;moving.y=oy}
  const dx=mx>=fx?2.5:-2.5,dy=my>=fy?2.5:-2.5;const ox=moving.x,oy=moving.y;moving.x=clamp(moving.x+dx,0,100-moving.w);moving.y=clamp(moving.y+dy,0,100-moving.h);return ox!==moving.x||oy!==moving.y
}
function reflowAround(active){
  const changed=new Set([active.id]);const others=state.items.filter(x=>x.id!==active.id);
  for(let pass=0;pass<7;pass++){
    let moved=false;
    for(const o of others){if(rectOverlap(active,o,1.1)&&moveAway(active,o,1.1)){changed.add(o.id);moved=true}}
    for(let i=0;i<others.length;i++)for(let j=i+1;j<others.length;j++){const a=others[i],b=others[j];if(!rectOverlap(a,b,.8))continue;const fixed=(a.weight||3)>=(b.weight||3)?a:b,moving=fixed===a?b:a;if(moveAway(fixed,moving,.8)){changed.add(moving.id);moved=true}}
    if(!moved)break
  }
  for(const id of changed)state.pendingItemIds.add(id);return changed
}
function clamp(v,min,max){return Math.max(min,Math.min(max,v))}

function queueItemsSave(ids){for(const id of ids||[])state.pendingItemIds.add(id);saveStatus('Salvataggio…');clearTimeout(state.itemSaveTimer);state.itemSaveTimer=setTimeout(flushItemSaves,500)}
async function flushItemSaves(){const ids=[...state.pendingItemIds];state.pendingItemIds.clear();const items=state.items.filter(x=>ids.includes(x.id));await Promise.all(items.map(it=>supabaseClient.from('moodboard_items').update({x:it.x,y:it.y,w:it.w,h:it.h,rotation:it.rotation,z_index:it.z_index}).eq('id',it.id)));saveStatus('Salvato')}
function scheduleMoodboardSave(obj){saveStatus('Salvataggio…');Object.assign(state.moodboard,obj);Object.assign(state.pendingMoodboardPatch,obj);clearTimeout(state.moodboardSaveTimer);state.moodboardSaveTimer=setTimeout(async()=>{const patch={...state.pendingMoodboardPatch};state.pendingMoodboardPatch={};if(Object.keys(patch).length)await updateMoodboard(patch)},550)}
async function updateMoodboard(obj){const {error}=await supabaseClient.from('moodboards').update(obj).eq('id',state.moodboard.id);if(error)return toast(error.message);Object.assign(state.moodboard,obj);saveStatus('Salvato')}
async function toggleSubmit(){const next=state.moodboard.status==='submitted'?'draft':'submitted';await updateMoodboard({status:next,submitted_at:next==='submitted'?new Date().toISOString():null});toast(next==='submitted'?'Moodboard consegnata al docente':'Consegna riaperta');renderEditor()}

function renderPalette(){
  const host=$('#palette');if(!host)return;let colors=state.moodboard.palette||[];if(typeof colors==='string'){try{colors=JSON.parse(colors)}catch{colors=[]}}
  if(!Array.isArray(colors)||!colors.length){host.innerHTML='<div class="palette-empty">Nessuna palette estratta</div>';return}
  host.innerHTML=colors.map(c=>`<button type="button" class="palette-swatch" style="background:${esc(c)}" title="${esc(c)} · usa come sfondo" data-action="palette-bg" data-color="${esc(c)}"><span>${esc(c)}</span></button>`).join('')
}
async function usePaletteColor(color){if(state.teacherViewing)return;state.moodboard.background_color=color;$('#bgColor').value=color;$('#board').style.background=color;await updateMoodboard({background_color:color})}
async function extractPalette(silent=false){
  if(!state.items.length){if(!silent)toast('Aggiungi prima almeno un’immagine');return}
  saveStatus('Analisi colori…');const samples=[];
  for(const it of state.items){
    try{const img=await loadImage(it._url);const cv=document.createElement('canvas'),size=56;cv.width=size;cv.height=size;const cx=cv.getContext('2d',{willReadFrequently:true});drawCover(cx,img,0,0,size,size);const data=cx.getImageData(0,0,size,size).data;const target=220+(it.weight||3)*170,step=Math.max(1,Math.floor((size*size)/target));for(let px=0;px<size*size;px+=step){const i=px*4,r=data[i],g=data[i+1],b=data[i+2],a=data[i+3];if(a<220)continue;if(r>250&&g>250&&b>250)continue;if(r<5&&g<5&&b<5)continue;samples.push([r,g,b])}}
    catch(err){console.warn('palette image skipped',err)}
  }
  if(samples.length<10){saveStatus('Salvato');if(!silent)toast('Non riesco a leggere i colori di queste immagini');return}
  const colors=kMeansPalette(samples,5);state.moodboard.palette=colors;await updateMoodboard({palette:colors});renderPalette();if(!silent)toast('Palette estratta dalle immagini')
}
function kMeansPalette(points,k=5){
  const stride=Math.max(1,Math.floor(points.length/9000));points=points.filter((_,i)=>i%stride===0);const avg=points.reduce((a,p)=>[a[0]+p[0],a[1]+p[1],a[2]+p[2]],[0,0,0]).map(v=>v/points.length);const centers=[avg];
  while(centers.length<Math.min(k,points.length)){let best=points[0],bestD=-1;for(const p of points){const d=Math.min(...centers.map(c=>colorDist(p,c)));if(d>bestD){bestD=d;best=p}}centers.push([...best])}
  let counts=[];for(let iter=0;iter<9;iter++){const sums=centers.map(()=>[0,0,0,0]);for(const p of points){let bi=0,bd=Infinity;centers.forEach((c,i)=>{const d=colorDist(p,c);if(d<bd){bd=d;bi=i}});sums[bi][0]+=p[0];sums[bi][1]+=p[1];sums[bi][2]+=p[2];sums[bi][3]++}counts=sums.map(s=>s[3]);centers.forEach((c,i)=>{if(sums[i][3])centers[i]=[sums[i][0]/sums[i][3],sums[i][1]/sums[i][3],sums[i][2]/sums[i][3]]})}
  return centers.map((c,i)=>({c,n:counts[i]||0})).filter(x=>x.n).sort((a,b)=>b.n-a.n).map(x=>rgbHex(x.c)).filter((c,i,a)=>a.findIndex(x=>hexDist(x,c)<26)===i).slice(0,k)
}
function colorDist(a,b){return Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2])}
function rgbHex(c){return'#'+c.map(v=>Math.round(clamp(v,0,255)).toString(16).padStart(2,'0')).join('')}
function hexDist(a,b){const p=x=>[parseInt(x.slice(1,3),16),parseInt(x.slice(3,5),16),parseInt(x.slice(5,7),16)];return colorDist(p(a),p(b))}

async function exportBoard(){
  const board=$('#board'),r=board.getBoundingClientRect(),scale=2,cv=document.createElement('canvas');cv.width=Math.round(r.width*scale);cv.height=Math.round(r.height*scale);const ctx=cv.getContext('2d');ctx.scale(scale,scale);ctx.fillStyle=state.moodboard.background_color||'#fff';ctx.fillRect(0,0,r.width,r.height);
  for(const it of [...state.items].sort((a,b)=>(a.z_index||0)-(b.z_index||0))){try{const img=await loadImage(it._url);const x=(+it.x||0)/100*r.width,y=(+it.y||0)/100*r.height,w=(+it.w||25)/100*r.width,h=(+it.h||25)/100*r.height;ctx.save();ctx.translate(x+w/2,y+h/2);ctx.rotate((+it.rotation||0)*Math.PI/180);drawCover(ctx,img,-w/2,-h/2,w,h);ctx.restore()}catch{}}
  const m=state.moodboard,fontPx=Math.max(12,r.width*(+m.title_size||4)/100),tx=r.width*(+m.title_x||4)/100,ty=r.height*(+m.title_y||84)/100,tw=r.width*(+m.title_width||60)/100;ctx.fillStyle=m.title_color||'#111';ctx.font=`${m.title_weight||900} ${fontPx}px ${fontCss(m.title_font||'Arial')}`;ctx.textBaseline='top';ctx.textAlign=m.title_align||'left';const ax=m.title_align==='center'?tx+tw/2:m.title_align==='right'?tx+tw:tx;drawWrappedText(ctx,m.title||'',ax,ty,tw,fontPx*.95,m.title_align||'left');
  const a=document.createElement('a');a.download=(state.moodboard.title||'moodboard').replace(/[^a-z0-9_-]+/gi,'_')+'.png';a.href=cv.toDataURL('image/png');a.click();
}
function drawWrappedText(ctx,text,x,y,maxWidth,lineHeight,align='left'){const words=String(text).split(/\s+/),lines=[];let line='';for(const w of words){const test=line?line+' '+w:w;if(ctx.measureText(test).width>maxWidth&&line){lines.push(line);line=w}else line=test}if(line)lines.push(line);for(let i=0;i<lines.length;i++)ctx.fillText(lines[i],x,y+i*lineHeight,maxWidth)}
function loadImage(src){return new Promise((res,rej)=>{const i=new Image();i.crossOrigin='anonymous';i.onload=()=>res(i);i.onerror=rej;i.src=src})}
function drawCover(ctx,img,x,y,w,h){const ir=img.width/img.height,br=w/h;let sx=0,sy=0,sw=img.width,sh=img.height;if(ir>br){sw=img.height*br;sx=(img.width-sw)/2}else{sh=img.width/br;sy=(img.height-sh)/2}ctx.drawImage(img,sx,sy,sw,sh,x,y,w,h)}

function modal(html){const d=document.createElement('div');d.className='modal-backdrop';d.id='modal';d.innerHTML=`<div class="card modal pad">${html}</div>`;document.body.append(d)}function closeModal(){$('#modal')?.remove()}
function fatal(err){console.error(err);app.innerHTML=`<div class="card pad"><h2>Errore</h2><p>${esc(err.message||String(err))}</p><button class="btn" data-action="home">Torna alla home</button></div>`}
init();
