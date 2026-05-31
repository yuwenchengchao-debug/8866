import { sql } from '@vercel/postgres'

export default async function handler(req, res) {
  try {
    // 创建 license_keys 表
    await sql`
      CREATE TABLE IF NOT EXISTS license_keys (
        id SERIAL PRIMARY KEY,
        key VARCHAR(50) UNIQUE NOT NULL,
        type VARCHAR(20) DEFAULT 'permanent',
        expires_at TIMESTAMP,
        used BOOLEAN DEFAULT FALSE,
        used_by VARCHAR(255),
        used_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `
    
    return res.json({ 
      success: true, 
      message: '数据库初始化成功' 
    })
  } catch (error) {
    console.error('[数据库初始化失败]', error)
    return res.status(500).json({ 
      success: false, 
      error: '数据库初始化失败: ' + error.message 
    })
  }
}
