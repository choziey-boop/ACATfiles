// 猫咪相册管理(仅管理员):追加照片/批量删除/设为封面/首页轮播标记
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

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

  const { action, catId } = event;
  if (!catId) return { code: 400, message: '缺少 catId' };

  const cats = db.collection('cats');
  const imagesCol = db.collection('cat_images');

  // 追加照片(排在现有最后;若该猫还没有封面,第一张追加图自动成为封面)
  if (action === 'add') {
    const urls = (event.urls || []).map(String).slice(0, 9);
    if (urls.length === 0) return { code: 400, message: '没有可添加的图片' };

    const last = await imagesCol
      .where({ cat_id: catId })
      .orderBy('sort', 'desc')
      .limit(1)
      .get()
      .catch(() => ({ data: [] }));
    const base = last.data.length ? (last.data[0].sort || 0) + 1 : 0;

    await Promise.all(
      urls.map((u, i) =>
        imagesCol.add({ data: { cat_id: catId, image_url: u, is_main: false, is_banner: false, sort: base + i } })
      )
    );

    const catRes = await cats.doc(catId).get().catch(() => null);
    const update = { updated_at: db.serverDate() };
    if (catRes && catRes.data && !catRes.data.cover_image) {
      update.cover_image = urls[0];
    }
    await cats.doc(catId).update({ data: update });
    return { code: 0, data: { added: urls.length } };
  }

  // 批量删除;封面被删时自动取剩余第一张顶上
  if (action === 'delete') {
    const urls = (event.urls || []).map(String);
    if (urls.length === 0) return { code: 400, message: '没有要删除的图片' };

    const toRemove = await imagesCol.where({ cat_id: catId, image_url: _.in(urls) }).limit(50).get();
    await Promise.all(toRemove.data.map((img) => imagesCol.doc(img._id).remove().catch(() => {})));

    const catRes = await cats.doc(catId).get().catch(() => null);
    if (catRes && catRes.data && urls.includes(catRes.data.cover_image)) {
      const remain = await imagesCol
        .where({ cat_id: catId })
        .orderBy('sort', 'asc')
        .limit(1)
        .get()
        .catch(() => ({ data: [] }));
      await cats.doc(catId).update({
        data: {
          cover_image: remain.data.length ? remain.data[0].image_url : '',
          updated_at: db.serverDate()
        }
      });
    }

    await deleteFiles(urls);
    return { code: 0, data: { deleted: toRemove.data.length } };
  }

  // 设为封面
  if (action === 'setCover') {
    const url = String(event.url || '');
    if (!url) return { code: 400, message: '缺少图片' };
    await cats.doc(catId).update({ data: { cover_image: url, updated_at: db.serverDate() } });
    return { code: 0, data: { cover_image: url } };
  }

  // 首页轮播标记(批量,flag 统一设置)
  if (action === 'toggleBanner') {
    const urls = (event.urls || []).map(String);
    const flag = !!event.flag;
    if (urls.length === 0) return { code: 400, message: '没有要操作的图片' };

    const docs = await imagesCol.where({ cat_id: catId, image_url: _.in(urls) }).limit(50).get();
    await Promise.all(
      docs.data.map((img) => imagesCol.doc(img._id).update({ data: { is_banner: flag } }).catch(() => {}))
    );
    return { code: 0, data: { updated: docs.data.length, is_banner: flag } };
  }

  return { code: 400, message: '未知操作' };
};
