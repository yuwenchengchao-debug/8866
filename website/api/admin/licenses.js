import { sql } from '@vercel/postgres'

const ADMIN_KEY = 'admin_key_2024_very_secure_xyz'

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: '仅支持 GET 请求' })
  }

  const adminKey = req.headers['x-admin-key']
  if (adminKey !== ADMIN_KEY) {
    return res.status(403).json({ error: '无权限访问' })
  }

  try {
    const { rows } = await sql`
      SELECT * FROM license_keys ORDER BY created_at DESC
    `
    
    return res.json({ licenses: rows })
  } catch (error) {
    console.error('[获取卡密列表失败]', error)
    return res.status(500).json({ error: '获取失败: ' + error.message })
  }
}
