// 动态管理(仅管理员):发布/编辑/删除。动态挂在猫咪下,冗余猫名与头像便于列表展示
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

async function checkAdmin(openid) {
  const res = await db.collection('admins').where({ openid }).count();
  return res.total > 0;
}

// 批量删除云存储文件(忽略失败,避免影响主流程)
async function deleteFiles(fileIDs) {
  const list = (fileIDs || []).filter((f) => typeof f === 'string' && f.startsWith('cloud://'));
  if (list.length === 0) return;
  await cloud.deleteFile({ fileList: list }).catch((e) => {
    console.warn('清理云存储文件失败', e.errMsg || e.message);
  });
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID || !(await checkAdmin(OPENID))) {
    return { code: 403, message: '无权限操作' };
  }

  const { action } = event;
  const activities = db.collection('activities');

  if (action === 'publish') {
    const { catId, content = '', images = [] } = event;
    if (!catId) return { code: 400, message: '请选择猫咪' };
    if (!String(content).trim() && images.length === 0) {
      return { code: 400, message: '内容不能为空' };
    }
    const catRes = await db.collection('cats').doc(catId).get().catch(() => null);
    if (!catRes || !catRes.data) return { code: 404, message: '猫咪不存在' };

    const res = await activities.add({
      data: {
        cat_id: catId,
        cat_name: catRes.data.name || '',
        cat_avatar: catRes.data.avatar || catRes.data.cover_image || '',
        content: String(content).trim().slice(0, 2000),
        images: images.slice(0, 9).map(String),
        likes: 0,
        created_at: db.serverDate()
      }
    });
    return { code: 0, data: { id: res._id } };
  }

  if (action === 'update') {
    const { id, content = '', images = [] } = event;
    if (!id) return { code: 400, message: '缺少 id' };
    if (!String(content).trim() && images.length === 0) {
      return { code: 400, message: '内容不能为空' };
    }
    const old = await activities.doc(id).get().catch(() => null);
    if (!old || !old.data) return { code: 404, message: '动态不存在' };

    const newImages = images.slice(0, 9).map(String);
    // 编辑时被移除的图片,清理云存储
    const newSet = new Set(newImages);
    const stale = (old.data.images || []).filter((u) => !newSet.has(u));

    await activities.doc(id).update({
      data: {
        content: String(content).trim().slice(0, 2000),
        images: newImages,
        updated_at: db.serverDate()
      }
    });
    await deleteFiles(stale);
    return { code: 0, data: { id } };
  }

  if (action === 'delete') {
    const { id } = event;
    if (!id) return { code: 400, message: '缺少 id' };
    const old = await activities.doc(id).get().catch(() => null);
    if (!old || !old.data) return { code: 404, message: '动态不存在' };

    await activities.doc(id).remove();
    await deleteFiles(old.data.images || []);
    // 同步清理该动态的点赞记录
    await db
      .collection('likes')
      .where({ target_type: 'activity', target_id: id })
      .remove()
      .catch(() => {});
    return { code: 0, data: { deleted: true } };
  }

  return { code: 400, message: '未知操作' };
};
