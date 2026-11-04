// GET /api/student-result?sid=43261[&year=2569&term=1]
// นักเรียนดูผลการเรียนที่แอดมินเผยแพร่แล้ว (ไม่ต้องล็อกอิน)
//  - อ่านจาก published/* ด้วย Admin SDK เท่านั้น (ฝั่งเว็บอ่าน collection นี้ไม่ได้)
//  - ตัดข้อมูลตามตัวเลือกใน publishMeta/{ปี_ภาค}.opts (คะแนน / ผลประเมิน / กิจกรรม / PDF)
//  - กันการสุ่มเลขประจำตัว: กรอกผิดเกิน 10 ครั้งใน 15 นาที (ต่อ IP) จะถูกพักการค้นชั่วคราว
import crypto from 'node:crypto'
import { adminDb } from './_admin.js'

const WINDOW_MS = 15 * 60 * 1000
const MAX_FAILS = 10
const DEFAULT_OPTS = { score: true, ev: true, act: true, pdf: true }
const send = (res, status, body) => {
  res.setHeader('Cache-Control', 'no-store')
  return res.status(status).json(body)
}

const ipOf = (req) => String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim()
const rlRef = (req) => adminDb.doc('rl/' + crypto.createHash('sha256').update('stu:' + ipOf(req)).digest('hex').slice(0, 32))

async function blocked(ref) {
  const s = await ref.get()
  const d = s.exists ? s.data() : null
  return d && Date.now() - d.t < WINDOW_MS && d.n >= MAX_FAILS
}
async function addFail(ref) {
  await adminDb.runTransaction(async (tx) => {
    const s = await tx.get(ref)
    const d = s.exists ? s.data() : null
    const fresh = !d || Date.now() - d.t >= WINDOW_MS
    tx.set(ref, { n: fresh ? 1 : d.n + 1, t: fresh ? Date.now() : d.t })
  })
}

// ตัดข้อมูลที่แอดมินไม่ได้เปิดให้ดู
function shape(doc, opts) {
  const d = doc.data
  const out = {
    year: d.year, term: d.term, level: d.level, mode: d.mode, crW: d.crW, full: d.full,
    gpa: d.gpa, crAll: d.crAll, crGot: d.crGot, publishedAt: doc.at,
    subjects: d.subjects.map((x) => ({
      code: x.code, name: x.name, type: x.type, cr: x.cr, grade: x.grade, after: x.after,
      ...(opts.score || d.mode === 'p1' ? { score: x.score } : {}),
    })),
    showScore: !!opts.score || d.mode === 'p1', // ประถมภาคเรียนที่ 1 ยังไม่มีเกรด จึงแสดงคะแนนเสมอ
  }
  if (opts.ev) Object.assign(out, { evA: d.evA, evR: d.evR })
  if (opts.act) Object.assign(out, { acts: d.acts, actAll: d.actAll })
  if (opts.pdf) out.html = (opts.score || d.mode === 'p1' || !doc.htmlNs ? doc.html : doc.htmlNs) || null
  return out
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return send(res, 405, { error: 'method not allowed' })
  const sid = String(req.query.sid || '').replace(/\D/g, '').slice(0, 12)
  if (sid.length < 3) return send(res, 400, { error: 'กรอกเลขประจำตัวนักเรียนให้ครบ' })
  try {
    const ref = rlRef(req)
    if (await blocked(ref)) return send(res, 429, { error: 'กรอกผิดหลายครั้งเกินไป โปรดรอประมาณ 15 นาทีแล้วลองใหม่' })

    const snap = await adminDb.collection('published').where('sidKey', '==', sid).get()
    if (snap.empty) {
      await addFail(ref)
      return send(res, 404, { error: 'ไม่พบเลขประจำตัวนี้ หรือชั้นของนักเรียนยังไม่ประกาศผล' })
    }
    const docs = snap.docs.map((x) => x.data())
    // ภาคเรียนที่ดูได้ เรียงล่าสุดก่อน
    const terms = [...new Map(docs.map((x) => [x.year + '_' + x.term, { year: x.year, term: x.term }])).values()]
      .sort((a, b) => b.year - a.year || b.term - a.term)
    const want = terms.find((t) => String(t.year) === String(req.query.year) && String(t.term) === String(req.query.term)) || terms[0]
    const pick = docs.find((x) => x.year === want.year && x.term === want.term)
    const meta = (await adminDb.doc(`publishMeta/${want.year}_${want.term}`).get()).data() || {}
    const opts = { ...DEFAULT_OPTS, ...(meta.opts || {}) }
    const d = pick.data
    return send(res, 200, {
      student: { name: d.name, level: d.level, no: d.no, sid: d.sid },
      terms,
      result: shape(pick, opts),
    })
  } catch (e) {
    console.error(e)
    return send(res, 500, { error: 'ระบบขัดข้องชั่วคราว ลองใหม่อีกครั้ง' })
  }
}
