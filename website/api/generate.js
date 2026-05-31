export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: '仅支持 POST 请求' });
  }

  try {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let key = '';
    for (let i = 0; i < 16; i++) {
      if (i > 0 && i % 4 === 0) key += '-';
      key += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    return res.status(200).json({ 
      success: true, 
      keys: [{ key, type: 'permanent', created_at: new Date().toISOString() }],
      todayCount: 1,
      limit: 10,
      remaining: 9
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
}
