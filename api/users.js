// POST /api/users  (ต้องส่ง Authorization: Bearer <Firebase ID token>)
//  { action: 'create', username, name, role, tempPassword }  -> สร้างผู้ใช้ (แอดมินหลัก/แอดมินโรงเรียน)
//  { action: 'reset',  uid, tempPassword }                   -> รีเซ็ตรหัส (แอดมินหลักและแอดมินโรงเรียน; รีเซ็ตบัญชีแอดมินหลักและบัญชีตัวเองไม่ได้)
//  { action: 'update', uid, name?, role? }                   -> แก้ชื่อ/บทบาท (แอดมินหลักเท่านั้น)
//  { action: 'setActive', uid, active }                      -> เปิด/ปิดใช้งานบัญชี (แอดมินหลักเท่านั้น)
//  { action: 'delete', uid }                                 -> ลบบัญชี (แอดมินหลักเท่านั้น)
// ผู้ใช้ใหม่/รีเซ็ตทุกคนถูกบังคับเปลี่ยนรหัสเมื่อเข้าครั้งแรก (mustChangePassword = true)
import { adminAuth, adminDb, requireRole, usernameToEmail } from './_admin.js'

const send = (res, status, body) => res.status(status).json(body)
const fail = (status, error) => Object.assign(new Error(error), { status })

// ผู้ใช้เป้าหมายต้องมีอยู่ ไม่ใช่ตัวเอง และไม่ใช่แอดมินหลัก
async function target(uid, caller) {
  if (!uid) throw fail(400, 'ไม่พบผู้ใช้')
  if (uid === caller.uid) throw fail(400, 'ทำรายการกับบัญชีของตัวเองไม่ได้')
  const snap = await adminDb.doc(`users/${uid}`).get()
  if (!snap.exists) throw fail(404, 'ไม่พบผู้ใช้')
  if (snap.data().role === 'superadmin') throw fail(403, 'แก้ไขบัญชีแอดมินหลักไม่ได้')
  return snap.data()
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'method not allowed' })
  try {
    const { action, username, name, role, uid, tempPassword, active } = req.body || {}

    if (action === 'create') {
      if (!tempPassword || tempPassword.length < 6) throw fail(400, 'รหัสผ่านเริ่มต้นต้องยาวอย่างน้อย 6 ตัว')
      const caller = await requireRole(req, ['superadmin', 'schooladmin'])
      if (!['teacher', 'schooladmin'].includes(role)) throw fail(400, 'บทบาทไม่ถูกต้อง')
      // แอดมินโรงเรียนสร้างได้เฉพาะครู
      if (caller.role === 'schooladmin' && role !== 'teacher') throw fail(403, 'แอดมินโรงเรียนสร้างได้เฉพาะบัญชีครู')
      if (!username || !name) throw fail(400, 'กรอกชื่อผู้ใช้และชื่อ-สกุล')

      const created = await adminAuth.createUser({
        email: usernameToEmail(username),
        password: tempPassword,
        displayName: name,
      })
      await adminDb.doc(`users/${created.uid}`).set({
        username: username.trim().toLowerCase(),
        name,
        role,
        active: true,
        mustChangePassword: true,
        createdAt: new Date().toISOString(),
      })
      return send(res, 200, { uid: created.uid })
    }

    // รีเซ็ตรหัส: แอดมินหลักและแอดมินโรงเรียนทำได้ (target() กันไม่ให้รีเซ็ตแอดมินหลักและตัวเอง)
    if (action === 'reset') {
      if (!tempPassword || tempPassword.length < 6) throw fail(400, 'รหัสผ่านเริ่มต้นต้องยาวอย่างน้อย 6 ตัว')
      const caller = await requireRole(req, ['superadmin', 'schooladmin'])
      await target(uid, caller)
      await adminAuth.updateUser(uid, { password: tempPassword })
      await adminAuth.revokeRefreshTokens(uid)
      await adminDb.doc(`users/${uid}`).update({ mustChangePassword: true })
      return send(res, 200, { ok: true })
    }

    // ต่อไปนี้ เฉพาะแอดมินหลัก
    const caller = await requireRole(req, ['superadmin'])

    if (action === 'update') {
      await target(uid, caller)
      const patch = {}
      if (typeof name === 'string' && name.trim()) patch.name = name.trim()
      if (role !== undefined) {
        if (!['teacher', 'schooladmin'].includes(role)) throw fail(400, 'บทบาทไม่ถูกต้อง')
        patch.role = role
      }
      if (!Object.keys(patch).length) throw fail(400, 'ไม่มีข้อมูลที่จะแก้ไข')
      await adminDb.doc(`users/${uid}`).update(patch)
      if (patch.name) await adminAuth.updateUser(uid, { displayName: patch.name })
      return send(res, 200, { ok: true })
    }

    if (action === 'setActive') {
      await target(uid, caller)
      const on = active !== false
      await adminAuth.updateUser(uid, { disabled: !on })
      if (!on) await adminAuth.revokeRefreshTokens(uid)
      await adminDb.doc(`users/${uid}`).update({ active: on })
      return send(res, 200, { ok: true })
    }

    if (action === 'delete') {
      await target(uid, caller)
      await adminAuth.deleteUser(uid)
      await adminDb.doc(`users/${uid}`).delete()
      return send(res, 200, { ok: true })
    }

    return send(res, 400, { error: 'action ไม่ถูกต้อง' })
  } catch (e) {
    return send(res, e.status || 500, { error: e.code === 'auth/email-already-exists' ? 'มีชื่อผู้ใช้นี้อยู่แล้ว' : e.message })
  }
}
