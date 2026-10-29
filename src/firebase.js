import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'

const app = initializeApp({
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
})

export const auth = getAuth(app)
export const db = getFirestore(app)

// ครูล็อกอินด้วยชื่อผู้ใช้ -> แปลงเป็นอีเมลภายในของ Firebase Auth
export const USER_DOMAIN = 'grade.local'
export const usernameToEmail = (u) =>
  u.includes('@') ? u.trim() : `${u.trim().toLowerCase()}@${USER_DOMAIN}`
