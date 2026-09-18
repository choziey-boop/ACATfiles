// 领养申请:查重 + 提交(联系方式 AES-256-CBC 加密存储)
// 需要配置环境变量 CONTACT_KEY(任意 32 字节字符串,README 有说明)
const cloud = require('wx-server-sdk');
const crypto = require('crypto');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

// 用 sha256 把任意长度的 CONTACT_KEY 归一化为 32 字节密钥
function getKey() {
  const raw = process.env.CONTACT_KEY || 'campus-cat-default-key-change-me';
  return crypto.createHash('sha256').update(raw).digest();
}

function encrypt(text) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  return iv.toString('hex') + ':' + encrypted.toString('hex');
}

function fail(code, message) {
  return { code, message };
}

function ok(data) {
  return { code: 0, data };
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) {
    return fail(401, '未登录');
  }

  const { action, catId } = event;
  if (!catId) {
    return fail(400, '缺少 catId');
  }

  const applications = db.collection('adoption_applications');

  // 查重:是否已有待审核申请
  const dupQuery = () =>
    applications
      .where({ openid: OPENID, cat_id: catId, status: 'pending' })
      .count();

  if (action === 'check') {
    const res = await dupQuery();
    return ok({ exists: res.total > 0 });
  }

  if (action === 'submit') {
    const { contact, reason, living } = event;
    if (!contact || !contact.trim()) return fail(400, '请填写联系方式');
    if (!reason || !reason.trim()) return fail(400, '请填写领养原因');
    if (!living || !living.trim()) return fail(400, '请填写居住情况');

    // 服务端防重复,避免前端绕过
    const dup = await dupQuery();
    if (dup.total > 0) {
      return fail(1001, '您已提交过申请,请勿重复提交');
    }

    // 校验猫咪存在且可领养
    const catRes = await db
      .collection('cats')
      .doc(catId)
      .get()
      .catch(() => null);
    if (!catRes || !catRes.data) {
      return fail(404, '猫咪档案不存在');
    }
    if (catRes.data.status !== 'available') {
      return fail(1002, '该猫咪当前不可领养');
    }

    await applications.add({
      data: {
        cat_id: catId,
        cat_name: catRes.data.name || '',
        openid: OPENID,
        contact: encrypt(contact.trim()), // 加密存储
        reason: reason.trim(),
        living_situation: living.trim(),
        status: 'pending',
        reject_reason: '',
        created_at: db.serverDate()
      }
    });
    return ok({ submitted: true });
  }

  return fail(400, '未知操作');
};
