// 一次性脚本:给所有猫咪重新编号 CAT-XXX
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async () => {
  // 获取所有猫咪总数
  const countRes = await db.collection('cats').count();
  const total = countRes.total;

  if (total === 0) {
    return { message: '没有猫咪数据', updated: 0 };
  }

  // 分批获取所有猫咪并重新编号
  const batchSize = 100;
  let updated = 0;
  let seq = 0;

  for (let skip = 0; skip < total; skip += batchSize) {
    const res = await db.collection('cats').skip(skip).limit(batchSize).get();
    for (const cat of res.data) {
      seq++;
      const code = 'CAT-' + String(seq).padStart(3, '0');
      await db.collection('cats').doc(cat._id).update({
        data: { code }
      });
      updated++;
    }
  }

  // 更新计数器
  const counter = await db.collection('counters').doc('cat_code').get().catch(() => null);
  if (counter) {
    await db.collection('counters').doc('cat_code').update({ data: { seq } });
  } else {
    await db.collection('counters').add({ data: { _id: 'cat_code', seq } });
  }

  return { message: `完成，共更新 ${updated} 只猫咪`, updated, lastCode: 'CAT-' + String(seq).padStart(3, '0') };
};
