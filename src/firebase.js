import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore, initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore'

const app = initializeApp({
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
})

export const auth = getAuth(app)
// เก็บสำเนาข้อมูลไว้ในเครื่อง (IndexedDB) และให้ทุกแท็บใช้การเชื่อมต่อเดียวกัน
// รีโหลดหน้า/เปิดหลายแท็บ จะอ่านเฉพาะเอกสารที่เปลี่ยน ไม่ต้องอ่านทั้งปีใหม่ทุกครั้ง (ประหยัดโควตา Firestore)
let _db
try { _db = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) }) }
catch { _db = getFirestore(app) } // เบราว์เซอร์ที่ไม่รองรับ (เช่นโหมดส่วนตัวบางตัว) ใช้แบบปกติ
export const db = _db

// ครูล็อกอินด้วยชื่อผู้ใช้ -> แปลงเป็นอีเมลภายในของ Firebase Auth
export const USER_DOMAIN = 'grade.local'
export const usernameToEmail = (u) =>
  u.includes('@') ? u.trim() : `${u.trim().toLowerCase()}@${USER_DOMAIN}`
