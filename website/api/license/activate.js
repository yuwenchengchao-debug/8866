import { sql } from '@vercel/postgres'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: '仅支持 POST 请求' })
  }

  const { key, deviceId } = req.body

  if (!key) {
    return res.status(400).json({ error: '请输入卡密' })
  }

  try {
    // 查询卡密
    const { rows } = await sql`
      SELECT * FROM license_keys WHERE key = ${key}
    `
    
    if (rows.length === 0) {
      return res.status(401).json({ error: '卡密无效' })
    }
    
    const license = rows[0]
    
    // 检查是否已激活
    if (license.used) {
      if (license.used_by !== deviceId) {
        return res.status(401).json({ error: '卡密已被其他设备使用' })
      }
      return res.json({ success: true, message: '已激活', activated: true })
    }
    
    // 检查是否过期
    if (license.expires_at) {
      const now = new Date().toISOString()
      if (now > license.expires_at) {
        return res.status(401).json({ error: '卡密已过期' })
      }
    }
    
    // 激活卡密
    await sql`
      UPDATE license_keys 
      SET used = TRUE, 
          used_by = ${deviceId || 'unknown'}, 
          used_at = CURRENT_TIMESTAMP 
      WHERE key = ${key}
    `
    
    return res.json({ success: true, message: '激活成功', activated: false })
  } catch (error) {
    console.error('[卡密激活失败]', error)
    return res.status(500).json({ error: '激活失败: ' + error.message })
  }
}
