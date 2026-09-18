// 删除猫咪档案及其相册、动态(仅管理员)
// 连带清理:相册图片/头像文件、动态记录、动态图片文件、相关点赞记录
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

async function checkAdmin(openid) {
  const res = await db.collection('admins').where({ openid }).count();
  return res.total > 0;
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID || !(await checkAdmin(OPENID))) {
    return { code: 403, message: '无权限操作' };
  }

  const { id } = event;
  if (!id) {
    return { code: 400, message: '缺少 id' };
  }

  // 先收集要清理的云存储文件
  const files = [];
  const cat = await db.collection('cats').doc(id).get().catch(() => null);
  if (cat && cat.data) {
    if (cat.data.avatar) files.push(cat.data.avatar);
    if (cat.data.cover_image) files.push(cat.data.cover_image);
  }

  const imagesCol = db.collection('cat_images');
  const images = await imagesCol.where({ cat_id: id }).limit(100).get();
  images.data.forEach((img) => files.push(img.image_url));

  // 动态:收集图片文件 + 删除记录
  const activitiesCol = db.collection('activities');
  const activities = await activitiesCol.where({ cat_id: id }).limit(100).get().catch(() => ({ data: [] }));
  activities.data.forEach((a) => (a.images || []).forEach((url) => files.push(url)));

  // 删除数据库记录
  await db.collection('cats').doc(id).remove();
  await Promise.all(images.data.map((img) => imagesCol.doc(img._id).remove().catch(() => {})));
  await Promise.all(activities.data.map((a) => activitiesCol.doc(a._id).remove().catch(() => {})));

  // 点赞记录:猫咪本身 + 它的所有动态(likes 集合可能不存在,失败忽略)
  const likeIds = [id].concat(activities.data.map((a) => a._id));
  await db
    .collection('likes')
    .where({ target_id: _.in(likeIds) })
    .remove()
    .catch(() => {});

  // 清理云存储文件(失败不影响删除结果)
  const fileList = files.filter((f) => typeof f === 'string' && f.startsWith('cloud://'));
  if (fileList.length > 0) {
    await cloud.deleteFile({ fileList }).catch((e) => {
      console.warn('清理云存储文件失败', e.errMsg || e.message);
    });
  }

  return { code: 0, data: { deleted: true } };
};
