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
    const { key } = req.body;
    if (!key) {
      return res.status(400).json({ success: false, error: '请输入卡密' });
    }

    return res.status(200).json({ success: true, message: '激活成功', activated: false });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
}
