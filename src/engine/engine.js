/* eslint-disable */
// เอนจินกรอกคะแนน/ประเมิน/กิจกรรม/ปพ.5/ใบแจ้งผล — ย้ายจากต้นแบบที่ทดสอบแล้ว
// ผูกกับ Firestore: work/{ปี~หมวด~คีย์}, sigs/{uid}, settings/school
import { collection, deleteDoc, doc, onSnapshot, query, setDoc, where, writeBatch } from 'firebase/firestore'
import { auth, db } from '../firebase'
import { printCss } from './printcss'
import { buildXlsx } from '../lib/xlsx'
import { htmlToDocx } from '../lib/docx'
import { ask, tell } from '../lib/dialog'
import { readTable } from '../lib/xlsxRead'

const $ = (s) => document.querySelector(s)
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
const LOGO = location.origin + '/logo.png'
const LEVELS = ['ป.1', 'ป.2', 'ป.3', 'ป.4', 'ป.5', 'ป.6', 'ม.1', 'ม.2', 'ม.3']
const isPri = (l) => l.startsWith('ป.')
const PAGES_OK = ['scores', 'acts', 'eval', 'p5', 'report', 'summary', 'sign', 'school', 'guide', 'att', 'progress', 'publish']

let CAT = []
let STU = []
const ACT = () => STU.filter((s) => !s.st)
const U = {}
const USERS = new Proxy(U, { get: (t, k) => t[k] || { name: '(ไม่ทราบชื่อ)', kind: 'teacher' } })
let HOMEROOM = {}
let TEACHERS = []
const NAMES = {}
let CTX = null

const defaultSchool = () => ({
  name: 'โรงเรียนวัดบางปูน',
  area: 'สำนักงานเขตพื้นที่การศึกษาประถมศึกษาสิงห์บุรี',
  officers: { measure: { name: '', sig: null }, acad: { name: '', sig: null }, dir: { name: '', sig: null } },
  heads: {},
})
const S = {
  page: 'scores', term: 1, year: 0, role: '', scCode: null,
  scores: {}, cfg: {}, ab: {}, rs: {}, ev: {}, sign: {}, fix: {}, meta: {}, acts: {}, members: {}, rpt: {}, att: {}, sub: {},
  sigs: {}, school: defaultSchool(), guidance: 'none', regs: [], openSubj: new Set(), notes: [],
  evKind: 'a', actLevel: 'ป.3', rpLevel: 'ป.3', rpStu: null, clubLv: 'ป.3', allSubj: false, sumLv: null,
}
const BUCKETS = ['scores', 'cfg', 'ab', 'rs', 'ev', 'sign', 'fix', 'meta', 'acts', 'members', 'rpt', 'att', 'sub']

const me = () => USERS[S.role]
const isAdmin = () => me().kind !== 'teacher'
function note() {}
function notify(to, text, link) {
  setDoc(doc(collection(db, 'notifications')), { to, text, link: link || '', from: S.role, ts: Date.now() }).catch(() => {})
}
function toast(t) {
  let e = $('#toast')
  if (!e) { e = document.createElement('div'); e.id = 'toast'; e.className = 'toast'; document.body.appendChild(e) }
  e.textContent = t; e.hidden = false
  clearTimeout(toast.h); toast.h = setTimeout(() => (e.hidden = true), 2800)
}

/* ---------- ตัวจัดการเหตุการณ์ ---------- */
const LISTENERS = []
const reg = (type, fn) => LISTENERS.push([type, (e) => { try { fn(e) } catch (err) { console.error(err); toast('เกิดข้อผิดพลาด: ' + err.message) } finally { persist() } }])

const P = {}
// ตัดเกรดจากคะแนนรวมที่ปัดเป็นจำนวนเต็มแล้ว (x.5 ขึ้นไปปัดขึ้น) ให้ตรงกับคะแนนที่แสดงในใบแจ้งผล
function grade(x){x=Math.round(x+1e-9);return x>=80?4:x>=75?3.5:x>=70?3:x>=65?2.5:x>=60?2:x>=55?1.5:x>=50?1:0;}
const gp=g=>`<span class="pill ${g>=3?'p-good':g>=1?'p-gold':'p-bad'}">${g}</span>`;
function evMiss(code,T,R){if(S.tpl)return 0;const st=S.ev[code+'|'+T]||{};return R.filter(r=>!EVK.every(([k,,,it])=>evOverall((st[r.s.id]||{})[k],it.length))).length;}
function myCodes(){if(S.tpl)return [...new Set(CAT.filter(c=>isPri(c.level)||c.term===S.term).map(c=>c.code))];const own=()=>S.regs.filter(r=>r.t===S.role&&r.status==='ok').flatMap(r=>r.codes).filter(c=>{const x=CAT.find(y=>y.code===c);return x&&(isPri(x.level)||x.term===S.term);});
  const mine=[...new Set(own())];if(isAdmin()&&!S.allSubj&&mine.length)return mine;
  return [...new Set(isAdmin()?CAT.filter(c=>(S.openSubj.has(c.code)||S.regs.some(r=>r.status==='ok'&&r.codes.includes(c.code)))&&(isPri(c.level)||c.term===S.term)).map(c=>c.code):S.regs.filter(r=>r.t===S.role&&r.status==='ok').flatMap(r=>r.codes).filter(c=>{const x=CAT.find(y=>y.code===c);return isPri(x.level)||x.term===S.term;}))];}
const TK=(code,T)=>{T=T||S.term;const c=CAT.find(x=>x.code===code);return(c&&isPri(c.level)&&T===1)?code+'~1':code;};
const uk=(T,l)=>(T===1&&isPri(CAT.find(x=>x.code===S.scCode).level))?'①'+l:l;
// ค่าตั้งวิชาที่เป็นค่าเริ่มต้นถูกบันทึกเป็น {} (ดู cleaned) → เติมค่าที่ขาดทุกครั้งที่อ่าน กันหน้าพังเมื่อโหลดจาก Firestore
function cfgOf(code,T){const k=TK(code,T);const f=S.cfg[k]||(S.cfg[k]={});if(!Array.isArray(f.cols)||!f.cols.length)f.cols=[{n:'คะแนนเก็บระหว่างภาค',max:0}];if(!f.scale)f.scale=100;if(!f.hours)f.hours=40;return f;}
function fulls(code,T){const c=CAT.find(x=>x.code===code),f=cfgOf(code,T),base=isPri(c.level)?f.scale:100,[r1,r2]=(f.ratio||'70:30').split(':').map(Number);return {base,mid:base*r1/100,fin:base*r2/100};}
// รวมคะแนนเก็บเฉพาะช่องที่ตั้งไว้ตอนนี้ (n ช่อง) ข้อมูลเกินจากช่องที่ถูกลบไปแล้วไม่นับ
const sumC=(v,n)=>{const a=((v&&v.c)||[]).slice(0,n);return n&&a.length===n&&a.every(x=>x!==''&&x!=null)?a.reduce((p,q)=>p+(+q),0):null;};
function calc(code,T){T=T||S.term;const c=CAT.find(x=>x.code===code),pri=isPri(c.level),F=fulls(code,T),cfg=cfgOf(code,T),H=cfg.hours,key=TK(code,T);
 if(cfg.cols.length===1)cfg.cols[0].max=F.mid;
 S.scores[key]=S.scores[key]||{};S.ab[code]=S.ab[code]||{};
 const t1=(pri&&T===2)?Object.fromEntries(calc(code,1).map(r=>[r.s.id,r.cur])):{},H1=pri?cfgOf(code,1).hours:H;
 return ACT().filter(s=>s.level===c.level).map(s=>{const v=S.scores[key][s.id]||(S.scores[key][s.id]={c:[],f:''});
  const a=S.ab[code][s.id]||(S.ab[code][s.id]={});
  const mid=sumC(v,cfg.cols.length),fin=(v.f===''||v.f==null)?null:+v.f,tot=(mid==null||fin==null)?null:mid+fin;
  const cur=tot==null?null:(pri&&F.base===100?tot/2:tot);const pr=(pri&&T===2)?(t1[s.id]??null):null;
  let att=null,pct=null;
  const A=t=>{const HH=(pri&&T===2&&t===1)?H1:H,ab=attAbs(code,t,s.id);if(ab!=null)return Math.min(HH,ab);const x=+a[t];return x>0?Math.min(HH,x):0;};
  if(pri&&T===2){const hh=H1+H;att=hh-A(1)-A(2);pct=att/hh*100;}
  else{att=H-A(T);pct=att/H*100;}
  const ms=pct!=null&&pct<80;let sum=null,g=null;
  if(!pri){sum=tot;g=(tot==null||pct==null)?null:(ms?'มส':grade(tot));}
  else if(T===2){sum=(cur==null||pr==null)?null:cur+pr;g=(sum==null||pct==null)?null:(ms?'มส':grade(sum));}
  if(((S.rs||{})[code+'|'+T]||{})[s.id]&&(!pri||T===2))g='ร';
  return {s,v,a,mid,fin,tot,cur,pr,att,pct,sum,g,ms};});}
const f1=x=>x==null?'-':(Math.round(x*10)/10).toString();
function pickSubject(){const codes=myCodes();if(!codes.length)return null;if(!S.scCode||!codes.includes(S.scCode))S.scCode=codes[0];return codes;}
function subjectSelect(codes,noRatio){return `${isAdmin()?`<label class="small"><input type="checkbox" id="allsubj" ${S.allSubj?'checked':''}> แสดงทุกวิชาของโรงเรียน (ไม่ติ๊ก = เฉพาะวิชาที่ฉันสอน)</label>`:''}<label for="sub">วิชา</label><select id="sub">${codes.map(k=>{const x=CAT.find(y=>y.code===k);return `<option value="${k}" ${k===S.scCode?'selected':''}>${progMark(k)}${x.level} ${k} ${esc(x.name)}</option>`}).join('')}</select>
 ${noRatio?'':`<label for="rt">สัดส่วน</label><select id="rt">${['60:40','70:30','80:20'].map(x=>`<option ${x===(cfgOf(S.scCode).ratio||'70:30')?'selected':''}>${x}</option>`).join('')}</select>`}
 <div class="row">${[1,2].map(t=>`<button class="chip" aria-pressed="${S.term===t}" data-term="${t}">ภาคเรียนที่ ${t}</button>`).join('')}</div>`;}


/* ---------- ความคืบหน้า / ส่งผลการเรียน ---------- */
const SUBK=(code,T)=>code+'|'+T;
function progOf(code,T){
  const c=CAT.find(x=>x.code===code),pri=isPri(c.level),R=calc(code,T),n=R.length;
  const hasSc=r=>((r.v.c||[]).some(x=>x!==''&&x!=null))||(r.v.f!==''&&r.v.f!=null);
  const full=R.filter(r=>r.tot!=null).length,any=R.filter(hasSc).length;
  const needEv=!pri||T===2,em=needEv?evMiss(code,T,R):0;
  const sub=S.sub[SUBK(code,T)]||null;
  const st=sub?'sent':!n?'none':full===n?'full':any?'part':'none';
  return {c,pri,n,full,any,att:attHas(code,T),needEv,em,sub,st};
}
const PST={sent:['ส่งผลแล้ว','p-good'],full:['กรอกครบ ยังไม่ส่ง','p-gold'],part:['กำลังกรอก','p-warn'],none:['ยังไม่เริ่ม','p-bad'],noteacher:['ยังไม่มีครูสอน','p-bad']};
function progMark(code){try{const p=progOf(code,S.term);return p.st==='sent'?'✔ ':p.st==='full'?'● ':p.st==='part'?'◐ ':'○ ';}catch(e){return '';}}
// วิชาที่ข้อมูลผิดรูปแบบไม่ทำให้ทั้งหน้าพัง: แสดงเป็น "ยังไม่เริ่ม" และบันทึกข้อผิดพลาดไว้ใน console
function progSafe(code,T){try{return progOf(code,T);}catch(e){console.error('progOf',code,e);return {c:CAT.find(x=>x.code===code),pri:false,n:0,full:0,any:0,att:false,needEv:false,em:0,sub:S.sub[SUBK(code,T)]||null,st:S.sub[SUBK(code,T)]?'sent':'none'};}}
function progRows(){
  const T=S.term,okc=c=>c&&(isPri(c.level)||c.term===T);
  const regs=S.regs.filter(r=>r.status==='ok'&&(isAdmin()||r.t===S.role));
  const seen=new Set(),out=[];
  regs.forEach(r=>r.codes.forEach(code=>{const c=CAT.find(x=>x.code===code);if(!okc(c)||seen.has(code))return;seen.add(code);
    let tn='-';try{tn=(USERS[r.t]&&USERS[r.t].name)||r.name||'-';}catch(e){}
    out.push({code,c,teacher:tn,p:progSafe(code,T)});}));
  // วิชาที่เปิดสอนแต่ไม่มีใบลงทะเบียนที่อนุมัติ: ถ้ามีคนกรอกคะแนน/ส่งผลแล้ว (เช่น แอดมินกรอกเองโดยไม่ได้ลงทะเบียน)
  // แสดงความคืบหน้าจริง + ชื่อผู้ส่งผล และป้าย "ยังไม่ลงทะเบียนสอน" แทน "ยังไม่มีครูสอน"
  if(isAdmin())CAT.filter(c=>S.openSubj.has(c.code)&&okc(c)&&!seen.has(c.code)).forEach(c=>{const p=progSafe(c.code,T);
    if(p.sub||p.any)out.push({code:c.code,c,teacher:(p.sub&&p.sub.name)||'-',p,unreg:true});
    else out.push({code:c.code,c,teacher:'-',p:{...p,st:'noteacher'},nt:true});});
  return out.sort((a,b)=>a.c.level.localeCompare(b.c.level,'th')||a.code.localeCompare(b.code));
}
function submitSubject(code){
  const T=S.term,p=progOf(code,T);if(S.tpl)return;
  const warn=[];if(!p.att)warn.push('ยังไม่มีข้อมูลเวลาเรียน (เช็คชื่อ/ชั่วโมงที่ขาด)');
  if(p.full<p.n)return toast('ยังกรอกคะแนนไม่ครบ ('+p.full+'/'+p.n+' คน) ส่งผลไม่ได้');
  if(p.em)return toast('ยังประเมินผู้เรียนไม่ครบ '+p.em+' คน (คุณลักษณะ/อ่านคิดวิเคราะห์เขียน/สมรรถนะ) ส่งผลไม่ได้');
  const go=()=>{S.sub[SUBK(code,T)]={at:Date.now(),by:S.role,name:me().name};persist();notify('admins',`${me().name} ส่งผลการเรียน ${code} ${p.c.name} ภาคเรียนที่ ${T} แล้ว`,'progress');toast('ส่งผลการเรียนแล้ว');render();};
  ask({title:'ส่งผลการเรียนวิชานี้?',text:`${code} ${p.c.name} ภาคเรียนที่ ${T}${warn.length?'\n\nข้อสังเกต:\n• '+warn.join('\n• '):''}\n\nแอดมินจะเห็นว่าส่งแล้ว (ส่งกลับให้แก้ไขได้ภายหลัง)`,ok:'ส่งผลการเรียน',cancel:'ยังไม่ส่ง'}).then(y=>{if(y)go();});
}
function unsubmitSubject(code){
  const T=S.term;const s=S.sub[SUBK(code,T)];if(!s||S.tpl)return;
  ask({title:isAdmin()?'ส่งกลับให้ครูแก้ไข?':'ยกเลิกการส่งผล?',text:`${code} ภาคเรียนที่ ${T} จะกลับเป็นสถานะ "ยังไม่ส่ง"`,ok:'ยืนยัน',cancel:'ไม่ทำ',danger:true}).then(y=>{if(!y)return;delete S.sub[SUBK(code,T)];persist();if(isAdmin()&&s.by&&s.by!==S.role)notify(s.by,`แอดมินส่งผลการเรียน ${code} ภาคเรียนที่ ${T} กลับให้แก้ไข`,'progress');toast('ยกเลิกการส่งแล้ว');render();});
}

function evKindMiss(code,T,R,k){const K=EVK.find(x=>x[0]===k),st=S.ev[code+'|'+T]||{};return R.filter(r=>!evOverall((st[r.s.id]||{})[k],K[3].length)).length;}
function stepBar(c,R,cur){
  const T=S.term,pri=isPri(c.level),needEv=!pri||T===2;
  const steps=[['scores','',1,'บันทึกคะแนน',R.length>0&&R.every(r=>r.tot!=null)]];
  if(needEv)EVK.forEach((x,i)=>steps.push(['eval',x[0],i+2,x[2],R.length>0&&evKindMiss(c.code,T,R,x[0])===0]));
  const sub=!!S.sub[c.code+'|'+T];
  steps.push(['scores','sub',steps.length+1,'ส่งผลการเรียน',sub]);
  return `<div class="row" style="gap:6px;flex-wrap:wrap" aria-label="ขั้นตอนการบันทึกวิชานี้">${steps.map(([pg,k,n,t,done])=>{const on=cur===(pg+':'+k);return `<button class="chip" aria-pressed="${on}" data-nx="${pg}|${k}">${done?'✔':n} ${t}</button>`;}).join('<span class="muted">›</span>')}</div>`;
}
function nextBtn(c,R,cur){
  const T=S.term,pri=isPri(c.level),needEv=!pri||T===2;
  const seq=[['scores','','บันทึกคะแนน']];if(needEv)EVK.forEach(x=>seq.push(['eval',x[0],x[2]]));
  const i=seq.findIndex(x=>(x[0]+':'+x[1])===cur),n=seq[i+1];
  const done=cur==='scores:'?(R.length>0&&R.every(r=>r.tot!=null)):evKindMiss(c.code,T,R,cur.split(':')[1])===0;
  return `<div class="card row" style="justify-content:space-between"><span class="small">${done?'✔ ขั้นนี้ครบแล้ว':'ยังกรอกขั้นนี้ไม่ครบ (ข้ามไปก่อนได้ แต่ต้องครบทุกขั้นถึงจะส่งผลได้)'}</span>${n?`<button class="btn ${done?'':'alt'}" data-nx="${n[0]}|${n[1]}">ถัดไป: ${n[2]} ▶</button>`:`<button class="btn ${done?'':'alt'}" data-nx="scores|sub">เสร็จแล้ว ไปส่งผลการเรียน ▶</button>`}</div>`;
}
function subCard(c,R){
  const p=progOf(c.code,S.term);if(!p.n)return '';
  const when=p.sub?new Date(p.sub.at).toLocaleString('th-TH',{dateStyle:'medium',timeStyle:'short'}):'';
  return `<div class="card row" style="justify-content:space-between"><span class="small"><span class="pill ${PST[p.st][1]}">${PST[p.st][0]}</span> กรอกคะแนนครบ ${p.full}/${p.n} คน${p.sub?` · ส่งเมื่อ ${when} โดย ${esc(p.sub.name||'')}`:''}</span>${p.sub?`<button class="btn sm alt" data-act="unsub" data-c="${c.code}">${isAdmin()?'ส่งกลับให้แก้ไข':'ยกเลิกการส่ง'}</button>`:`<button class="btn sm" data-act="dosub" data-c="${c.code}" ${p.full<p.n||p.em?`disabled title="${p.full<p.n?'กรอกคะแนนให้ครบทุกคนก่อน':'ประเมินผู้เรียนให้ครบทุกหมวดก่อน'}"`:''}>ส่งผลการเรียน</button>`}</div>`;
}
P.progress=()=>{
  const all=progRows(),T=S.term,F=S.pgF||'all',LV=S.pgLv||'all',V=isAdmin()?(S.pgView||'subj'):'subj';
  const rows=all.filter(r=>LV==='all'||r.c.level===LV);
  if(!all.length)return `<div class="card empty">ยังไม่มีวิชาที่อนุมัติสำหรับภาคเรียนนี้<br><br><button class="btn" data-go="reg">ไปลงทะเบียนสอน</button></div>`;
  const cnt=k=>rows.filter(r=>r.p.st===k).length;
  const list=rows.filter(r=>F==='all'||r.p.st===F);
  const chip=(k,t)=>`<button class="chip" aria-pressed="${F===k}" data-pgf="${k}">${t}</button>`;
  const bar=r=>`<div style="background:#eee;border-radius:99px;height:8px;min-width:70px;overflow:hidden"><div style="width:${r.p.n?Math.round(r.p.full/r.p.n*100):0}%;height:8px;background:${r.p.st==='sent'?'#2e7d32':'#c4883a'}"></div></div>`;
  const tr=list.map(r=>{const p=r.p;return `<tr><td><b>${r.code}</b><div class="small muted">${esc(r.c.name)}</div></td><td>${r.c.level}</td>${isAdmin()?`<td>${esc(r.teacher)}${r.unreg?'<div><span class="pill p-warn" title="วิชานี้มีการกรอกคะแนนแล้ว แต่ยังไม่มีใบลงทะเบียนสอนที่อนุมัติ ให้ครูผู้สอนลงทะเบียนวิชานี้ในเมนูลงทะเบียนวิชาสอน">ยังไม่ลงทะเบียนสอน</span></div>':''}</td>`:''}<td class="num">${p.n}</td>
   <td>${r.nt?'-':`${p.full}/${p.n}${bar(r)}`}</td><td>${r.nt?'-':p.att?'<span class="pill p-good">มีแล้ว</span>':'<span class="pill p-warn">ยังไม่มี</span>'}</td>
   <td>${r.nt?'-':!p.needEv?'<span class="small muted">ไม่ต้อง</span>':p.em?`<span class="pill p-warn">ขาด ${p.em} คน</span>`:p.n?'<span class="pill p-good">ครบ</span>':'-'}</td>
   <td><span class="pill ${PST[p.st][1]}">${PST[p.st][0]}</span>${p.sub?`<div class="small muted">${new Date(p.sub.at).toLocaleDateString('th-TH',{day:'numeric',month:'short',year:'2-digit'})}</div>`:''}</td>
   <td>${r.nt?'':`<button class="btn sm alt" data-go="scores@${r.code}" title="ไปหน้าบันทึกคะแนนของวิชานี้">${isAdmin()?'ดูคะแนน':'กรอกคะแนน'}</button>${p.sub?` <button class="btn sm alt" data-act="unsub" data-c="${r.code}">${isAdmin()?'ส่งกลับ':'ยกเลิกส่ง'}</button>`:p.st==='full'&&!isAdmin()?` <button class="btn sm" data-act="dosub" data-c="${r.code}">ส่งผล</button>`:''}`}</td></tr>`;}).join('');
  const lvs=LEVELS.filter(l=>all.some(r=>r.c.level===l));
  const lvBar=`<div class="row"><b class="small">ชั้น</b><button class="chip" aria-pressed="${LV==='all'}" data-pglv="all">ทุกชั้น</button>${lvs.map(l=>`<button class="chip" aria-pressed="${LV===l}" data-pglv="${l}">${l}</button>`).join('')}</div>`;
  const viewBar=isAdmin()?`<div class="row"><b class="small">มุมมอง</b><button class="chip" aria-pressed="${V==='subj'}" data-pgview="subj">รายวิชา</button><button class="chip" aria-pressed="${V==='teacher'}" data-pgview="teacher">รายครู (ส่งครบหรือยัง)</button></div>`:'';
  // มุมมองรายครู: ครูแต่ละคน วิชาที่ลงทะเบียน และส่งผลแล้วหรือยัง
  const byT={};rows.filter(r=>!r.nt).forEach(r=>{(byT[r.teacher]||(byT[r.teacher]=[])).push(r);});
  const tcards=Object.entries(byT).sort((a,b)=>{const da=a[1].every(r=>r.p.st==='sent'),db=b[1].every(r=>r.p.st==='sent');return (da-db)||a[0].localeCompare(b[0],'th');}).map(([t,rs])=>{const done=rs.filter(r=>r.p.st==='sent').length,ok=done===rs.length;
   return `<div class="tcard${ok?' ok':''}"><div class="row" style="justify-content:space-between"><b>${ok?'✅':'⏳'} ${esc(t)}</b><span class="pill ${ok?'p-good':'p-warn'}">ส่งแล้ว ${done}/${rs.length} วิชา</span></div>
   <div class="tsub">${rs.sort((a,b)=>a.c.level.localeCompare(b.c.level,'th')||a.code.localeCompare(b.code)).map(r=>`<span class="tchip ${r.p.st==='sent'?'on':''}" title="${esc(PST[r.p.st][0])}">${r.p.st==='sent'?'✓':'•'} ${r.c.level} ${r.code} ${esc(r.c.name)}</span>`).join('')}</div></div>`;}).join('');
  const nt=rows.filter(r=>r.nt);
  if(V==='teacher')return `<div class="stack"><div class="row">${[1,2].map(t=>`<button class="chip" aria-pressed="${T===t}" data-term="${t}">ภาคเรียนที่ ${t}</button>`).join('')}</div>${viewBar}${lvBar}
   <div class="card stack"><h3>ครูส่งผลครบหรือยัง · ภาคเรียนที่ ${T}${LV==='all'?'':' · '+LV}</h3><div class="small muted">✓ = ส่งผลแล้ว · • = ยังไม่ส่ง · ครูที่ยังส่งไม่ครบแสดงก่อน</div><div class="tgrid">${tcards||'<div class="empty">ไม่มีข้อมูล</div>'}</div>
   ${nt.length?`<div class="lock small"><b>วิชาที่ยังไม่มีครูสอน ${nt.length} วิชา:</b> ${nt.map(r=>`${r.c.level} ${r.code} ${esc(r.c.name)}`).join(' · ')}</div>`:''}</div></div>`;
  return `<div class="stack"><div class="row">${[1,2].map(t=>`<button class="chip" aria-pressed="${T===t}" data-term="${t}">ภาคเรียนที่ ${t}</button>`).join('')}</div>${viewBar}${lvBar}
  <div class="grid"><div class="card kpi"><b>${rows.length}</b>วิชาทั้งหมด</div><div class="card kpi"><b style="color:#2e7d32">${cnt('sent')}</b>ส่งผลแล้ว</div><div class="card kpi"><b>${cnt('full')}</b>กรอกครบ รอส่ง</div><div class="card kpi"><b>${cnt('part')+cnt('none')+cnt('noteacher')}</b>ยังไม่เสร็จ</div></div>
  <div class="card stack"><h3>${isAdmin()?'ความคืบหน้าการบันทึกผลทุกวิชา':'วิชาของฉัน: บันทึกแล้วหรือยัง'} · ภาคเรียนที่ ${T}</h3>
  <div class="small muted">ส่งผลได้เมื่อกรอกคะแนนครบทุกคน ${T===1?'· ประถมภาคเรียนที่ 1 ยังไม่ตัดเกรด แต่ส่งผลคะแนนได้':''}</div>
  <div class="row">${chip('all','ทั้งหมด '+rows.length)}${chip('sent','ส่งแล้ว '+cnt('sent'))}${chip('full','รอส่ง '+cnt('full'))}${chip('part','กำลังกรอก '+cnt('part'))}${chip('none','ยังไม่เริ่ม '+cnt('none'))}${isAdmin()&&cnt('noteacher')?chip('noteacher','ไม่มีครู '+cnt('noteacher')):''}</div>
  <div class="tw"><table><thead><tr><th>วิชา</th><th>ชั้น</th>${isAdmin()?'<th>ครูผู้สอน</th>':''}<th>นักเรียน</th><th>กรอกคะแนนครบ</th><th>เวลาเรียน</th><th>ประเมิน</th><th>สถานะ</th><th></th></tr></thead><tbody>${tr||'<tr><td colspan="9" class="muted">ไม่มีรายการในกลุ่มนี้</td></tr>'}</tbody></table></div></div></div>`;
};
reg('click',e=>{const nx=e.target.closest('[data-nx]');if(nx&&$('#view')&&$('#view').contains(nx)){const [pg,k]=nx.dataset.nx.split('|');if(pg==='eval'&&k)S.evKind=k;if(S.page===pg)render();else CTX.go(pg);if(k==='sub')setTimeout(()=>{const b=document.querySelector('[data-act=dosub],[data-act=unsub]');if(b&&b.scrollIntoView)b.scrollIntoView({block:'center'});},120);return;}
 const t=e.target.closest('[data-pgf],[data-pglv],[data-pgview],[data-act=dosub],[data-act=unsub]');if(!t||!$('#view')||!$('#view').contains(t))return;
  if(t.dataset.pgf){S.pgF=t.dataset.pgf;render();return;}
  if(t.dataset.pglv){S.pgLv=t.dataset.pglv;render();return;}
  if(t.dataset.pgview){S.pgView=t.dataset.pgview;render();return;}
  if(t.dataset.act==='dosub')submitSubject(t.dataset.c||S.scCode);else unsubmitSubject(t.dataset.c||S.scCode);});

/* ---------- เช็คชื่อรายวัน ---------- */
const ATC=['','ข','ล','ป','ส','น'],ATN={'':'มา',ข:'ขาด',ล:'ลากิจ',ป:'ป่วย',ส:'สาย',น:'หนีเรียน'},ATABS='ขลปน';
const attKey=(code,T)=>code+'|'+T;
const attOf=(code,T)=>{const x=S.att[attKey(code,T)]||(S.att[attKey(code,T)]={});if(!Array.isArray(x.days))x.days=[];if(!x.m||typeof x.m!=='object')x.m={};return x;};
const attHas=(code,T)=>{const x=S.att[attKey(code,T)];return !!(x&&x.days&&x.days.length);};
function attAbs(code,T,sid){const x=S.att[attKey(code,T)];if(!x||!x.days||!x.days.length)return null;const m=(x.m||{})[sid]||{};let n=0;x.days.forEach(d=>{if(d.x)return;const st=m[d.d];if(st&&ATABS.includes(st))n+=(+d.h>0?+d.h:1);});return n;}
const isoD=dt=>dt.getFullYear()+'-'+String(dt.getMonth()+1).padStart(2,'0')+'-'+String(dt.getDate()).padStart(2,'0');
const dShort=iso=>{const q=iso.split('-');return (+q[2])+'/'+(+q[1]);};
const MSHORT=['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
function attRender(){const w=document.querySelector('#view .tw'),l=w?w.scrollLeft:0,y=window.scrollY;render();const w2=document.querySelector('#view .tw');if(w2)w2.scrollLeft=l;window.scrollTo(0,y);}

const calOf=()=>{const sc=S.school;sc.cal=sc.cal||{};[1,2].forEach(t=>{sc.cal[t]=sc.cal[t]||{open:'',close:''}});sc.cal.hol=sc.cal.hol||[];return sc.cal;};
const holSet=()=>{const set=new Map();calOf().hol.forEach(h=>{const d=new Date(h.f+'T00:00:00'),e=new Date((h.t||h.f)+'T00:00:00');let n=0;while(d<=e&&n++<120){set.set(isoD(d),h.n||'วันหยุด');d.setDate(d.getDate()+1);}});return set;};
const DOWN=['อา','จ','อ','พ','พฤ','ศ','ส'];
const mondayOf=iso=>{const d=new Date(iso+'T00:00:00');d.setDate(d.getDate()-((d.getDay()+6)%7));return isoD(d);};
function attWeeks(days){const m=new Map();days.forEach(x=>{const k=mondayOf(x.d);(m.get(k)||m.set(k,[]).get(k)).push(x);});return [...m.entries()].sort((a,b)=>a[0]<b[0]?-1:1);}
function attGen(f,e2){
  const c=S.scCode,T=S.term,A=attOf(c,T),tt=(A.tt&&A.tt.h)||{},hol=holSet();
  if(!Object.values(tt).some(v=>+v>0))return toast('เลือกวันที่สอนและจำนวนชั่วโมงในตารางสอนก่อน');
  if(!f||!e2||e2<f)return toast('ตั้งวันเปิด-ปิดภาคเรียนให้ถูกต้องก่อน');
  const have=new Set(A.days.map(x=>x.d));let n=0,skip=0;const d=new Date(f+'T00:00:00'),end=new Date(e2+'T00:00:00');
  while(d<=end&&n<400){const iso=isoD(d),h=+tt[d.getDay()]||0;if(h>0){if(hol.has(iso)){skip++;if(!have.has(iso)){A.days.push({d:iso,h,x:hol.get(iso)});have.add(iso);}}else if(!have.has(iso)){A.days.push({d:iso,h});have.add(iso);n++;}}d.setDate(d.getDate()+1);}
  A.days.sort((x,y)=>x.d<y.d?-1:x.d>y.d?1:0);S.attWk=null;S.attPg=null;
  const tot=A.days.filter(x=>!x.x).reduce((p,x)=>p+(+x.h||1),0),H=cfgOf(c,T).hours;
  toast(`สร้างวันเรียน ${n} วัน (รวม ${A.days.filter(x=>!x.x).length} วัน ${tot} ชม.) วันหยุดที่ขีดไว้ ${skip} วัน`);attRender();
  if(tot!==H)ask({title:'ปรับชั่วโมงเรียนทั้งหมดตามที่สร้าง ?',text:`ตอนนี้ตั้งไว้ ${H} ชม. แต่วันเรียนที่สร้างรวม ${tot} ชม.\\nให้ตั้งชั่วโมงทั้งหมดเป็น ${tot} ชม. เพื่อคิดร้อยละเวลาเรียนและ มส. ?`,ok:`ตั้งเป็น ${tot} ชม.`,cancel:'คงเดิม'}).then(y=>{if(y){cfgOf(c,T).hours=tot;attRender();}});
}
function genCard(c,A){
  const T=S.term,cal=calOf()[T],tt=(A.tt&&A.tt.h)||{};
  return `<div class="card stack"><h3>ตารางสอนและสร้างวันเรียนทั้งภาคเรียน</h3>
  <div class="small muted">เลือกวันที่สอนในแต่ละสัปดาห์และจำนวนชั่วโมง แล้วกดสร้าง ระบบจะใส่วันเรียนทั้งภาคเรียนให้ทันที (ข้ามวันหยุดที่แอดมินตั้งไว้) จากนั้นค่อยเช็คชื่อทีละสัปดาห์</div>
  <div class="row">${[1,2,3,4,5].map(d=>`<label class="small" style="display:flex;flex-direction:column;align-items:center;gap:2px">วัน${DOWN[d]}<select data-ttd="${d}" aria-label="ชั่วโมงสอนวัน${DOWN[d]}">${[0,1,2,3,4].map(h=>`<option value="${h}" ${(+tt[d]||0)===h?'selected':''}>${h?h+' ชม.':'ไม่สอน'}</option>`).join('')}</select></label>`).join('')}</div>
  <div class="row"><label for="genf">เปิดเรียน</label><input id="genf" type="date" value="${cal.open||''}"><label for="gent">ปิดเรียน</label><input id="gent" type="date" value="${cal.close||''}"><button class="btn sm" data-at="gen">สร้างวันเรียนทั้งภาคเรียน</button></div>
  ${cal.open&&cal.close?`<div class="small muted">วันเปิด-ปิดเรียนดึงจากปฏิทินที่แอดมินตั้งไว้ · วันหยุดในปฏิทิน ${calOf().hol.length} รายการ</div>`:'<div class="small" style="color:var(--bad)">แอดมินยังไม่ตั้งปฏิทินภาคเรียนนี้ (เมนูตั้งค่าโรงเรียน) กรอกวันเปิด-ปิดเองได้ แต่จะไม่ข้ามวันหยุดให้</div>'}</div>`;
}
function calCard(){
  const cal=calOf();
  return `<div class="card stack"><h3>ปฏิทินภาคเรียน (วันเปิด-ปิด และวันหยุด)</h3><div class="small muted">ตั้งครั้งเดียว ครูทุกคนจะดึงไปสร้างวันเรียนในหน้าเช็คชื่อได้ทันที เสาร์-อาทิตย์ไม่นับอยู่แล้ว เพิ่มเฉพาะวันหยุดราชการ/หยุดพิเศษ</div>
  ${[1,2].map(t=>`<div class="row"><b>ภาคเรียนที่ ${t}</b><label for="co${t}">เปิดเรียน</label><input id="co${t}" type="date" data-cal="${t}.open" value="${cal[t].open||''}"><label for="cc${t}">ปิดเรียน</label><input id="cc${t}" type="date" data-cal="${t}.close" value="${cal[t].close||''}"></div>`).join('')}
  <div class="row"><button class="btn sm" data-act="holstd">เพิ่มวันหยุดราชการประจำปีที่วันที่คงที่</button><span class="small muted">วันพระใหญ่ (มาฆบูชา วิสาขบูชา อาสาฬหบูชา เข้าพรรษา) และวันหยุดชดเชย เพิ่มเองด้านล่าง เพราะเปลี่ยนทุกปี</span></div>
  <div class="row"><b>เพิ่มวันหยุด</b><input id="hf" type="date" aria-label="วันที่เริ่ม"><span class="small">ถึง</span><input id="ht" type="date" aria-label="ถึงวันที่ (ถ้าหยุดหลายวัน)"><input id="hn" placeholder="ชื่อวันหยุด" size="18"><button class="btn sm" data-act="holadd">เพิ่ม</button></div>
  ${cal.hol.length?`<div class="tw"><table><thead><tr><th>วันที่</th><th>ชื่อ</th><th></th></tr></thead><tbody>${cal.hol.map((h,i)=>({h,i})).sort((a,b)=>a.h.f<b.h.f?-1:1).map(({h,i})=>`<tr><td>${dShort(h.f)}${h.t&&h.t!==h.f?' – '+dShort(h.t):''} ${(h.f||'').slice(0,4)}</td><td>${esc(h.n||'')}</td><td><button class="btn sm alt" data-act="holdel" data-i="${i}">ลบ</button></td></tr>`).join('')}</tbody></table></div>`:'<div class="small muted">ยังไม่มีวันหยุด</div>'}</div>`;
}
function attAddDays(list,h){const c=S.scCode,A=attOf(c,S.term),have=new Set(A.days.map(x=>x.d));let n=0;list.forEach(d=>{if(!have.has(d)){A.days.push({d,h});have.add(d);n++;}});A.days.sort((x,y)=>x.d<y.d?-1:x.d>y.d?1:0);return n;}
P.att=()=>{
 const codes=pickSubject();
 if(!codes)return `<div class="card empty">ยังไม่มีวิชาที่อนุมัติสำหรับภาคเรียนนี้<br><br><button class="btn" data-go="reg">ไปลงทะเบียนสอน</button></div>`;
 const c=CAT.find(x=>x.code===S.scCode),T=S.term,A=attOf(c.code,T),R=calc(c.code,T),H=cfgOf(c.code,T).hours,days=A.days;
 const ids=new Set(R.map(r=>r.s.id));S.attS=(S.attS||[]).filter(i=>ids.has(i));S.attD=(S.attD||[]).filter(d=>days.some(x=>x.d===d));
 // แสดงวันเรียนต่อเนื่องกัน หน้าละ 20 วัน (เพิ่มวันใหม่ต่อท้ายของเดิม) มีเลขหน้าให้กด
 const PG=20,np=Math.max(1,Math.ceil(days.length/PG)),today=isoD(new Date());
 if(S.attPg==null||S.attPg>=np){const tgt=S.attLast||today;let idx=days.findIndex(x=>x.d>=tgt);if(idx<0)idx=days.length-1;S.attPg=Math.max(0,Math.floor(Math.max(0,idx)/PG));}
 const vd=days.slice(S.attPg*PG,S.attPg*PG+PG);S.attVis=vd.map(x=>x.d);
 const pgs=Array.from({length:np},(_,i)=>i),pgLbl=i=>{const a=days[i*PG],b=days[Math.min(days.length,(i+1)*PG)-1];return a?dShort(a.d)+'–'+dShort(b.d):''};
 const wkBar=days.length?`<div class="row pgbar"><button class="btn sm alt" data-at="wkprev" ${S.attPg<=0?'disabled':''} aria-label="หน้าก่อน">◀</button>${pgs.map(i=>`<button class="chip" aria-pressed="${i===S.attPg}" data-at="pg" data-p="${i}" title="${pgLbl(i)}">${i+1}</button>`).join('')}<button class="btn sm alt" data-at="wknext" ${S.attPg>=np-1?'disabled':''} aria-label="หน้าถัดไป">▶</button><span class="small muted">วันที่ ${S.attPg*PG+1}–${S.attPg*PG+vd.length} จากทั้งหมด ${days.length} วัน (${pgLbl(S.attPg)})</span></div>`:'';
 const nHol=days.filter(x=>x.x).length,totH=days.filter(x=>!x.x).reduce((p,x)=>p+(+x.h||1),0),xset=new Set(days.filter(x=>x.x).map(x=>x.d)),ym=days.length?days[0].d.slice(0,4):String(new Date().getFullYear());
 const head=vd.map(x=>x.x?`<th class="atd hol" title="วันหยุด: ${esc(x.x)}"><label><input type="checkbox" data-ad="${x.d}" ${S.attD.includes(x.d)?'checked':''} aria-label="เลือกวันที่ ${dShort(x.d)}"><br><s><b>${dShort(x.d)}</b></s></label><div class="small" style="max-width:70px;white-space:normal;line-height:1.15">${esc(x.x)}</div></th>`:`<th class="atd"><label><input type="checkbox" data-ad="${x.d}" ${S.attD.includes(x.d)?'checked':''} aria-label="เลือกวันที่ ${dShort(x.d)}"><br><b>${dShort(x.d)}</b></label><div class="small muted">${x.h} ชม.</div></th>`).join('');
 const rows=R.map(r=>{const m=A.m[r.s.id]||{},ab=attAbs(c.code,T,r.s.id)||0;
  return `<tr><td class="num"><label><input type="checkbox" data-as="${r.s.id}" ${S.attS.includes(r.s.id)?'checked':''} aria-label="เลือก ${esc(r.s.name)}"> ${r.s.no}</label></td><td>${esc(r.s.name)}</td>${vd.map(x=>{if(x.x)return `<td class="ac hol" title="${esc(x.x)}">—</td>`;const st=m[x.d]||'';return `<td class="ac"><button class="astb as${st||'0'}" data-ac="${r.s.id}|${x.d}" title="${ATN[st]}" aria-label="${esc(r.s.name)} ${dShort(x.d)} ${ATN[st]}">${st||'/'}</button></td>`;}).join('')}<td class="num">${ab}</td><td class="num">${r.pct==null?'-':`<span class="pill ${r.ms?'p-bad':'p-good'}">${f1(r.pct)}%</span>`}</td></tr>`;}).join('');
 return `<div class="stack"><div class="row">${subjectSelect(codes,1)}</div>
 ${genCard(c,A)}
 <div class="card stack"><h3>เช็คชื่อรายวัน</h3>
  <div class="small muted">เพิ่มวันเรียนทีละวันหรือทั้งช่วง ทุกคนถือว่า “มาเรียน” อยู่แล้ว จึงบันทึกเฉพาะคนที่ขาด/ลา/ป่วย/สาย/หนีเรียน ระบบนับชั่วโมงที่ขาดเข้าเวลาเรียนและตัดเป็น มส. (ต่ำกว่าร้อยละ 80) ให้เอง และพิมพ์รวมเป็นหน้าแนวนอนใน ปพ.5</div>
  <div class="row"><label for="attd">วันที่</label><input id="attd" type="date" value="${S.attLast||''}"><label for="atth">ชั่วโมง/วัน</label><input id="atth" type="number" min="1" max="8" value="${S.attH||1}" style="width:70px"><button class="btn sm" data-at="add">เพิ่มวันเรียน</button></div>
  <details><summary class="small">เพิ่มทั้งช่วงวัน (ข้ามเสาร์-อาทิตย์ให้)</summary><div class="row" style="margin-top:8px"><label for="attf">ตั้งแต่</label><input id="attf" type="date"><label for="attt">ถึง</label><input id="attt" type="date"><label class="small"><input type="checkbox" id="attwe"> รวมเสาร์-อาทิตย์</label><button class="btn sm alt" data-at="range">เพิ่มทั้งช่วง</button></div><div class="small muted">วันหยุดที่ไม่ได้สอน ให้ติ๊กหัวคอลัมน์วันนั้นแล้วกด “ลบวันที่เลือก”</div></details>
  <div class="row"><label for="hrs">ชั่วโมงเรียนทั้งหมดของภาคเรียนนี้</label><input id="hrs" type="number" min="1" value="${H}" style="width:90px"><span class="small muted">ตั้งตามจริงของวิชานี้ (ค่าเริ่มต้น 40) ใช้คิดร้อยละเวลาเรียนและ มส.</span></div>
  <div class="row"><span class="pill ${days.length?'p-good':'p-warn'}">บันทึกแล้ว ${days.length-nHol} วัน · ${totH} ชม.${nHol?` (วันหยุดที่ขีดไว้ ${nHol} วัน ไม่นับ)`:''} (ตั้งไว้ทั้งภาคเรียน ${H} ชม.)</span>${days.length&&totH>H?`<span class="small" style="color:var(--bad)">ชั่วโมงที่บันทึกมากกว่าที่ตั้งไว้ ปรับช่อง “ชั่วโมงเรียนทั้งหมด” ด้านบน</span>`:''}</div>
 </div>
 ${days.length?`<div class="card stack"><div class="row"><b>ลงสถานะ</b><select id="atss" aria-label="สถานะ">${ATC.map(k=>`<option value="${k}">${k?k+' = ':''}${ATN[k]}</option>`).join('')}</select><button class="btn sm" data-at="apply">ใช้กับที่เลือก</button><span class="small muted">ติ๊กหน้าชื่อ (หลายคนได้) และ/หรือหัวคอลัมน์วันที่ แล้วกดใช้ — ถ้าเลือกเฉพาะนักเรียน = ทุกวันของคนนั้น, เลือกเฉพาะวัน = ทุกคนในวันนั้น</span></div>
  <div class="row"><button class="btn sm alt" data-at="selall">เลือกนักเรียนทั้งหมด</button><button class="btn sm alt" data-at="selnone">ล้างที่เลือก</button><button class="btn sm alt" data-at="allpresent">ทุกคนมาเรียนทุกวัน</button><button class="btn sm alt" style="color:var(--bad)" data-at="delday">ลบวันที่เลือก</button></div>
  <div class="row"><b>วันหยุด</b><input id="attholn" placeholder="ชื่อวันหยุด เช่น หยุดชดเชย" size="22"><button class="btn sm alt" data-at="markhol">ตั้งวันที่เลือกเป็นวันหยุด (ขีดช่อง)</button><button class="btn sm alt" data-at="unhol">ยกเลิกวันหยุด</button><span class="small muted">ติ๊กหัวคอลัมน์วันที่ก่อน · วันหยุดไม่นับชั่วโมงและไม่เช็คชื่อ</span></div>
  <div class="small muted">แตะช่องเพื่อเปลี่ยนทีละคน: / (มา) → ข → ล → ป → ส → น · ข=ขาด ล=ลากิจ ป=ลาป่วย ส=สาย (นับว่ามาเรียน) น=หนีเรียน</div></div>
 ${wkBar}
 <div class="tw hd"><table class="attm"><thead><tr><th>เลขที่</th><th>ชื่อ-สกุล</th>${head}<th>ขาด (ชม.)</th><th>เวลาเรียน</th></tr></thead><tbody>${rows}</tbody></table></div>`:'<div class="card empty">ยังไม่มีวันเรียน เพิ่มวันที่ด้านบนเพื่อเริ่มเช็คชื่อ</div>'}</div>`;};
P.scores=()=>{
 const codes=pickSubject();
 if(!codes)return `<div class="card empty">ยังไม่มีวิชาที่อนุมัติสำหรับภาคเรียนนี้<br><br><button class="btn" data-go="reg">ไปลงทะเบียนสอน</button></div>`;
 const c=CAT.find(x=>x.code===S.scCode),pri=isPri(c.level),cfg=cfgOf(c.code),F=fulls(c.code),R=calc(c.code),t2=pri&&S.term===2;
 const sumMax=cfg.cols.reduce((p,q)=>p+(+q.max||0),0),ok=Math.abs(sumMax-F.mid)<1e-9,H=cfg.hours;
 const rows=R.map(r=>{
  const ins=cfg.cols.map((k,i)=>`<td><input type="number" min="0" max="${k.max}" data-sc="${r.s.id}" data-i="${i}" value="${r.v.c[i]==null?'':r.v.c[i]}" aria-label="${esc(k.n)} ${esc(r.s.name)}"></td>`).join('');
  const fin=`<td><input type="number" min="0" max="${F.fin}" data-sc="${r.s.id}" data-i="f" value="${r.v.f==null?'':r.v.f}" aria-label="ปลายภาค ${esc(r.s.name)}"></td>`;
  const att=`<td><input type="number" min="0" max="${H}" data-ab="${r.s.id}" value="${attHas(c.code,S.term)?(attAbs(c.code,S.term,r.s.id)||''):(r.a[S.term]>0?r.a[S.term]:'')}" ${attHas(c.code,S.term)?'disabled title="คำนวณจากหน้าเช็คชื่อ"':''} placeholder="0" aria-label="ชั่วโมงที่ขาด ${esc(r.s.name)}"></td><td class="num">${r.pct==null?'-':`<span class="pill ${r.ms?'p-bad':'p-good'}">${f1(r.pct)}%</span>`}</td>`;
  let tail;
  if(!pri)tail=`<td class="num">${f1(r.tot)}</td><td>${r.g==null?'-':gp(r.g)}</td>`;
  else if(!t2)tail=`<td class="num">${f1(r.cur)} / 50</td><td class="muted small">${r.ms?'เวลาเรียนต่ำกว่าร้อยละ 80':'ยังไม่ตัดเกรด'}</td>`;
  else tail=`<td class="num">${f1(r.pr)}</td><td class="num">${f1(r.cur)}</td><td class="num">${f1(r.sum)}</td><td>${r.g==null?'-':gp(r.g)}</td>`;
  return `<tr><td>${r.s.no}</td><td>${esc(r.s.name)}</td>${ins}<td class="num">${f1(r.mid)}</td>${fin}${att}${(!pri||t2)?`<td><input type="checkbox" data-rs="${r.s.id}" ${((S.rs[SKEY()]||{})[r.s.id])?'checked':''} aria-label="ร รอการตัดสิน ${esc(r.s.name)}"></td>`:''}${tail}</tr>`;}).join('');
 const head=!pri?'<th>รวม</th><th>เกรด</th>':!t2?'<th>ภาคเรียน 1 (/50)</th><th></th>':'<th>ภาคเรียน 1 (/50)</th><th>ภาคเรียน 2 (/50)</th><th>รวมทั้งปี</th><th>เกรด</th>';
 return `<div class="stack"><div class="row">${subjectSelect(codes)}</div>
 ${stepBar(c,R,'scores:')}
 ${subCard(c,R)}
 ${(!pri||t2)&&evMiss(c.code,S.term,R)?`<div class="card lock small row" style="justify-content:space-between"><span>ยังประเมินผู้เรียนไม่ครบ ${evMiss(c.code,S.term,R)} คน เล่ม ปพ.5 จะลงนามและดาวน์โหลดไม่ได้จนกว่าจะประเมินครบ</span><button class="btn sm" data-go="eval">ไปประเมิน</button></div>`:''}
 <div class="card stack"><h3>ตั้งค่าการเก็บคะแนนของวิชานี้</h3>
  ${pri?`<div class="row"><label for="scl">การเก็บคะแนนต่อภาคเรียน</label><select id="scl"><option value="100" ${cfg.scale===100?'selected':''}>เก็บเต็ม 100 (ระบบย่อเหลือ 50)</option><option value="50" ${cfg.scale===50?'selected':''}>เก็บเต็ม 50 ต่อภาคเรียนเลย</option></select></div>`:''}
  <div class="row"><label for="hrs">จำนวนชั่วโมงเรียนทั้งหมดของภาคเรียน</label><input id="hrs" type="number" min="1" value="${H}" style="width:90px"><span class="small muted">ค่าเริ่มต้นทุกคนมาเรียนครบ กรอกเฉพาะชั่วโมงที่ขาด ถ้าเวลาเรียนต่ำกว่า 80% ระบบให้ มส. ไม่ตัดเกรด</span></div>
  <div class="small muted">คะแนนระหว่างภาคเต็ม ${F.mid} · ปลายภาคเต็ม ${F.fin} · แบ่งช่องคะแนนเก็บได้ตามที่ครูใช้ (ช่องเดียวหรือหลายช่อง)</div>
  ${cfg.cols.map((k,i)=>`<div class="row"><input data-cn="${i}" value="${esc(k.n)}" aria-label="ชื่อคะแนนช่องที่ ${i+1}" placeholder="ชื่อคะแนน เช่น ชิ้นงาน" size="16"><input data-cu="${i}" value="${esc(k.u||'')}" aria-label="หน่วยการเรียนรู้ของช่องที่ ${i+1}" placeholder="หน่วยที่ (ถ้ามี)" size="12"><label class="small muted" for="cm${i}">เต็ม</label><input id="cm${i}" type="number" min="1" data-cm="${i}" value="${k.max}" ${cfg.cols.length===1?'disabled':''} style="width:80px">${cfg.cols.length>1?`<button class="btn sm alt" data-act="delcol" data-i="${i}">ลบช่อง</button>`:''}</div>`).join('')}
  <div class="row"><button class="btn sm alt" data-act="addcol">เพิ่มช่องคะแนนเก็บ</button><span class="pill ${ok?'p-good':'p-warn'}">${ok?'รวมคะแนนเก็บครบ '+F.mid:'รวมช่องคะแนน '+sumMax+' ต้องเท่ากับ '+F.mid}</span></div></div>
 ${scoreXlCard()}
 <div class="small muted">${pri?'ประถมตัดเกรดเมื่อจบภาคเรียนที่ 2 (เวลาเรียนนับรวมทั้งปี)':'มัธยมตัดเกรดทุกภาคเรียน'} · กรอกเฉพาะชั่วโมงที่ขาด (ไม่กรอก = มาเรียนครบ)</div>
 <div class="tw hd"><table><thead><tr><th>เลขที่</th><th>ชื่อ-สกุล</th>${cfg.cols.map(k=>`<th>${esc(k.n)} /${k.max}</th>`).join('')}<th>รวมระหว่างภาค</th><th>ปลายภาค /${F.fin}</th><th>ชั่วโมงที่ขาด (ชม.)</th><th>เวลาเรียน %</th>${(!pri||t2)?'<th>ร</th>':''}${head}</tr></thead><tbody>${rows}</tbody></table></div>${(!pri||t2)?nextBtn(c,R,'scores:'):''}</div>`;
};
const ACTS=['ชุมนุม','แนะแนว','ลูกเสือ-เนตรนารี','กิจกรรมเพื่อสังคมและสาธารณประโยชน์'];
// ประถม: กิจกรรมพัฒนาผู้เรียนทุกกิจกรรมตัดสินเมื่อจบภาคเรียนที่ 2 (ภาคเรียนที่ 1 ยังตัดสินไม่ได้)
const actLockT=L=>isPri(L)&&S.term===1;
P.acts=()=>{
 const L=S.actLevel,stu=ACT().filter(s=>s.level===L),hr=HOMEROOM[L]||[];
 const guidanceTeacher=S.guidance!=='none'&&S.guidance;
 const who=a=>a==='ชุมนุม'?'ครูผู้สอนชุมนุม':a==='แนะแนว'?(guidanceTeacher?'ครูแนะแนว ('+USERS[S.guidance].name+')':'ครูที่ปรึกษา (ไม่มีครูแนะแนว)'):'ครูที่ปรึกษา';
 const canBase=a=>isAdmin()||(a==='แนะแนว'&&guidanceTeacher?S.guidance===S.role:hr.includes(S.role));
 return `<div class="stack"><div class="row">${LEVELS.map(l=>`<button class="chip" aria-pressed="${S.actLevel===l}" data-actlv="${l}">${l}</button>`).join('')}</div>
 <div class="small muted">ที่ปรึกษาห้อง ${L}: ${hr.map(h=>USERS[h].name).join(', ')||'ยังไม่กำหนด'}</div>
 ${isAdmin()?`<div class="row"><label for="gd">ครูแนะแนว</label><select id="gd"><option value="none">ไม่มี (ให้ครูที่ปรึกษากรอก)</option>${TEACHERS.map(k=>`<option value="${k.uid}" ${S.guidance===k.uid?'selected':''}>${esc(k.name)}</option>`).join('')}</select></div>`:''}
 ${ACTS.filter(a=>a!=='ชุมนุม').map(a=>{const key=L+'|'+a,st=S.acts[key]||(S.acts[key]={owner:null,v:{}});
  const can=canBase(a),locked=st.owner&&st.owner!==S.role&&!isAdmin()&&!(a==='แนะแนว'&&guidanceTeacher);
  return `<div class="card stack"><div class="row" style="justify-content:space-between"><h3>${a}</h3><span class="small muted">ผู้ตัดสิน: ${who(a)}</span></div>
  ${!can?'<div class="lock small">กิจกรรมนี้ไม่ใช่หน้าที่ของคุณ</div>':locked?`<div class="lock small">${esc(USERS[st.owner].name)} กรอกกิจกรรมนี้ของห้อง ${L} แล้ว คุณกรอกซ้ำไม่ได้</div>`:
   `${st.owner?`<div class="small muted">กรอกโดย ${esc(USERS[st.owner].name)} ${isAdmin()?`<button class="btn sm alt" data-act="release" data-key="${esc(key)}">ปล่อยสิทธิ์</button>`:''}</div>`:''}
   ${actLockT(L)?'<div class="lock small">ประถมตัดสินผลกิจกรรมพัฒนาผู้เรียนเมื่อจบภาคเรียนที่ 2 (ผลทั้งปี) <button class="btn sm alt" data-term="2">ไปภาคเรียนที่ 2</button></div>':`<div class="row"><button class="btn sm" data-act="allpass" data-key="${esc(key)}">ผ่านทั้งห้อง</button></div>`}
   <div class="tw"><table><thead><tr><th>ชื่อ</th><th>ผล</th></tr></thead><tbody>${stu.map(s=>`<tr><td>${esc(s.name)}</td><td>${actLockT(L)?'<span class="small muted">ตัดสินภาคเรียนที่ 2</span>':`<select data-av="${esc(key)}" data-s="${s.id}" aria-label="ผลของ ${esc(s.name)}"><option value="">-</option><option ${st.v[s.id]==='ผ'?'selected':''}>ผ</option><option ${st.v[s.id]==='มผ'?'selected':''}>มผ</option></select>`}</td></tr>`).join('')}</tbody></table></div>`}</div>`;}).join('')}
 ${clubsHtml()}</div>`;
};
function teacherOf(code){const r=S.regs.find(x=>x.status==='ok'&&x.codes.includes(code));return r?USERS[r.t].name:me().name;}
function fname(c,ext){const yr=S.year;
 const t=teacherOf(c.code).replace(/^ครู/,'').trim().replace(/\s+/g,'_');
 return `${c.name.replace(/\s+/g,'')}_${c.level}_${isPri(c.level)?'ทั้งปี':'ภาคเรียน'+S.term}_ปีการศึกษา${yr}_ครู${t}.${ext}`.replace(/[\\/:*?"<>|]/g,'');}
const AREA={'ท':'ภาษาไทย','ค':'คณิตศาสตร์','ว':'วิทยาศาสตร์และเทคโนโลยี','ส':'สังคมศึกษา ศาสนา และวัฒนธรรม','พ':'สุขศึกษาและพลศึกษา','ศ':'ศิลปะ','ง':'การงานอาชีพ','อ':'ภาษาต่างประเทศ'};
const EVL=['ดีเยี่ยม','ดี','ผ่าน','ไม่ผ่าน'];
const EVK=[['a','ผลการประเมินคุณลักษณะอันพึงประสงค์','คุณลักษณะอันพึงประสงค์',['รักชาติ ศาสน์ กษัตริย์','ซื่อสัตย์สุจริต','มีวินัย','ใฝ่เรียนรู้','อยู่อย่างพอเพียง','มุ่งมั่นในการทำงาน','รักความเป็นไทย','มีจิตสาธารณะ']],
 ['r','ผลการประเมินการอ่าน คิดวิเคราะห์ และเขียน','การอ่าน คิดวิเคราะห์ และเขียน',['การอ่าน','การคิดวิเคราะห์','การเขียน']],
 ['c','ผลการประเมินสมรรถนะสำคัญของผู้เรียน','สมรรถนะสำคัญของผู้เรียน',['การสื่อสาร','การคิด','การแก้ปัญหา','การใช้ทักษะชีวิต','การใช้เทคโนโลยี']]];
const evOverall=(a,len)=>{if(!a||a.length<len)return null;a=a.slice(0,len);if(a.some(x=>x===''||x==null))return null;const m=a.reduce((p,q)=>p+(+q),0)/len;return EVL[3-(m>=2.5?3:m>=1.5?2:m>=1?1:0)];};
const SKEY=()=>S.scCode+'|'+S.term;
const MONTHS=['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
const thDate=iso=>{if(!iso)return 'วันที่ ........... เดือน .............................. พ.ศ. ..............';const d=new Date(iso+'T00:00:00');return `วันที่ ${d.getDate()} เดือน ${MONTHS[d.getMonth()]} พ.ศ. ${d.getFullYear()+543}`;};
function teacherKeyOf(code){const r=S.regs.find(x=>x.status==='ok'&&x.codes.includes(code));return r?r.t:S.role;}
function metaOf(code){const m=S.meta[code]||(S.meta[code]={desc:'',img:null,units:{}});return m;}
function groupsOf(cfg){const g=[];cfg.cols.forEach((k,i)=>{const u=(k.u||'').trim(),last=g[g.length-1];if(u&&last&&last.u===u){last.idx.push(i);last.max+=+k.max||0;}else g.push({u,label:u||k.n,idx:[i],max:+k.max||0});});return g;}
const gsum=(r,g)=>{const v=g.idx.map(i=>r.v.c[i]).filter(x=>x!==''&&x!=null);return v.length?v.reduce((p,q)=>p+(+q),0):null;};
const sigImg=s=>s?`<span class="sigln"><img class="sigimg" src="${s}" alt="ลายเซ็น"></span>`:'';
function getSig(t){const [k,id]=t.split(':');return k==='u'?S.sigs[id]:k==='o'?S.school.officers[id].sig:(S.school.heads[id]||{}).sig;}
function setSig(t,v){const [k,id]=t.split(':');if(k==='u')S.sigs[id]=v;else if(k==='o')S.school.officers[id].sig=v;else(S.school.heads[id]=S.school.heads[id]||{name:''}).sig=v;}
P.p5=()=>{
 const codes=pickSubject();
 if(!codes)return `<div class="card empty">ยังไม่มีวิชาที่อนุมัติ<br><br><button class="btn" data-go="reg">ไปลงทะเบียนสอน</button></div>`;
 const c=CAT.find(x=>x.code===S.scCode),pri=isPri(c.level),cfg=cfgOf(c.code),F=fulls(c.code),R=calc(c.code),t2=pri&&S.term===2,graded=!pri||t2,evOn=!pri||S.term===2;
 if(pri&&S.term===1)return `<div class="stack"><div class="row">${subjectSelect(codes,1)}</div><div class="card stack"><h3>ประถมทำ ปพ.5 เล่มเดียวต่อปี</h3><p class="muted" style="margin:0">ระบบรวมคะแนนย่อย โครงสร้าง และผลของภาคเรียนที่ 1 เข้าเล่มให้เองเมื่อถึงภาคเรียนที่ 2 ตอนนี้ให้กรอกคะแนนภาคเรียนที่ 1 ตามปกติ และใช้ "ใบแจ้งผลการเรียน" แจ้งผู้ปกครอง</p><div class="row"><button class="btn" data-term="2">ไปภาคเรียนที่ 2 เพื่อออกเล่ม</button><button class="btn alt" data-go="scores">กรอกคะแนน</button><button class="btn alt" data-go="report">ใบแจ้งผลการเรียน</button></div></div></div>`;
 const key=SKEY(),G=groupsOf(cfg),meta=metaOf(c.code),sg=S.sign[key]||(S.sign[key]={}),fix=S.fix[key]||{},evS=S.ev[key]||{};
 const yr=S.year,tn=teacherOf(c.code),tk=teacherKeyOf(c.code),H=cfg.hours,N=R.length;
 const sc=S.school,hd0=sc.heads[c.code[0]]||{},off=sc.officers;
 const keys=['4','3.5','3','2.5','2','1.5','1','0','ร','มส'],cnt={};keys.forEach(k=>cnt[k]=0);let n=0,sumS=0,gS=0,nm=0;
 R.forEach(r=>{if(r.g!=null){cnt[String(r.g)]++;n++;if(!r.ms&&r.g!=='ร'){sumS+=r.sum;gS+=r.g;nm++;}}});
 const pend=N-n,pc=(x,t)=>t?(x/t*100).toFixed(1):'0.0',avg=nm?sumS/nm:0,gpa=nm?gS/nm:0;
 const gnum=r=>typeof r.g==='number'?r.g:null;
 const pass=R.filter(r=>gnum(r)!=null&&gnum(r)>=1).length,hi=R.filter(r=>gnum(r)!=null&&gnum(r)>=3).length;
 const area=AREA[c.code[0]]||'-',typ=c.code[3]==='2'?'รายวิชาเพิ่มเติม':'รายวิชาพื้นฐาน';
 const hrsTxt=pri?`${H*2} ชั่วโมง/ปี`:`${H} ชั่วโมง/ภาคเรียน`;
 const lvName=pri?'ประถมศึกษา':'มัธยมศึกษาตอนต้น';
 let pn=1;const ph=()=>`<div class="ph"><span>ปพ.5 · ${c.code} ${esc(c.name)} · ชั้น ${c.level} · ${t2?'ภาคเรียนที่ 1 – 2 (ทั้งปี)':'ภาคเรียนที่ '+S.term} · ปีการศึกษา ${yr}</span><span>หน้า ${++pn}</span></div>`;
 const bl=(t,r,sig)=>`<div class="sg"><div>ลงชื่อ ${sig?sigImg(sig):'....................................................'}</div><div>( ${t||'........................................'} )</div>${r?`<div>${r}</div>`:''}</div>`;
 const evLab=(r,k,len)=>evOverall(((evS[r.s.id]||{})[k]),len);
 const evCnt=(k,len)=>{const o={};EVL.forEach(l=>o[l]=0);R.forEach(r=>{const v=evLab(r,k,len);if(v)o[v]++;});o.all=EVL.reduce((p,l)=>p+o[l],0);return o;};
 const evTbl=`<div class="tw"><table><thead><tr><th rowspan="2" style="width:26%">การประเมิน</th>${EVL.map(l=>`<th colspan="2">${l}</th>`).join('')}</tr><tr>${EVL.map(()=>'<th>คน</th><th>ร้อยละ</th>').join('')}</tr></thead><tbody>${EVK.map(([k,,t,it])=>{const o=evCnt(k,it.length);return `<tr><td>${t}</td>${EVL.map(l=>`<td class="num">${o[l]}</td><td class="num">${pc(o[l],o.all)}</td>`).join('')}</tr>`}).join('')}</tbody></table></div>`;
 const evBrief=`<div class="tw"><table><thead><tr><th>การประเมิน</th>${EVL.map(l=>`<th>${l}</th>`).join('')}<th>ประเมินแล้ว</th></tr></thead><tbody>${EVK.map(([k,,t,it])=>{const o=evCnt(k,it.length);return `<tr><td>${t}</td>${EVL.map(l=>`<td class="num">${o[l]}</td>`).join('')}<td class="num">${o.all}</td></tr>`}).join('')}</tbody></table></div>`;
 const dist=`<div class="tw"><table><thead><tr><th rowspan="2">ผลการเรียน</th><th colspan="${keys.length}">จำนวนนักเรียนที่ได้ระดับผลการเรียน</th>${pend?'<th rowspan="2">ยังไม่ตัดเกรด</th>':''}<th rowspan="2">รวม</th></tr><tr>${keys.map(k=>`<th>${k}</th>`).join('')}</tr></thead><tbody>
  <tr><td>จำนวน (คน)</td>${keys.map(k=>`<td class="num">${cnt[k]}</td>`).join('')}${pend?`<td class="num">${pend}</td>`:''}<td class="num">${N}</td></tr>
  <tr><td>ร้อยละ</td>${keys.map(k=>`<td class="num">${pc(cnt[k],N)}</td>`).join('')}${pend?`<td class="num">${pc(pend,N)}</td>`:''}<td class="num">100</td></tr></tbody></table></div>`;
 const mx=Math.max(1,...keys.map(k=>cnt[k]));
 const chart=`<div class="bars2" role="img" aria-label="แผนภูมิจำนวนนักเรียนแต่ละระดับผลการเรียน">${keys.map(k=>`<div class="bc2"><div class="bt2"><span class="bn2">${cnt[k]}</span><div class="bb2 ${['0','ร','มส'].includes(k)?'fx':''}" style="height:${Math.round(cnt[k]/mx*110)+2}px"></div></div><div class="bk2">${k}</div><div class="bp2">${pc(cnt[k],N)}%</div></div>`).join('')}</div>
  <div class="small" style="text-align:center"><span class="lg"></span> ผ่านเกณฑ์ (ระดับ 1 – 4) &nbsp;&nbsp; <span class="lg fx"></span> ต้องแก้ไขผลการเรียน (0 ร มส)</div>`;
 const hd=t=>`<h3 style="text-align:center;margin:4px 0">${t}</h3>`;
 const rot=t=>`<th class="rot"><span class="rv">${t}</span></th>`;
 const hasSid=R.some(r=>r.s.sid),SID=rs=>hasSid?`<th${rs?` rowspan="${rs}"`:''}>เลขประจำตัว</th>`:'';
 const stuCells=r=>`<td class="num">${r.s.no}</td>${hasSid?`<td class="num">${esc(r.s.sid||'')}</td>`:''}<td>${esc(r.s.name)}</td>`;
 const sTeach=sg.t?S.sigs[tk]:null,sHead=sg.head?hd0.sig:null,sMeas=sg.measure?off.measure.sig:null,sAcad=sg.acad?off.acad.sig:null,sDir=(sg.dir==='ok'||sg.dir==='no')?off.dir.sig:null;
 /* หน้าสรุปและลงนาม */
 const info=`<div class="pg"><div style="text-align:center"><img src="${LOGO}" alt="" style="width:140px;height:140px;object-fit:contain"></div>${hd('แบบบันทึกผลการพัฒนาคุณภาพผู้เรียน (ปพ.5)')}<div style="text-align:center">ระดับ${lvName}<br><b>${esc(sc.name)}</b> · ${esc(sc.area)}</div>
  <div class="tw"><table class="kv"><tbody>
   <tr><th>ปีการศึกษา</th><td>${yr}</td><th>ชั้น</th><td>${c.level}</td></tr>
   <tr><th>กลุ่มสาระการเรียนรู้</th><td colspan="3">${area}</td></tr>
   <tr><th>รหัสวิชา</th><td>${c.code}</td><th>รายวิชา</th><td>${esc(c.name)}</td></tr>
   <tr><th>เวลาเรียน</th><td>${hrsTxt}</td><th>ประเภท</th><td>${typ}</td></tr>
   <tr><th>ภาคเรียนที่</th><td colspan="3">${S.term}${pri?(t2?' (ประกาศผลทั้งปี)':' (ยังไม่ตัดเกรด)'):''}</td></tr>
   <tr><th>ครูผู้สอน</th><td colspan="3">${esc(tn)}</td></tr></tbody></table></div>
  ${graded?dist:'<div class="small">ภาคเรียนที่ 1 ของประถมยังไม่ตัดเกรด ระบบรวมคะแนนและตัดเกรดเมื่อจบภาคเรียนที่ 2</div>'}
  ${evOn?evBrief:'<div class="small">ประถมประเมินคุณลักษณะ การอ่าน คิดวิเคราะห์ เขียน และสมรรถนะ ในภาคเรียนที่ 2</div>'}
  <div class="sg2">${bl(tn,'ครูผู้สอน',sTeach)}${bl(hd0.name,'หัวหน้ากลุ่มสาระการเรียนรู้',sHead)}${bl(off.measure.name,'หัวหน้างานวัดและประเมินผล',sMeas)}${bl(off.acad.name,'หัวหน้ากลุ่มบริหารงานวิชาการ',sAcad)}</div>
  <div style="text-align:center">${sg.dir==='ok'?'☑':'☐'} อนุมัติ &nbsp;&nbsp;&nbsp; ${sg.dir==='no'?'☑':'☐'} ไม่อนุมัติ</div>
  <div class="sg2" style="grid-template-columns:1fr">${bl(off.dir.name,'ผู้อำนวยการโรงเรียน',sDir)}<div class="small" style="text-align:center">${thDate(sg.date)}</div></div></div>`;
 /* คำอธิบายรายวิชา */
 const desc=`<div class="pg descp">${ph()}${hd('คำอธิบายรายวิชา')}${meta.desc?`<div class="dtxt">${esc(meta.desc)}</div>`:''}${meta.img?`<div style="text-align:center"><img class="dimg" src="${meta.img}" alt="คำอธิบายรายวิชา"></div>`:''}${!meta.desc&&!meta.img?'<div class="blank"></div>':''}</div>`;
 /* โครงสร้างรายวิชา */
 const structF=(T,cfg,F,G)=>{const uhrs=G.reduce((p,g)=>p+(+((meta.units[uk(T,g.label)]||{}).hrs)||0),0);return `<div class="pg">${ph()}${hd(`โครงสร้างรายวิชา ${esc(c.name)} รหัสวิชา ${c.code}${pri?` ภาคเรียนที่ ${T}`:''}`)}
  <div class="tw"><table><thead><tr><th>หน่วยที่</th><th>ชื่อหน่วยการเรียนรู้</th><th style="width:30%">มาตรฐาน/ตัวชี้วัด</th><th>เวลา (ชม.)</th><th>น้ำหนักคะแนน</th></tr></thead><tbody>
  ${G.map((g,i)=>{const m=meta.units[uk(T,g.label)]||{};return `<tr><td class="num">${i+1}</td><td>${esc(g.label)}</td><td class="pw">${esc(m.std||'')}</td><td class="num">${m.hrs||''}</td><td class="num">${g.max}</td></tr>`}).join('')}
  <tr><td></td><td>สอบปลายภาค</td><td></td><td></td><td class="num">${F.fin}</td></tr>
  <tr><th colspan="3">รวม${pri?`ภาคเรียนที่ ${T}`:'ภาคเรียน'}</th><th class="num">${uhrs||''}</th><th class="num">${F.base}</th></tr></tbody></table></div>
  <div>อัตราส่วนคะแนนระหว่างเรียน : ปลายภาค = ${(cfg.ratio||'70:30').replace(':',' : ')}</div>
  ${pri?`<div class="small">ประถมเก็บคะแนนภาคเรียนละ ${F.base===100?'100 แล้วระบบย่อเหลือ 50':'50'} · รวมทั้งปี 100 คะแนน · เวลาเรียนทั้งปี ${H*2} ชั่วโมง</div>`:''}</div>`};
 /* คะแนนย่อย (แนวนอน) */
 const subF=(T,cfg,G,R)=>`<div class="pg">${ph()}${hd('บันทึกคะแนนย่อยระหว่างเรียน'+(pri?` ภาคเรียนที่ ${T}`:''))}
  <div class="tw" style="font-size:${cfg.cols.length>12?'.68em':cfg.cols.length>8?'.8em':'1em'}"><table><thead><tr><th rowspan="3">เลขที่</th>${SID(3)}<th rowspan="3">ชื่อ - สกุล</th>${G.map(g=>g.idx.length>1?`<th colspan="${g.idx.length+1}">${esc(g.label)}</th>`:`<th rowspan="2">${esc(cfg.cols[g.idx[0]].n)}</th>`).join('')}${G.length>1?'<th rowspan="3">รวม<br>ระหว่างเรียน</th>':''}</tr>
  <tr>${G.map(g=>g.idx.length>1?g.idx.map(i=>`<th>${esc(cfg.cols[i].n)}</th>`).join('')+'<th>รวม</th>':'').join('')}</tr>
  <tr>${G.map(g=>g.idx.length>1?g.idx.map(i=>`<th>${cfg.cols[i].max}</th>`).join('')+`<th>${g.max}</th>`:`<th>${g.max}</th>`).join('')}</tr></thead><tbody>
  ${R.map(r=>`<tr>${stuCells(r)}${G.map(g=>g.idx.map(i=>`<td class="num">${r.v.c[i]==null||r.v.c[i]===''?'-':r.v.c[i]}</td>`).join('')+(g.idx.length>1?`<td class="num"><b>${f1(gsum(r,g))}</b></td>`:'')).join('')}${G.length>1?`<td class="num"><b>${f1(r.mid)}</b></td>`:''}</tr>`).join('')}</tbody></table></div></div>`;
 const G1=t2?groupsOf(cfgOf(c.code,1)):[],cfg1=t2?cfgOf(c.code,1):null,F1=t2?fulls(c.code,1):null,R1=t2?calc(c.code,1):null;
 const struct=(t2?structF(1,cfg1,F1,G1):'')+structF(S.term,cfg,F,G);
 /* เวลาเรียนรายวัน (แนวนอน) */
 const attF=T=>{const A=S.att[c.code+'|'+T];if(!A||!A.days||!A.days.length)return '';
  const RT=T===S.term?R:calc(c.code,T),HT=cfgOf(c.code,T).hours,days=[...A.days].filter(x=>!x.x).sort((x,y)=>x.d<y.d?-1:x.d>y.d?1:0),PER=20,RPP=20,dch=[],sch=[];
  for(let i=0;i<days.length;i+=PER)dch.push(days.slice(i,i+PER));
  for(let i=0;i<RT.length;i+=RPP)sch.push(RT.slice(i,i+RPP));
  const stOf=(sid,d)=>((A.m||{})[sid]||{})[d]||'',blank=n=>'<td></td>'.repeat(n),blankH=n=>'<th></th>'.repeat(n);
  let out='';
  dch.forEach((dc,di)=>{const lastD=di===dch.length-1,pad=PER-dc.length,grp=[];
   dc.forEach(x=>{const q=x.d.split('-'),k=q[0]+q[1],g=grp[grp.length-1];if(g&&g.k===k)g.n++;else grp.push({k,n:1,t:MSHORT[+q[1]-1]+' '+String((+q[0]+543)%100)});});
   const mh=grp.map(g=>`<th colspan="${g.n}">${g.t}</th>`).join('')+(pad?`<th colspan="${pad}"></th>`:''),dh=dc.map(x=>`<th>${+x.d.slice(8)}</th>`).join('')+blankH(pad),hh=dc.map(x=>`<th>${x.h}</th>`).join('')+blankH(pad);
   sch.forEach((sc,si)=>{const lastS=si===sch.length-1;
    out+=`<div class="pg land">${ph()}${hd('บันทึกเวลาเรียนรายวัน'+(pri?` ภาคเรียนที่ ${T}`:'')+` · ${esc(c.name)} ชั้น ${c.level}`)}
  <div class="tw"><table class="att"><colgroup><col style="width:4%">${hasSid?'<col style="width:8%">':''}<col style="width:22%">${'<col style="width:2.8%">'.repeat(PER)}${lastD?'<col style="width:5%"><col style="width:5%"><col style="width:5%">':''}</colgroup><thead><tr><th rowspan="3">เลขที่</th>${SID(3)}<th rowspan="3">ชื่อ - สกุล</th>${mh}${lastD?'<th rowspan="3">ขาด<br>(ชม.)</th><th rowspan="3">เวลาเรียน<br>ร้อยละ</th><th rowspan="3">ผล</th>':''}</tr><tr>${dh}</tr><tr>${hh}</tr></thead><tbody>
  ${sc.map(r=>{const ab=Math.min(HT,attAbs(c.code,T,r.s.id)||0),pc2=(HT-ab)/HT*100;return `<tr>${stuCells(r)}${dc.map(x=>`<td class="num">${stOf(r.s.id,x.d)||'/'}</td>`).join('')}${blank(pad)}${lastD?`<td class="num">${ab||'-'}</td><td class="num">${f1(pc2)}</td><td class="num">${(!pri||T===2)?(r.ms?'มส':'ผ่าน'):''}</td>`:''}</tr>`;}).join('')}
  ${lastS?`<tr><td colspan="${2+(hasSid?1:0)}" style="text-align:right"><b>มาเรียน (คน)</b></td>${dc.map(x=>`<td class="num">${RT.filter(r=>!ATABS.includes(stOf(r.s.id,x.d)||'-')).length}</td>`).join('')}${blank(pad)}${lastD?blank(3):''}</tr>`:''}</tbody></table></div>
  <div class="small">เครื่องหมาย: / = มาเรียน · ข = ขาด · ล = ลากิจ · ป = ลาป่วย · ส = มาสาย (นับว่ามาเรียน) · น = หนีเรียน · ขาด ลา ป่วย หนีเรียน นับเป็นชั่วโมงที่ไม่ได้เรียน · ต้องมีเวลาเรียนไม่ต่ำกว่าร้อยละ 80 ของเวลาเรียนทั้งหมด (${HT} ชั่วโมง)</div>
  ${(lastD&&lastS)?`<div style="width:min(300px,100%);margin-left:auto">${bl(tn,'ครูผู้สอน',sTeach)}</div>`:''}</div>`;});});
  return out;};
 const attP=(t2?attF(1):'')+attF(S.term);
 const sub=(t2?subF(1,cfg1,G1,R1):'')+subF(S.term,cfg,G,R);
 /* ผลการเรียน */
 const resF=(T,cfg,F,G,R,showG)=>{const scl=pri&&F.base===100,multi=G.length>1;
  const heads=[...G.map(g=>[esc(g.label),g.max]),...(multi?[['รวมระหว่างเรียน',F.mid]]:[]),['สอบปลายภาค',F.fin],[pri?`รวมภาคเรียนที่ ${T}${scl?' (เก็บ 100)':''}`:'รวม',F.base],...(scl?[['ย่อเหลือ 50 คะแนน',50]]:[])];
  const note=pri?`วิธีคิด: คะแนนระหว่างเรียน (${F.mid}) + ปลายภาค (${F.fin}) = ${F.base} คะแนน${scl?' → ย่อเหลือ 50':''} · ภาคเรียนที่ ${T} ยังไม่ตัดเกรด ตัดเกรดรวมทั้งปีในหน้าบันทึกผลการเรียนรวม`:`วิธีคิด: คะแนนระหว่างเรียน (${F.mid}) + ปลายภาค (${F.fin}) = 100 แล้วตัดเกรด`;
  return `<div class="pg">${ph()}${hd('บันทึกผลการเรียน'+(pri?` ภาคเรียนที่ ${T}`:''))}
  <div class="tw"><table><thead><tr><th rowspan="2">เลขที่</th>${SID(2)}<th rowspan="2">ชื่อ - สกุล</th>${heads.map(h=>rot(h[0])).join('')}${showG?'<th rowspan="2">ระดับ<br>ผลการ<br>เรียน</th>':''}</tr>
  <tr>${heads.map(h=>`<th>${h[1]}</th>`).join('')}</tr></thead><tbody>
  ${R.map(r=>`<tr>${stuCells(r)}${G.map(g=>`<td class="num">${f1(gsum(r,g)).replace('-','')}</td>`).join('')}${multi?`<td class="num">${f1(r.mid).replace('-','')}</td>`:''}<td class="num">${r.fin==null?'':r.fin}</td><td class="num">${f1(r.tot).replace('-','')}</td>${scl?`<td class="num">${f1(r.cur).replace('-','')}</td>`:''}${showG?`<td class="num"><b>${r.g==null?'-':r.g}</b></td>`:''}</tr>`).join('')}</tbody></table></div>
  <div class="small">${note}</div></div>`;};
 const resYf=()=>`<div class="pg">${ph()}${hd('บันทึกผลการเรียนรวมทั้งปี')}
  <div class="tw"><table><thead><tr><th rowspan="2">เลขที่</th>${SID(2)}<th rowspan="2">ชื่อ - สกุล</th><th>ภาคเรียนที่ 1</th><th>ภาคเรียนที่ 2</th><th>รวมทั้งปี</th><th rowspan="2">ระดับ<br>ผลการ<br>เรียน</th></tr><tr><th>50</th><th>50</th><th>100</th></tr></thead><tbody>
  ${R.map(r=>`<tr>${stuCells(r)}<td class="num">${f1(r.pr).replace('-','')}</td><td class="num">${f1(r.cur).replace('-','')}</td><td class="num">${f1(r.sum).replace('-','')}</td><td class="num"><b>${r.g==null?'-':r.g}</b></td></tr>`).join('')}</tbody></table></div>
  <div class="small">รวมทั้งปี = ภาคเรียนที่ 1 (50) + ภาคเรียนที่ 2 (50) = 100 คะแนน แล้วตัดเกรด · เวลาเรียนนับรวมทั้งปี ต้องไม่ต่ำกว่าร้อยละ 80</div></div>`;
 const resP=t2?resF(1,cfg1,F1,G1,R1,false)+resF(2,cfg,F,G,R,false)+resYf():resF(S.term,cfg,F,G,R,true);
 /* ผลการประเมิน 3 หน้า */
 const evPage=([k,title,,items])=>`<div class="pg">${ph()}${hd(title)}
  <div class="tw"><table><thead><tr><th>เลขที่</th>${SID()}<th>ชื่อ - สกุล</th>${items.map((t,i)=>rot(`${i+1}. ${t}`)).join('')}<th class="rot"><span class="rv">สรุปผล</span></th></tr></thead><tbody>
  ${R.map(r=>`<tr>${stuCells(r)}${items.map((_,i)=>`<td class="num">${((evS[r.s.id]||{})[k]||[])[i]??''}</td>`).join('')}<td class="num">${evLab(r,k,items.length)||''}</td></tr>`).join('')}</tbody></table></div>
  <div class="small">เกณฑ์: 3 = ดีเยี่ยม · 2 = ดี · 1 = ผ่าน · 0 = ไม่ผ่าน</div></div>`;
 const evP=evOn?EVK.map(evPage).join('<div class="pgl">ผลการประเมิน</div>'):'';
 /* สรุปผล */
 const sumP=`<div class="pg">${ph()}${hd('สรุปผลการเรียน')}
  ${graded?`<div class="tiles"><div><span>นักเรียนทั้งหมด</span><b>${N}</b><span>คน</span></div><div><span>ผ่านเกณฑ์</span><b>${pc(pass,N)}%</b><span>${pass} คน</span></div><div><span>ระดับ 3 ขึ้นไป</span><b>${pc(hi,N)}%</b><span>${hi} คน</span></div><div><span>ผลการเรียนเฉลี่ย</span><b>${gpa.toFixed(2)}</b><span>คะแนนเฉลี่ย ${avg.toFixed(2)}</span></div></div>
  <b>1. จำนวนและร้อยละของนักเรียนจำแนกตามระดับผลการเรียน</b>${dist}<b>2. แผนภูมิแสดงการกระจายระดับผลการเรียน</b>${chart}`:'<div class="small">ภาคเรียนที่ 1 ของประถมยังไม่ตัดเกรด</div>'}
  ${evOn?`<b>3. ผลการประเมินคุณลักษณะอันพึงประสงค์ การอ่าน คิดวิเคราะห์ และเขียน และสมรรถนะสำคัญ</b>${evTbl}`:''}
  <div style="width:min(300px,100%);margin-left:auto">${bl(tn,'ครูผู้สอน',sTeach)}</div></div>`;
 /* แก้ไขผลการเรียน */
 const fixP=graded?`<div class="pg">${ph()}${hd('บันทึกการแก้ไขผลการเรียน (0, ร, มส)')}
  <div class="tw"><table><thead><tr><th>เลขที่</th>${SID()}<th>ชื่อ - สกุล</th><th>ผลเดิม</th><th>สาเหตุ / วิธีการแก้ไข</th><th>ผลหลังแก้</th><th>วันที่</th><th>ลงชื่อครูผู้สอน</th></tr></thead><tbody>${R.map(r=>{const x=fix[r.s.id]||{};return `<tr>${stuCells(r)}<td class="num">${r.g==null?'-':r.g}</td><td>${esc(x.why||'')}</td><td class="num">${esc(x.after||'')}</td><td class="num">${x.date?thDate(x.date).replace('วันที่ ',''):''}</td><td class="num">${x.after&&sTeach?`<img class="sigimg sm" src="${sTeach}" alt="">`:''}</td></tr>`}).join('')}</tbody></table></div></div>`:'';
 /* คำชี้แจงเกณฑ์ */
 const crit=`<div class="pg">${ph().replace(/หน้า \d+/,'ท้ายเล่ม')}${hd('คำชี้แจงเกณฑ์การวัดและประเมินผล')}
  <b>1. เกณฑ์การตัดสินระดับผลการเรียน</b>
  <div class="tw"><table><thead><tr><th>ระดับผลการเรียน</th><th>ช่วงคะแนน (ร้อยละ)</th><th>ความหมาย</th></tr></thead><tbody>${[['4','80 – 100','ผลการเรียนดีเยี่ยม'],['3.5','75 – 79','ผลการเรียนดีมาก'],['3','70 – 74','ผลการเรียนดี'],['2.5','65 – 69','ผลการเรียนค่อนข้างดี'],['2','60 – 64','ผลการเรียนน่าพอใจ'],['1.5','55 – 59','ผลการเรียนพอใช้'],['1','50 – 54','ผลการเรียนผ่านเกณฑ์ขั้นต่ำ'],['0','0 – 49','ผลการเรียนต่ำกว่าเกณฑ์ขั้นต่ำ']].map(x=>`<tr><td class="num"><b>${x[0]}</b></td><td class="num">${x[1]}</td><td>${x[2]}</td></tr>`).join('')}</tbody></table></div>
  <b>2. ผลการเรียนที่ต้องแก้ไข</b>
  <div class="tw"><table><tbody><tr><td class="num"><b>ร</b></td><td>รอการตัดสิน เนื่องจากนักเรียนยังส่งงานหรือรับการประเมินไม่ครบ ต้องดำเนินการให้เสร็จภายในภาคเรียนถัดไป</td></tr><tr><td class="num"><b>มส</b></td><td>ไม่มีสิทธิ์เข้ารับการวัดผลปลายปี เนื่องจากมีเวลาเรียนไม่ถึงร้อยละ 80 ของเวลาเรียนทั้งหมด</td></tr><tr><td class="num"><b>0</b></td><td>ผลการเรียนต่ำกว่าเกณฑ์ขั้นต่ำ ต้องสอนซ่อมเสริมและสอบแก้ตัว ผลการแก้ไขบันทึกในหน้าบันทึกการแก้ไขผลการเรียน</td></tr></tbody></table></div>
  <b>3. เกณฑ์การประเมินคุณลักษณะอันพึงประสงค์ การอ่าน คิดวิเคราะห์ และเขียน และสมรรถนะสำคัญ</b>
  <div class="tw"><table><thead><tr><th>ระดับ</th><th>3 ดีเยี่ยม</th><th>2 ดี</th><th>1 ผ่าน</th><th>0 ไม่ผ่าน</th></tr></thead><tbody><tr><td class="num">ความหมาย</td><td class="num">ปฏิบัติเป็นนิสัย<br>และเป็นแบบอย่างได้</td><td class="num">ปฏิบัติได้ดี<br>สม่ำเสมอ</td><td class="num">ปฏิบัติได้<br>ตามเกณฑ์ขั้นต่ำ</td><td class="num">ยังไม่ผ่าน<br>เกณฑ์ขั้นต่ำ</td></tr></tbody></table></div>
  <b>4. เกณฑ์อื่นที่ใช้ในแบบบันทึก</b>
  <div class="tw"><table><tbody><tr><td>เวลาเรียนขั้นต่ำ</td><td>ไม่ต่ำกว่าร้อยละ 80 ของเวลาเรียนทั้งหมด</td></tr><tr><td>อัตราส่วนคะแนน ระหว่างเรียน : ปลายภาค</td><td>${(cfg.ratio||'70:30').replace(':',' : ')}</td></tr></tbody></table></div>
  <div style="text-align:center;margin-top:10px;border-top:1px solid #444;padding-top:8px"><img src="${LOGO}" alt="" style="width:100px;height:100px;object-fit:contain"><br><b>${esc(sc.name)}</b><br>${esc(sc.area)}<br><span class="small">${c.code} ${esc(c.name)} · ชั้น ${c.level} · ปีการศึกษา ${yr}</span></div></div>`;
 const L=(t,h)=>h?`${h}<div class="pgl">${t}</div>`:'';
 /* ตรวจความครบถ้วน */
 const evFull=!evOn||EVK.every(([k,,,it])=>R.every(r=>evLab(r,k,it.length))),evLock=!S.tpl&&evOn&&!evFull;
 const chk=[
  ['คะแนนครบทุกคน (ระหว่างเรียนและปลายภาค)',R.every(r=>r.tot!=null),'scores'],
  ['คำอธิบายรายวิชา (ข้อความหรือภาพ)',!!(meta.desc||meta.img),null],
  ['มาตรฐาน/ตัวชี้วัด และเวลาของทุกหน่วย',[...G1.map(g=>[1,g]),...G.map(g=>[S.term,g])].every(([T,g])=>{const m=meta.units[uk(T,g.label)]||{};return m.std&&m.hrs}),null],
  ...(evOn?[['ผลประเมินครบทุกข้อ ทุกคน',evFull,'eval']]:[]),
  ['ลายเซ็นครูผู้สอนและกดลงนามเล่มนี้',!!sTeach,'sign'],
  ['ชื่อหัวหน้ากลุ่มสาระ งานวัดผล วิชาการ ผอ.',!!(hd0.name&&off.measure.name&&off.acad.name&&off.dir.name),'school'],
  ['ผู้บริหารลงนามและอนุมัติ',!!(sg.head&&sg.measure&&sg.acad&&(sg.dir==='ok'||sg.dir==='no')),null]];
 const done=chk.filter(x=>x[1]).length;
 const gOf=graded?R.filter(r=>r.g===0||r.g==='ร'||r.ms):[];
 const editor=`<div class="card stack"><div class="row" style="justify-content:space-between"><h3>ตรวจความครบถ้วนก่อนดาวน์โหลด</h3><span class="pill ${done===chk.length?'p-good':'p-warn'}">${done}/${chk.length}</span></div>
  <ul class="ck">${chk.map(x=>`<li class="${x[1]?'ok':'no'}"><span>${x[1]?'✓':'✗'}</span> ${x[0]}${!x[1]&&x[2]?` <button class="btn sm alt" data-go="${x[2]}">ไปกรอก</button>`:''}</li>`).join('')}</ul></div>
 <details class="card stack" open><summary><b>ข้อมูลประกอบเล่ม (ครูกรอก)</b></summary>
  <label for="desc">คำอธิบายรายวิชา (พิมพ์ข้อความ หรือแนบภาพ หรือทั้งสองอย่าง)</label><textarea id="desc" placeholder="พิมพ์คำอธิบายรายวิชา">${esc(meta.desc||'')}</textarea>
  <div class="row"><label class="btn sm alt" style="cursor:pointer">แนบภาพคำอธิบาย<input type="file" accept="image/*" id="descimg" hidden></label>${meta.img?`<img src="${meta.img}" alt="" style="height:50px;border:1px solid var(--line);border-radius:4px"><button class="btn sm alt" data-act="descdel">ลบภาพ</button>`:''}</div>
  <b>โครงสร้างรายวิชา</b><div class="small muted">หน่วยการเรียนรู้มาจากช่องคะแนนที่ตั้งไว้ในหน้ากรอกคะแนน (ใส่ชื่อหน่วยเดียวกันเพื่อรวมหลายช่องเป็นหน่วยเดียว)</div>
  ${[...(t2?[[1,G1]]:[]),[S.term,G]].map(([T,GG])=>(t2?`<b class="small">ภาคเรียนที่ ${T}</b>`:'')+GG.map((g,i)=>{const m=meta.units[uk(T,g.label)]||{},ix=(t2&&T===1?'1:':'')+i;return `<div class="card stack" style="padding:10px"><b>หน่วยที่ ${i+1} ${esc(g.label)}</b> <span class="small muted">น้ำหนักคะแนน ${g.max}</span>
   <textarea data-std="${ix}" placeholder="มาตรฐาน/ตัวชี้วัด เช่น ส 1.1 ม.4/1" aria-label="มาตรฐานตัวชี้วัดหน่วยที่ ${i+1}">${esc(m.std||'')}</textarea>
   <div class="row"><label class="small muted" for="hu${ix}">เวลา (ชั่วโมง)</label><input id="hu${ix}" type="number" min="0" data-hrsu="${ix}" value="${m.hrs||''}" style="width:90px"></div></div>`}).join('')).join('')}
</details>
 ${graded?`<details class="card stack"><summary><b>บันทึกการแก้ไขผลการเรียน (0, ร, มส)</b> <span class="small muted">${gOf.length} คน</span></summary>
  ${gOf.length?gOf.map(r=>{const x=fix[r.s.id]||{};return `<div class="row"><span style="min-width:150px">${r.s.no}. ${esc(r.s.name)} <span class="pill p-bad">${r.g}</span></span><input data-fw="${r.s.id}" value="${esc(x.why||'')}" placeholder="สาเหตุ/วิธีการแก้ไข" aria-label="สาเหตุ ${esc(r.s.name)}" size="20"><input data-fa="${r.s.id}" value="${esc(x.after||'')}" placeholder="ผลหลังแก้" aria-label="ผลหลังแก้ ${esc(r.s.name)}" size="8"><input type="date" data-fd="${r.s.id}" value="${x.date||''}" aria-label="วันที่แก้ ${esc(r.s.name)}"></div>`}).join(''):'<div class="small muted">ไม่มีนักเรียนที่ได้ 0 ร หรือ มส.</div>'}</details>`:''}
 <details class="card stack"><summary><b>ลงนามเล่ม</b></summary>
  <div class="row"><label><input type="checkbox" ${evLock?'disabled':''} data-sg="t" ${sg.t?'checked':''}> ลงลายมือชื่อครูผู้สอน (${esc(tn)})</label>${S.sigs[tk]?'':`<span class="small" style="color:var(--bad)">ยังไม่มีลายเซ็น</span> <button class="btn sm alt" data-go="sign">ไปสร้างลายเซ็น</button>`}</div>
  ${isAdmin()?`<div class="small muted">ส่วนของผู้บริหาร (ในระบบจริงแต่ละคนลงนามด้วยบัญชีของตน)</div>
  <label><input type="checkbox" ${evLock?'disabled':''} data-sg="head" ${sg.head?'checked':''}> หัวหน้ากลุ่มสาระฯ ${esc(hd0.name||'(ยังไม่ตั้งชื่อ)')}</label>
  <label><input type="checkbox" ${evLock?'disabled':''} data-sg="measure" ${sg.measure?'checked':''}> หัวหน้างานวัดและประเมินผล ${esc(off.measure.name||'')}</label>
  <label><input type="checkbox" ${evLock?'disabled':''} data-sg="acad" ${sg.acad?'checked':''}> หัวหน้ากลุ่มบริหารงานวิชาการ ${esc(off.acad.name||'')}</label>
  <div class="row"><label for="dirsel">ผู้อำนวยการ ${esc(off.dir.name||'')}</label><select id="dirsel" ${evLock?'disabled':''}><option value="">ยังไม่ลงนาม</option><option value="ok" ${sg.dir==='ok'?'selected':''}>อนุมัติ</option><option value="no" ${sg.dir==='no'?'selected':''}>ไม่อนุมัติ</option></select><input type="date" id="dirdate" value="${sg.date||''}" aria-label="วันที่อนุมัติ"></div>`:'<div class="small muted">ส่วนของผู้บริหาร แอดมินโรงเรียนเป็นผู้ลงนาม</div>'}</details>`;
 return `<div class="stack"><div class="row">${subjectSelect(codes)}</div>
 <div class="card stack"><h3>ดาวน์โหลดเป็นหลักฐาน</h3>
  <div class="small muted">ชื่อไฟล์ที่ระบบตั้งให้อัตโนมัติ</div>
  <code style="word-break:break-all">${esc(fname(c,'pdf'))}</code>
  ${evLock?`<div class="lock small">ล็อกอยู่: ยังประเมินผู้เรียนไม่ครบ ${evMiss(c.code,S.term,R)} คน ต้องประเมินคุณลักษณะ การอ่าน คิดวิเคราะห์ เขียน และสมรรถนะให้ครบก่อน จึงจะลงนามและดาวน์โหลดได้ <button class="btn sm" data-go="eval">ไปประเมิน</button></div>`:''}
  <div class="row">${['PDF','Excel','Word'].map(f=>`<button class="btn sm ${f==='PDF'?'':'alt'}" data-act="dl" data-f="${f}" ${evLock?'disabled':''}>${f}</button>`).join('')}</div>
  <div class="small muted">เรียงชื่อ: ชื่อวิชา_ชั้น_ภาคเรียน_ปีการศึกษา_ครูผู้สอน · จัดหน้าตามแบบ ปพ.5 ของโรงเรียน (มีหน้าเวลาเรียนรายวันแนวนอนเมื่อเช็คชื่อแล้ว) A4 ฟอนต์ TH Sarabun</div></div>
 ${editor}
 <h3>ตัวอย่างหน้าในเล่ม</h3>
 ${L('หน้าสรุปและลงนาม',info)}${L('คำอธิบายรายวิชา',desc)}${L('โครงสร้างรายวิชา',struct)}${L('เวลาเรียนรายวัน (เช็คชื่อ)',attP)}${L('คะแนนย่อยระหว่างเรียน',sub)}${L('ผลการเรียน',resP)}${evP?evP+'<div class="pgl">ผลการประเมิน</div>':''}${L('สรุปผลการเรียน',sumP)}${L('แก้ไขผลการเรียน',fixP)}${L('คำชี้แจงเกณฑ์',crit)}
 <p class="small muted">ข้อมูลผลประเมิน ลายเซ็น และคำอธิบายในต้นแบบเป็นตัวอย่างสมมติ</p></div>`;};

const GUIDE={
 super:[['ตั้งปีการศึกษา','เปิดปีการศึกษาและภาคเรียน ปิดปีเมื่อสิ้นปีเพื่อเก็บข้อมูลและเลื่อนชั้น','years'],['สร้างบัญชีผู้ใช้','สร้างแอดมินโรงเรียนและครู กำหนดรหัสเริ่มต้น รีเซ็ตรหัสเมื่อลืม และส่งออกใบรหัส','users'],['เตรียมรายวิชา','เลือกวิชาจากคลังที่จะเปิดสอนในปีและภาคเรียนนี้','catalog'],['เพิ่มนักเรียน','เพิ่มทีละคนหรือวางรายชื่อหลายคน ใส่เลขประจำตัวนักเรียนให้ครบ (นักเรียนใช้เลขนี้ดูผลการเรียน) ระบบเลื่อนชั้นให้เองตอนขึ้นปีใหม่','students'],['อนุมัติการสอน','ตรวจที่ครูลงทะเบียน อนุมัติ หรือส่งกลับพร้อมข้อความ รวมถึงคำขอแก้ไขการลงทะเบียน (ขอเพิ่ม/เอาวิชาออก) · แอดมินที่สอนด้วยให้ลงทะเบียน "วิชาที่ฉันสอน" ไว้ ชื่อจึงจะขึ้นเป็นครูผู้สอน','reg'],['ติดตามความคืบหน้า','เลือกดูทีละชั้นหรือทุกชั้น และสลับเป็นมุมมอง "รายครู" ดูว่าครูแต่ละคนส่งผลครบหรือยัง','progress'],['เผยแพร่ผลให้นักเรียน','เลือกว่านักเรียนเห็นคะแนนหรือเฉพาะเกรด แล้วกดเผยแพร่รายชั้น ถ้าครูแก้คะแนนภายหลังให้กด "เผยแพร่ใหม่"','publish'],['ประกาศหน้าแรก','เพิ่ม แก้ไข ปักหมุด ซ่อน หรือลบประกาศ ตั้ง "วันที่กำหนด" เช่น วันผลการเรียนออก หน้าแรกนับถอยหลังและขึ้นประกาศใหม่ให้เองเมื่อถึงวัน','news'],['ติดตามและส่งออก','ดูเอกสารของแต่ละวิชาและดาวน์โหลดเป็นหลักฐาน','p5']],
 admin:[['ตั้งค่าโรงเรียน','กรอกชื่อและลายเซ็นของ ผอ. หัวหน้างานวัดผล หัวหน้างานวิชาการ และหัวหน้ากลุ่มสาระ และกำหนดครูที่ปรึกษาประจำชั้น','school'],['เตรียมรายวิชา','เลือกวิชาจากคลังที่เปิดสอนในภาคเรียนนี้ ทีละวิชาหรือหลายวิชา','catalog'],['จัดการนักเรียน','เพิ่มนักเรียนใหม่ ย้ายเข้า หรือวางรายชื่อหลายคน ใส่เลขประจำตัวนักเรียนให้ครบ','students'],['อนุมัติการสอน','ตรวจรายการที่ครูลงทะเบียนและคำขอแก้ไข ถ้าไม่ถูกต้องส่งกลับพร้อมข้อความ','reg'],['ติดตามความคืบหน้า','เลือกดูทีละชั้น หรือมุมมอง "รายครู" ว่าครูคนไหนส่งผลครบแล้ว','progress'],['จัดชุมนุม','สร้างชุมนุมและเลือกครูผู้สอนชุมนุม ระบบเตือนเมื่อนักเรียนอยู่หลายชุมนุม','acts'],['ลงนามและอนุมัติเล่ม','ในหน้าสมุด ปพ.5 ติ๊กลงนามของหัวหน้าฝ่ายต่าง ๆ และให้ ผอ. อนุมัติ พร้อมวันที่','p5'],['เผยแพร่ผลและประกาศ','เผยแพร่ผลการเรียนรายชั้นให้นักเรียนดูออนไลน์ และลงประกาศบนหน้าแรก','publish'],['ดาวน์โหลดเอกสาร','ดาวน์โหลด ปพ.5 ของแต่ละวิชาและเอกสารสรุป','p5']],
 teacher:[['ลงทะเบียนวิชาที่สอน','กดเลือกชั้นทีละชั้น แล้วติ๊กวิชาที่สอน (วิชาของชั้นอื่นที่ติ๊กไว้ยังอยู่ ดูได้ในกล่อง "วิชาที่เลือกไว้ทั้งหมด") ส่งให้แอดมินอนุมัติทุกภาคเรียน · อนุมัติแล้วถ้าลงไม่ครบ กด "แก้ไขการลงทะเบียน" ขอเพิ่มได้','reg'],['รอการอนุมัติ','ถ้าแอดมินส่งกลับจะมีแจ้งเตือนและข้อความ ให้แก้แล้วส่งใหม่','reg'],['ตั้งช่องคะแนนเก็บ','ตั้งว่าเก็บกี่ช่อง ช่องละเท่าไร ประถมเลือกเก็บ 100 หรือ 50 ต่อภาคเรียน','scores'],['กรอกคะแนน','กรอกในตาราง หรือกด "ดาวน์โหลดแบบกรอกคะแนน (Excel)" ไปกรอกใน Excel / Google ชีต แล้ว "แนบไฟล์คะแนน" ระบบกรอกให้อัตโนมัติ · ชั่วโมงที่ขาดกรอกเฉพาะคนที่ขาด ผู้ที่เวลาเรียนต่ำกว่า 80% ได้ มส.','scores'],['เช็คชื่อรายวัน (ถ้าใช้)','เพิ่มวันเรียนต่อจากของเดิม หน้าละ 20 วัน กดเลขหน้าเพื่อดูวันก่อนหน้า','att'],['ตัดสินกิจกรรม','ชุมนุมเลือกสมาชิกของตน ส่วนลูกเสือและกิจกรรมเพื่อสังคมเป็นของครูที่ปรึกษา · ประถมตัดสินผลกิจกรรมในภาคเรียนที่ 2','acts'],['ประเมินผู้เรียน','ให้คะแนนคุณลักษณะ การอ่าน คิดวิเคราะห์ เขียน และสมรรถนะ รายข้อ ทีละคนหรือทั้งห้อง ระบบสรุปผลให้ (ประถมกรอกภาคเรียนที่ 2)','eval'],['ส่งผล','กรอกครบทุกคนแล้วกด "ส่งผล" ที่หน้าความคืบหน้า ถ้าต้องแก้ กด "ยกเลิกส่ง"','progress'],['ใบแจ้งผลและสรุปห้อง (ครูที่ปรึกษา)','เห็นเฉพาะห้องที่เป็นครูที่ปรึกษา ดาวน์โหลด PDF ใบแจ้งผลรายบุคคลหรือทั้งห้อง พร้อมลงนาม','report'],['สร้างลายเซ็น','วาดหรือแนบภาพลายเซ็น ระบบลบพื้นหลังให้ ใช้ลงชื่อในเล่ม ปพ.5 และใบแจ้งผล','sign'],['กรอกข้อมูลประกอบเล่ม','คำอธิบายรายวิชา มาตรฐาน/ตัวชี้วัดและเวลาของแต่ละหน่วย แล้วดูรายการตรวจความครบถ้วน','p5'],['ลงนามและดาวน์โหลด ปพ.5','กดลงลายมือชื่อครูผู้สอน ตรวจครบแล้วดาวน์โหลดเป็นหลักฐาน ระบบตั้งชื่อไฟล์ให้','p5']]};
P.guide=()=>{const k=me().kind,NM={super:'แอดมินหลัก',admin:'แอดมินโรงเรียน',teacher:'ครูผู้สอน'}
 const tabs=k==='super'?['super','admin','teacher']:k==='admin'?['admin','teacher']:['teacher']
 const v=tabs.includes(S.guideKind)?S.guideKind:k, own=v===k, st=GUIDE[v]
 return `<div class="stack"><div class="card"><b>คู่มือสำหรับ${NM[v]}</b><div class="small muted">${own?'ทำตามลำดับ กดปุ่มเพื่อไปยังหน้านั้น':'ดูเพื่อทำความเข้าใจขั้นตอนของบทบาทนี้ (ปุ่มไปหน้าต่าง ๆ ใช้ได้เฉพาะคู่มือของบทบาทคุณ)'}</div>
 ${tabs.length>1?`<div class="row" style="margin-top:8px">${tabs.map(x=>`<button class="btn sm ${x===v?'':'alt'}" data-gk="${x}">${x===k?'คู่มือของฉัน · ':''}${NM[x]}</button>`).join('')}</div>`:''}</div>
 ${st.map((x,i)=>`<div class="card step"><i>${i+1}</i><div class="stack" style="gap:6px"><b>${x[0]}</b><span class="small muted">${x[1]}</span>${own?`<div><button class="btn sm alt" data-go="${x[2]}">ไปที่หน้านี้</button></div>`:''}</div></div>`).join('')}
 <div class="card"><b>ข้อควรรู้</b><ul class="small" style="margin:6px 0 0;padding-left:18px">
  <li>ประถม ภาคเรียนที่ 1 ยังไม่ตัดเกรด ตัดเกรดเมื่อจบภาคเรียนที่ 2 มัธยมตัดเกรดทุกภาคเรียน</li>
  <li>กิจกรรมแนะแนว: มีครูแนะแนวให้ครูแนะแนวตัด ถ้าไม่มีให้ครูที่ปรึกษาตัด</li>
  <li>ครูที่ปรึกษา 2 คนในห้องเดียวกัน คนที่กรอกก่อนจะได้สิทธิ์ อีกคนจะได้รับแจ้งเตือน</li>
  <li>เล่ม ปพ.5 ลงนามและดาวน์โหลดไม่ได้จนกว่าจะประเมินคุณลักษณะ การอ่าน คิดวิเคราะห์ เขียน และสมรรถนะครบทุกคน (ประถมประเมินในภาคเรียนที่ 2)</li>
  <li>เวลาเรียนต่ำกว่า 80% ได้ มส. ระบบไม่ตัดเกรดให้ ประถมนับเวลาเรียนรวมทั้งปี</li>
  <li>ลืมรหัสผ่านให้แจ้งแอดมินหลักหรือแอดมินโรงเรียนเพื่อรีเซ็ต</li>
  <li>นักเรียนดูผลการเรียนที่ <b>${esc(location.origin)}/student</b> ด้วยเลขประจำตัวนักเรียน (คัดลอกลิงก์ได้ที่หน้าภาพรวม) · นักเรียนจำเลขประจำตัวไม่ได้ ให้ติดต่อครูประจำชั้น · ผลจะขึ้นเมื่อแอดมินกดเผยแพร่</li>
  <li>ติดตั้งระบบเป็นแอปบนมือถือได้: กดปุ่ม "ติดตั้งแอป" บนหน้าแรก (iPhone: Safari → แชร์ → เพิ่มไปยังหน้าจอโฮม)</li>
  <li>เกรดคิดจากคะแนนรวมที่ปัดเป็นจำนวนเต็ม (.5 ขึ้นไปปัดขึ้น)</li></ul></div></div>`;};

/* ---------- ลายเซ็นอิเล็กทรอนิกส์ ---------- */
function sigWidget(target,label){const cur=getSig(target);
 return `<div class="card stack"><b>${label}</b>${cur?`<img class="sigprev" src="${cur}" alt="ลายเซ็นปัจจุบัน">`:'<div class="small muted">ยังไม่มีลายเซ็น</div>'}
 <canvas class="sigc" data-target="${target}" width="520" height="170" aria-label="กรอบวาดลายเซ็น"></canvas>
 <div class="row"><button class="btn sm" data-act="sigsave" data-target="${target}">บันทึกลายเซ็นที่วาด</button><button class="btn sm alt" data-act="sigclear" data-target="${target}">ล้างกรอบ</button>
 <label class="btn sm alt" style="cursor:pointer">แนบภาพลายเซ็น<input type="file" accept="image/*" data-sigfile="${target}" hidden></label>${cur?`<button class="btn sm alt" data-act="sigclean" data-target="${target}">ลบพื้นหลังลายเซ็นเดิม</button><button class="btn sm alt" data-act="sigdel" data-target="${target}">ลบลายเซ็น</button>`:''}</div>
 <div class="small muted">วาดด้วยนิ้ว เมาส์ หรือปากกา หรือแนบภาพลายเซ็น (พื้นขาวหรือโปร่งใส)</div></div>`;}
function initSig(){document.querySelectorAll('canvas.sigc').forEach(cv=>{const x=cv.getContext('2d');x.lineWidth=3;x.lineCap='round';x.lineJoin='round';x.strokeStyle='#14213d';let on=false;
 const pos=e=>{const r=cv.getBoundingClientRect();return [(e.clientX-r.left)*cv.width/r.width,(e.clientY-r.top)*cv.height/r.height];};
 cv.onpointerdown=e=>{on=true;cv.setPointerCapture(e.pointerId);const [a,b]=pos(e);x.beginPath();x.moveTo(a,b);x.lineTo(a+.1,b+.1);x.stroke();cv._dirty=true;e.preventDefault();};
 cv.onpointermove=e=>{if(!on)return;const [a,b]=pos(e);x.lineTo(a,b);x.stroke();};
 cv.onpointerup=cv.onpointercancel=()=>{on=false;};});}
function cleanSig(url,cb){const im=new Image();im.onload=()=>{const W=im.width,Hh=im.height,cv=document.createElement('canvas');cv.width=W;cv.height=Hh;const x=cv.getContext('2d');x.drawImage(im,0,0);
 const d=x.getImageData(0,0,W,Hh),p=d.data;let x0=W,y0=Hh,x1=-1,y1=-1;
 for(let i=0;i<p.length;i+=4){const a0=p[i+3]/255,l=0.299*p[i]+0.587*p[i+1]+0.114*p[i+2],a=Math.max(0,Math.min(1,(235-l)/85))*a0;
  p[i+3]=Math.round(a*255);if(a>0){const k=i/4,xx=k%W,yy=(k-xx)/W;p[i]=Math.min(p[i],90);p[i+1]=Math.min(p[i+1],90);p[i+2]=Math.min(p[i+2],120);if(a>.2){if(xx<x0)x0=xx;if(xx>x1)x1=xx;if(yy<y0)y0=yy;if(yy>y1)y1=yy;}}}
 x.putImageData(d,0,0);if(x1<0)return cb(url);const pad=6;x0=Math.max(0,x0-pad);y0=Math.max(0,y0-pad);x1=Math.min(W-1,x1+pad);y1=Math.min(Hh-1,y1+pad);
 const o=document.createElement('canvas');o.width=x1-x0+1;o.height=y1-y0+1;o.getContext('2d').drawImage(cv,x0,y0,o.width,o.height,0,0,o.width,o.height);cb(o.toDataURL('image/png'));};im.onerror=()=>cb(url);im.src=url;}
function readImg(file,max,type,cb){const fr=new FileReader();fr.onload=()=>{const im=new Image();im.onload=()=>{const k=Math.min(1,max/Math.max(im.width,im.height)),cv=document.createElement('canvas');cv.width=Math.round(im.width*k);cv.height=Math.round(im.height*k);const x=cv.getContext('2d');if(type==='jpeg'){x.fillStyle='#fff';x.fillRect(0,0,cv.width,cv.height);}x.drawImage(im,0,0,cv.width,cv.height);cb(cv.toDataURL('image/'+type,.88));};im.src=fr.result;};fr.readAsDataURL(file);}
P.sign=()=>`<div class="stack"><div class="card"><b>ลายเซ็นของฉัน (${esc(me().name)})</b><div class="small muted">ใช้ลงชื่อในสมุด ปพ.5 เมื่อกด "ลงลายมือชื่อครูผู้สอน" ในหน้าสมุด ปพ.5 ลายเซ็นเก็บเฉพาะบัญชีของคุณ</div></div>${sigWidget('u:'+S.role,'วาดหรือแนบลายเซ็น')}</div>`;
P.school=()=>{const sc=S.school,o=sc.officers;
 return `<div class="stack"><div class="card stack"><h3>ข้อมูลโรงเรียน</h3><label for="scn">ชื่อโรงเรียน</label><input id="scn" data-sc2="name" value="${esc(sc.name)}"><label for="sca">สังกัด</label><input id="sca" data-sc2="area" value="${esc(sc.area)}"></div>
 <div class="card stack"><h3>ผู้ลงนามในสมุด ปพ.5</h3><div class="small muted">ชื่อที่กรอกจะขึ้นในช่องลงนามทุกเล่ม ลายเซ็นจะแสดงเมื่อผู้นั้นลงนามเล่มนั้น</div>
 ${[['measure','หัวหน้างานวัดและประเมินผล'],['acad','หัวหน้ากลุ่มบริหารงานวิชาการ'],['dir','ผู้อำนวยการโรงเรียน']].map(([k,t])=>`<label for="of${k}">${t}</label><input id="of${k}" data-of="${k}" value="${esc(o[k].name)}" placeholder="คำนำหน้า ชื่อ-สกุล">${sigWidget('o:'+k,'ลายเซ็น'+t)}`).join('')}</div>
 ${calCard()}${homeroomCard()}<div class="card stack"><h3>หัวหน้ากลุ่มสาระการเรียนรู้</h3>${Object.entries(AREA).map(([k,t])=>`<details><summary>${t} <span class="small muted">${esc((sc.heads[k]||{}).name||'ยังไม่ตั้งชื่อ')}</span></summary><div class="stack" style="padding:8px 0"><label for="hd${k}">ชื่อหัวหน้ากลุ่มสาระ${t}</label><input id="hd${k}" data-hd="${k}" value="${esc((sc.heads[k]||{}).name||'')}">${sigWidget('h:'+k,'ลายเซ็น')}</div></details>`).join('')}</div></div>`;};
P.eval=()=>{const codes=pickSubject();
 if(!codes)return `<div class="card empty">ยังไม่มีวิชาที่อนุมัติ<br><br><button class="btn" data-go="reg">ไปลงทะเบียนสอน</button></div>`;
 const c=CAT.find(x=>x.code===S.scCode),pri=isPri(c.level);
 if(pri&&S.term===1)return `<div class="stack"><div class="row">${subjectSelect(codes,1)}</div><div class="card empty">ประถมประเมินคุณลักษณะ การอ่าน คิดวิเคราะห์ เขียน และสมรรถนะ ในภาคเรียนที่ 2<br>เลือก "ภาคเรียนที่ 2" ด้านบนเพื่อกรอก</div></div>`;
 const R=calc(c.code),key=SKEY(),st=S.ev[key]||(S.ev[key]={}),K=EVK.find(x=>x[0]===S.evKind)||EVK[0],[k,title,short,items]=K;
 const o={};EVL.forEach(l=>o[l]=0);R.forEach(r=>{const v=evOverall((st[r.s.id]||{})[k],items.length);if(v)o[v]++;});const all=EVL.reduce((p,l)=>p+o[l],0);
 const opts=`<option value="">-</option><option value="3">3 ดีเยี่ยม</option><option value="2">2 ดี</option><option value="1">1 ผ่าน</option><option value="0">0 ไม่ผ่าน</option>`;
 return `<div class="stack"><div class="row">${subjectSelect(codes,1)}</div>
 ${stepBar(c,R,'eval:'+k)}
 <div class="card stack"><b>${title}</b><div class="small muted">ให้คะแนนแต่ละข้อ 3 = ดีเยี่ยม · 2 = ดี · 1 = ผ่าน · 0 = ไม่ผ่าน ระบบสรุปผลให้ (ค่าเฉลี่ย 2.5 ขึ้นไปดีเยี่ยม · 1.5 ขึ้นไปดี · 1 ขึ้นไปผ่าน)</div>
 <div class="row"><span class="small">ตั้งทั้งห้อง:</span><select id="evall" aria-label="ตั้งทั้งห้อง">${opts}</select><button class="btn sm" data-act="evall">ทั้งห้อง</button>
  <span class="small" style="margin-left:10px">ตั้งตามเลขที่:</span><input id="evnos" placeholder="เช่น 1,3,5-8" size="14" aria-label="เลขที่นักเรียน หลายคนคั่นด้วยจุลภาค"><select id="evlv" aria-label="ระดับ">${opts}</select><button class="btn sm" data-act="evnos">ใช้กับเลขที่เหล่านี้</button></div>
 <div class="row">${EVL.map(l=>`<span class="pill ${l==='ไม่ผ่าน'?'p-bad':l==='ผ่าน'?'p-gold':'p-good'}">${l} ${o[l]} คน</span>`).join('')}<span class="small muted">ประเมินแล้ว ${all}/${R.length}</span></div>
 <div class="small muted" style="line-height:1.5">${items.map((t,i)=>`<b>${i+1}</b> ${t}`).join(' · ')}</div>
 ${(()=>{// ตารางเดียวเสมอ เรียงเลขที่ต่อกัน หัวตารางค้างด้านบน (เดิมแบ่ง 2 ฝั่งเมื่อเกิน 16 คนบนจอกว้าง ทำให้กรอกสับสน)
  const tbl=rs=>`<div class="tw evc hd"><table><thead><tr><th>ที่</th><th>ชื่อ - สกุล</th><th>ทุกข้อ</th>${items.map((t,i)=>`<th title="${esc(t)}">${i+1}</th>`).join('')}<th>สรุป</th></tr></thead><tbody>
  ${rs.map(r=>{const a=(st[r.s.id]||{})[k]||[];return `<tr><td>${r.s.no}</td><td>${esc(r.s.name)}</td><td><select data-evrow="${r.s.id}" aria-label="ตั้งทุกข้อ ${esc(r.s.name)}">${opts}</select></td>${items.map((t,i)=>`<td><select data-ev="${r.s.id}|${i}" aria-label="${esc(t)} ${esc(r.s.name)}">${['','3','2','1','0'].map(v=>`<option value="${v}" ${String(a[i]??'')===v?'selected':''}>${v===''?'-':v}</option>`).join('')}</select></td>`).join('')}<td>${evOverall(a,items.length)||'-'}</td></tr>`}).join('')}</tbody></table></div>`;
  return tbl(R);})()}
 </div>${nextBtn(c,R,'eval:'+k)}${k===EVK[EVK.length-1][0]?subCard(c,R):''}</div>`;};
reg('click',e=>{const t=e.target.closest('[data-evk],[data-act]');if(!t)return;const d=t.dataset,a=d.act;
 if(d.evk){S.evKind=d.evk;render();return;}
 if(a==='sigclear'){const cv=document.querySelector(`canvas.sigc[data-target="${d.target}"]`);cv.getContext('2d').clearRect(0,0,cv.width,cv.height);cv._dirty=false;}
 else if(a==='sigsave'){const cv=document.querySelector(`canvas.sigc[data-target="${d.target}"]`);if(!cv._dirty)return toast('วาดลายเซ็นในกรอบก่อน');cleanSig(cv.toDataURL('image/png'),u=>{setSig(d.target,u);toast('บันทึกลายเซ็นแล้ว');render();});}
  else if(a==='sigclean'){const cur=getSig(d.target);if(cur)cleanSig(cur,u=>{setSig(d.target,u);toast('ลบพื้นหลังลายเซ็นแล้ว');render();});}
 else if(a==='sigdel'){setSig(d.target,null);render();}
 else if(a==='descdel'){metaOf(S.scCode).img=null;render();}
 else if(a==='holadd'){const f=$('#hf').value,e2=$('#ht').value;if(!f)return toast('เลือกวันที่หยุดก่อน');if(e2&&e2<f)return toast('วันสิ้นสุดต้องไม่ก่อนวันเริ่ม');calOf().hol.push({f,t:e2||f,n:($('#hn').value||'').trim()});render();}
 else if(a==='holstd'){const cal=calOf(),ys=new Set();[1,2].forEach(t=>[cal[t].open,cal[t].close].forEach(v=>{if(v)ys.add(+v.slice(0,4));}));if(!ys.size){const y=(+S.year||2569)-543;ys.add(y);ys.add(y+1);}const FX=[['01-01','วันขึ้นปีใหม่'],['04-06','วันจักรี'],['04-13','วันสงกรานต์'],['04-14','วันสงกรานต์'],['04-15','วันสงกรานต์'],['05-01','วันแรงงาน'],['05-04','วันฉัตรมงคล'],['06-03','วันเฉลิมพระชนมพรรษาสมเด็จพระราชินี'],['07-28','วันเฉลิมพระชนมพรรษาพระบาทสมเด็จพระเจ้าอยู่หัว'],['08-12','วันแม่แห่งชาติ'],['10-13','วันนวมินทรมหาราช'],['10-23','วันปิยมหาราช'],['12-05','วันพ่อแห่งชาติ'],['12-10','วันรัฐธรรมนูญ'],['12-31','วันสิ้นปี']];let n=0;const have=new Set(cal.hol.map(h=>h.f));ys.forEach(y=>FX.forEach(([md,nm])=>{const d=y+'-'+md;if(!have.has(d)){cal.hol.push({f:d,t:d,n:nm});have.add(d);n++;}}));render();toast('เพิ่มวันหยุดแล้ว '+n+' รายการ (ปี '+[...ys].map(y=>y+543).join(', ')+')');}
 else if(a==='holdel'){calOf().hol.splice(+d.i,1);render();}
 else if(a==='evnos'){const v=$('#evlv').value,txt=($('#evnos').value||'').trim();if(v==='')return toast('เลือกระดับก่อน');if(!txt)return toast('พิมพ์เลขที่ เช่น 1,3,5-8');const nos=new Set();txt.split(/[,\s]+/).filter(Boolean).forEach(p=>{const m=p.match(/^(\d+)-(\d+)$/);if(m){for(let n=+m[1];n<=+m[2];n++)nos.add(n);}else if(/^\d+$/.test(p))nos.add(+p);});const K=EVK.find(x=>x[0]===S.evKind),st=S.ev[SKEY()]||(S.ev[SKEY()]={});let c=0;const R=calc(S.scCode),have=new Set(R.map(r=>r.s.no));R.forEach(r=>{if(nos.has(r.s.no)){(st[r.s.id]=st[r.s.id]||{})[K[0]]=K[3].map(()=>+v);c++;}});const miss=[...nos].filter(n=>!have.has(n));render();toast('ตั้งผลให้ '+c+' คน'+(miss.length?' · ไม่พบเลขที่ '+miss.join(', '):''));}
 else if(a==='evall'){const v=$('#evall').value;if(v==='')return toast('เลือกระดับก่อน');const K=EVK.find(x=>x[0]===S.evKind),st=S.ev[SKEY()]||(S.ev[SKEY()]={});calc(S.scCode).forEach(r=>{(st[r.s.id]=st[r.s.id]||{})[K[0]]=K[3].map(()=>+v);});render();}
});
reg('change',e=>{const t=e.target,d=t.dataset;
 if(t.id==='desc'){metaOf(S.scCode).desc=t.value;}
 else if(t.id==='descimg'&&t.files[0]){readImg(t.files[0],1200,'jpeg',u=>{metaOf(S.scCode).img=u;render();});}
 else if(d.sigfile!==undefined&&t.files[0]){readImg(t.files[0],520,'png',u=>cleanSig(u,v=>{setSig(d.sigfile,v);toast('แนบลายเซ็นแล้ว (ลบพื้นหลังให้แล้ว)');render();}));}
 else if(d.std!==undefined||d.hrsu!==undefined){const raw=String(d.std!==undefined?d.std:d.hrsu),T=raw.includes(':')?1:S.term,g=groupsOf(cfgOf(S.scCode,T))[+raw.split(':').pop()],m=metaOf(S.scCode),u=(m.units[uk(T,g.label)]=m.units[uk(T,g.label)]||{});if(d.std!==undefined)u.std=t.value;else u.hrs=t.value;render();}
 else if(d.fw!==undefined||d.fa!==undefined||d.fd!==undefined){const sid=d.fw??d.fa??d.fd,f=S.fix[SKEY()]||(S.fix[SKEY()]={}),x=f[sid]||(f[sid]={});if(d.fw!==undefined)x.why=t.value;else if(d.fa!==undefined)x.after=t.value;else x.date=t.value;render();}
 else if(d.sg){const s=S.sign[SKEY()]||(S.sign[SKEY()]={});s[d.sg]=t.checked;render();}
 else if(t.id==='dirsel'){(S.sign[SKEY()]=S.sign[SKEY()]||{}).dir=t.value||null;render();}
 else if(t.id==='dirdate'){(S.sign[SKEY()]=S.sign[SKEY()]||{}).date=t.value;render();}
 else if(d.rs!==undefined){const m=S.rs[SKEY()]||(S.rs[SKEY()]={});m[d.rs]=t.checked;render();}
 else if(d.cu!==undefined){cfgOf(S.scCode).cols[+d.cu].u=t.value;render();}
 else if(d.sc2){S.school[d.sc2]=t.value;}
 else if(d.cal){const [tt,f]=d.cal.split('.');calOf()[tt][f]=t.value;}
 else if(d.of){S.school.officers[d.of].name=t.value;}
 else if(d.hd){(S.school.heads[d.hd]=S.school.heads[d.hd]||{}).name=t.value;}
 else if(d.ev!==undefined){const [sid,i]=d.ev.split('|'),K=EVK.find(x=>x[0]===S.evKind),st=S.ev[SKEY()]||(S.ev[SKEY()]={}),o=st[sid]||(st[sid]={}),a=o[K[0]]||(o[K[0]]=K[3].map(()=>''));a[+i]=t.value===''?'':+t.value;render();}
 else if(d.evrow!==undefined){if(t.value==='')return;const K=EVK.find(x=>x[0]===S.evKind),st=S.ev[SKEY()]||(S.ev[SKEY()]={});(st[d.evrow]=st[d.evrow]||{})[K[0]]=K[3].map(()=>+t.value);render();}
});

/* ---------- ใบแจ้งผลการเรียน (ประถม ภาคเรียนที่ 1 / ประถม ภาคเรียนที่ 2 / มัธยม) ---------- */
function rptData(L,T){T=T||S.term;const pri=isPri(L);
 const subs=CAT.filter(c=>c.level===L&&S.openSubj.has(c.code)&&(pri||c.term===T));
 const cal=subs.map(c=>({c,R:calc(c.code,T)}));const stus=ACT().filter(s=>s.level===L);
 return {cal,stus,T,pri,mode:pri?(T===1?'p1':'p2'):'s'};}
const rname=(L,s,T)=>`ใบแจ้งผลการเรียน_${L}_ภาคเรียน${T||S.term}_ปีการศึกษา${S.year}_${s?s.name.replace(/\s+/g,'_'):'ทั้งห้อง'}.pdf`.replace(/[\\/:*?"<>|]/g,'');
// ใบแจ้งผล "แบบรายงานประจำตัวนักเรียน" หน้าเดียว A4 ใช้แบบเดียวกันทั้งประถมและมัธยม (ไม่แสดงเวลาเรียน)
//  มัธยม (s): หน่วยกิต = ชั่วโมง/ภาคเรียน ÷ 40 · คะแนนเต็ม 100 · ตัดเกรดทุกภาค
//  ประถม ภาค 1 (p1): น้ำหนัก = ชั่วโมงทั้งปี ÷ 40 · คะแนนภาค 1 เต็ม 50 · ยังไม่ตัดเกรด/ยังไม่ประเมิน
//  ประถม ภาค 2 (p2): คะแนนรวมทั้งปี เต็ม 100 · ตัดเกรดและประเมินทั้งปี
const EVN=lab=>lab?3-EVL.indexOf(lab):null;
const evLabOf=m=>m==null?'-':EVL[3-(m>=2.5?3:m>=1.5?2:m>=1?1:0)];
const credOf=(code,T,pri)=>pri?((+cfgOf(code,1).hours||40)+(+cfgOf(code,2).hours||40))/40:(+cfgOf(code,T).hours||40)/40;
const fmtCr=x=>(Math.round(x*10)/10).toFixed(1);
function rptPage(L,s,D){const yr=S.year,sc=S.school,hr=(HOMEROOM[L]||[]),st=S.rpt[L]||{},T=D.T,M=D.mode,pri=D.pri,p1=M==='p1';
 const showSc=p1||st.sc!==false,crW=pri?'น้ำหนัก':'หน่วยกิต',full=p1?50:100;
 const rows=D.cal.map(x=>{const c=x.c,r=x.R.find(q=>q.s.id===s.id)||{},k=c.code+'|'+T,fx=((S.fix[k]||{})[s.id])||{},ev=((S.ev[k]||{})[s.id])||{};
  const g=p1?null:r.g,after=p1?'':String(fx.after||'').trim(),afN=after!==''&&!isNaN(+after)?+after:null;
  const eff=afN!=null?afN:(typeof g==='number'?g:null),score=p1?r.cur:M==='p2'?r.sum:r.tot;
  return {c,g,score,add:c.code[3]==='2',cr:credOf(c.code,T,pri),after,eff,
   ea:p1?null:EVN(evOverall(ev.a,EVK[0][3].length)),er:p1?null:EVN(evOverall(ev.r,EVK[1][3].length))};});
 const crS=l=>l.reduce((a,x)=>a+x.cr,0),crG=l=>p1?'-':fmtCr(l.reduce((a,x)=>a+(x.eff!=null&&x.eff>=1?x.cr:0),0));
 const base=rows.filter(x=>!x.add),add=rows.filter(x=>x.add);
 const gr=rows.filter(x=>x.eff!=null),gpa=!p1&&gr.length?gr.reduce((a,x)=>a+x.eff*x.cr,0)/crS(gr):null;
 const avg=a=>{a=a.filter(v=>v!=null);return a.length?a.reduce((p,q)=>p+q,0)/a.length:null;};
 const evA=p1?'ประเมินในภาคเรียนที่ 2':evLabOf(avg(rows.map(x=>x.ea))),evR=p1?'ประเมินในภาคเรียนที่ 2':evLabOf(avg(rows.map(x=>x.er)));
 const clubE=Object.entries(S.members).find(([,m])=>(m.ids||[]).includes(s.id));
 const acts=ACTS.map(a=>{if(a==='ชุมนุม')return {n:clubE?`ชุมนุม (${clubE[0]})`:'ชุมนุม',v:clubE?((clubE[1].v||{})[s.id]||'-'):'-'};return {n:a,v:((S.acts[L+'|'+a]||{}).v||{})[s.id]||'-'};});
 const actAll=p1?'ประเมินในภาคเรียนที่ 2':acts.some(a=>a.v==='มผ')?'มผ':acts.every(a=>a.v==='ผ')?'ผ':'-';
 const nC=showSc?10:9;
 const line=x=>`<tr><td class="num">${x.c.code}</td><td>${esc(x.c.name)}</td><td class="num">${x.add?'เพิ่มเติม':'พื้นฐาน'}</td><td class="num">${fmtCr(x.cr)}</td>${showSc?`<td class="num${p1?' b':''}">${x.score==null?'-':Math.round(x.score+1e-9)}</td>`:''}<td class="num b">${x.g==null?'-':x.g}</td><td class="num b">${esc(x.after)}</td><td class="num">${x.ea==null?'-':x.ea}</td><td class="num">${x.er==null?'-':x.er}</td><td class="nt"></td></tr>`;
 const aLine=a=>`<tr><td></td><td>${esc(a.n)}</td><td class="num">กิจกรรม</td><td></td>${showSc?'<td class="num">-</td>':''}<td class="num b">${p1?'-':a.v}</td><td></td><td></td><td></td><td></td></tr>`;
 const n=rows.length+acts.length,fs=n<=18?13.5:n<=22?12.5:n<=26?11.5:10.5;
 const sigT=st.t?S.sigs[hr[0]]:null,sigD=st.dir?sc.officers.dir.sig:null;
 const sg=(img,name,role)=>`<div class="sg"><div>ลงชื่อ ${img?sigImg(img):'..............................................'}</div><div>( ${name||'..............................................'} )</div><div>${role}</div></div>`;
 const lvTxt=(pri?'ประถมศึกษาปีที่ ':'มัธยมศึกษาปีที่ ')+L.replace(/^[ปม]\./,'');
 const tTxt=M==='p2'?'ภาคเรียนที่ 2 (ผลการเรียนทั้งปี)':'ภาคเรียนที่ '+T;
 const note=p1?'ภาคเรียนที่ 1 ของประถมแจ้งคะแนน (เต็มวิชาละ 50) ยังไม่ตัดสินระดับผลการเรียน ผลทั้งปีแจ้งเมื่อสิ้นภาคเรียนที่ 2 · ':M==='p2'?'คะแนนรวมทั้งปี = ภาคเรียนที่ 1 (50) + ภาคเรียนที่ 2 (50) · ':'';
 return `<div class="pg rp rps" style="--rfs:${fs}pt"><div class="rpsk">ปพ.6</div>
 <div class="rhd"><img src="${LOGO}" alt=""><b>แบบรายงานประจำตัวนักเรียน</b><span>${esc(sc.name)} &nbsp; ${esc(sc.area)}</span><span>ชั้น${lvTxt} &nbsp; ${tTxt} &nbsp; ปีการศึกษา ${yr}</span></div>
 <div class="rpsn"><span><b>ชื่อ</b> ${esc(s.name)}</span><span><b>เลขประจำตัว</b> ${s.sid?esc(s.sid):'..........'}</span><span><b>ชั้น</b> ${L}</span><span><b>เลขที่</b> ${s.no}</span></div>
 <div class="tw"><table class="rs3"><colgroup><col style="width:10%"><col><col style="width:7%"><col style="width:7%">${showSc?'<col style="width:7%">':''}<col style="width:7%"><col style="width:6%"><col style="width:6%"><col style="width:9%"><col style="width:9%"></colgroup>
 <thead><tr><th rowspan="2">รหัสวิชา</th><th rowspan="2">รายวิชา</th><th rowspan="2">ประเภท</th><th rowspan="2">${crW}</th><th colspan="${showSc?3:2}">การประเมินผลสัมฤทธิ์</th><th rowspan="2">คุณ<br>ลักษณะ</th><th rowspan="2">อ่าน คิด<br>วิเคราะห์ เขียน</th><th rowspan="2">หมายเหตุ</th></tr>
 <tr>${showSc?`<th>คะแนน<br>(${full})</th>`:''}<th>สอบปกติ</th><th>แก้ตัว</th></tr></thead>
 <tbody>${base.map(line).join('')}${add.map(line).join('')}${acts.map(aLine).join('')}${rows.length?'':`<tr><td colspan="${nC}" class="num">ยังไม่มีรายวิชา</td></tr>`}</tbody></table></div>
 <div class="rpsb"><div class="tw"><table class="rs3 rsum"><thead><tr><th rowspan="2">สรุปผลการประเมิน</th><th colspan="2">ผลการเรียน</th></tr><tr><th>ที่เรียน</th><th>ที่ได้</th></tr></thead><tbody>
 <tr><td>จำนวน${crW}รายวิชาพื้นฐาน</td><td class="num">${fmtCr(crS(base))}</td><td class="num">${crG(base)}</td></tr>
 <tr><td>จำนวน${crW}รายวิชาเพิ่มเติม</td><td class="num">${fmtCr(crS(add))}</td><td class="num">${crG(add)}</td></tr>
 <tr><td>รวมจำนวน${crW}</td><td class="num">${fmtCr(crS(rows))}</td><td class="num">${crG(rows)}</td></tr>
 <tr><td>ระดับผลการเรียนเฉลี่ย (GPA)</td><td class="num b" colspan="2">${gpa==null?'-':gpa.toFixed(2)}</td></tr>
 <tr><td>ผลการประเมินคุณลักษณะอันพึงประสงค์</td><td class="num" colspan="2">${evA}</td></tr>
 <tr><td>ผลการประเมินการอ่าน คิดวิเคราะห์ และเขียน</td><td class="num" colspan="2">${evR}</td></tr>
 <tr><td>ผลการประเมินกิจกรรมพัฒนาผู้เรียน</td><td class="num" colspan="2">${actAll}</td></tr></tbody></table></div>
 <div class="rpss">${sg(sigT,hr.length?USERS[hr[0]].name:'','ครูที่ปรึกษา')}${sg(sigD,sc.officers.dir.name,'ผู้บริหารสถานศึกษา')}${sg(null,'','ผู้ปกครอง')}</div></div>
 <div class="small">${note}คุณลักษณะ / อ่าน คิดวิเคราะห์ เขียน: 3 = ดีเยี่ยม 2 = ดี 1 = ผ่าน 0 = ไม่ผ่าน · ร = รอการตัดสิน มส = ไม่มีสิทธิ์รับการตัดสิน · ผ = ผ่าน มผ = ไม่ผ่าน · ${crW} 1.0 = 40 ชั่วโมง${pri?'ต่อปี':'ต่อภาคเรียน'}</div></div>`;}

P.report=()=>{const RL=sumLevels();if(!RL.length)return '<div class="card empty">ใบแจ้งผลการเรียนพิมพ์ได้เฉพาะครูที่ปรึกษาประจำชั้น (แอดมินกำหนดครูที่ปรึกษาที่หน้า "ตั้งค่าโรงเรียน")</div>';
 const L=RL.includes(S.rpLevel)?S.rpLevel:RL[0],D=rptData(L),T=D.T,s=D.stus.find(x=>x.id===S.rpStu)||D.stus[0],st=S.rpt[L]||(S.rpt[L]={});
 const ttl={p1:'ใบแจ้งผลการเรียน ประถม ภาคเรียนที่ 1',p2:'ใบแจ้งผลการเรียน ประถม ภาคเรียนที่ 2 (ผลทั้งปี)',s:`ใบแจ้งผลการเรียน มัธยม ภาคเรียนที่ ${T}`}[D.mode];
 const dsc={p1:'แบบรายงานประจำตัวนักเรียน หน้าเดียว A4 (แบบเดียวกับมัธยม): แจ้งคะแนนภาคเรียนที่ 1 เต็มวิชาละ 50 ยังไม่ตัดเกรด การประเมินและกิจกรรมแจ้งในภาคเรียนที่ 2',p2:'แบบรายงานประจำตัวนักเรียน หน้าเดียว A4 (แบบเดียวกับมัธยม): ผลการเรียนทั้งปี น้ำหนัก ผลสอบปกติ/แก้ตัว คุณลักษณะ อ่าน คิดวิเคราะห์ เขียน กิจกรรม และ GPA',s:'แบบรายงานประจำตัวนักเรียน หน้าเดียว A4: หน่วยกิต ผลสอบปกติ/แก้ตัว คุณลักษณะ อ่าน คิดวิเคราะห์ เขียน กิจกรรมพัฒนาผู้เรียน สรุปหน่วยกิตและ GPA'}[D.mode];
 return `<div class="stack"><div class="row">${RL.map(l=>`<button class="chip" aria-pressed="${l===L}" data-rl="${l}">${l}</button>`).join('')}</div>
 <div class="row">${[1,2].map(t=>`<button class="chip" aria-pressed="${S.term===t}" data-term="${t}">ภาคเรียนที่ ${t}</button>`).join('')}</div>
 <div class="card stack"><h3>${ttl}</h3><div class="small muted">${dsc}</div>
 ${D.stus.length?`<div class="row"><label for="rpst">นักเรียน</label><select id="rpst">${D.stus.map(x=>`<option value="${x.id}" ${x.id===s.id?'selected':''}>${x.no}. ${esc(x.name)}</option>`).join('')}</select></div>
 <code style="word-break:break-all">${esc(rname(L,s,T))}</code>
 <div class="row"><button class="btn sm" data-act="rdl" data-w="one">PDF รายบุคคล</button><button class="btn sm alt" data-act="rdl" data-w="all">PDF ทั้งห้อง (${D.stus.length} คน คนละหน้า)</button></div>
 <code style="word-break:break-all">${esc(rname(L,null,T))}</code>
 <div class="row">${D.mode==='p1'?'<span class="small muted">ภาคเรียนที่ 1 ประถมแสดงคะแนนเสมอ (ยังไม่มีเกรด)</span>':`<label><input type="checkbox" id="rpsc" data-rsg="sc" ${st.sc!==false?'checked':''}> แสดงคะแนนรวมในใบแจ้งผล</label>`}<label><input type="checkbox" data-rsg="t" ${st.t?'checked':''}> ลงนามครูที่ปรึกษา</label>${isAdmin()?`<label><input type="checkbox" data-rsg="dir" ${st.dir?'checked':''}> ลงนาม ผอ.</label>`:''}</div>`:'<div class="empty">ห้องนี้ยังไม่มีนักเรียน</div>'}</div>
 ${D.cal.length?'':'<div class="card empty">ชั้นนี้ยังไม่มีรายวิชาที่เปิดสอนในภาคเรียนนี้</div>'}
 ${D.stus.length&&D.cal.length?rptPage(L,s,D):''}</div>`;};
// ===== เผยแพร่ผลการเรียนให้นักเรียนดูออนไลน์ =====
// publishMeta/{ปี_ภาค}: ตัวเลือกการแสดงผล + สถานะรายชั้น (ทุกคนอ่านได้ ใช้แสดงบนหน้าแรก)
// published/{ปี_ภาค_idนักเรียน}: สำเนาผลของนักเรียนแต่ละคน ณ เวลาที่กดเผยแพร่ (อ่านได้เฉพาะแอดมิน นักเรียนอ่านผ่าน /api/student-result)
const PUB_OPTS={score:true,ev:true,act:true,pdf:true};
let pubUnsub=null,pubKey='';S.pubMeta=null;S.pubBusy='';
const pubId=T=>S.year+'_'+T;
const sidKey=s=>String(s.sid||'').replace(/\D/g,'');
function pubWatch(){const k=pubId(S.term);if(k===pubKey)return;pubKey=k;if(pubUnsub)pubUnsub();S.pubMeta=null;
 pubUnsub=onSnapshot(doc(db,'publishMeta',k),s=>{S.pubMeta=s.exists()?s.data():{};render();},e=>{S.pubMeta={};report(e);});}
const hashStr=s=>{let h=5381;for(let i=0;i<s.length;i++)h=((h<<5)+h+s.charCodeAt(i))|0;return (h>>>0).toString(36);};
// ข้อมูลผลการเรียนของนักเรียน 1 คน (คำนวณแบบเดียวกับใบแจ้งผล)
function pubData(L,s,D){const T=D.T,M=D.mode,pri=D.pri,p1=M==='p1';
 const rows=D.cal.map(x=>{const c=x.c,r=x.R.find(q=>q.s.id===s.id)||{},k=c.code+'|'+T,fx=((S.fix[k]||{})[s.id])||{},ev=((S.ev[k]||{})[s.id])||{};
  const g=p1||r.g==null?null:r.g,after=p1?'':String(fx.after||'').trim(),afN=after!==''&&!isNaN(+after)?+after:null;
  const eff=afN!=null?afN:(typeof g==='number'?g:null),score=p1?r.cur:M==='p2'?r.sum:r.tot;
  return {code:c.code,name:c.name,type:c.code[3]==='2'?'เพิ่มเติม':'พื้นฐาน',cr:Math.round(credOf(c.code,T,pri)*10)/10,
   score:score==null?null:Math.round(score+1e-9),grade:g,after,eff,
   ea:p1?null:EVN(evOverall(ev.a,EVK[0][3].length)),er:p1?null:EVN(evOverall(ev.r,EVK[1][3].length))};});
 const r1=x=>Math.round(x*10)/10,sum=l=>r1(l.reduce((a,x)=>a+x.cr,0)),got=l=>r1(l.reduce((a,x)=>a+(x.eff!=null&&x.eff>=1?x.cr:0),0));
 const gr=rows.filter(x=>x.eff!=null),gpa=!p1&&gr.length?Math.round(gr.reduce((a,x)=>a+x.eff*x.cr,0)/sum(gr)*100)/100:null;
 const avg=a=>{a=a.filter(v=>v!=null);return a.length?a.reduce((p,q)=>p+q,0)/a.length:null;};
 const clubE=Object.entries(S.members).find(([,m])=>(m.ids||[]).includes(s.id));
 const acts=ACTS.map(a=>a==='ชุมนุม'?{n:clubE?`ชุมนุม (${clubE[0]})`:'ชุมนุม',v:clubE?((clubE[1].v||{})[s.id]||'-'):'-'}:{n:a,v:((S.acts[L+'|'+a]||{}).v||{})[s.id]||'-'});
 return {year:S.year,term:T,level:L,mode:M,crW:pri?'น้ำหนัก':'หน่วยกิต',full:p1?50:100,name:s.name,no:s.no||'',sid:String(s.sid||''),
  subjects:rows.map(({eff,...x})=>x),gpa,crAll:sum(rows),crGot:p1?null:got(rows),
  evA:p1?null:evLabOf(avg(rows.map(x=>x.ea))),evR:p1?null:evLabOf(avg(rows.map(x=>x.er))),
  acts:p1?acts.map(a=>({n:a.n,v:'-'})):acts,actAll:p1?null:acts.some(a=>a.v==='มผ')?'มผ':acts.every(a=>a.v==='ผ')?'ผ':'-'};}
function pubInfo(L,T){const D=rptData(L,T),datas=D.stus.map(s=>pubData(L,s,D));
 return {D,datas,hash:hashStr(JSON.stringify(datas)),sent:D.cal.filter(x=>S.sub[SUBK(x.c.code,T)]).length,tot:D.cal.length,noSid:D.stus.filter(s=>!sidKey(s)).length};}
async function pubLevel(L){if(S.tpl)return;const T=S.term,key=pubId(T),I=pubInfo(L,T),D=I.D;
 if(!D.stus.length)return toast('ชั้นนี้ยังไม่มีนักเรียน');
 if(I.sent<I.tot&&!(await ask({title:'ครูยังส่งผลไม่ครบ',text:`ชั้น ${L} ส่งผลแล้ว ${I.sent} จาก ${I.tot} วิชา\nวิชาที่ยังไม่ส่ง นักเรียนจะเห็นผลเท่าที่ครูกรอกไว้ ณ ตอนนี้\n\nเผยแพร่เลยไหม?`,ok:'เผยแพร่',cancel:'ยังไม่เผยแพร่'})))return;
 S.pubBusy=L;render();
 const st=S.rpt[L]||(S.rpt[L]={}),keep=st.sc;
 try{const b=writeBatch(db),ids=[];
  D.stus.forEach((s,i)=>{st.sc=true;const html=rptPage(L,s,D);let htmlNs=null;if(D.mode!=='p1'){st.sc=false;htmlNs=rptPage(L,s,D);}
   const id=key+'_'+s.id;ids.push(id);
   b.set(doc(db,'published',id),{year:S.year,term:T,level:L,sidKey:sidKey(s),data:I.datas[i],html,htmlNs,at:Date.now()});});
  const old=((S.pubMeta||{}).levels||{})[L];((old&&old.ids)||[]).filter(i=>!ids.includes(i)).forEach(i=>b.delete(doc(db,'published',i)));
  b.set(doc(db,'publishMeta',key),{year:S.year,term:T,at:Date.now(),levels:{[L]:{at:Date.now(),by:me().name,hash:I.hash,n:ids.length,ids}}},{merge:true});
  await b.commit();toast('เผยแพร่ผลชั้น '+L+' แล้ว');
 }catch(e){report(e);}finally{if(keep===undefined)delete st.sc;else st.sc=keep;S.pubBusy='';render();}}
async function unpubLevel(L){if(S.tpl)return;const key=pubId(S.term),old=((S.pubMeta||{}).levels||{})[L];if(!old)return;
 if(!(await ask({title:'ยกเลิกการเผยแพร่?',text:`นักเรียนชั้น ${L} จะดูผลภาคเรียนที่ ${S.term} ไม่ได้จนกว่าจะเผยแพร่ใหม่`,ok:'ยกเลิกเผยแพร่',cancel:'ไม่ทำ',danger:true})))return;
 S.pubBusy=L;render();
 try{const b=writeBatch(db);(old.ids||[]).forEach(i=>b.delete(doc(db,'published',i)));
  b.set(doc(db,'publishMeta',key),{at:Date.now(),levels:{[L]:null}},{merge:true});await b.commit();toast('ยกเลิกการเผยแพร่ชั้น '+L+' แล้ว');
 }catch(e){report(e);}finally{S.pubBusy='';render();}}
function pubSetOpt(k,v){if(S.tpl)return;setDoc(doc(db,'publishMeta',pubId(S.term)),{year:S.year,term:S.term,opts:{[k]:v}},{merge:true}).catch(report);}
P.publish=()=>{if(!isAdmin())return '<div class="card empty">หน้านี้สำหรับแอดมินเท่านั้น</div>';
 if(S.tpl)return '<div class="card empty">เปิดปีการศึกษาก่อน จึงจะเผยแพร่ผลได้</div>';
 pubWatch();if(S.pubMeta===null)return '<div class="card empty">กำลังโหลด…</div>';
 const T=S.term,m=S.pubMeta||{},o=Object.assign({},PUB_OPTS,m.opts||{}),lv=m.levels||{};
 const PILL={pub:['เผยแพร่แล้ว','p-good'],changed:['มีการแก้ไขหลังเผยแพร่','p-warn'],ready:['พร้อมเผยแพร่','p-gold'],part:['ครูยังส่งผลไม่ครบ','p-bad']};
 const dt=t=>new Date(t).toLocaleString('th-TH',{day:'numeric',month:'short',year:'2-digit',hour:'2-digit',minute:'2-digit'});
 let pubN=0;
 const rows=LEVELS.map(L=>{const I=pubInfo(L,T),n=I.D.stus.length;if(!n)return '';const p=lv[L];if(p)pubN++;
  const st=p?(p.hash===I.hash?'pub':'changed'):(I.tot&&I.sent>=I.tot?'ready':'part'),busy=S.pubBusy===L;
  const sub=p?`เมื่อ ${dt(p.at)}${p.by?' โดย '+esc(p.by):''}`:I.sent<I.tot?`ขาด ${I.tot-I.sent} วิชา`:'';
  return `<tr><td><b>${L}</b></td><td class="num">${n}</td><td>${I.sent} / ${I.tot} วิชา</td>
  <td><span class="pill ${PILL[st][1]}">${PILL[st][0]}</span>${sub?`<div class="small muted">${sub}</div>`:''}${I.noSid?`<div class="small" style="color:var(--bad)">ไม่มีเลขประจำตัว ${I.noSid} คน (เข้าดูผลไม่ได้)</div>`:''}</td>
  <td style="text-align:right;white-space:nowrap">${busy?'<span class="small muted">กำลังบันทึก…</span>':`${st!=='pub'?`<button class="btn sm" data-pub="${L}">${p?'เผยแพร่ใหม่':'เผยแพร่'}</button>`:''}${p?` <button class="btn sm alt" data-unpub="${L}">ยกเลิกเผยแพร่</button>`:''}`}</td></tr>`;}).join('');
 const seg=(v,label)=>`<button class="chip" aria-pressed="${o.score===v}" data-pubopt="score" data-v="${v?1:0}">${label}</button>`;
 const chk=(k,label)=>`<label class="row" style="gap:8px;min-height:40px"><input type="checkbox" data-pubchk="${k}" ${o[k]?'checked':''}> ${label}</label>`;
 const parts=[o.score?'คะแนนและเกรดรายวิชา':'เกรดรายวิชา (ไม่แสดงคะแนน)','GPA และหน่วยกิต'];if(o.ev)parts.push('ผลประเมินคุณลักษณะ / อ่าน คิดวิเคราะห์ เขียน');if(o.act)parts.push('ผลกิจกรรม');if(o.pdf)parts.push('ดาวน์โหลดใบแจ้งผล PDF');
 return `<div class="stack">
 <div class="card stack"><h3>นักเรียนจะเห็นอะไรบ้าง · ภาคเรียนที่ ${T}</h3><div class="small muted">ใช้กับทุกชั้นในภาคเรียนนี้ เปลี่ยนได้ทุกเมื่อ และมีผลทันทีโดยไม่ต้องเผยแพร่ใหม่</div>
 <div class="row"><b>ผลรายวิชา</b>${seg(true,'คะแนน + เกรด')}${seg(false,'เกรดอย่างเดียว')}</div>
 <div class="row" style="gap:4px 18px">${chk('ev','ผลประเมินคุณลักษณะ / อ่าน คิดวิเคราะห์ เขียน')}${chk('act','ผลกิจกรรมพัฒนาผู้เรียน')}${chk('pdf','ให้ดาวน์โหลดใบแจ้งผล (PDF)')}</div>
 <div class="lock small"><b>สรุป</b> นักเรียนจะเห็น ${parts.join(' · ')}</div>
 <div class="row small"><span>ลิงก์สำหรับนักเรียน:</span><code>${esc(location.origin)}/student</code><button class="btn sm alt" data-act="pubcopy">คัดลอกลิงก์</button></div></div>
 <div class="card stack"><div class="row" style="justify-content:space-between"><h3>สถานะรายชั้น</h3><span class="small muted">เผยแพร่แล้ว ${pubN} ชั้น</span></div>
 <div class="tw"><table><thead><tr><th>ชั้น</th><th>นักเรียน</th><th>ครูส่งผลแล้ว</th><th>สถานะ</th><th></th></tr></thead><tbody>${rows||'<tr><td colspan="5" class="empty">ยังไม่มีนักเรียน</td></tr>'}</tbody></table></div>
 <div class="small muted">การเผยแพร่จะคัดลอกผล ณ เวลาที่กดไปให้นักเรียนดู หากครูแก้คะแนนภายหลัง ชั้นนั้นจะขึ้นสถานะ “มีการแก้ไขหลังเผยแพร่” ให้กดเผยแพร่ใหม่อีกครั้ง · นักเรียนเข้าดูด้วยเลขประจำตัวนักเรียน</div></div></div>`;};
reg('click',e=>{const t=e.target.closest('[data-pub],[data-unpub],[data-pubopt],[data-act=pubcopy]');if(!t||!$('#view'))return;const d=t.dataset;
 if(d.pub)pubLevel(d.pub);else if(d.unpub)unpubLevel(d.unpub);else if(d.pubopt)pubSetOpt(d.pubopt,d.v==='1');
 else if(d.act==='pubcopy'){try{navigator.clipboard.writeText(location.origin+'/student');toast('คัดลอกลิงก์แล้ว');}catch(err){toast(location.origin+'/student');}}});
reg('change',e=>{const t=e.target;if(t.dataset&&t.dataset.pubchk)pubSetOpt(t.dataset.pubchk,t.checked);});
// ===== กรอกคะแนนผ่าน Excel / Google ชีต: ดาวน์โหลดแบบฟอร์ม → กรอก → แนบกลับ ระบบกรอกให้อัตโนมัติ =====
function scoreTplRows(code){const c=CAT.find(x=>x.code===code),cfg=cfgOf(code),F=fulls(code),H=cfg.hours,R=calc(code),useAb=!attHas(code,S.term);
 const head=['รหัสระบบ (ห้ามแก้)','เลขที่','เลขประจำตัว','ชื่อ-สกุล',...cfg.cols.map(k=>`${k.n} (เต็ม ${k.max})`),`ปลายภาค (เต็ม ${F.fin})`,...(useAb?[`ชั่วโมงที่ขาด (เต็ม ${H})`]:[])];
 const nv=x=>x===''||x==null?'':+x;
 const rows=R.map(r=>[r.s.id,r.s.no,r.s.sid||'',r.s.name,...cfg.cols.map((k,i)=>nv(r.v.c[i])),nv(r.v.f),...(useAb?[r.a[S.term]>0?r.a[S.term]:'']:[])]);
 return {c,cfg,F,H,useAb,head,rows};}
function scoreTplDownload(){const code=S.scCode;if(!code)return;const X=scoreTplRows(code),c=X.c;
 const title=`แบบกรอกคะแนน ${c.code} ${c.name} ${c.level} ${isPri(c.level)?'ภาคเรียนที่ '+S.term+' ':'ภาคเรียนที่ '+S.term+' '}ปีการศึกษา ${S.year}`;
 const note='กรอกเฉพาะคอลัมน์คะแนน (ตั้งแต่คอลัมน์ E) · ห้ามแก้คอลัมน์ รหัสระบบ เลขที่ ชื่อ · ช่องที่เว้นว่าง ระบบจะไม่เปลี่ยนคะแนนเดิม';
 saveFile(`แบบกรอกคะแนน_${c.code}_${c.level}_ภาค${S.term}_${S.year}.xlsx`,buildXlsx([{name:c.code,head:3,widths:[22,7,13,30,...X.head.slice(4).map(()=>18)],rows:[[title],[note],X.head,...X.rows]}]));
 toast('ดาวน์โหลดแบบกรอกคะแนนแล้ว');}
async function scoreImport(file){const code=S.scCode;if(!code||!file)return;
 if(S.sub[SUBK(code,S.term)]&&!isAdmin())return toast('วิชานี้ส่งผลแล้ว กด “ยกเลิกส่ง” ก่อนนำเข้าคะแนน');
 let T;try{T=await readTable(file);}catch(e){return tell({title:'อ่านไฟล์ไม่ได้',text:'รองรับไฟล์ .xlsx (Excel / Google ชีต: ไฟล์ → ดาวน์โหลด → Microsoft Excel) และ .csv\n\n'+(e.message||e),tone:'warn'});}
 const X=scoreTplRows(code),hi=T.findIndex(r=>String(r[0]||'').startsWith('รหัสระบบ'));
 if(hi<0)return tell({title:'ไม่ใช่แบบกรอกคะแนนของระบบ',text:'ไม่พบหัวคอลัมน์ “รหัสระบบ” ให้ดาวน์โหลดแบบกรอกคะแนนจากหน้านี้ แล้วกรอกในไฟล์นั้น',tone:'warn'});
 const H0=T[hi].map(x=>String(x||'').trim());
 if(T.slice(0,hi).some(r=>String(r[0]||'').includes('แบบกรอกคะแนน')&&!String(r[0]).includes(code)))return tell({title:'ไฟล์เป็นของวิชาอื่น',text:`ไฟล์นี้ไม่ใช่แบบกรอกคะแนนของ ${code} ตรวจว่าเลือกวิชาถูกต้อง`,tone:'warn'});
 if(H0.length<X.head.length||X.head.some((h,i)=>H0[i]!==h))return tell({title:'ช่องคะแนนไม่ตรงกับที่ตั้งไว้ตอนนี้',text:'ช่องคะแนนเก็บหรือคะแนนเต็มถูกเปลี่ยนหลังดาวน์โหลดแบบฟอร์ม ให้ดาวน์โหลดแบบกรอกคะแนนใหม่แล้วกรอกอีกครั้ง',tone:'warn'});
 const sk=TK(code),ids=new Set(X.rows.map(r=>r[0])),err=[];let n=0,stu=0;const nc=X.cfg.cols.length;
 const maxOf=i=>i<nc?+X.cfg.cols[i].max:i===nc?X.F.fin:X.H;
 T.slice(hi+1).forEach((r,ri)=>{const id=String(r[0]||'').trim();if(!id)return;if(!ids.has(id)){err.push(`แถว ${hi+ri+2}: ไม่พบนักเรียน (รหัสระบบถูกแก้หรือไม่ใช่ห้องนี้)`);return;}
  const row=(S.scores[sk]=S.scores[sk]||{})[id]||(S.scores[sk][id]={c:[],f:''});let touched=false;
  for(let i=0;i<nc+1+(X.useAb?1:0);i++){const raw=r[4+i];if(raw===''||raw==null)continue;const v=+String(raw).replace(',','.');
   if(isNaN(v)||v<0||v>maxOf(i)){err.push(`${r[3]||id}: ${X.head[4+i]} ค่า “${raw}” ไม่ถูกต้อง (0–${maxOf(i)})`);continue;}
   if(i<nc)row.c[i]=v;else if(i===nc)row.f=v;else{const a=(S.ab[code]=S.ab[code]||{});(a[id]=a[id]||{})[S.term]=v;}n++;touched=true;}
  if(touched)stu++;});
 render();
 tell({title:err.length?`นำเข้าแล้ว แต่มีข้อผิดพลาด ${err.length} รายการ`:'นำเข้าคะแนนเรียบร้อย',text:`กรอกคะแนนให้ ${stu} คน รวม ${n} ช่อง${err.length?'\n\nช่องที่ข้าม (คะแนนเดิมไม่เปลี่ยน):\n'+err.slice(0,15).join('\n')+(err.length>15?`\n… และอีก ${err.length-15} รายการ`:''):''}\n\nตรวจคะแนนในตาราง แล้วกด “ส่งผล” ตามปกติ`,tone:err.length?'warn':'ok'});}
function scoreXlCard(){return `<div class="card stack"><h3>กรอกคะแนนผ่าน Excel / Google ชีต</h3>
 <ol class="small" style="margin:0;padding-left:20px;display:grid;gap:4px">
 <li>กด <b>ดาวน์โหลดแบบกรอกคะแนน</b> ไฟล์มีรายชื่อนักเรียนและช่องคะแนนตามที่ตั้งไว้ด้านบน (ตั้งช่องคะแนนเก็บให้เสร็จก่อนดาวน์โหลด)</li>
 <li>เปิดด้วย <b>Excel</b> หรืออัปโหลดเข้า <b>Google Drive</b> แล้วเปิดด้วย Google ชีต</li>
 <li>กรอกคะแนนตั้งแต่คอลัมน์ E เป็นต้นไป · <b>ห้ามแก้</b> คอลัมน์รหัสระบบ เลขที่ และชื่อ · ช่องที่เว้นว่างระบบจะไม่เปลี่ยนคะแนนเดิม</li>
 <li>บันทึกเป็น <b>.xlsx</b> (Google ชีต: ไฟล์ → ดาวน์โหลด → Microsoft Excel (.xlsx) หรือ .csv)</li>
 <li>กด <b>แนบไฟล์คะแนน</b> ระบบกรอกให้อัตโนมัติ ตรวจคะแนนเต็มให้ และบอกช่องที่ผิด จากนั้นตรวจในตารางแล้วกด <b>ส่งผล</b> ตามปกติ</li></ol>
 <div class="row"><button class="btn sm" data-act="xltpl">ดาวน์โหลดแบบกรอกคะแนน (Excel)</button><label class="btn sm alt" style="cursor:pointer">แนบไฟล์คะแนน (.xlsx / .csv)<input type="file" accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv" data-xlimp hidden></label></div></div>`;}
reg('click',e=>{const t=e.target.closest('[data-act=xltpl]');if(t&&$('#view')&&$('#view').contains(t))scoreTplDownload();});
reg('change',e=>{const t=e.target;if(t.dataset&&t.dataset.xlimp!==undefined&&t.files&&t.files[0]){const f=t.files[0];t.value='';scoreImport(f);}});
const PRI_L=['ป.1','ป.2','ป.3','ป.4','ป.5','ป.6'];
reg('click',e=>{const t=e.target.closest('[data-rl],[data-act=rdl]');if(!t)return;const d=t.dataset;
 if(d.rl){S.rpLevel=d.rl;S.rpStu=null;render();}
 else{const L=S.rpLevel||'ป.3',s=STU.find(x=>x.id===S.rpStu)||STU.find(x=>x.level===L);toast('ตัวอย่าง: ระบบจริงจะดาวน์โหลด '+(d.w==='all'?rname(L,null):rname(L,s)));}});
reg('change',e=>{const t=e.target;if(t.id==='rpst'){S.rpStu=t.value;render();}else if(t.dataset.rsg){const L=S.rpLevel||'ป.3';(S.rpt[L]=S.rpt[L]||{})[t.dataset.rsg]=t.checked;render();}});

function stickNames(){document.querySelectorAll('#view .tw').forEach(w=>{const t=w.querySelector('table'),h=t&&t.querySelector('thead tr');if(!h)return;if(w.scrollWidth<=w.clientWidth+2){w.classList.remove('stk','stk1');return;}
 const th=[...h.children],i=th.findIndex(x=>/ชื่อ/.test(x.textContent)&&!(x.colSpan>1));if(i<0||i>1)return;
 w.classList.add('stk');w.classList.toggle('stk1',i===0);w.style.setProperty('--w0',th[0].offsetWidth+'px');});}
/* ---------- ชุมนุม ---------- */
function clubOfStu(id, except) { return Object.entries(S.members).find(([n, m]) => n !== except && (m.ids || []).includes(id)) }
// ประถมตัดสินผลกิจกรรมเมื่อจบภาคเรียนที่ 2 (ผลทั้งปี) ภาคเรียนที่ 1 จัดสมาชิกได้แต่ยังตัดสินไม่ได้
const clubJudge = (s) => !(isPri(s.level) && S.term === 1)
function clubsHtml() {
  const admin = isAdmin(), clubs = Object.entries(S.members).sort((a, b) => a[0].localeCompare(b[0], 'th'))
  const L = S.clubLv, pool = ACT().filter((s) => s.level === L)
  const tOpts = (cur) => TEACHERS.map((t) => `<option value="${t.uid}" ${cur === t.uid ? 'selected' : ''}>${esc(t.name)}</option>`).join('')
  const dup = ACT().map((s) => [s, Object.entries(S.members).filter(([, m]) => (m.ids || []).includes(s.id)).map(([n]) => n)]).filter(([, a]) => a.length > 1)
  return `<div class="card stack"><h3>ชุมนุม</h3>
  <div class="small muted">แอดมินสร้างชุมนุมและมอบหมายครูผู้สอนได้ · ครูสร้างชุมนุมของตนเองได้ · ครูผู้สอนชุมนุมเลือกสมาชิกและตัดสินผล · นักเรียน 1 คนอยู่ได้ 1 ชุมนุม${S.term === 1 ? ' · <b>ประถมตัดสินผลชุมนุมในภาคเรียนที่ 2</b> (ภาคเรียนที่ 1 จัดสมาชิกไว้ก่อนได้)' : ''}</div>
  <div class="row"><input id="clubn" placeholder="ชื่อชุมนุมใหม่ เช่น ชุมนุมศิลปะ" size="26">${admin ? `<select id="clubt" aria-label="ครูผู้สอนชุมนุม"><option value="">ครูผู้สอน: ตัวฉันเอง</option>${tOpts('')}</select>` : ''}<button class="btn sm" data-act="newclub">สร้างชุมนุม</button></div>
  ${dup.length ? `<div class="lock small"><b>นักเรียนอยู่มากกว่า 1 ชุมนุม ${dup.length} คน</b> — ให้เอาออกจากชุมนุมที่ไม่ใช่<br>${dup.map(([s, a]) => `${esc(s.level)} ${esc(s.name)}: ${a.map(esc).join(', ')}`).join('<br>')}</div>` : ''}
  ${clubs.map(([name, m]) => {
    const mine = m.owner === S.role || admin, ids = m.ids || []
    if (!mine) return `<div class="lock small">${esc(name)} — ครูผู้สอน: ${esc(USERS[m.owner].name)} · สมาชิก ${ids.length} คน (ไม่ใช่ชุมนุมของคุณ)</div>`
    const members = STU.filter((s) => ids.includes(s.id)).sort((a, b) => a.level.localeCompare(b.level, 'th') || (a.no || 0) - (b.no || 0))
    const chips = pool.map((s) => { const on = ids.includes(s.id), o = on ? null : clubOfStu(s.id, name)
      return `<button class="chip mem${o ? ' taken' : ''}" aria-pressed="${on}" data-mem="${s.id}" data-club="${esc(name)}" title="${o ? 'อยู่ชุมนุม ' + esc(o[0]) + ' แล้ว' : ''}">${esc(s.name)}${o ? ` <small>· ${esc(o[0])}</small>` : ''}</button>` }).join('')
    const judgeable = members.filter(clubJudge).length
    return `<div class="card stack" style="background:var(--bg,#fff)"><div class="row" style="justify-content:space-between"><b>${esc(name)}</b>
    <span class="small muted">ครูผู้สอน: ${admin ? `<select data-clubowner="${esc(name)}" aria-label="ครูผู้สอนชุมนุม ${esc(name)}">${TEACHERS.some((t) => t.uid === m.owner) ? '' : `<option value="${m.owner}" selected>${esc(USERS[m.owner].name)}</option>`}${tOpts(m.owner)}</select>` : esc(USERS[m.owner].name)}</span></div>
    <div class="row">${LEVELS.map((l) => `<button class="chip" aria-pressed="${l === L}" data-clublv="${l}">${l}</button>`).join('')}</div>
    <div class="mgrid">${chips || '<span class="small muted">ไม่มีนักเรียนในชั้นนี้</span>'}</div>
    <div class="row small">สมาชิก ${members.length} คน
      ${pool.length ? `<button class="btn sm alt" data-act="cluballlv" data-club="${esc(name)}">เลือกทั้งชั้น ${L}</button><button class="btn sm alt" data-act="clubnonelv" data-club="${esc(name)}">เอาออกทั้งชั้น ${L}</button>` : ''}
      ${judgeable ? `<button class="btn sm alt" data-act="clubpass" data-club="${esc(name)}">ผ่านทั้งชุมนุม</button>` : ''}
      <button class="btn sm alt" data-act="delclub" data-club="${esc(name)}">ลบชุมนุม</button></div>
    ${members.length ? `<div class="tw"><table><thead><tr><th>ชื่อ</th><th>ชั้น</th><th>ผล</th></tr></thead><tbody>${members.map((s) => `<tr><td>${esc(s.name)}</td><td>${s.level}</td><td>${clubJudge(s) ? `<select data-cv="${s.id}" data-club="${esc(name)}" aria-label="ผลของ ${esc(s.name)}"><option value="">-</option><option ${(m.v || {})[s.id] === 'ผ' ? 'selected' : ''}>ผ</option><option ${(m.v || {})[s.id] === 'มผ' ? 'selected' : ''}>มผ</option></select>` : '<span class="small muted">ตัดสินภาคเรียนที่ 2</span>'}</td></tr>`).join('')}</tbody></table></div>` : ''}</div>`
  }).join('') || '<div class="small muted">ยังไม่มีชุมนุม</div>'}</div>`
}
function homeroomCard() {
  if (!isAdmin()) return ''
  const label = (t) => esc(t.name) + (TEACHERS.filter((x) => x.name === t.name).length > 1 ? ` (${esc(t.username || '')})` : '') + (t.role === 'teacher' ? '' : t.role === 'superadmin' ? ' · แอดมินหลัก' : ' · แอดมิน')
  const sel = (L, i) => { const cur = (HOMEROOM[L] || [])[i] || ''; return `<select data-hrsel="${L}" data-slot="${i}" aria-label="ครูที่ปรึกษา ${L} คนที่ ${i + 1}"><option value="">${i ? '— ไม่มี —' : '— ยังไม่กำหนด —'}</option>${TEACHERS.map((t) => `<option value="${t.uid}" ${cur === t.uid ? 'selected' : ''}>${label(t)}</option>`).join('')}</select>` }
  return `<div class="card stack"><h3>ครูที่ปรึกษาประจำชั้น</h3><div class="small muted">เลือกจากรายชื่อ ครูผู้สอนและแอดมินที่สอนด้วยเป็นที่ปรึกษาได้ ชั้นละไม่เกิน 2 คน คนที่ 1 เป็นผู้ลงนามในใบแจ้งผล ครูที่ปรึกษากรอกกิจกรรมพัฒนาผู้เรียนของห้องได้</div>
  ${TEACHERS.length ? `<div class="hrgrid">${LEVELS.map((l) => `<div class="hrc"><b>${l}</b><label>คนที่ 1 (ผู้ลงนาม)${sel(l, 0)}</label><label>คนที่ 2${sel(l, 1)}</label></div>`).join('')}</div>` : '<span class="small muted">ยังไม่มีบัญชีครู</span>'}</div>`
}


/* ---------- สรุปผลรายห้อง ---------- */
function sumLevels() { return (S.tpl || isAdmin()) ? LEVELS : LEVELS.filter((l) => (HOMEROOM[l] || []).includes(S.role)) }
function sumData(L) {
  const D = rptData(L, S.term), M = D.mode
  const clubOf = (s) => { const m = Object.values(S.members).find((m) => (m.ids || []).includes(s.id)); return m ? ((m.v || {})[s.id] || '-') : '-' }
  const actOf = (s, a) => (a === 'ชุมนุม' ? clubOf(s) : (((S.acts[L + '|' + a] || {}).v || {})[s.id] || '-'))
  const rows = D.stus.map((s) => {
    const rs = D.cal.map((x) => x.R.find((q) => q.s.id === s.id))
    const cells = rs.map((r) => (M === 'p1' ? (r.cur == null ? '' : Math.round(r.cur * 10) / 10) : (r.g == null ? '' : r.g)))
    // ช่องว่าง = ยังคำนวณเกรดไม่ได้ เพราะคะแนนยังไม่ครบ (ระบุว่าขาดส่วนไหน)
    const miss = rs.map((r) => (r.g != null && M !== 'p1') || (M === 'p1' && r.cur != null) ? '' :
      [r.mid == null ? 'คะแนนเก็บ' : '', r.fin == null ? 'คะแนนสอบปลายภาค' : '', M === 'p2' && r.pr == null && r.cur != null ? 'คะแนนภาคเรียนที่ 1' : ''].filter(Boolean).join(' และ ') || 'คะแนน')
    // GPA ถ่วงด้วยหน่วยกิต/น้ำหนัก และใช้ผลแก้ตัว (ถ้ามี) แบบเดียวกับใบแจ้งผล
    const eff = D.cal.map((x, i) => { const fx = ((S.fix[x.c.code + '|' + D.T] || {})[s.id] || {}).after, a = String(fx ?? '').trim(); return a !== '' && !isNaN(+a) ? +a : (typeof rs[i].g === 'number' ? rs[i].g : null) })
    const wt = D.cal.map((x) => credOf(x.c.code, D.T, D.pri))
    const gi = eff.map((g, i) => [g, wt[i]]).filter(([g]) => g != null), wsum = gi.reduce((a, [, w]) => a + w, 0)
    const ap = rs.filter((r) => r.pct != null)
    return { s, cells, miss, gpa: M === 'p1' ? null : (wsum ? gi.reduce((a, [g, w]) => a + g * w, 0) / wsum : null),
      att: ap.length ? ap.reduce((a, r) => a + r.pct, 0) / ap.length : null,
      ms: rs.filter((r) => r.g === 'มส').length, ro: rs.filter((r) => r.g === 'ร').length,
      acts: ACTS.map((a) => actOf(s, a)) }
  })
  return { D, rows, M }
}
const SUM_NOTE = { p1: 'ภาคเรียนที่ 1 ประถม: คะแนนเต็มวิชาละ 50 ยังไม่ตัดสินระดับผลการเรียน', p2: 'ผลการเรียนทั้งปีของประถม (ภาคเรียนที่ 1 + 2 = 100)', s: 'ผลการเรียนมัธยมของภาคเรียนนี้' }
function sumTable(L, forPrint) {
  const { D, rows, M } = sumData(L), sh = (c) => c.name.replace(/\s+\d+$/, '')
  const head = D.cal.map((x) => (forPrint ? `<th class="rot"><span class="rv">${esc(x.c.code)} ${esc(sh(x.c))}</span></th>` : `<th title="${esc(x.c.name)}">${esc(x.c.code)}<br><span class="small">${esc(sh(x.c))}</span></th>`)).join('')
  const ah = ACTS.map((a) => (forPrint ? `<th class="rot"><span class="rv">${esc(a.length > 14 ? a.slice(0, 14) + '…' : a)}</span></th>` : `<th>${esc(a.length > 12 ? a.slice(0, 12) + '…' : a)}</th>`)).join('')
  const cell = (c, i, r) => (c !== '' ? c : forPrint ? '-' : `<span class="pill p-warn" title="ยังไม่มี${esc(r.miss[i])} กรอกให้ครบที่หน้าบันทึกคะแนน">ไม่ครบ</span>`)
  const body = rows.map((r) => `<tr><td class="num">${r.s.no}</td><td>${esc(r.s.name)}</td>${r.cells.map((c, i) => `<td class="num">${cell(c, i, r)}</td>`).join('')}<td class="num">${r.gpa == null ? '-' : r.gpa.toFixed(2)}</td><td class="num">${r.att == null ? '-' : r.att.toFixed(0)}</td>${r.acts.map((a) => `<td class="num">${a}</td>`).join('')}</tr>`).join('')
  return `<table class="rt2 sumt"><thead><tr><th>ที่</th><th>ชื่อ-สกุล</th>${head}<th>${M === 'p1' ? '-' : 'GPA'}</th><th>เวลา %</th>${ah}</tr></thead><tbody>${body}</tbody></table>`
}
function sumPage(L) {
  const { D } = sumData(L), hr = (HOMEROOM[L] || []).map((h) => USERS[h].name).join(', ')
  return `<div class="pg sum"><style>.sum th,.sum td{font-size:10.5pt!important;padding:0 2px!important;line-height:1.05}.sum th.rot{height:40mm}.sum td:nth-child(2){text-align:left;white-space:nowrap}.sum h3{font-size:15pt!important}</style>
  <h3 style="text-align:center">สรุปผลการเรียนรายห้อง ชั้น ${L} ภาคเรียนที่ ${D.T} ปีการศึกษา ${S.year}</h3>
  <div style="text-align:center">${esc(S.school.name)}</div>${sumTable(L, true)}
  <div class="small">${SUM_NOTE[D.mode]} · ร = รอการตัดสิน มส = ไม่มีสิทธิ์รับการตัดสิน · ผ = ผ่าน มผ = ไม่ผ่าน</div>
  <div class="small">ครูที่ปรึกษา: ${esc(hr || '-')}</div></div>`
}
P.summary = () => {
  const lv = sumLevels()
  if (!lv.length) return '<div class="card empty">หน้านี้สำหรับแอดมินและครูที่ปรึกษาประจำชั้น (แอดมินกำหนดครูที่ปรึกษาที่หน้า "ตั้งค่าโรงเรียน")</div>'
  if (!lv.includes(S.sumLv)) S.sumLv = lv[0]
  const L = S.sumLv, { D, rows, M } = sumData(L)
  return `<div class="stack"><div class="row">${lv.map((l) => `<button class="chip" aria-pressed="${l === L}" data-sumlv="${l}">${l}</button>`).join('')}</div>
  <div class="row">${[1, 2].map((t) => `<button class="chip" aria-pressed="${S.term === t}" data-term="${t}">ภาคเรียนที่ ${t}</button>`).join('')}</div>
  <div class="card stack"><h3>สรุปผลการเรียนรายห้อง ${L} ภาคเรียนที่ ${D.T}</h3><div class="small muted">${SUM_NOTE[M]}</div>
  ${D.stus.length && D.cal.length ? `<div class="row"><button class="btn sm" data-act="sumdl" data-f="PDF">PDF</button><button class="btn sm alt" data-act="sumdl" data-f="Excel">Excel</button></div>
  <div class="tw">${sumTable(L, false)}</div>
  <div class="small muted">รวม มส. ${rows.reduce((a, r) => a + r.ms, 0)} รายการ · ร ${rows.reduce((a, r) => a + r.ro, 0)} รายการ · GPA ถ่วงด้วย${D.pri ? 'น้ำหนัก' : 'หน่วยกิต'}แบบเดียวกับใบแจ้งผล</div>
  ${(() => { const L2 = []; rows.forEach((r) => r.miss.forEach((m, i) => { if (m) L2.push(`${r.s.no}. ${esc(r.s.name)} · ${esc(D.cal[i].c.code)} ${esc(D.cal[i].c.name)}: ยังไม่มี${esc(m)}`) })); return L2.length ? `<div class="lock small"><b>คะแนนยังไม่ครบ ${L2.length} รายการ (ช่อง "ไม่ครบ" ในตาราง)</b><div style="max-height:180px;overflow:auto">${L2.join('<br>')}</div></div>` : '' })()}` : '<div class="empty">ชั้นนี้ยังไม่มีนักเรียนหรือรายวิชาที่เปิดสอนในภาคเรียนนี้</div>'}</div></div>`
}
function sumName(L, ext) { return `สรุปผลการเรียน_${L}_ภาคเรียน${S.term}_ปีการศึกษา${S.year}.${ext}`.replace(/[\\/:*?"<>|]/g, '') }
function downloadSummary(f) {
  const L = S.sumLv, { D, rows, M } = sumData(L)
  if (f === 'PDF') return exportPdf(sumName(L, 'pdf').replace(/\.pdf$/, ''), sumPage(L))
  const sh = (c) => c.name.replace(/\s+\d+$/, '')
  const head = ['เลขที่', 'ชื่อ-สกุล', ...D.cal.map((x) => `${x.c.code} ${sh(x.c)}`), M === 'p1' ? '' : 'GPA', 'เวลาเรียนเฉลี่ย %', ...ACTS, 'มส.', 'ร']
  const data = rows.map((r) => [r.s.no, r.s.name, ...r.cells.map((c) => (c === '' ? '' : (typeof c === 'number' ? c : String(c)))), r.gpa == null ? '' : Math.round(r.gpa * 100) / 100, r.att == null ? '' : Math.round(r.att * 10) / 10, ...r.acts, r.ms, r.ro])
  saveFile(sumName(L, 'xlsx'), buildXlsx([{ name: `${L} ภาค ${S.term}`, head: 2, widths: [8, 30, ...D.cal.map(() => 16), 8, 12, ...ACTS.map(() => 14), 6, 6], rows: [[`สรุปผลการเรียนรายห้อง ${L} ภาคเรียนที่ ${D.T} ปีการศึกษา ${S.year} (${SUM_NOTE[M]})`], head, ...data] }]))
}

/* ---------- ดาวน์โหลด / พิมพ์ ---------- */
const WORD_NS = 'xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"'
function pageDoc(title, inner, word) {
  return `<!doctype html><html ${word ? WORD_NS : ''}><head><meta charset="utf-8"><title>${esc(title)}</title><style>${printCss(location.origin)}${word ? '' : ''}</style></head><body>${inner}</body></html>`
}
async function printPages(title, inner) {
  // เปิดเป็นหน้า Blob (รีเฟรชได้ ไม่ค้าง) พร้อมแถบปุ่มพิมพ์ — สั่งพิมพ์อัตโนมัติเฉพาะครั้งแรก และรอให้ภาพโหลดครบก่อน
  const w = window.open('about:blank', '_blank')
  if (!w) return toast('เบราว์เซอร์บล็อกหน้าต่างใหม่ กรุณาอนุญาต pop-up แล้วกดอีกครั้ง')
  try { w.document.title = title; w.document.body.innerHTML = '<p style="font:18px sans-serif;padding:24px">กำลังเตรียมเอกสาร…</p>' } catch { /* ไม่เป็นไร */ }
  let body = inner
  try { // ฝังโลโก้เป็นภาพในตัว กันภาพไม่ขึ้นในหน้าใหม่
    const blob = await (await fetch(LOGO)).blob()
    const du = await new Promise((ok) => { const r = new FileReader(); r.onload = () => ok(r.result); r.readAsDataURL(blob) })
    body = body.split(LOGO).join(du)
  } catch { /* ใช้ลิงก์เดิม */ }
  const bar = '<div class="noprint" style="position:sticky;top:0;z-index:9;display:flex;gap:10px;align-items:center;justify-content:center;padding:10px;background:#7a1010;color:#fff;font:16px sans-serif"><span>ตัวอย่างก่อนพิมพ์ — เลือก “บันทึกเป็น PDF” ที่ปลายทางเครื่องพิมพ์</span><button onclick="print()" style="padding:8px 18px;border:0;border-radius:8px;background:#f5c542;font:bold 16px sans-serif;cursor:pointer">พิมพ์ / บันทึก PDF</button><button onclick="window.close()" style="padding:8px 14px;border:0;border-radius:8px;background:#fff;font:16px sans-serif;cursor:pointer">ปิด</button></div><style>@media print{.noprint{display:none!important}}@media screen{body{background:#ddd}}</style>'
  const scr = '<script>addEventListener("load",function(){var n=performance.getEntriesByType&&performance.getEntriesByType("navigation")[0];if(n&&n.type==="reload")return;var im=[].slice.call(document.images).map(function(i){return i.complete?1:new Promise(function(r){i.onload=i.onerror=r})});Promise.all(im).then(function(){return document.fonts&&document.fonts.ready}).then(function(){setTimeout(function(){print()},500)})})<\/script>'
  const html = pageDoc(title, bar + body).replace('<head>', `<head><base href="${location.origin}/">`).replace('</body>', scr + '</body>')
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }))
  w.location.replace(url)
  setTimeout(() => URL.revokeObjectURL(url), 10 * 60 * 1000)
}
function saveBlob(name, mime, text) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob(['﻿', text], { type: mime + ';charset=utf-8' }))
  a.download = name; document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 4000)
}
// PDF: คอม/โน้ตบุ๊กใช้หน้าต่างพิมพ์ของเบราว์เซอร์ ส่วนไอแพด/มือถือให้เซิร์ฟเวอร์สร้างไฟล์ PDF ให้ดาวน์โหลดตรง ๆ
const isTouchDevice = () => /iPad|iPhone|iPod|Android/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Mac/i.test(navigator.platform))
let forcePrint = false
async function exportPdf(title, inner) {
  if (!isTouchDevice() || forcePrint) { forcePrint = false; return printPages(title, inner) }
  const html = pageDoc(title, inner)
  if (html.length > 3800000) { forcePrint = true; return toast('ไฟล์ใหญ่เกินไปสำหรับสร้างบนเซิร์ฟเวอร์ กดปุ่ม PDF อีกครั้งเพื่อใช้วิธีพิมพ์') }
  toast('กำลังสร้างไฟล์ PDF…')
  try {
    const token = await auth.currentUser.getIdToken()
    const r = await fetch('/api/pdf', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify({ html }) })
    if (!r.ok) throw new Error('status ' + r.status)
    saveFile(title + '.pdf', await r.blob())
    toast('สร้างไฟล์ PDF แล้ว')
  } catch (err) {
    console.error(err)
    forcePrint = true
    toast('สร้าง PDF บนเซิร์ฟเวอร์ไม่สำเร็จ กดปุ่ม PDF อีกครั้งเพื่อใช้วิธีพิมพ์แทน')
  }
}
function bookPages() { return [...document.querySelectorAll('#view .pg')].map((e) => e.outerHTML).join('') }
function sheetXlsx(c) {
  const cfg = cfgOf(c.code), R = calc(c.code), pri = isPri(c.level), t2 = pri && S.term === 2, F = fulls(c.code)
  const th = ['เลขที่', 'ชื่อ-สกุล', ...cfg.cols.map((k) => `${k.n} (${k.max})`), 'รวมระหว่างภาค', `ปลายภาค (${F.fin})`, 'ชั่วโมงที่ขาด', 'เวลาเรียน %'].concat(pri ? (t2 ? ['ภาคเรียน 1 (50)', 'ภาคเรียน 2 (50)', 'รวมทั้งปี', 'เกรด'] : ['ภาคเรียน 1 (50)']) : ['รวม', 'เกรด'])
  const n = (x) => (x == null || x === '' ? '' : Math.round(x * 10) / 10)
  const rows = R.map((r) => [r.s.no, r.s.name, ...cfg.cols.map((k, i) => (r.v.c[i] === '' || r.v.c[i] == null ? '' : +r.v.c[i])), n(r.mid), r.v.f === '' || r.v.f == null ? '' : +r.v.f, r.a[S.term] > 0 ? r.a[S.term] : 0, n(r.pct)].concat(pri ? (t2 ? [n(r.pr), n(r.cur), n(r.sum), r.g ?? ''] : [n(r.cur)]) : [n(r.tot), r.g ?? '']))
  return buildXlsx([{ name: c.code, head: 2, widths: [8, 30, ...th.slice(2).map(() => 14)], rows: [[`${c.code} ${c.name} ${c.level} ปีการศึกษา ${S.year} ${pri ? '' : 'ภาคเรียนที่ ' + S.term}`], th, ...rows] }])
}
function saveFile(name, blob) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 4000)
}
function downloadBook(f) {
  const c = CAT.find((x) => x.code === S.scCode)
  if (!c) return
  const R = calc(c.code), pri = isPri(c.level)
  if ((!pri || S.term === 2) && evMiss(c.code, S.term, R)) return toast('ยังประเมินผู้เรียนไม่ครบ ดาวน์โหลดไม่ได้')
  if (f === 'PDF') exportPdf(fname(c, 'pdf').replace(/\.pdf$/, ''), bookPages())
  else if (f === 'Word') wordBook(c)
  else saveFile(fname(c, 'xlsx'), sheetXlsx(c))
}
// Word (.docx จริง): แปลงหน้า ปพ.5 เป็นตาราง/ย่อหน้าของ Word (ฟอนต์ TH SarabunPSK ต้องมีในเครื่องที่เปิดไฟล์)
async function wordBook(c) {
  try {
    toast('กำลังสร้างไฟล์ Word...')
    saveFile(fname(c, 'docx'), await htmlToDocx(pageDoc(fname(c, 'docx'), bookPages(), true)))
  } catch (e) { console.error(e); toast('สร้างไฟล์ Word ไม่สำเร็จ') }
}
function downloadReport(which) {
  const L = S.rpLevel || 'ป.3', D = rptData(L), s = D.stus.find((x) => x.id === S.rpStu) || D.stus[0]
  if (!s) return
  if (which === 'all' && !S.tpl) exportPdf(rname(L, null, D.T).replace(/\.pdf$/, ''), D.stus.map((x) => rptPage(L, x, D)).join(''))
  else exportPdf(rname(L, s, D.T).replace(/\.pdf$/, ''), rptPage(L, s, D))
}

/* ---------- ตัวจัดการเหตุการณ์หลัก ---------- */
reg('click', (e) => {
  const t = e.target.closest('[data-gk],[data-go],[data-term],[data-actlv],[data-mem],[data-act],[data-hr],[data-clublv],[data-sumlv]')
  if (!t || !$('#view') || !$('#view').contains(t)) return
  const d = t.dataset
  if (d.gk) { S.guideKind = d.gk; render(); return }
  if (d.go) { const [pg, cd] = d.go.split('@'); if (cd) { if (isAdmin() && !myCodes().includes(cd)) S.allSubj = true; S.scCode = cd } CTX.go(pg); return }
  if (d.term) { CTX.setTerm(+d.term); return }
  if (d.sumlv) { S.sumLv = d.sumlv; render(); return }
  if (d.actlv) { S.actLevel = d.actlv; render(); return }
  if (d.clublv) { S.clubLv = d.clublv; render(); return }
  if (d.hr) { const a = (HOMEROOM[d.hr] = HOMEROOM[d.hr] || []), i = a.indexOf(d.uid); if (i < 0) { if (a.length >= 2) return toast('ที่ปรึกษาห้องละไม่เกิน 2 คน'); a.push(d.uid) } else a.splice(i, 1); render(); return }
  if (d.mem) {
    const m = S.members[d.club]; m.ids = m.ids || []; const k = m.ids.indexOf(d.mem)
    if (k >= 0) { m.ids.splice(k, 1); m.v && delete m.v[d.mem]; render(); return }
    const o = clubOfStu(d.mem, d.club), s = STU.find((x) => x.id === d.mem)
    if (!o) { m.ids.push(d.mem); render(); return }
    // นักเรียนชนกับชุมนุมอื่น: แจ้งเตือนและให้เลือกว่าจะย้ายหรือไม่
    ask({ title: 'นักเรียนอยู่ชุมนุมอื่นแล้ว', text: `${s ? s.name : ''} อยู่ "${o[0]}" (ครูผู้สอน: ${USERS[o[1].owner].name}) แล้ว\n\nย้ายมา "${d.club}" ไหม? รายชื่อและผลในชุมนุมเดิมจะถูกลบ`, ok: 'ย้ายมาชุมนุมนี้', cancel: 'ไม่ย้าย' })
      .then((y) => { if (!y) return; const om = S.members[o[0]]; om.ids = (om.ids || []).filter((x) => x !== d.mem); om.v && delete om.v[d.mem]; if (!m.ids.includes(d.mem)) m.ids.push(d.mem); render() })
    return
  }
  const a = d.act
  if (a === 'newclub') { const n = ($('#clubn').value || '').trim(); if (!n) return toast('พิมพ์ชื่อชุมนุม'); if (S.members[n]) return toast('มีชุมนุมชื่อนี้แล้ว'); const ow = (isAdmin() && $('#clubt') && $('#clubt').value) || S.role; S.members[n] = { owner: ow, ids: [], v: {} }; if (ow !== S.role) notify(ow, `${me().name} มอบหมายให้คุณเป็นครูผู้สอนชุมนุม "${n}"`, 'acts'); render() }
  else if (a === 'delclub') { const m = S.members[d.club]; if (m) ask({ title: 'ลบชุมนุม "' + d.club + '" ?', text: 'รายชื่อนักเรียนและผลของชุมนุมนี้จะถูกลบ', ok: 'ลบชุมนุม', danger: true }).then((y) => { if (y) { delete S.members[d.club]; render(); persist() } }) }
  else if (a === 'clubpass') { const m = S.members[d.club]; m.v = m.v || {}; (m.ids || []).forEach((id) => { const s = STU.find((x) => x.id === id); if (s && clubJudge(s)) m.v[id] = 'ผ' }); render() }
  else if (a === 'cluballlv' || a === 'clubnonelv') {
    const m = S.members[d.club]; m.ids = m.ids || []; const pool = ACT().filter((s) => s.level === S.clubLv)
    if (a === 'clubnonelv') { pool.forEach((s) => { m.ids = m.ids.filter((x) => x !== s.id); m.v && delete m.v[s.id] }); render(); return }
    let skip = 0; pool.forEach((s) => { if (m.ids.includes(s.id)) return; if (clubOfStu(s.id, d.club)) { skip++; return } m.ids.push(s.id) })
    render(); if (skip) toast(`เพิ่มแล้ว · ข้าม ${skip} คนที่อยู่ชุมนุมอื่น (กดที่ชื่อเพื่อย้าย)`)
  }
  else if (a === 'allpass') { if (actLockT(d.key.split('|')[0])) return toast('ประถมตัดสินผลกิจกรรมในภาคเรียนที่ 2'); const st = S.acts[d.key]; if (!claim(d.key)) return; ACT().filter((s) => s.level === d.key.split('|')[0]).forEach((s) => (st.v[s.id] = 'ผ')); render() }
  else if (a === 'release') { S.acts[d.key].owner = null; render() }
  else if (a === 'addcol') { const cf = cfgOf(S.scCode); cf.cols.push({ n: 'ช่องที่ ' + (cf.cols.length + 1), max: 0 }); render() }
  else if (a === 'delcol') {
    // ลบช่องคะแนนเก็บ: ลบคะแนนช่องนั้นของนักเรียนทุกคนด้วย ไม่ให้คะแนนช่องอื่นเลื่อนผิดช่อง
    const i = +d.i, cf = cfgOf(S.scCode), sc = S.scores[TK(S.scCode)] || {}
    const used = Object.values(sc).some((v) => v && v.c && v.c[i] !== '' && v.c[i] != null)
    const del = () => { cf.cols.splice(i, 1); Object.values(sc).forEach((v) => { if (v && Array.isArray(v.c) && v.c.length > i) v.c.splice(i, 1) }); persist(); render() }
    if (!used) del()
    else ask({ title: 'ลบช่อง "' + (cf.cols[i] || {}).n + '"?', text: 'คะแนนที่กรอกไว้ในช่องนี้ของนักเรียนทุกคนจะถูกลบด้วย', ok: 'ลบช่อง', cancel: 'ไม่ลบ', danger: true }).then((y) => y && del())
  }
  else if (a === 'dl') downloadBook(d.f)
  else if (a === 'rdl') downloadReport(d.w)
  else if (a === 'sumdl') downloadSummary(d.f)
})
/* เช็คชื่อรายวัน: ตัวจัดการปุ่ม */
reg('click', (e) => {
  const t = e.target.closest('[data-ac],[data-at]')
  if (!t || !$('#view') || !$('#view').contains(t)) return
  const c = S.scCode, T = S.term, A = attOf(c, T), ids = ACT().filter((x) => x.level === CAT.find((z) => z.code === c).level).map((x) => x.id)
  if (t.dataset.ac) {
    const [sid, d] = t.dataset.ac.split('|'), m = (A.m[sid] = A.m[sid] || {}), n = ATC[(ATC.indexOf(m[d] || '') + 1) % ATC.length]
    if (n) m[d] = n; else delete m[d]
    attRender(); return
  }
  const a = t.dataset.at, h = Math.max(1, Math.min(8, +($('#atth') || {}).value || 1))
  if (a === 'add') {
    const v = $('#attd').value; if (!v) return toast('เลือกวันที่ก่อน')
    const n = attAddDays([v], h); S.attH = h
    const nx = new Date(v + 'T00:00:00'); do nx.setDate(nx.getDate() + 1); while (nx.getDay() === 0 || nx.getDay() === 6)
    S.attLast = isoD(nx); S.attPg = null; toast(n ? 'เพิ่มวันเรียนแล้ว' : 'มีวันนี้อยู่แล้ว'); attRender()
  } else if (a === 'range') {
    const f = $('#attf').value, e2 = $('#attt').value; if (!f || !e2 || e2 < f) return toast('เลือกวันเริ่มและวันสิ้นสุดให้ถูกต้อง')
    const we = $('#attwe').checked, list = [], d = new Date(f + 'T00:00:00'), end = new Date(e2 + 'T00:00:00')
    while (d <= end && list.length < 370) { if (we || (d.getDay() !== 0 && d.getDay() !== 6)) list.push(isoD(d)); d.setDate(d.getDate() + 1) }
    const n = attAddDays(list, h); S.attH = h; toast(`เพิ่มแล้ว ${n} วัน`); attRender()
  } else if (a === 'markhol') {
    if (!S.attD.length) return toast('ติ๊กหัวคอลัมน์วันที่ที่เป็นวันหยุดก่อน')
    const nm = ($('#attholn').value || '').trim(); if (!nm) return toast('พิมพ์ชื่อวันหยุด เช่น วันหยุดพิเศษ')
    const sel = new Set(S.attD); A.days.forEach((x) => { if (sel.has(x.d)) { x.x = nm; Object.values(A.m).forEach((m) => delete m[x.d]) } })
    S.attD = []; toast('ตั้งเป็นวันหยุดแล้ว (ไม่นับชั่วโมง)'); attRender()
  } else if (a === 'unhol') {
    if (!S.attD.length) return toast('ติ๊กหัวคอลัมน์วันที่ที่จะยกเลิกวันหยุดก่อน')
    const sel = new Set(S.attD); A.days.forEach((x) => { if (sel.has(x.d)) delete x.x }); S.attD = []; toast('ยกเลิกวันหยุดแล้ว กลับเป็นวันเรียน'); attRender()
  } else if (a === 'gen') { attGen($('#genf').value, $('#gent').value)
  } else if (a === 'wkprev' || a === 'wknext') {
    S.attPg = Math.max(0, (S.attPg || 0) + (a === 'wkprev' ? -1 : 1)); attRender()
  } else if (a === 'pg') {
    S.attPg = +d.p; attRender()
  } else if (a === 'apply') {
    const st = $('#atss').value, ss = S.attS.length ? S.attS : null, dd = S.attD.length ? S.attD : null
    if (!ss && !dd) return toast('ติ๊กนักเรียน หรือหัวคอลัมน์วันที่ ที่ต้องการก่อน')
    ;(ss || ids).forEach((sid) => { const m = (A.m[sid] = A.m[sid] || {}); (dd || S.attVis || A.days.map((x) => x.d)).filter((d) => !A.days.some((y) => y.d === d && y.x)).forEach((d) => { if (st) m[d] = st; else delete m[d] }) })
    toast('บันทึกแล้ว'); attRender()
  } else if (a === 'selall') { S.attS = ids.slice(); attRender() }
  else if (a === 'selnone') { S.attS = []; S.attD = []; attRender() }
  else if (a === 'allpresent') {
    ask({ title: 'ให้ทุกคนมาเรียนทุกวัน ?', text: 'ล้างสถานะ ขาด/ลา/ป่วย/สาย/หนีเรียน ของภาคเรียนนี้ทั้งหมด (วันเรียนยังอยู่)', ok: 'ล้างทั้งหมด', danger: true }).then((ok) => { if (ok) { A.m = {}; attRender() } })
  } else if (a === 'delday') {
    if (!S.attD.length) return toast('ติ๊กหัวคอลัมน์วันที่ที่จะลบก่อน')
    ask({ title: `ลบวันที่เลือก ${S.attD.length} วัน ?`, text: 'สถานะการมาเรียนของวันเหล่านั้นจะถูกลบด้วย', ok: 'ลบ', danger: true }).then((ok) => {
      if (!ok) return
      const del = new Set(S.attD); A.days = A.days.filter((x) => !del.has(x.d)); Object.values(A.m).forEach((m) => del.forEach((d) => delete m[d])); S.attD = []; attRender()
    })
  }
})
reg('change', (e) => {
  const t = e.target, d = t.dataset
  if (!$('#view') || !$('#view').contains(t)) return
  const tog = (k, v) => { const a = (S[k] = S[k] || []), i = a.indexOf(v); if (t.checked) { if (i < 0) a.push(v) } else if (i >= 0) a.splice(i, 1) }
  if (d.ttd !== undefined) { const A = attOf(S.scCode, S.term); A.tt = A.tt || { h: {} }; A.tt.h[d.ttd] = +t.value; return }
  if (t.id === 'attwk') { S.attWk = t.value; attRender(); return }
  if (d.as !== undefined) tog('attS', d.as)
  else if (d.ad !== undefined) tog('attD', d.ad)
})
reg('change', (e) => {
  const t = e.target
  if (!$('#view') || !$('#view').contains(t)) return
  if (t.dataset.hrsel) { const L = t.dataset.hrsel, v = [...new Set([...document.querySelectorAll(`select[data-hrsel="${L}"]`)].map((x) => x.value).filter(Boolean))]; HOMEROOM[L] = v; render() }
  else if (t.id === 'allsubj') { S.allSubj = t.checked; render() }
  else if (t.id === 'sub') { S.scCode = t.value; render() }
  else if (t.id === 'rt') { cfgOf(S.scCode).ratio = t.value; render() }
  else if (t.id === 'gd') { S.guidance = t.value; render() }
  else if (t.id === 'hrs') { cfgOf(S.scCode).hours = Math.max(1, +t.value || 40); render() }
  else if (t.dataset.ab !== undefined) { const H = cfgOf(S.scCode).hours, a = (S.ab[S.scCode] = S.ab[S.scCode] || {}); (a[t.dataset.ab] = a[t.dataset.ab] || {})[S.term] = t.value === '' ? 0 : Math.max(0, Math.min(H, +t.value)); render() }
  else if (t.id === 'scl') { cfgOf(S.scCode).scale = +t.value; render() }
  else if (t.dataset.cn !== undefined) { cfgOf(S.scCode).cols[+t.dataset.cn].n = t.value }
  else if (t.dataset.cm !== undefined) { cfgOf(S.scCode).cols[+t.dataset.cm].max = Math.max(0, +t.value); render() }
  else if (t.dataset.sc) {
    const sk = TK(S.scCode), row = (S.scores[sk] = S.scores[sk] || {})[t.dataset.sc] || (S.scores[sk][t.dataset.sc] = { c: [], f: '' })
    const max = +t.max, x = t.value === '' ? '' : Math.max(0, Math.min(max, +t.value))
    if (t.dataset.i === 'f') row.f = x; else row.c[+t.dataset.i] = x
    render()
  }
  else if (t.dataset.av) { if (actLockT(t.dataset.av.split('|')[0])) { render(); return } const st = S.acts[t.dataset.av]; if (!claim(t.dataset.av)) { render(); return } st.v[t.dataset.s] = t.value }
  else if (t.dataset.cv) { const m = S.members[t.dataset.club]; m.v = m.v || {}; m.v[t.dataset.cv] = t.value; persist() }
  else if (t.dataset.clubowner) { const m = S.members[t.dataset.clubowner]; if (m && t.value && m.owner !== t.value) { m.owner = t.value; notify(t.value, `${me().name} มอบหมายให้คุณเป็นครูผู้สอนชุมนุม "${t.dataset.clubowner}"`, 'acts'); render() } }
})
// ลูกศร/Enter เลื่อนช่องกรอก (ซ้าย-ขวา-ขึ้น-ลง) ใช้ได้ทั้งในตารางและแถวช่องกรอก (ตั้งค่าคะแนน ฯลฯ)
const NAVSEL = 'input:not([type=checkbox]):not([type=file]):not([type=date]):not([type=hidden]):not([type=radio]),select[data-ev],select[data-evrow]'
const navOk = (x) => x && !x.disabled && x.offsetParent !== null
reg('keydown', (e) => {
  const t = e.target, v = $('#view')
  if (!t || !t.matches || !v || !v.contains(t) || !t.matches(NAVSEL)) return
  const k = e.key
  if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter'].includes(k)) return
  const isSel = t.tagName === 'SELECT'
  if (isSel && k === 'Enter') return
  if (!isSel && t.selectionStart != null && t.type !== 'number') { // ช่องข้อความ: ลูกศรซ้าย/ขวาเลื่อนกล่องเมื่อเคอร์เซอร์อยู่ขอบ
    if (k === 'ArrowLeft' && !(t.selectionStart === 0 && t.selectionEnd === 0)) return
    if (k === 'ArrowRight' && !(t.selectionStart === t.value.length && t.selectionEnd === t.value.length)) return
  }
  const fieldsOf = (c) => [...c.querySelectorAll(NAVSEL)].filter(navOk)
  let target = null
  const td = t.closest('td'), tr = td && td.closest('tr')
  if (tr) {
    const cellIn = (row, ci) => { const c = row && row.cells[ci]; const i = c && c.querySelector(NAVSEL); return navOk(i) ? i : null }
    if (k === 'ArrowLeft' || k === 'ArrowRight') {
      const d = k === 'ArrowLeft' ? -1 : 1
      for (let ci = td.cellIndex + d; ci >= 0 && ci < tr.cells.length; ci += d) { const i = cellIn(tr, ci); if (i) { target = i; break } }
    } else {
      const d = k === 'ArrowUp' ? -1 : 1
      for (let r = tr.sectionRowIndex + d, rows = tr.parentNode.rows; r >= 0 && r < rows.length; r += d) { const i = cellIn(rows[r], td.cellIndex); if (i) { target = i; break } }
    }
  } else {
    const row = t.closest('.row'); if (!row) return
    const fs = fieldsOf(row), idx = fs.indexOf(t)
    if (k === 'ArrowLeft' || k === 'ArrowRight') target = fs[idx + (k === 'ArrowLeft' ? -1 : 1)] || null
    else {
      const d = k === 'ArrowUp' ? 'previousElementSibling' : 'nextElementSibling'
      for (let r = row[d]; r; r = r[d]) { if (!r.classList.contains('row')) continue; const f = fieldsOf(r)[idx]; if (f) { target = f; break } }
    }
  }
  e.preventDefault()
  if (!target) return
  const ti = [...v.querySelectorAll(NAVSEL)].indexOf(target)
  target.focus() // blur ของช่องเดิมจะบันทึกค่าและ render ใหม่
  const f = [...$('#view').querySelectorAll(NAVSEL)][ti]; if (f) { f.focus(); try { f.select() } catch (_) {} }
})
function claim(key) {
  const st = S.acts[key]; if (isAdmin()) return true
  if (st.owner && st.owner !== S.role) { toast('ครูอีกคนกรอกกิจกรรมนี้แล้ว'); return false }
  if (!st.owner) {
    st.owner = S.role
    const L = key.split('|')[0]
    ;(HOMEROOM[L] || []).filter((h) => h !== S.role).forEach((h) => notify(h, `${me().name} กรอกกิจกรรม ${key.replace('|', ' ')} ของห้องแล้ว คุณกรอกซ้ำไม่ได้`, 'acts'))
  }
  return true
}

/* ---------- วาดหน้า ---------- */
function stickAll() { stickNames() }
function render() {
  const v = $('#view'); if (!v) return
  if (!ready()) { v.innerHTML = '<div class="card empty">กำลังโหลดข้อมูล…</div>'; return }
  const ae = document.activeElement, aeSel = ae && ae.tagName === 'SELECT' && ae.matches('[data-ev],[data-evrow]') && v.contains(ae) ? [...v.querySelectorAll('select[data-ev],select[data-evrow]')].indexOf(ae) : -1
  try { v.innerHTML = (S.tpl ? TPL_BAR : '') + P[S.page]() } catch (err) { console.error(err); v.innerHTML = `<div class="card lock">แสดงหน้านี้ไม่ได้: ${esc(err.message)}</div>`; return }
  if (S.tpl) v.querySelectorAll('input,select,textarea').forEach((el) => { if (!el.matches('#sub,#rpst,#allsubj,#rpsc')) el.disabled = true })
  stickNames(); initSig(); persist()
  if (aeSel >= 0) { const f = v.querySelectorAll('select[data-ev],select[data-evrow]')[aeSel]; if (f) f.focus() }
}
function softRender() {
  const a = document.activeElement
  if (a && $('#view') && $('#view').contains(a) && /^(INPUT|SELECT|TEXTAREA)$/.test(a.tagName)) return
  render()
}

/* ---------- บันทึก/ซิงก์กับ Firestore ---------- */
const st8 = { work: false, settings: false }
const TPL = '....'
const TPL_BAR = '<div class="card tplbar"><b>ยังไม่กำหนดปีการศึกษา</b> — ดูหน้าจอและดาวน์โหลดแบบฟอร์มเปล่าได้ แต่กรอกหรือแก้ไขข้อมูลไม่ได้ (แอดมินหลักเปิดปีการศึกษาได้ที่เมนู "ปีการศึกษา")</div>'
const tplGate = (e) => {
  const v = $('#view'); if (!S.tpl || !v || !v.contains(e.target)) return
  const t = e.target
  if (e.type === 'click') {
    const b = t.closest('button,[data-act],[data-rl],[data-go],[data-term]'); if (!b) return
    if (b.matches('[data-nx],[data-pgf],[data-gk],[data-go],[data-term],[data-sumlv],[data-actlv],[data-clublv],[data-rl],[data-evk],[data-act=dl],[data-act=rdl],[data-act=sumdl]')) return
    e.stopImmediatePropagation(); e.preventDefault(); toast('ยังไม่กำหนดปีการศึกษา กรอกหรือแก้ไขข้อมูลไม่ได้')
  } else if (!t.matches('#sub,#rpst,#allsubj,#rpsc')) { e.stopImmediatePropagation(); toast('ยังไม่กำหนดปีการศึกษา กรอกหรือแก้ไขข้อมูลไม่ได้') }
}
const tplBlank = () => LEVELS.flatMap((L) => Array.from({ length: 40 }, (_, i) => ({ id: '_' + L + '_' + (i + 1), name: '', level: L, no: i + 1, status: 'active' })))
const ready = () => st8.work && st8.settings && S.year && CAT.length
const lastJson = {}
const metaOfId = {}
const pending = {}
const timers = {}
let unsubs = []
let unsubsS = []
const docId = (b, sub) => `${S.year}~${b}~${encodeURIComponent(sub).replace(/\./g, '%2E')}`
function cleaned(b, d) {
  if (b === 'cfg' && d.cols && d.cols.length === 1 && d.cols[0].n === 'คะแนนเก็บระหว่างภาค' && d.scale === 100 && d.hours === 40 && !d.ratio) return {}
  if (b === 'scores') { const o = {}; for (const [k, v] of Object.entries(d)) if ((v.c || []).some((x) => x !== '' && x != null) || (v.f !== '' && v.f != null)) o[k] = v; return o }
  if (b === 'att') { const tt = d.tt && Object.keys(d.tt.h || {}).length ? { tt: d.tt } : {}; if (!d.days || !d.days.length) return tt; const m = {}; for (const [k, v] of Object.entries(d.m || {})) { const o = Object.fromEntries(Object.entries(v).filter(([, x]) => x)); if (Object.keys(o).length) m[k] = o } return { days: d.days, m, ...tt } }
  if (b === 'ab') { const o = {}; for (const [k, v] of Object.entries(d)) if (Object.values(v).some((x) => +x > 0)) o[k] = v; return o }
  return d
}
function persist() {
  if (S.tpl || !st8.work || !CTX) return
  for (const b of BUCKETS) {
    for (const sub of Object.keys(S[b])) {
      const id = docId(b, sub), j = JSON.stringify(cleaned(b, S[b][sub]))
      if (lastJson[id] === j || (j === '{}' && lastJson[id] === undefined)) continue
      pending[id] = j; metaOfId[id] = { b, sub }; lastJson[id] = j
      clearTimeout(timers[id]); timers[id] = setTimeout(() => flush(id), 700)
    }
  }
  for (const id of Object.keys(metaOfId)) {
    const { b, sub } = metaOfId[id]
    if (id.startsWith(S.year + '~') && S[b][sub] === undefined && lastJson[id] !== undefined) {
      const old = lastJson[id]
      delete lastJson[id]; delete pending[id]; delete metaOfId[id]
      // ลบไม่สำเร็จ (เช่น ไม่มีสิทธิ์) → คืนค่าเดิมบนหน้าจอ ไม่ให้หน้าจอขึ้นว่าทำสำเร็จทั้งที่ข้อมูลบนเซิร์ฟเวอร์ยังอยู่
      deleteDoc(doc(db, 'work', id)).catch((err) => {
        if (S[b][sub] === undefined) { S[b][sub] = JSON.parse(old); lastJson[id] = old; metaOfId[id] = { b, sub }; render() }
        report(err)
      })
    }
  }
  persistSettings(); persistSig()
}
function flush(id) {
  const j = pending[id]; if (j === undefined) return
  const { b, sub } = metaOfId[id]
  setDoc(doc(db, 'work', id), { year: S.year, bucket: b, sub, json: j, by: S.role, at: Date.now() })
    .then(() => { if (pending[id] === j) delete pending[id] }).catch(report)
}
function report(err) { console.error(err); toast('บันทึกไม่สำเร็จ: ' + (err.code === 'permission-denied' ? 'ไม่มีสิทธิ์แก้ข้อมูลส่วนนี้' : err.message)) }
let lastSettings = null
function settingsJson() { return JSON.stringify({ school: S.school, homeroom: HOMEROOM, guidance: S.guidance, names: NAMES }) }
function persistSettings() {
  if (S.tpl || !isAdmin() || !st8.settings) return
  TEACHERS.forEach((t) => (NAMES[t.uid] = t.name))
  const j = settingsJson(); if (j === lastSettings) return
  lastSettings = j
  setDoc(doc(db, 'settings', 'school'), { json: j, at: Date.now() }).catch(report)
}
let lastSig
function persistSig() {
  if (S.tpl || !st8.sigsLoaded) return
  const cur = S.sigs[S.role] || null
  if (cur === lastSig) return
  lastSig = cur
  if (cur) setDoc(doc(db, 'sigs', S.role), { data: cur, at: Date.now() }).catch(report)
  else deleteDoc(doc(db, 'sigs', S.role)).catch(() => {})
}
function applySettings(j) {
  const o = JSON.parse(j), d = defaultSchool()
  S.school = { ...d, ...o.school, officers: { ...d.officers, ...((o.school || {}).officers || {}) }, heads: (o.school || {}).heads || {} }
  HOMEROOM = o.homeroom || {}; S.guidance = o.guidance || 'none'
  Object.assign(NAMES, o.names || {}); rebuildUsers()
}
function rebuildUsers() {
  Object.keys(U).forEach((k) => delete U[k])
  Object.entries(NAMES).forEach(([k, n]) => (U[k] = { name: n, kind: 'teacher' }))
  S.regs.forEach((r) => { if (r.name) U[r.t] = { name: r.name, kind: 'teacher' } })
  if (CTX) U[CTX.user.uid] = { name: CTX.user.name, kind: CTX.user.role === 'superadmin' ? 'super' : CTX.user.role === 'schooladmin' ? 'admin' : 'teacher' }
}
function subscribeAll() {
  unsubs.forEach((f) => f()); unsubs = []
  Object.keys(lastJson).forEach((k) => delete lastJson[k]); Object.keys(metaOfId).forEach((k) => delete metaOfId[k]); Object.keys(pending).forEach((k) => delete pending[k])
  BUCKETS.forEach((b) => (S[b] = {}))
  st8.work = false
  unsubs.push(onSnapshot(query(collection(db, 'work'), where('year', '==', S.year)), (snap) => {
    snap.docChanges().forEach((ch) => {
      const id = ch.doc.id, d = ch.doc.data()
      if (ch.doc.metadata.hasPendingWrites) return
      if (ch.type === 'removed') { if (S[d.bucket]) delete S[d.bucket][d.sub]; delete lastJson[id]; delete metaOfId[id]; return }
      if (pending[id] !== undefined || !S[d.bucket]) return
      lastJson[id] = d.json; metaOfId[id] = { b: d.bucket, sub: d.sub }; S[d.bucket][d.sub] = JSON.parse(d.json)
    })
    st8.work = true; softRender()
  }, report))
}
function subscribeStatic() {
  unsubsS.push(onSnapshot(doc(db, 'settings', 'school'), (s) => {
    if (s.exists() && !s.metadata.hasPendingWrites) { lastSettings = s.data().json; applySettings(s.data().json) }
    else if (!s.exists()) lastSettings = null
    st8.settings = true; softRender()
  }, report))
  unsubsS.push(onSnapshot(collection(db, 'sigs'), (snap) => {
    snap.docs.forEach((d) => (S.sigs[d.id] = d.data().data))
    snap.docChanges().forEach((ch) => { if (ch.type === 'removed') delete S.sigs[ch.doc.id] })
    lastSig = S.sigs[S.role] || null; st8.sigsLoaded = true; softRender()
  }, report))
}

/* ---------- ส่วนที่ React เรียกใช้ ---------- */
let started = false
export function engineUpdate(ctx, page) {
  const first = !CTX || CTX.user.uid !== ctx.user.uid
  CTX = ctx
  S.role = ctx.user.uid
  S.term = ctx.term
  S.tpl = !!ctx.template
  S.page = PAGES_OK.includes(page) ? page : 'scores'
  CAT = ctx.catalog.map((c) => ({ level: c.level, term: isPri(c.level) ? 0 : +c.term, code: c.code, name: c.name }))
  const rk = (s) => ({ ...s, st: (s.status || 'active') === 'active' ? undefined : s.status })
  STU = (S.tpl ? tplBlank() : ctx.students).map(rk).sort((a, b) => LEVELS.indexOf(a.level) - LEVELS.indexOf(b.level) || (a.no || 0) - (b.no || 0))
  S.openSubj = S.tpl ? new Set(CAT.map((c) => c.code)) : ctx.openSet
  S.regs = (S.tpl ? [] : ctx.regs).map((r) => ({ id: r.id, t: r.uid, name: r.name, codes: r.codes, status: r.status, msg: r.msg, term: r.term }))
  TEACHERS = ctx.teachers || []
  if (ctx.user.role === 'superadmin') Object.assign(NAMES, {})
  rebuildUsers()
  if (!started) { started = true; subscribeStatic(); LISTENERS.forEach(([t, f]) => document.addEventListener(t, f)); window.addEventListener('resize', stickAll) }
  if (S.tpl) {
    if (S.year !== TPL) { unsubs.forEach((f) => f()); unsubs = []; Object.keys(lastJson).forEach((k) => delete lastJson[k]); Object.keys(metaOfId).forEach((k) => delete metaOfId[k]); Object.keys(pending).forEach((k) => delete pending[k]); BUCKETS.forEach((b) => (S[b] = {})); S.year = TPL }
    st8.work = true
    document.addEventListener('click', tplGate, true); document.addEventListener('input', tplGate, true); document.addEventListener('change', tplGate, true)
  } else {
    document.removeEventListener('click', tplGate, true); document.removeEventListener('input', tplGate, true); document.removeEventListener('change', tplGate, true)
    if (S.year !== ctx.year) { S.year = ctx.year; subscribeAll() }
  }
  if (!S.scCode || !CAT.find((c) => c.code === S.scCode)) S.scCode = null
  render()
}
export function engineStop() {
  unsubs.forEach((f) => f()); unsubs = []; unsubsS.forEach((f) => f()); unsubsS = []
  ;['click', 'input', 'change'].forEach((t) => document.removeEventListener(t, tplGate, true))
  LISTENERS.forEach(([t, f]) => document.removeEventListener(t, f)); window.removeEventListener('resize', stickAll)
  Object.keys(timers).forEach((id) => { clearTimeout(timers[id]); flush(id) })
  started = false; CTX = null; S.year = 0; S.tpl = false; st8.work = false; st8.settings = false; st8.sigsLoaded = false
}
