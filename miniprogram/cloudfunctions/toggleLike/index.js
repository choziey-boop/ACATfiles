// 点赞/取消点赞(猫咪或动态),likes 集合按 openid+目标 防重复
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

// likes 集合可能不存在(老环境),首次调用时自动创建
async function ensureLikes() {
  try {
    await db.createCollection('likes');
  } catch (e) {
    // 已存在则忽略
  }
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) return { code: 401, message: '未登录' };

  const { targetType, targetId } = event;
  if (!['cat', 'activity'].includes(targetType) || !targetId) {
    return { code: 400, message: '参数错误' };
  }

  await ensureLikes();
  const likesCol = db.collection('likes');
  const targetCol = db.collection(targetType === 'cat' ? 'cats' : 'activities');
  const where = { openid: OPENID, target_type: targetType, target_id: targetId };

  const dup = await likesCol.where(where).count();
  let liked;
  if (dup.total > 0) {
    await likesCol.where(where).remove();
    liked = false;
  } else {
    await likesCol.add({ data: { ...where, created_at: db.serverDate() } });
    liked = true;
  }

  // 计数挂在目标文档上;目标可能已被删除,失败则忽略
  await targetCol
    .doc(targetId)
    .update({ data: { likes: _.inc(liked ? 1 : -1) } })
    .catch(() => null);
  const doc = await targetCol.doc(targetId).get().catch(() => null);
  const likes = doc && doc.data ? Math.max(0, doc.data.likes || 0) : 0;

  return { code: 0, data: { liked, likes } };
};
