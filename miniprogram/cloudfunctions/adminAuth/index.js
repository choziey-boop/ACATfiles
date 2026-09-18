// 校验调用者是否在 admins 集合中
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async () => {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) {
    return { code: 401, message: '未登录' };
  }
  // 日志中打印 openid,便于首次配置管理员时从控制台日志中获取
  console.log('[adminAuth] openid:', OPENID);
  const res = await db
    .collection('admins')
    .where({ openid: OPENID })
    .count();
  return {
    code: 0,
    data: { isAdmin: res.total > 0 }
  };
};
