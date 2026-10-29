export const LEVELS = ['ป.1', 'ป.2', 'ป.3', 'ป.4', 'ป.5', 'ป.6', 'ม.1', 'ม.2', 'ม.3']
export const isPri = (level) => level.startsWith('ป')

export const ROLE_LABEL = {
  superadmin: 'แอดมินหลัก',
  schooladmin: 'แอดมินโรงเรียน',
  teacher: 'ครูผู้สอน',
}
export const isAdminRole = (role) => role === 'superadmin' || role === 'schooladmin'

export const STUDENT_STATUS = { active: 'กำลังเรียน', out: 'ย้ายออก', grad: 'จบการศึกษา' }

export const REG_STATUS = { pending: 'รออนุมัติ', ok: 'อนุมัติแล้ว', back: 'ส่งกลับแก้ไข' }

export const nowTh = () =>
  new Date().toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' })
