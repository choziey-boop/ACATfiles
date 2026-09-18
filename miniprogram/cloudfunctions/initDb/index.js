// 一次性初始化函数:创建全部集合;若 admins 为空则将调用者设为首个管理员
// 用完可在云开发控制台手动删除
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

const COLLECTIONS = ['cats', 'cat_images', 'activities', 'adoption_applications', 'admins', 'likes'];

exports.main = async () => {
  const { OPENID } = cloud.getWXContext();

  const results = {};
  for (const name of COLLECTIONS) {
    try {
      await db.createCollection(name);
      results[name] = 'created';
    } catch (e) {
      const msg = e.errMsg || e.message || String(e);
      results[name] = msg.includes('exists') || msg.includes('ALREADY') ? 'already exists' : msg;
    }
  }

  // admins 为空时,把当前调用者加入为首个管理员
  let adminAdded = false;
  try {
    const cnt = await db.collection('admins').count();
    if (cnt.total === 0 && OPENID) {
      await db.collection('admins').add({
        data: { openid: OPENID, created_at: db.serverDate() }
      });
      adminAdded = true;
    }
  } catch (e) {
    results.admins_init_error = e.errMsg || e.message || String(e);
  }

  return { code: 0, data: { results, openid: OPENID, adminAdded } };
};
