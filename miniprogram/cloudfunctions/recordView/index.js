// 猫咪详情浏览量 +1(匿名,进入详情页时调用)
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

exports.main = async (event) => {
  const { catId } = event;
  if (!catId) return { code: 400, message: '缺少 catId' };

  await db
    .collection('cats')
    .doc(catId)
    .update({ data: { views: _.inc(1) } })
    .catch(() => null); // 猫可能已被删除,浏览量失败不影响页面

  return { code: 0, data: { ok: true } };
};
