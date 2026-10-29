import { initializeApp, getApps, cert } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'

if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: (process.env.FIREBASE_ADMIN_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
    }),
  })
}

export const adminAuth = getAuth()
export const adminDb = getFirestore()

export const USER_DOMAIN = 'grade.local'
export const usernameToEmail = (u) =>
  u.includes('@') ? u.trim() : `${u.trim().toLowerCase()}@${USER_DOMAIN}`

// ตรวจ token ของผู้เรียก และคืนข้อมูลบทบาทจาก Firestore
export async function requireRole(req, allowed) {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null
  if (!token) throw Object.assign(new Error('ไม่ได้เข้าสู่ระบบ'), { status: 401 })
  const decoded = await adminAuth.verifyIdToken(token)
  const snap = await adminDb.doc(`users/${decoded.uid}`).get()
  const user = snap.data()
  if (!user || !allowed.includes(user.role)) {
    throw Object.assign(new Error('ไม่มีสิทธิ์ทำรายการนี้'), { status: 403 })
  }
  return { uid: decoded.uid, ...user }
}
