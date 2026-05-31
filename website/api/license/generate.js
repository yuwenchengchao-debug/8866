import { sql } from '@vercel/postgres'

function generateLicenseKey(length = 16) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let key = ''
  for (let i = 0; i < length; i++) {
    if (i > 0 && i % 4 === 0) key += '-'
    key += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return key
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: '仅支持 POST 请求' })
  }

  const { count = 1, type = 'permanent', expiresDays = null } = req.body
  const DAILY_LIMIT = 10

  try {
    // 获取今日生成的卡密数量
    const today = new Date().toISOString().split('T')[0]
    const { rows: todayLicenses } = await sql`
      SELECT COUNT(*) as count FROM license_keys 
      WHERE created_at::date = ${today}::date
    `
    
    const todayCount = parseInt(todayLicenses[0].count)

    if (todayCount >= DAILY_LIMIT) {
      return res.status(429).json({ 
        success: false, 
        error: `今日已达生成上限（${DAILY_LIMIT}个），请明天再试`,
        todayCount,
        limit: DAILY_LIMIT
      })
    }

    const remaining = DAILY_LIMIT - todayCount
    const actualCount = Math.min(count, remaining, 100)

    const keys = []
    for (let i = 0; i < actualCount; i++) {
      const key = generateLicenseKey()
      let expiresAt = null
      if (expiresDays) {
        const date = new Date()
        date.setDate(date.getDate() + expiresDays)
        expiresAt = date.toISOString()
      }
      
      const { rows } = await sql`
        INSERT INTO license_keys (key, type, expires_at, used, created_at)
        VALUES (${key}, ${type}, ${expiresAt}, FALSE, CURRENT_TIMESTAMP)
        RETURNING *
      `
      
      keys.push(rows[0])
    }

    return res.json({ 
      success: true, 
      keys,
      todayCount: todayCount + actualCount,
      limit: DAILY_LIMIT,
      remaining: DAILY_LIMIT - todayCount - actualCount
    })
  } catch (error) {
    console.error('[卡密生成失败]', error)
    return res.status(500).json({ error: '生成失败: ' + error.message })
  }
}
