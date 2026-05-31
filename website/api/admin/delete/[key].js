import { sql } from '@vercel/postgres'

const ADMIN_KEY = 'admin_key_2024_very_secure_xyz'

export default async function handler(req, res) {
  if (req.method !== 'DELETE') {
    return res.status(405).json({ error: '仅支持 DELETE 请求' })
  }

  const adminKey = req.headers['x-admin-key']
  if (adminKey !== ADMIN_KEY) {
    return res.status(403).json({ error: '无权限访问' })
  }

  const { key } = req.query

  if (!key) {
    return res.status(400).json({ error: '缺少卡密参数' })
  }

  try {
    await sql`
      DELETE FROM license_keys WHERE key = ${key}
    `
    
    return res.json({ success: true })
  } catch (error) {
    console.error('[删除卡密失败]', error)
    return res.status(500).json({ error: '删除失败: ' + error.message })
  }
}
