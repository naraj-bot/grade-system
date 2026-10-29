/* eslint-disable */
// เอนจินกรอกคะแนน/ประเมิน/กิจกรรม/ปพ.5/ใบแจ้งผล — ย้ายจากต้นแบบที่ทดสอบแล้ว
// ผูกกับ Firestore: work/{ปี~หมวด~คีย์}, sigs/{uid}, settings/school
import { collection, deleteDoc, doc, onSnapshot, query, setDoc, where } from 'firebase/firestore'
import { db } from '../firebase'
import { printCss } from './printcss'

const $ = (s) => document.querySelector(s)
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
const LOGO = location.origin + '/logo.jpg'
const LEVELS = ['ป.1', 'ป.2', 'ป.3', 'ป.4', 'ป.5', 'ป.6', 'ม.1', 'ม.2', 'ม.3']
const isPri = (l) => l.startsWith('ป.')
const PAGES_OK = ['scores', 'acts', 'eval', 'p5', 'report', 'sign', 'school', 'guide']

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
  scores: {}, cfg: {}, ab: {}, rs: {}, ev: {}, sign: {}, fix: {}, meta: {}, acts: {}, members: {}, rpt: {},
  sigs: {}, school: defaultSchool(), guidance: 'none', regs: [], openSubj: new Set(), notes: [],
  evKind: 'a', actLevel: 'ป.3', rpLevel: 'ป.3', rpStu: null, clubLv: 'ป.3',
}
const BUCKETS = ['scores', 'cfg', 'ab', 'rs', 'ev', 'sign', 'fix', 'meta', 'acts', 'members', 'rpt']

const me = () => USERS[S.role]
const isAdmin = () => me().kind !== 'teacher'
function note() {}
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
function grade(x){return x>=80?4:x>=75?3.5:x>=70?3:x>=65?2.5:x>=60?2:x>=55?1.5:x>=50?1:0;}
const gp=g=>`<span class="pill ${g>=3?'p-good':g>=1?'p-gold':'p-bad'}">${g}</span>`;
function evMiss(code,T,R){const st=S.ev[code+'|'+T]||{};return R.filter(r=>!EVK.every(([k,,,it])=>evOverall((st[r.s.id]||{})[k],it.length))).length;}
function myCodes(){return [...new Set(isAdmin()?CAT.filter(c=>S.openSubj.has(c.code)&&(isPri(c.level)||c.term===S.term)).map(c=>c.code):S.regs.filter(r=>r.t===S.role&&r.status==='ok').flatMap(r=>r.codes).filter(c=>{const x=CAT.find(y=>y.code===c);return isPri(x.level)||x.term===S.term;}))];}
const TK=(code,T)=>{T=T||S.term;const c=CAT.find(x=>x.code===code);return(c&&isPri(c.level)&&T===1)?code+'~1':code;};
const uk=(T,l)=>(T===1&&isPri(CAT.find(x=>x.code===S.scCode).level))?'①'+l:l;
function cfgOf(code,T){const k=TK(code,T);const f=S.cfg[k]||(S.cfg[k]={scale:100,cols:[{n:'คะแนนเก็บระหว่างภาค',max:0}]});if(!f.hours)f.hours=40;return f;}
function fulls(code,T){const c=CAT.find(x=>x.code===code),f=cfgOf(code,T),base=isPri(c.level)?f.scale:100,[r1,r2]=(f.ratio||'70:30').split(':').map(Number);return {base,mid:base*r1/100,fin:base*r2/100};}
const sumC=v=>{const a=(v&&v.c)||[];return a.length&&a.every(x=>x!==''&&x!=null)?a.reduce((p,q)=>p+(+q),0):null;};
function calc(code,T){T=T||S.term;const c=CAT.find(x=>x.code===code),pri=isPri(c.level),F=fulls(code,T),cfg=cfgOf(code,T),H=cfg.hours,key=TK(code,T);
 if(cfg.cols.length===1)cfg.cols[0].max=F.mid;
 S.scores[key]=S.scores[key]||{};S.ab[code]=S.ab[code]||{};
 const t1=(pri&&T===2)?Object.fromEntries(calc(code,1).map(r=>[r.s.id,r.cur])):{},H1=pri?cfgOf(code,1).hours:H;
 return ACT().filter(s=>s.level===c.level).map(s=>{const v=S.scores[key][s.id]||(S.scores[key][s.id]={c:[],f:''});
  const a=S.ab[code][s.id]||(S.ab[code][s.id]={});
  const mid=sumC(v),fin=(v.f===''||v.f==null)?null:+v.f,tot=(mid==null||fin==null)?null:mid+fin;
  const cur=tot==null?null:(pri&&F.base===100?tot/2:tot);const pr=(pri&&T===2)?(t1[s.id]??null):null;
  let att=null,pct=null;
  const A=t=>{const x=+a[t];return x>0?Math.min((pri&&T===2&&t===1)?H1:H,x):0;};
  if(pri&&T===2){const hh=H1+H;att=hh-A(1)-A(2);pct=att/hh*100;}
  else{att=H-A(T);pct=att/H*100;}
  const ms=pct!=null&&pct<80;let sum=null,g=null;
  if(!pri){sum=tot;g=(tot==null||pct==null)?null:(ms?'มส':grade(tot));}
  else if(T===2){sum=(cur==null||pr==null)?null:cur+pr;g=(sum==null||pct==null)?null:(ms?'มส':grade(sum));}
  if(((S.rs||{})[code+'|'+T]||{})[s.id]&&(!pri||T===2))g='ร';
  return {s,v,a,mid,fin,tot,cur,pr,att,pct,sum,g,ms};});}
const f1=x=>x==null?'-':(Math.round(x*10)/10).toString();
function pickSubject(){const codes=myCodes();if(!codes.length)return null;if(!S.scCode||!codes.includes(S.scCode))S.scCode=codes[0];return codes;}
function subjectSelect(codes,noRatio){return `<label for="sub">วิชา</label><select id="sub">${codes.map(k=>{const x=CAT.find(y=>y.code===k);return `<option value="${k}" ${k===S.scCode?'selected':''}>${x.level} ${k} ${esc(x.name)}</option>`}).join('')}</select>
 ${noRatio?'':`<label for="rt">สัดส่วน</label><select id="rt">${['60:40','70:30','80:20'].map(x=>`<option ${x===(cfgOf(S.scCode).ratio||'70:30')?'selected':''}>${x}</option>`).join('')}</select>`}
 <div class="row">${[1,2].map(t=>`<button class="chip" aria-pressed="${S.term===t}" data-term="${t}">ภาคเรียนที่ ${t}</button>`).join('')}</div>`;}
P.scores=()=>{
 const codes=pickSubject();
 if(!codes)return `<div class="card empty">ยังไม่มีวิชาที่อนุมัติสำหรับภาคเรียนนี้<br><br><button class="btn" data-go="reg">ไปลงทะเบียนสอน</button></div>`;
 const c=CAT.find(x=>x.code===S.scCode),pri=isPri(c.level),cfg=cfgOf(c.code),F=fulls(c.code),R=calc(c.code),t2=pri&&S.term===2;
 const sumMax=cfg.cols.reduce((p,q)=>p+(+q.max||0),0),ok=Math.abs(sumMax-F.mid)<1e-9,H=cfg.hours;
 const rows=R.map(r=>{
  const ins=cfg.cols.map((k,i)=>`<td><input type="number" min="0" max="${k.max}" data-sc="${r.s.id}" data-i="${i}" value="${r.v.c[i]==null?'':r.v.c[i]}" aria-label="${esc(k.n)} ${esc(r.s.name)}"></td>`).join('');
  const fin=`<td><input type="number" min="0" max="${F.fin}" data-sc="${r.s.id}" data-i="f" value="${r.v.f==null?'':r.v.f}" aria-label="ปลายภาค ${esc(r.s.name)}"></td>`;
  const att=`<td><input type="number" min="0" max="${H}" data-ab="${r.s.id}" value="${r.a[S.term]>0?r.a[S.term]:''}" placeholder="0" aria-label="ชั่วโมงที่ขาด ${esc(r.s.name)}"></td><td class="num">${r.pct==null?'-':`<span class="pill ${r.ms?'p-bad':'p-good'}">${f1(r.pct)}%</span>`}</td>`;
  let tail;
  if(!pri)tail=`<td class="num">${f1(r.tot)}</td><td>${r.g==null?'-':gp(r.g)}</td>`;
  else if(!t2)tail=`<td class="num">${f1(r.cur)} / 50</td><td class="muted small">${r.ms?'เวลาเรียนต่ำกว่าร้อยละ 80':'ยังไม่ตัดเกรด'}</td>`;
  else tail=`<td class="num">${f1(r.pr)}</td><td class="num">${f1(r.cur)}</td><td class="num">${f1(r.sum)}</td><td>${r.g==null?'-':gp(r.g)}</td>`;
  return `<tr><td>${r.s.no}</td><td>${esc(r.s.name)}</td>${ins}<td class="num">${f1(r.mid)}</td>${fin}${att}${(!pri||t2)?`<td><input type="checkbox" data-rs="${r.s.id}" ${((S.rs[SKEY()]||{})[r.s.id])?'checked':''} aria-label="ร รอการตัดสิน ${esc(r.s.name)}"></td>`:''}${tail}</tr>`;}).join('');
 const head=!pri?'<th>รวม</th><th>เกรด</th>':!t2?'<th>ภาคเรียน 1 (/50)</th><th></th>':'<th>ภาคเรียน 1 (/50)</th><th>ภาคเรียน 2 (/50)</th><th>รวมทั้งปี</th><th>เกรด</th>';
 return `<div class="stack"><div class="row">${subjectSelect(codes)}</div>
 ${(!pri||t2)&&evMiss(c.code,S.term,R)?`<div class="card lock small row" style="justify-content:space-between"><span>ยังประเมินผู้เรียนไม่ครบ ${evMiss(c.code,S.term,R)} คน เล่ม ปพ.5 จะลงนามและดาวน์โหลดไม่ได้จนกว่าจะประเมินครบ</span><button class="btn sm" data-go="eval">ไปประเมิน</button></div>`:''}
 <div class="card stack"><h3>ตั้งค่าการเก็บคะแนนของวิชานี้</h3>
  ${pri?`<div class="row"><label for="scl">การเก็บคะแนนต่อภาคเรียน</label><select id="scl"><option value="100" ${cfg.scale===100?'selected':''}>เก็บเต็ม 100 (ระบบย่อเหลือ 50)</option><option value="50" ${cfg.scale===50?'selected':''}>เก็บเต็ม 50 ต่อภาคเรียนเลย</option></select></div>`:''}
  <div class="row"><label for="hrs">จำนวนชั่วโมงเรียนทั้งหมดของภาคเรียน</label><input id="hrs" type="number" min="1" value="${H}" style="width:90px"><span class="small muted">ค่าเริ่มต้นทุกคนมาเรียนครบ กรอกเฉพาะชั่วโมงที่ขาด ถ้าเวลาเรียนต่ำกว่า 80% ระบบให้ มส. ไม่ตัดเกรด</span></div>
  <div class="small muted">คะแนนระหว่างภาคเต็ม ${F.mid} · ปลายภาคเต็ม ${F.fin} · แบ่งช่องคะแนนเก็บได้ตามที่ครูใช้ (ช่องเดียวหรือหลายช่อง)</div>
  ${cfg.cols.map((k,i)=>`<div class="row"><input data-cn="${i}" value="${esc(k.n)}" aria-label="ชื่อคะแนนช่องที่ ${i+1}" placeholder="ชื่อคะแนน เช่น ชิ้นงาน" size="16"><input data-cu="${i}" value="${esc(k.u||'')}" aria-label="หน่วยการเรียนรู้ของช่องที่ ${i+1}" placeholder="หน่วยที่ (ถ้ามี)" size="12"><label class="small muted" for="cm${i}">เต็ม</label><input id="cm${i}" type="number" min="1" data-cm="${i}" value="${k.max}" ${cfg.cols.length===1?'disabled':''} style="width:80px">${cfg.cols.length>1?`<button class="btn sm alt" data-act="delcol" data-i="${i}">ลบช่อง</button>`:''}</div>`).join('')}
  <div class="row"><button class="btn sm alt" data-act="addcol">เพิ่มช่องคะแนนเก็บ</button><span class="pill ${ok?'p-good':'p-warn'}">${ok?'รวมคะแนนเก็บครบ '+F.mid:'รวมช่องคะแนน '+sumMax+' ต้องเท่ากับ '+F.mid}</span></div></div>
 <div class="small muted">${pri?'ประถมตัดเกรดเมื่อจบภาคเรียนที่ 2 (เวลาเรียนนับรวมทั้งปี)':'มัธยมตัดเกรดทุกภาคเรียน'} · กรอกเฉพาะชั่วโมงที่ขาด (ไม่กรอก = มาเรียนครบ)</div>
 <div class="tw"><table><thead><tr><th>เลขที่</th><th>ชื่อ-สกุล</th>${cfg.cols.map(k=>`<th>${esc(k.n)} /${k.max}</th>`).join('')}<th>รวมระหว่างภาค</th><th>ปลายภาค /${F.fin}</th><th>ชั่วโมงที่ขาด (ชม.)</th><th>เวลาเรียน %</th>${(!pri||t2)?'<th>ร</th>':''}${head}</tr></thead><tbody>${rows}</tbody></table></div></div>`;
};
const ACTS=['ชุมนุม','แนะแนว','ลูกเสือ-เนตรนารี','กิจกรรมเพื่อสังคมและสาธารณประโยชน์'];
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
   <div class="row"><button class="btn sm" data-act="allpass" data-key="${esc(key)}">ผ่านทั้งห้อง</button></div>
   <div class="tw"><table><thead><tr><th>ชื่อ</th><th>ผล</th></tr></thead><tbody>${stu.map(s=>`<tr><td>${esc(s.name)}</td><td><select data-av="${esc(key)}" data-s="${s.id}" aria-label="ผลของ ${esc(s.name)}"><option value="">-</option><option ${st.v[s.id]==='ผ'?'selected':''}>ผ</option><option ${st.v[s.id]==='มผ'?'selected':''}>มผ</option></select></td></tr>`).join('')}</tbody></table></div>`}</div>`;}).join('')}
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
const sigImg=s=>s?`<img class="sigimg" src="${s}" alt="ลายเซ็น">`:'';
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
 const stuCells=r=>`<td class="num">${r.s.no}</td><td>${esc(r.s.name)}</td>`;
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
  <div class="tw" style="font-size:${cfg.cols.length>12?'.68em':cfg.cols.length>8?'.8em':'1em'}"><table><thead><tr><th rowspan="3">เลขที่</th><th rowspan="3">ชื่อ - สกุล</th>${G.map(g=>g.idx.length>1?`<th colspan="${g.idx.length+1}">${esc(g.label)}</th>`:`<th rowspan="2">${esc(cfg.cols[g.idx[0]].n)}</th>`).join('')}${G.length>1?'<th rowspan="3">รวม<br>ระหว่างเรียน</th>':''}</tr>
  <tr>${G.map(g=>g.idx.length>1?g.idx.map(i=>`<th>${esc(cfg.cols[i].n)}</th>`).join('')+'<th>รวม</th>':'').join('')}</tr>
  <tr>${G.map(g=>g.idx.length>1?g.idx.map(i=>`<th>${cfg.cols[i].max}</th>`).join('')+`<th>${g.max}</th>`:`<th>${g.max}</th>`).join('')}</tr></thead><tbody>
  ${R.map(r=>`<tr>${stuCells(r)}${G.map(g=>g.idx.map(i=>`<td class="num">${r.v.c[i]==null||r.v.c[i]===''?'-':r.v.c[i]}</td>`).join('')+(g.idx.length>1?`<td class="num"><b>${f1(gsum(r,g))}</b></td>`:'')).join('')}${G.length>1?`<td class="num"><b>${f1(r.mid)}</b></td>`:''}</tr>`).join('')}</tbody></table></div></div>`;
 const G1=t2?groupsOf(cfgOf(c.code,1)):[],cfg1=t2?cfgOf(c.code,1):null,F1=t2?fulls(c.code,1):null,R1=t2?calc(c.code,1):null;
 const struct=(t2?structF(1,cfg1,F1,G1):'')+structF(S.term,cfg,F,G),sub=(t2?subF(1,cfg1,G1,R1):'')+subF(S.term,cfg,G,R);
 /* ผลการเรียน */
 const resF=(T,cfg,F,G,R,showG)=>{const scl=pri&&F.base===100,multi=G.length>1;
  const heads=[...G.map(g=>[esc(g.label),g.max]),...(multi?[['รวมระหว่างเรียน',F.mid]]:[]),['สอบปลายภาค',F.fin],[pri?`รวมภาคเรียนที่ ${T}${scl?' (เก็บ 100)':''}`:'รวม',F.base],...(scl?[['ย่อเหลือ 50 คะแนน',50]]:[])];
  const note=pri?`วิธีคิด: คะแนนระหว่างเรียน (${F.mid}) + ปลายภาค (${F.fin}) = ${F.base} คะแนน${scl?' → ย่อเหลือ 50':''} · ภาคเรียนที่ ${T} ยังไม่ตัดเกรด ตัดเกรดรวมทั้งปีในหน้าบันทึกผลการเรียนรวม`:`วิธีคิด: คะแนนระหว่างเรียน (${F.mid}) + ปลายภาค (${F.fin}) = 100 แล้วตัดเกรด`;
  return `<div class="pg">${ph()}${hd('บันทึกผลการเรียน'+(pri?` ภาคเรียนที่ ${T}`:''))}
  <div class="tw"><table><thead><tr><th rowspan="2">เลขที่</th><th rowspan="2">ชื่อ - สกุล</th>${heads.map(h=>rot(h[0])).join('')}${showG?'<th rowspan="2">ระดับ<br>ผลการ<br>เรียน</th>':''}</tr>
  <tr>${heads.map(h=>`<th>${h[1]}</th>`).join('')}</tr></thead><tbody>
  ${R.map(r=>`<tr>${stuCells(r)}${G.map(g=>`<td class="num">${f1(gsum(r,g)).replace('-','')}</td>`).join('')}${multi?`<td class="num">${f1(r.mid).replace('-','')}</td>`:''}<td class="num">${r.fin==null?'':r.fin}</td><td class="num">${f1(r.tot).replace('-','')}</td>${scl?`<td class="num">${f1(r.cur).replace('-','')}</td>`:''}${showG?`<td class="num"><b>${r.g==null?'-':r.g}</b></td>`:''}</tr>`).join('')}</tbody></table></div>
  <div class="small">${note}</div></div>`;};
 const resYf=()=>`<div class="pg">${ph()}${hd('บันทึกผลการเรียนรวมทั้งปี')}
  <div class="tw"><table><thead><tr><th rowspan="2">เลขที่</th><th rowspan="2">ชื่อ - สกุล</th><th>ภาคเรียนที่ 1</th><th>ภาคเรียนที่ 2</th><th>รวมทั้งปี</th><th rowspan="2">ระดับ<br>ผลการ<br>เรียน</th></tr><tr><th>50</th><th>50</th><th>100</th></tr></thead><tbody>
  ${R.map(r=>`<tr>${stuCells(r)}<td class="num">${f1(r.pr).replace('-','')}</td><td class="num">${f1(r.cur).replace('-','')}</td><td class="num">${f1(r.sum).replace('-','')}</td><td class="num"><b>${r.g==null?'-':r.g}</b></td></tr>`).join('')}</tbody></table></div>
  <div class="small">รวมทั้งปี = ภาคเรียนที่ 1 (50) + ภาคเรียนที่ 2 (50) = 100 คะแนน แล้วตัดเกรด · เวลาเรียนนับรวมทั้งปี ต้องไม่ต่ำกว่าร้อยละ 80</div></div>`;
 const resP=t2?resF(1,cfg1,F1,G1,R1,false)+resF(2,cfg,F,G,R,false)+resYf():resF(S.term,cfg,F,G,R,true);
 /* ผลการประเมิน 3 หน้า */
 const evPage=([k,title,,items])=>`<div class="pg">${ph()}${hd(title)}
  <div class="tw"><table><thead><tr><th>เลขที่</th><th>ชื่อ - สกุล</th>${items.map((t,i)=>rot(`${i+1}. ${t}`)).join('')}<th class="rot"><span class="rv">สรุปผล</span></th></tr></thead><tbody>
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
  <div class="tw"><table><thead><tr><th>เลขที่</th><th>ชื่อ - สกุล</th><th>ผลเดิม</th><th>สาเหตุ / วิธีการแก้ไข</th><th>ผลหลังแก้</th><th>วันที่</th><th>ลงชื่อครูผู้สอน</th></tr></thead><tbody>${R.map(r=>{const x=fix[r.s.id]||{};return `<tr>${stuCells(r)}<td class="num">${r.g==null?'-':r.g}</td><td>${esc(x.why||'')}</td><td class="num">${esc(x.after||'')}</td><td class="num">${x.date?thDate(x.date).replace('วันที่ ',''):''}</td><td class="num">${x.after&&sTeach?`<img class="sigimg sm" src="${sTeach}" alt="">`:''}</td></tr>`}).join('')}</tbody></table></div></div>`:'';
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
 const evFull=!evOn||EVK.every(([k,,,it])=>R.every(r=>evLab(r,k,it.length))),evLock=evOn&&!evFull;
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
  <div class="small muted">เรียงชื่อ: ชื่อวิชา_ชั้น_ภาคเรียน_ปีการศึกษา_ครูผู้สอน · จัดหน้าตามแบบ ปพ.5 ของโรงเรียน (ไม่มีหน้าบันทึกเวลาเรียน) A4 ฟอนต์ TH Sarabun</div></div>
 ${editor}
 <h3>ตัวอย่างหน้าในเล่ม</h3>
 ${L('หน้าสรุปและลงนาม',info)}${L('คำอธิบายรายวิชา',desc)}${L('โครงสร้างรายวิชา',struct)}${L('คะแนนย่อยระหว่างเรียน',sub)}${L('ผลการเรียน',resP)}${evP?evP+'<div class="pgl">ผลการประเมิน</div>':''}${L('สรุปผลการเรียน',sumP)}${L('แก้ไขผลการเรียน',fixP)}${L('คำชี้แจงเกณฑ์',crit)}
 <p class="small muted">ข้อมูลผลประเมิน ลายเซ็น และคำอธิบายในต้นแบบเป็นตัวอย่างสมมติ</p></div>`;};

const GUIDE={
 super:[['ตั้งปีการศึกษา','เปิดปีการศึกษาและภาคเรียน ปิดปีเมื่อสิ้นปีเพื่อเก็บข้อมูลและเลื่อนชั้น','years'],['สร้างบัญชีผู้ใช้','สร้างแอดมินโรงเรียนและครู กำหนดรหัสเริ่มต้น รีเซ็ตรหัสเมื่อลืม และส่งออกใบรหัส','users'],['เตรียมรายวิชา','เลือกวิชาจากคลังที่จะเปิดสอนในปีและภาคเรียนนี้','catalog'],['เพิ่มนักเรียน','เพิ่มทีละคนหรือวางรายชื่อหลายคน ระบบเลื่อนชั้นให้เองตอนขึ้นปีใหม่','students'],['อนุมัติการสอน','ตรวจที่ครูลงทะเบียน อนุมัติ หรือส่งกลับพร้อมข้อความ','reg'],['ติดตามและส่งออก','ดูเอกสารของแต่ละวิชาและดาวน์โหลดเป็นหลักฐาน','p5']],
 admin:[['ตั้งค่าโรงเรียน','กรอกชื่อและลายเซ็นของ ผอ. หัวหน้างานวัดผล หัวหน้างานวิชาการ และหัวหน้ากลุ่มสาระ ให้ขึ้นในเล่ม ปพ.5','school'],['เตรียมรายวิชา','เลือกวิชาจากคลังที่เปิดสอนในภาคเรียนนี้ ทีละวิชาหรือหลายวิชา','catalog'],['จัดการนักเรียน','เพิ่มนักเรียนใหม่ ย้ายเข้า หรือวางรายชื่อหลายคน','students'],['อนุมัติการสอน','ตรวจรายการที่ครูลงทะเบียน ถ้าไม่ถูกต้องส่งกลับพร้อมข้อความ','reg'],['ดูคะแนนและกิจกรรม','ติดตามว่าครูกรอกครบหรือยัง ปล่อยสิทธิ์กิจกรรมเมื่อครูกรอกค้าง','acts'],['ลงนามและอนุมัติเล่ม','ในหน้าสมุด ปพ.5 ติ๊กลงนามของหัวหน้าฝ่ายต่าง ๆ และให้ ผอ. อนุมัติ พร้อมวันที่','p5'],['ดาวน์โหลดเอกสาร','ดาวน์โหลด ปพ.5 ของแต่ละวิชาและเอกสารสรุป','p5']],
 teacher:[['ลงทะเบียนวิชาที่สอน','เลือกชั้นที่สอนได้หลายชั้น แล้วติ๊กวิชาที่ตัวเองสอน ส่งให้แอดมินอนุมัติทุกปีการศึกษาและภาคเรียน','reg'],['รอการอนุมัติ','ถ้าแอดมินส่งกลับจะมีแจ้งเตือนและข้อความ ให้แก้แล้วส่งใหม่','reg'],['ตั้งช่องคะแนนเก็บ','ตั้งว่าเก็บกี่ช่อง ช่องละเท่าไร ประถมเลือกเก็บ 100 หรือ 50 ต่อภาคเรียน','scores'],['กรอกคะแนน','กรอกคะแนนแต่ละช่อง ปลายภาค และชั่วโมงที่ขาดเฉพาะคนที่ขาด (ไม่กรอก = มาครบ) ระบบรวมและตัดเกรดให้ ผู้ที่เวลาเรียนต่ำกว่า 80% จะได้ มส.','scores'],['ตัดสินกิจกรรม','ชุมนุมเลือกสมาชิกของตน ส่วนลูกเสือและกิจกรรมเพื่อสังคมเป็นของครูที่ปรึกษา','acts'],['ประเมินผู้เรียน','ให้คะแนนคุณลักษณะ การอ่าน คิดวิเคราะห์ เขียน และสมรรถนะ รายข้อ ทีละคนหรือทั้งห้อง ระบบสรุปผลให้ (ประถมกรอกภาคเรียนที่ 2)','eval'],['ออกใบแจ้งผลการเรียน (ประถม ภาคเรียนที่ 1)','เลือกชั้น ดูตัวอย่างรายบุคคล ดาวน์โหลด PDF รายบุคคลหรือทั้งห้อง พร้อมลงนามครูที่ปรึกษา','report'],['สร้างลายเซ็น','วาดลายเซ็นด้วยนิ้วหรือเมาส์ หรือแนบภาพ ใช้ลงชื่อในเล่ม ปพ.5','sign'],['กรอกข้อมูลประกอบเล่ม','คำอธิบายรายวิชา (ข้อความหรือภาพ) มาตรฐาน/ตัวชี้วัดและเวลาของแต่ละหน่วย แล้วดูรายการตรวจความครบถ้วน','p5'],['ลงนามและดาวน์โหลด ปพ.5','กดลงลายมือชื่อครูผู้สอน ตรวจครบแล้วดาวน์โหลดเป็นหลักฐาน ระบบตั้งชื่อไฟล์ให้','p5']]};
P.guide=()=>{const k=me().kind,st=GUIDE[k];
 return `<div class="stack"><div class="card"><b>คู่มือสำหรับ${{super:'แอดมินหลัก',admin:'แอดมินโรงเรียน',teacher:'ครูผู้สอน'}[k]}</b><div class="small muted">ทำตามลำดับ กดปุ่มเพื่อไปยังหน้านั้น</div></div>
 ${st.map((x,i)=>`<div class="card step"><i>${i+1}</i><div class="stack" style="gap:6px"><b>${x[0]}</b><span class="small muted">${x[1]}</span><div><button class="btn sm alt" data-go="${x[2]}">ไปที่หน้านี้</button></div></div></div>`).join('')}
 <div class="card"><b>ข้อควรรู้</b><ul class="small" style="margin:6px 0 0;padding-left:18px">
  <li>ประถม ภาคเรียนที่ 1 ยังไม่ตัดเกรด ตัดเกรดเมื่อจบภาคเรียนที่ 2 มัธยมตัดเกรดทุกภาคเรียน</li>
  <li>กิจกรรมแนะแนว: มีครูแนะแนวให้ครูแนะแนวตัด ถ้าไม่มีให้ครูที่ปรึกษาตัด</li>
  <li>ครูที่ปรึกษา 2 คนในห้องเดียวกัน คนที่กรอกก่อนจะได้สิทธิ์ อีกคนจะได้รับแจ้งเตือน</li>
  <li>เล่ม ปพ.5 ลงนามและดาวน์โหลดไม่ได้จนกว่าจะประเมินคุณลักษณะ การอ่าน คิดวิเคราะห์ เขียน และสมรรถนะครบทุกคน (ประถมประเมินในภาคเรียนที่ 2)</li>
  <li>เวลาเรียนต่ำกว่า 80% ได้ มส. ระบบไม่ตัดเกรดให้ ประถมนับเวลาเรียนรวมทั้งปี</li>
  <li>ลืมรหัสผ่านให้แจ้งแอดมินหลักเพื่อรีเซ็ต</li></ul></div></div>`;};

/* ---------- ลายเซ็นอิเล็กทรอนิกส์ ---------- */
function sigWidget(target,label){const cur=getSig(target);
 return `<div class="card stack"><b>${label}</b>${cur?`<img class="sigprev" src="${cur}" alt="ลายเซ็นปัจจุบัน">`:'<div class="small muted">ยังไม่มีลายเซ็น</div>'}
 <canvas class="sigc" data-target="${target}" width="520" height="170" aria-label="กรอบวาดลายเซ็น"></canvas>
 <div class="row"><button class="btn sm" data-act="sigsave" data-target="${target}">บันทึกลายเซ็นที่วาด</button><button class="btn sm alt" data-act="sigclear" data-target="${target}">ล้างกรอบ</button>
 <label class="btn sm alt" style="cursor:pointer">แนบภาพลายเซ็น<input type="file" accept="image/*" data-sigfile="${target}" hidden></label>${cur?`<button class="btn sm alt" data-act="sigdel" data-target="${target}">ลบลายเซ็น</button>`:''}</div>
 <div class="small muted">วาดด้วยนิ้ว เมาส์ หรือปากกา หรือแนบภาพลายเซ็น (พื้นขาวหรือโปร่งใส)</div></div>`;}
function initSig(){document.querySelectorAll('canvas.sigc').forEach(cv=>{const x=cv.getContext('2d');x.lineWidth=3;x.lineCap='round';x.lineJoin='round';x.strokeStyle='#14213d';let on=false;
 const pos=e=>{const r=cv.getBoundingClientRect();return [(e.clientX-r.left)*cv.width/r.width,(e.clientY-r.top)*cv.height/r.height];};
 cv.onpointerdown=e=>{on=true;cv.setPointerCapture(e.pointerId);const [a,b]=pos(e);x.beginPath();x.moveTo(a,b);x.lineTo(a+.1,b+.1);x.stroke();cv._dirty=true;e.preventDefault();};
 cv.onpointermove=e=>{if(!on)return;const [a,b]=pos(e);x.lineTo(a,b);x.stroke();};
 cv.onpointerup=cv.onpointercancel=()=>{on=false;};});}
function readImg(file,max,type,cb){const fr=new FileReader();fr.onload=()=>{const im=new Image();im.onload=()=>{const k=Math.min(1,max/Math.max(im.width,im.height)),cv=document.createElement('canvas');cv.width=Math.round(im.width*k);cv.height=Math.round(im.height*k);const x=cv.getContext('2d');if(type==='jpeg'){x.fillStyle='#fff';x.fillRect(0,0,cv.width,cv.height);}x.drawImage(im,0,0,cv.width,cv.height);cb(cv.toDataURL('image/'+type,.88));};im.src=fr.result;};fr.readAsDataURL(file);}
P.sign=()=>`<div class="stack"><div class="card"><b>ลายเซ็นของฉัน (${esc(me().name)})</b><div class="small muted">ใช้ลงชื่อในสมุด ปพ.5 เมื่อกด "ลงลายมือชื่อครูผู้สอน" ในหน้าสมุด ปพ.5 ลายเซ็นเก็บเฉพาะบัญชีของคุณ</div></div>${sigWidget('u:'+S.role,'วาดหรือแนบลายเซ็น')}</div>`;
P.school=()=>{const sc=S.school,o=sc.officers;
 return `<div class="stack"><div class="card stack"><h3>ข้อมูลโรงเรียน</h3><label for="scn">ชื่อโรงเรียน</label><input id="scn" data-sc2="name" value="${esc(sc.name)}"><label for="sca">สังกัด</label><input id="sca" data-sc2="area" value="${esc(sc.area)}"></div>
 <div class="card stack"><h3>ผู้ลงนามในสมุด ปพ.5</h3><div class="small muted">ชื่อที่กรอกจะขึ้นในช่องลงนามทุกเล่ม ลายเซ็นจะแสดงเมื่อผู้นั้นลงนามเล่มนั้น</div>
 ${[['measure','หัวหน้างานวัดและประเมินผล'],['acad','หัวหน้ากลุ่มบริหารงานวิชาการ'],['dir','ผู้อำนวยการโรงเรียน']].map(([k,t])=>`<label for="of${k}">${t}</label><input id="of${k}" data-of="${k}" value="${esc(o[k].name)}" placeholder="คำนำหน้า ชื่อ-สกุล">${sigWidget('o:'+k,'ลายเซ็น'+t)}`).join('')}</div>
 ${homeroomCard()}<div class="card stack"><h3>หัวหน้ากลุ่มสาระการเรียนรู้</h3>${Object.entries(AREA).map(([k,t])=>`<details><summary>${t} <span class="small muted">${esc((sc.heads[k]||{}).name||'ยังไม่ตั้งชื่อ')}</span></summary><div class="stack" style="padding:8px 0"><label for="hd${k}">ชื่อหัวหน้ากลุ่มสาระ${t}</label><input id="hd${k}" data-hd="${k}" value="${esc((sc.heads[k]||{}).name||'')}">${sigWidget('h:'+k,'ลายเซ็น')}</div></details>`).join('')}</div></div>`;};
P.eval=()=>{const codes=pickSubject();
 if(!codes)return `<div class="card empty">ยังไม่มีวิชาที่อนุมัติ<br><br><button class="btn" data-go="reg">ไปลงทะเบียนสอน</button></div>`;
 const c=CAT.find(x=>x.code===S.scCode),pri=isPri(c.level);
 if(pri&&S.term===1)return `<div class="stack"><div class="row">${subjectSelect(codes,1)}</div><div class="card empty">ประถมประเมินคุณลักษณะ การอ่าน คิดวิเคราะห์ เขียน และสมรรถนะ ในภาคเรียนที่ 2<br>เลือก "ภาคเรียนที่ 2" ด้านบนเพื่อกรอก</div></div>`;
 const R=calc(c.code),key=SKEY(),st=S.ev[key]||(S.ev[key]={}),K=EVK.find(x=>x[0]===S.evKind)||EVK[0],[k,title,short,items]=K;
 const o={};EVL.forEach(l=>o[l]=0);R.forEach(r=>{const v=evOverall((st[r.s.id]||{})[k],items.length);if(v)o[v]++;});const all=EVL.reduce((p,l)=>p+o[l],0);
 const opts=`<option value="">-</option><option value="3">3 ดีเยี่ยม</option><option value="2">2 ดี</option><option value="1">1 ผ่าน</option><option value="0">0 ไม่ผ่าน</option>`;
 return `<div class="stack"><div class="row">${subjectSelect(codes,1)}</div>
 <div class="row">${EVK.map(x=>`<button class="chip" aria-pressed="${x[0]===k}" data-evk="${x[0]}">${x[2]}</button>`).join('')}</div>
 <div class="card stack"><b>${title}</b><div class="small muted">ให้คะแนนแต่ละข้อ 3 = ดีเยี่ยม · 2 = ดี · 1 = ผ่าน · 0 = ไม่ผ่าน ระบบสรุปผลให้ (ค่าเฉลี่ย 2.5 ขึ้นไปดีเยี่ยม · 1.5 ขึ้นไปดี · 1 ขึ้นไปผ่าน)</div>
 <div class="row"><span class="small">ตั้งทั้งห้อง ทุกข้อ:</span><select id="evall" aria-label="ตั้งทั้งห้อง">${opts}</select><button class="btn sm" data-act="evall">ใช้กับทั้งห้อง</button></div>
 <div class="row">${EVL.map(l=>`<span class="pill ${l==='ไม่ผ่าน'?'p-bad':l==='ผ่าน'?'p-gold':'p-good'}">${l} ${o[l]} คน</span>`).join('')}<span class="small muted">ประเมินแล้ว ${all}/${R.length}</span></div>
 <div class="tw"><table><thead><tr><th>เลขที่</th><th>ชื่อ - สกุล</th><th>ทุกข้อ</th>${items.map((t,i)=>`<th><span class="small">${i+1}. ${t}</span></th>`).join('')}<th>สรุปผล</th></tr></thead><tbody>
 ${R.map(r=>{const a=(st[r.s.id]||{})[k]||[];return `<tr><td>${r.s.no}</td><td>${esc(r.s.name)}</td><td><select data-evrow="${r.s.id}" aria-label="ตั้งทุกข้อ ${esc(r.s.name)}">${opts}</select></td>${items.map((t,i)=>`<td><select data-ev="${r.s.id}|${i}" aria-label="${esc(t)} ${esc(r.s.name)}">${['','3','2','1','0'].map(v=>`<option value="${v}" ${String(a[i]??'')===v?'selected':''}>${v===''?'-':v}</option>`).join('')}</select></td>`).join('')}<td>${evOverall(a,items.length)||'-'}</td></tr>`}).join('')}</tbody></table></div></div></div>`;};
reg('click',e=>{const t=e.target.closest('[data-evk],[data-act]');if(!t)return;const d=t.dataset,a=d.act;
 if(d.evk){S.evKind=d.evk;render();return;}
 if(a==='sigclear'){const cv=document.querySelector(`canvas.sigc[data-target="${d.target}"]`);cv.getContext('2d').clearRect(0,0,cv.width,cv.height);cv._dirty=false;}
 else if(a==='sigsave'){const cv=document.querySelector(`canvas.sigc[data-target="${d.target}"]`);if(!cv._dirty)return toast('วาดลายเซ็นในกรอบก่อน');setSig(d.target,cv.toDataURL('image/png'));toast('บันทึกลายเซ็นแล้ว');render();}
 else if(a==='sigdel'){setSig(d.target,null);render();}
 else if(a==='descdel'){metaOf(S.scCode).img=null;render();}
 else if(a==='evall'){const v=$('#evall').value;if(v==='')return toast('เลือกระดับก่อน');const K=EVK.find(x=>x[0]===S.evKind),st=S.ev[SKEY()]||(S.ev[SKEY()]={});calc(S.scCode).forEach(r=>{(st[r.s.id]=st[r.s.id]||{})[K[0]]=K[3].map(()=>+v);});render();}
});
reg('change',e=>{const t=e.target,d=t.dataset;
 if(t.id==='desc'){metaOf(S.scCode).desc=t.value;}
 else if(t.id==='descimg'&&t.files[0]){readImg(t.files[0],1200,'jpeg',u=>{metaOf(S.scCode).img=u;render();});}
 else if(d.sigfile!==undefined&&t.files[0]){readImg(t.files[0],520,'png',u=>{setSig(d.sigfile,u);toast('แนบลายเซ็นแล้ว');render();});}
 else if(d.std!==undefined||d.hrsu!==undefined){const raw=String(d.std!==undefined?d.std:d.hrsu),T=raw.includes(':')?1:S.term,g=groupsOf(cfgOf(S.scCode,T))[+raw.split(':').pop()],m=metaOf(S.scCode),u=(m.units[uk(T,g.label)]=m.units[uk(T,g.label)]||{});if(d.std!==undefined)u.std=t.value;else u.hrs=t.value;render();}
 else if(d.fw!==undefined||d.fa!==undefined||d.fd!==undefined){const sid=d.fw??d.fa??d.fd,f=S.fix[SKEY()]||(S.fix[SKEY()]={}),x=f[sid]||(f[sid]={});if(d.fw!==undefined)x.why=t.value;else if(d.fa!==undefined)x.after=t.value;else x.date=t.value;render();}
 else if(d.sg){const s=S.sign[SKEY()]||(S.sign[SKEY()]={});s[d.sg]=t.checked;render();}
 else if(t.id==='dirsel'){(S.sign[SKEY()]=S.sign[SKEY()]||{}).dir=t.value||null;render();}
 else if(t.id==='dirdate'){(S.sign[SKEY()]=S.sign[SKEY()]||{}).date=t.value;render();}
 else if(d.rs!==undefined){const m=S.rs[SKEY()]||(S.rs[SKEY()]={});m[d.rs]=t.checked;render();}
 else if(d.cu!==undefined){cfgOf(S.scCode).cols[+d.cu].u=t.value;render();}
 else if(d.sc2){S.school[d.sc2]=t.value;}
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
function rptPage(L,s,D){const yr=S.year,sc=S.school,hr=(HOMEROOM[L]||[]),st=S.rpt[L]||{},T=D.T,M=D.mode;
 const rows=D.cal.map(x=>{const r=x.R.find(q=>q.s.id===s.id);return {c:x.c,add:x.c.code[3]==='2',r};});
 const pctOf=r=>M==='p1'?(r.cur==null?null:r.cur/50*100):M==='p2'?r.sum:r.tot;
 const have=rows.filter(x=>pctOf(x.r)!=null),mean=have.length?have.reduce((a,x)=>a+pctOf(x.r),0)/have.length:null,ap=rows.filter(x=>x.r.pct!=null),mAtt=ap.length?ap.reduce((a,x)=>a+x.r.pct,0)/ap.length:null;
 const gn=rows.map(x=>x.r.g).filter(g=>typeof g==='number'),gpa=gn.length?gn.reduce((a,b)=>a+b,0)/gn.length:null;
 const nm=s.name.trim().split(/\s+/),sur=nm.length>1?nm.pop():'',fn=nm.join(' ');
 const sigT=st.t?S.sigs[hr[0]]:null,sigD=st.dir?sc.officers.dir.sig:null;
 const sg=(img,name,role)=>`<div class="sg"><div>ลงชื่อ ${img?sigImg(img):'..............................................'}</div><div>( ${name||'........................................'} )</div><div>${role}</div></div>`;
 const att=r=>r.pct==null?'-':r.pct.toFixed(1);
 const cols={p1:6,p2:8,s:6}[M];
 const head={p1:`<tr><th rowspan="2">รหัสวิชา</th><th rowspan="2">รายวิชา</th><th colspan="4">ภาคเรียนที่ 1</th></tr><tr><th>คะแนนเต็ม</th><th>คะแนนที่ได้</th><th>เวลาเรียน (%)</th><th>หมายเหตุ</th></tr>`,
  p2:`<tr><th rowspan="2">รหัสวิชา</th><th rowspan="2">รายวิชา</th><th colspan="6">ผลการเรียนทั้งปี</th></tr><tr><th>ภาคเรียนที่ 1 (50)</th><th>ภาคเรียนที่ 2 (50)</th><th>รวม (100)</th><th>ระดับผลการเรียน</th><th>เวลาเรียน (%)</th><th>หมายเหตุ</th></tr>`,
  s:`<tr><th rowspan="2">รหัสวิชา</th><th rowspan="2">รายวิชา</th><th colspan="4">ภาคเรียนที่ ${T}</th></tr><tr><th>คะแนนเต็ม</th><th>คะแนนที่ได้</th><th>ระดับผลการเรียน</th><th>เวลาเรียน (%)</th></tr>`}[M];
 const line=x=>{const r=x.r,c=x.c;return `<tr><td class="num">${c.code}</td><td>${esc(c.name)}</td>`+({
  p1:`<td class="num">50</td><td class="num sc">${f1(r.cur)}</td><td class="num">${att(r)}</td><td class="num"></td>`,
  p2:`<td class="num">${f1(r.pr)}</td><td class="num">${f1(r.cur)}</td><td class="num sc">${f1(r.sum)}</td><td class="num sc">${r.g==null?'-':r.g}</td><td class="num">${att(r)}</td><td class="num"></td>`,
  s:`<td class="num">100</td><td class="num sc">${f1(r.tot)}</td><td class="num sc">${r.g==null?'-':r.g}</td><td class="num">${att(r)}</td>`}[M])+`</tr>`;};
 const grp=(t,l)=>l.length?`<tr><th class="grp" colspan="${cols}">${t}</th></tr>${l.map(line).join('')}`:'';
 const avgRow=M==='p1'?`<tr><th colspan="3" style="text-align:right">คะแนนเฉลี่ยร้อยละ</th><td colspan="3" class="avg">${mean==null?'-':mean.toFixed(1)}</td></tr>`
  :`<tr><th colspan="${M==='p2'?4:3}" style="text-align:right">คะแนนเฉลี่ยร้อยละ</th><td colspan="${cols-(M==='p2'?4:3)}" class="avg">${mean==null?'-':mean.toFixed(1)}</td></tr>`;
 const actRes=a=>{if(a==='ชุมนุม'){const m=Object.values(S.members).find(m=>(m.ids||[]).includes(s.id));return m?((m.v||{})[s.id]||'-'):'-';}const v=((S.acts[L+'|'+a]||{}).v||{})[s.id];return v||'-';};
 const sumRows=M==='p1'?`<tr><td colspan="2">จำนวนรายวิชาที่มีคะแนน</td><td class="num">${have.length} / ${rows.length}</td></tr>
  <tr><td colspan="2">เวลาเรียนเฉลี่ย (ร้อยละ)</td><td class="num">${mAtt==null?'-':mAtt.toFixed(1)}</td></tr>
  <tr><td colspan="2">คุณลักษณะอันพึงประสงค์ การอ่าน คิดวิเคราะห์และเขียน สมรรถนะ และกิจกรรมพัฒนาผู้เรียน</td><td class="num">ประเมินในภาคเรียนที่ 2</td></tr>`
  :`<tr><td colspan="2">ผลการเรียนเฉลี่ย (GPA)</td><td class="num">${gpa==null?'-':gpa.toFixed(2)}</td></tr>
  <tr><td colspan="2">เวลาเรียนเฉลี่ย (ร้อยละ)</td><td class="num">${mAtt==null?'-':mAtt.toFixed(1)}</td></tr>
  ${['ชุมนุม','แนะแนว','ลูกเสือ-เนตรนารี','กิจกรรมเพื่อสังคมและสาธารณประโยชน์'].map(a=>`<tr><td colspan="2">กิจกรรมพัฒนาผู้เรียน: ${a}</td><td class="num">${actRes(a)}</td></tr>`).join('')}`;
 const note={p1:'หมายเหตุ: ภาคเรียนที่ 1 ของประถมยังไม่ตัดสินระดับผลการเรียน (คะแนนเต็มวิชาละ 50) ผลการเรียนทั้งปีประกาศเมื่อสิ้นภาคเรียนที่ 2 · นักเรียนต้องมีเวลาเรียนไม่ต่ำกว่าร้อยละ 80',
  p2:'หมายเหตุ: ผลการเรียนทั้งปี = ภาคเรียนที่ 1 (50) + ภาคเรียนที่ 2 (50) = 100 คะแนน · เวลาเรียนนับรวมทั้งปี ต้องไม่ต่ำกว่าร้อยละ 80 · ร = รอการตัดสิน มส = ไม่มีสิทธิ์รับการตัดสิน',
  s:'หมายเหตุ: มัธยมตัดสินผลการเรียนทุกภาคเรียน · นักเรียนต้องมีเวลาเรียนไม่ต่ำกว่าร้อยละ 80 · ร = รอการตัดสิน มส = ไม่มีสิทธิ์รับการตัดสิน'}[M];
 return `<div class="pg rp"><div class="pj">ปพ.6</div>
 <div class="rhd"><img src="${LOGO}" alt=""><b>แบบรายงานผลการพัฒนาคุณภาพผู้เรียนรายบุคคล</b><b>ภาคเรียนที่ ${T}${M==='p2'?' (ประกาศผลทั้งปี)':''} ปีการศึกษา ${yr} &nbsp; ${esc(sc.name)}</b><span>${esc(sc.area)}</span></div>
 <div class="rn"><div class="lbl">ข้อมูลนักเรียน</div><div class="rl"><span><b>ชื่อ</b> ${esc(fn)}</span><span><b>สกุล</b> ${esc(sur)}</span><span><b>ชั้น</b> ${L}</span><span><b>เลขที่</b> ${s.no}</span></div></div>
 <div class="tw"><table class="rt2"><thead>${head}</thead><tbody>
 ${grp('วิชาพื้นฐาน',rows.filter(x=>!x.add))}${grp('วิชาเพิ่มเติม',rows.filter(x=>x.add))}
 ${avgRow}</tbody></table></div>
 <div class="tw"><table class="rt2"><thead><tr><th colspan="2">สรุปผลภาคเรียนที่ ${T}</th><th>ผล</th></tr></thead><tbody>${sumRows}</tbody></table></div>
 <div class="small">${note}</div>
 <div class="sg3">${sg(sigT,hr.length?USERS[hr[0]].name:'','ครูประจำชั้น')}${sg(sigD,sc.officers.dir.name,'ผู้อำนวยการโรงเรียน')}${sg(null,'','ผู้ปกครองรับทราบ')}</div></div>`;}

P.report=()=>{const L=LEVELS.includes(S.rpLevel)?S.rpLevel:'ป.3',D=rptData(L),T=D.T,s=D.stus.find(x=>x.id===S.rpStu)||D.stus[0],st=S.rpt[L]||(S.rpt[L]={});
 const ttl={p1:'ใบแจ้งผลการเรียน ประถม ภาคเรียนที่ 1',p2:'ใบแจ้งผลการเรียน ประถม ภาคเรียนที่ 2 (ผลทั้งปี)',s:`ใบแจ้งผลการเรียน มัธยม ภาคเรียนที่ ${T}`}[D.mode];
 const dsc={p1:'แจ้งคะแนนทุกวิชาของนักเรียน (เต็มวิชาละ 50) พร้อมเวลาเรียน ให้ผู้ปกครองรับทราบ ยังไม่ตัดสินเกรด',p2:'แจ้งผลการเรียนทั้งปี (ภาคเรียนที่ 1 + 2 = 100) ระดับผลการเรียน เวลาเรียนรวมทั้งปี และผลกิจกรรมพัฒนาผู้เรียน',s:'แจ้งคะแนน ระดับผลการเรียน เวลาเรียน และผลกิจกรรมพัฒนาผู้เรียนของภาคเรียนนี้'}[D.mode];
 return `<div class="stack"><div class="row">${LEVELS.map(l=>`<button class="chip" aria-pressed="${l===L}" data-rl="${l}">${l}</button>`).join('')}</div>
 <div class="row">${[1,2].map(t=>`<button class="chip" aria-pressed="${S.term===t}" data-term="${t}">ภาคเรียนที่ ${t}</button>`).join('')}</div>
 <div class="card stack"><h3>${ttl}</h3><div class="small muted">${dsc}</div>
 ${D.stus.length?`<div class="row"><label for="rpst">นักเรียน</label><select id="rpst">${D.stus.map(x=>`<option value="${x.id}" ${x.id===s.id?'selected':''}>${x.no}. ${esc(x.name)}</option>`).join('')}</select></div>
 <code style="word-break:break-all">${esc(rname(L,s,T))}</code>
 <div class="row"><button class="btn sm" data-act="rdl" data-w="one">PDF รายบุคคล</button><button class="btn sm alt" data-act="rdl" data-w="all">PDF ทั้งห้อง (${D.stus.length} คน คนละหน้า)</button></div>
 <code style="word-break:break-all">${esc(rname(L,null,T))}</code>
 <div class="row"><label><input type="checkbox" data-rsg="t" ${st.t?'checked':''}> ลงนามครูที่ปรึกษา</label>${isAdmin()?`<label><input type="checkbox" data-rsg="dir" ${st.dir?'checked':''}> ลงนาม ผอ.</label>`:''}</div>`:'<div class="empty">ห้องนี้ยังไม่มีนักเรียน</div>'}</div>
 ${D.cal.length?'':'<div class="card empty">ชั้นนี้ยังไม่มีรายวิชาที่เปิดสอนในภาคเรียนนี้</div>'}
 ${D.stus.length&&D.cal.length?rptPage(L,s,D):''}</div>`;};
const PRI_L=['ป.1','ป.2','ป.3','ป.4','ป.5','ป.6'];
reg('click',e=>{const t=e.target.closest('[data-rl],[data-act=rdl]');if(!t)return;const d=t.dataset;
 if(d.rl){S.rpLevel=d.rl;S.rpStu=null;render();}
 else{const L=S.rpLevel||'ป.3',s=STU.find(x=>x.id===S.rpStu)||STU.find(x=>x.level===L);toast('ตัวอย่าง: ระบบจริงจะดาวน์โหลด '+(d.w==='all'?rname(L,null):rname(L,s)));}});
reg('change',e=>{const t=e.target;if(t.id==='rpst'){S.rpStu=t.value;render();}else if(t.dataset.rsg){const L=S.rpLevel||'ป.3';(S.rpt[L]=S.rpt[L]||{})[t.dataset.rsg]=t.checked;render();}});

function stickNames(){document.querySelectorAll('#view .tw').forEach(w=>{const t=w.querySelector('table'),h=t&&t.querySelector('thead tr');if(!h)return;if(w.scrollWidth<=w.clientWidth+2){w.classList.remove('stk','stk1');return;}
 const th=[...h.children],i=th.findIndex(x=>/ชื่อ/.test(x.textContent)&&!(x.colSpan>1));if(i<0||i>1)return;
 w.classList.add('stk');w.classList.toggle('stk1',i===0);w.style.setProperty('--w0',th[0].offsetWidth+'px');});}
/* ---------- ชุมนุม ---------- */
function clubsHtml() {
  const admin = isAdmin(), clubs = Object.entries(S.members).sort((a, b) => a[0].localeCompare(b[0], 'th'))
  const L = S.clubLv, pool = ACT().filter((s) => s.level === L)
  return `<div class="card stack"><h3>ชุมนุม</h3>
  <div class="small muted">ครูผู้สอนชุมนุมเป็นผู้ตัดสิน เลือกสมาชิกจากนักเรียนทั้งโรงเรียน (ทีละคนหรือหลายคน) แล้วตัดสินเฉพาะสมาชิก</div>
  <div class="row"><input id="clubn" placeholder="ชื่อชุมนุมใหม่ เช่น ชุมนุมศิลปะ" size="26"><button class="btn sm" data-act="newclub">สร้างชุมนุม</button></div>
  ${clubs.map(([name, m]) => {
    const mine = m.owner === S.role || admin
    if (!mine) return `<div class="lock small">${esc(name)} — ผู้ตัดสิน: ${esc(USERS[m.owner].name)} (ไม่ใช่ชุมนุมของคุณ)</div>`
    const members = STU.filter((s) => (m.ids || []).includes(s.id))
    return `<div class="card stack" style="background:var(--bg,#fff)"><div class="row" style="justify-content:space-between"><b>${esc(name)}</b><span class="small muted">ผู้ตัดสิน: ${esc(USERS[m.owner].name)}</span></div>
    <div class="row">${LEVELS.map((l) => `<button class="chip" aria-pressed="${l === L}" data-clublv="${l}">${l}</button>`).join('')}</div>
    <div class="row">${pool.map((s) => `<button class="chip" aria-pressed="${(m.ids || []).includes(s.id)}" data-mem="${s.id}" data-club="${esc(name)}">${esc(s.name)}</button>`).join('') || '<span class="small muted">ไม่มีนักเรียนในชั้นนี้</span>'}</div>
    <div class="small">สมาชิก ${members.length} คน <button class="btn sm alt" data-act="clubpass" data-club="${esc(name)}">ผ่านทั้งชุมนุม</button> <button class="btn sm alt" data-act="delclub" data-club="${esc(name)}">ลบชุมนุม</button></div>
    ${members.length ? `<div class="tw"><table><thead><tr><th>ชื่อ</th><th>ชั้น</th><th>ผล</th></tr></thead><tbody>${members.map((s) => `<tr><td>${esc(s.name)}</td><td>${s.level}</td><td><select data-cv="${s.id}" data-club="${esc(name)}" aria-label="ผลของ ${esc(s.name)}"><option value="">-</option><option ${(m.v || {})[s.id] === 'ผ' ? 'selected' : ''}>ผ</option><option ${(m.v || {})[s.id] === 'มผ' ? 'selected' : ''}>มผ</option></select></td></tr>`).join('')}</tbody></table></div>` : ''}</div>`
  }).join('') || '<div class="small muted">ยังไม่มีชุมนุม</div>'}</div>`
}
function homeroomCard() {
  if (!isAdmin()) return ''
  return `<div class="card stack"><h3>ครูที่ปรึกษาประจำชั้น</h3><div class="small muted">ครูที่ปรึกษากรอกกิจกรรมพัฒนาผู้เรียนของห้อง และลงนามในใบแจ้งผล (ชื่อแรกเป็นผู้ลงนาม) ชั้นละไม่เกิน 2 คน</div>
  ${LEVELS.map((l) => `<div class="row"><b style="min-width:40px">${l}</b>${TEACHERS.map((t) => `<button class="chip" aria-pressed="${(HOMEROOM[l] || []).includes(t.uid)}" data-hr="${l}" data-uid="${t.uid}">${esc(t.name)}</button>`).join('') || '<span class="small muted">ยังไม่มีบัญชีครู</span>'}</div>`).join('')}</div>`
}

/* ---------- ดาวน์โหลด / พิมพ์ ---------- */
const WORD_NS = 'xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"'
function pageDoc(title, inner, word) {
  return `<!doctype html><html ${word ? WORD_NS : ''}><head><meta charset="utf-8"><title>${esc(title)}</title><style>${printCss(location.origin)}${word ? '' : ''}</style></head><body>${inner}</body></html>`
}
function printPages(title, inner) {
  const w = window.open('', '_blank')
  if (!w) return toast('เบราว์เซอร์บล็อกหน้าต่างใหม่ กรุณาอนุญาต pop-up แล้วกดอีกครั้ง')
  w.document.open(); w.document.write(pageDoc(title, inner)); w.document.close()
  const go = () => { w.focus(); w.print() }
  w.onload = () => { (w.document.fonts && w.document.fonts.ready ? w.document.fonts.ready : Promise.resolve()).then(() => setTimeout(go, 300)) }
}
function saveBlob(name, mime, text) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob(['﻿', text], { type: mime + ';charset=utf-8' }))
  a.download = name; document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 4000)
}
function bookPages() { return [...document.querySelectorAll('#view .pg')].map((e) => e.outerHTML).join('') }
function sheetHtml(c) {
  const cfg = cfgOf(c.code), R = calc(c.code), pri = isPri(c.level), t2 = pri && S.term === 2, F = fulls(c.code)
  const th = ['เลขที่', 'ชื่อ-สกุล', ...cfg.cols.map((k) => `${k.n} (${k.max})`), 'รวมระหว่างภาค', `ปลายภาค (${F.fin})`, 'ชั่วโมงที่ขาด', 'เวลาเรียน %'].concat(pri ? (t2 ? ['ภาคเรียน 1 (50)', 'ภาคเรียน 2 (50)', 'รวมทั้งปี', 'เกรด'] : ['ภาคเรียน 1 (50)']) : ['รวม', 'เกรด'])
  const rows = R.map((r) => [r.s.no, r.s.name, ...cfg.cols.map((k, i) => r.v.c[i] ?? ''), f1(r.mid), r.v.f ?? '', r.a[S.term] > 0 ? r.a[S.term] : 0, r.pct == null ? '-' : f1(r.pct)].concat(pri ? (t2 ? [f1(r.pr), f1(r.cur), f1(r.sum), r.g ?? '-'] : [f1(r.cur)]) : [f1(r.tot), r.g ?? '-']))
  return `<html><head><meta charset="utf-8"></head><body><table border="1"><tr><td colspan="${th.length}"><b>${esc(c.code)} ${esc(c.name)} ${c.level} ปีการศึกษา ${S.year} ${isPri(c.level) ? '' : 'ภาคเรียนที่ ' + S.term}</b></td></tr><tr>${th.map((x) => `<th>${esc(x)}</th>`).join('')}</tr>${rows.map((r) => `<tr>${r.map((x) => `<td>${esc(x)}</td>`).join('')}</tr>`).join('')}</table></body></html>`
}
function downloadBook(f) {
  const c = CAT.find((x) => x.code === S.scCode)
  if (!c) return
  const R = calc(c.code), pri = isPri(c.level)
  if ((!pri || S.term === 2) && evMiss(c.code, S.term, R)) return toast('ยังประเมินผู้เรียนไม่ครบ ดาวน์โหลดไม่ได้')
  if (f === 'PDF') printPages(fname(c, 'pdf').replace(/\.pdf$/, ''), bookPages())
  else if (f === 'Word') saveBlob(fname(c, 'doc'), 'application/msword', pageDoc(fname(c, 'doc'), bookPages(), true))
  else saveBlob(fname(c, 'xls'), 'application/vnd.ms-excel', sheetHtml(c))
}
function downloadReport(which) {
  const L = S.rpLevel || 'ป.3', D = rptData(L), s = D.stus.find((x) => x.id === S.rpStu) || D.stus[0]
  if (!s) return
  if (which === 'all') printPages(rname(L, null, D.T).replace(/\.pdf$/, ''), D.stus.map((x) => rptPage(L, x, D)).join(''))
  else printPages(rname(L, s, D.T).replace(/\.pdf$/, ''), rptPage(L, s, D))
}

/* ---------- ตัวจัดการเหตุการณ์หลัก ---------- */
reg('click', (e) => {
  const t = e.target.closest('[data-go],[data-term],[data-actlv],[data-mem],[data-act],[data-hr],[data-clublv]')
  if (!t || !$('#view') || !$('#view').contains(t)) return
  const d = t.dataset
  if (d.go) { const [pg, cd] = d.go.split('@'); if (cd) S.scCode = cd; CTX.go(pg); return }
  if (d.term) { CTX.setTerm(+d.term); return }
  if (d.actlv) { S.actLevel = d.actlv; render(); return }
  if (d.clublv) { S.clubLv = d.clublv; render(); return }
  if (d.hr) { const a = (HOMEROOM[d.hr] = HOMEROOM[d.hr] || []), i = a.indexOf(d.uid); if (i < 0) { if (a.length >= 2) return toast('ที่ปรึกษาห้องละไม่เกิน 2 คน'); a.push(d.uid) } else a.splice(i, 1); render(); return }
  if (d.mem) { const m = S.members[d.club]; m.ids = m.ids || []; const k = m.ids.indexOf(d.mem); k < 0 ? m.ids.push(d.mem) : (m.ids.splice(k, 1), m.v && delete m.v[d.mem]); render(); return }
  const a = d.act
  if (a === 'newclub') { const n = ($('#clubn').value || '').trim(); if (!n) return toast('พิมพ์ชื่อชุมนุม'); if (S.members[n]) return toast('มีชุมนุมชื่อนี้แล้ว'); S.members[n] = { owner: S.role, ids: [], v: {} }; render() }
  else if (a === 'delclub') { const m = S.members[d.club]; if (m && confirm('ลบชุมนุม ' + d.club + ' ?')) { delete S.members[d.club]; render() } }
  else if (a === 'clubpass') { const m = S.members[d.club]; m.v = m.v || {}; (m.ids || []).forEach((id) => (m.v[id] = 'ผ')); render() }
  else if (a === 'allpass') { const st = S.acts[d.key]; if (!claim(d.key)) return; ACT().filter((s) => s.level === d.key.split('|')[0]).forEach((s) => (st.v[s.id] = 'ผ')); render() }
  else if (a === 'release') { S.acts[d.key].owner = null; render() }
  else if (a === 'addcol') { const cf = cfgOf(S.scCode); cf.cols.push({ n: 'ช่องที่ ' + (cf.cols.length + 1), max: 0 }); render() }
  else if (a === 'delcol') { cfgOf(S.scCode).cols.splice(+d.i, 1); render() }
  else if (a === 'dl') downloadBook(d.f)
  else if (a === 'rdl') downloadReport(d.w)
})
reg('change', (e) => {
  const t = e.target
  if (!$('#view') || !$('#view').contains(t)) return
  if (t.id === 'sub') { S.scCode = t.value; render() }
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
  else if (t.dataset.av) { const st = S.acts[t.dataset.av]; if (!claim(t.dataset.av)) { render(); return } st.v[t.dataset.s] = t.value }
  else if (t.dataset.cv) { const m = S.members[t.dataset.club]; m.v = m.v || {}; m.v[t.dataset.cv] = t.value }
})
function claim(key) {
  const st = S.acts[key]; if (isAdmin()) return true
  if (st.owner && st.owner !== S.role) { toast('ครูอีกคนกรอกกิจกรรมนี้แล้ว'); return false }
  if (!st.owner) st.owner = S.role
  return true
}

/* ---------- วาดหน้า ---------- */
function stickAll() { stickNames() }
function render() {
  const v = $('#view'); if (!v) return
  if (!ready()) { v.innerHTML = '<div class="card empty">กำลังโหลดข้อมูล…</div>'; return }
  try { v.innerHTML = P[S.page]() } catch (err) { console.error(err); v.innerHTML = `<div class="card lock">แสดงหน้านี้ไม่ได้: ${esc(err.message)}</div>`; return }
  stickNames(); initSig(); persist()
}
function softRender() {
  const a = document.activeElement
  if (a && $('#view') && $('#view').contains(a) && /^(INPUT|SELECT|TEXTAREA)$/.test(a.tagName)) return
  render()
}

/* ---------- บันทึก/ซิงก์กับ Firestore ---------- */
const st8 = { work: false, settings: false }
const ready = () => st8.work && st8.settings && S.year && CAT.length
const lastJson = {}
const metaOfId = {}
const pending = {}
const timers = {}
let unsubs = []
const docId = (b, sub) => `${S.year}~${b}~${encodeURIComponent(sub).replace(/\./g, '%2E')}`
function cleaned(b, d) {
  if (b === 'scores') { const o = {}; for (const [k, v] of Object.entries(d)) if ((v.c || []).some((x) => x !== '' && x != null) || (v.f !== '' && v.f != null)) o[k] = v; return o }
  if (b === 'ab') { const o = {}; for (const [k, v] of Object.entries(d)) if (Object.values(v).some((x) => +x > 0)) o[k] = v; return o }
  return d
}
function persist() {
  if (!st8.work || !CTX) return
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
      delete lastJson[id]; delete pending[id]; deleteDoc(doc(db, 'work', id)).catch(report); delete metaOfId[id]
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
function report(err) { console.error(err); toast('บันทึกไม่สำเร็จ: ' + (err.code === 'permission-denied' ? 'ไม่มีสิทธิ์' : err.message)) }
let lastSettings = null
function settingsJson() { return JSON.stringify({ school: S.school, homeroom: HOMEROOM, guidance: S.guidance, names: NAMES }) }
function persistSettings() {
  if (!isAdmin() || !st8.settings) return
  TEACHERS.forEach((t) => (NAMES[t.uid] = t.name))
  const j = settingsJson(); if (j === lastSettings) return
  lastSettings = j
  setDoc(doc(db, 'settings', 'school'), { json: j, at: Date.now() }).catch(report)
}
let lastSig
function persistSig() {
  if (!st8.sigsLoaded) return
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
  unsubs.push(onSnapshot(doc(db, 'settings', 'school'), (s) => {
    if (s.exists() && !s.metadata.hasPendingWrites) { lastSettings = s.data().json; applySettings(s.data().json) }
    else if (!s.exists()) lastSettings = null
    st8.settings = true; softRender()
  }, report))
  unsubs.push(onSnapshot(collection(db, 'sigs'), (snap) => {
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
  S.page = PAGES_OK.includes(page) ? page : 'scores'
  CAT = ctx.catalog.map((c) => ({ level: c.level, term: isPri(c.level) ? 0 : +c.term, code: c.code, name: c.name }))
  const rk = (s) => ({ ...s, st: (s.status || 'active') === 'active' ? undefined : s.status })
  STU = ctx.students.map(rk).sort((a, b) => LEVELS.indexOf(a.level) - LEVELS.indexOf(b.level) || (a.no || 0) - (b.no || 0))
  S.openSubj = ctx.openSet
  S.regs = ctx.regs.map((r) => ({ id: r.id, t: r.uid, name: r.name, codes: r.codes, status: r.status, msg: r.msg, term: r.term }))
  TEACHERS = ctx.teachers || []
  if (ctx.user.role === 'superadmin') Object.assign(NAMES, {})
  rebuildUsers()
  if (!started) { started = true; subscribeStatic(); LISTENERS.forEach(([t, f]) => document.addEventListener(t, f)); window.addEventListener('resize', stickAll) }
  if (S.year !== ctx.year) { S.year = ctx.year; subscribeAll() }
  if (!S.scCode || !CAT.find((c) => c.code === S.scCode)) S.scCode = null
  render()
}
export function engineStop() {
  unsubs.forEach((f) => f()); unsubs = []
  LISTENERS.forEach(([t, f]) => document.removeEventListener(t, f)); window.removeEventListener('resize', stickAll)
  Object.keys(timers).forEach((id) => { clearTimeout(timers[id]); flush(id) })
  started = false; CTX = null; S.year = 0; st8.work = false; st8.settings = false; st8.sigsLoaded = false
}
