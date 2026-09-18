// 批量查询当前用户对一组目标的点赞状态(likes 集合不开放读权限,由此函数代查)
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) return { code: 401, message: '未登录' };

  const { targetType, targetIds = [] } = event;
  if (!['cat', 'activity'].includes(targetType) || !Array.isArray(targetIds) || targetIds.length === 0) {
    return { code: 0, data: { likedIds: [] } };
  }

  const res = await db
    .collection('likes')
    .where({
      openid: OPENID,
      target_type: targetType,
      target_id: _.in(targetIds.slice(0, 50))
    })
    .limit(50)
    .get()
    .catch(() => ({ data: [] })); // likes 集合尚未创建时视为无点赞

  return { code: 0, data: { likedIds: (res.data || []).map((r) => r.target_id) } };
};
