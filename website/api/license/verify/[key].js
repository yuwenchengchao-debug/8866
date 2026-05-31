import { sql } from '@vercel/postgres'

export default async function handler(req, res) {
  const { key } = req.query
  const deviceId = req.query.deviceId

  if (!key) {
    return res.status(400).json({ error: '缺少卡密参数' })
  }

  try {
    const { rows } = await sql`
      SELECT * FROM license_keys WHERE key = ${key}
    `
    
    if (rows.length === 0) {
      return res.json({ valid: false, error: '卡密不存在' })
    }
    
    const license = rows[0]
    
    if (license.expires_at) {
      const now = new Date().toISOString()
      if (now > license.expires_at) {
        return res.json({ valid: false, error: '卡密已过期' })
      }
    }
    
    if (license.used && deviceId && license.used_by !== deviceId) {
      return res.json({ valid: false, error: '卡密已被其他设备使用' })
    }
    
    return res.json({ 
      valid: true, 
      used: license.used,
      expiresAt: license.expires_at,
      type: license.type
    })
  } catch (error) {
    console.error('[卡密验证失败]', error)
    return res.status(500).json({ error: '验证失败: ' + error.message })
  }
}
