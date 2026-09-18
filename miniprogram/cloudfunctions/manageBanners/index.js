// 轮播图管理(仅管理员):支持 home_banner(最多5张) / home_top(最多3张)
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

const LIMITS = { home_banner: 5, home_top: 10 };

async function checkAdmin(openid) {
  const res = await db.collection('admins').where({ openid }).count();
  return res.total > 0;
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID || !(await checkAdmin(OPENID))) {
    return { code: 403, message: '无权限操作' };
  }

  const { action, id, banner } = event;
  const type = banner && banner.type || 'home_banner';
  const maxCount = LIMITS[type] || 5;

  if (action === 'add') {
    const countRes = await db.collection('banners').where({ type }).count();
    if (countRes.total >= maxCount) {
      return { code: 400, message: `该类型轮播图最多 ${maxCount} 张,请先删除后再添加` };
    }
    if (!banner || !banner.image_url) {
      return { code: 400, message: '图片不能为空' };
    }
    const data = {
      type,
      image_url: String(banner.image_url),
      title: String(banner.title || '').slice(0, 50),
      content: String(banner.content || '').slice(0, 5000),
      sort: Number(banner.sort) || 0,
      created_at: db.serverDate(),
      updated_at: db.serverDate()
    };
    const res = await db.collection('banners').add({ data });
    return { code: 0, data: { id: res._id } };
  }

  if (action === 'update') {
    if (!id) return { code: 400, message: '缺少 id' };
    const old = await db.collection('banners').doc(id).get().catch(() => null);
    if (!old || !old.data) return { code: 404, message: '轮播图不存在' };
    const data = {
      title: String(banner.title || '').slice(0, 50),
      content: String(banner.content || '').slice(0, 5000),
      sort: typeof banner.sort === 'number' ? banner.sort : old.data.sort,
      updated_at: db.serverDate()
    };
    // 图片可换:替换时清理旧文件
    if (banner.image_url && banner.image_url !== old.data.image_url) {
      data.image_url = String(banner.image_url);
    }
    await db.collection('banners').doc(id).update({ data });
    if (data.image_url && old.data.image_url && old.data.image_url.startsWith('cloud://')) {
      await cloud.deleteFile({ fileList: [old.data.image_url] }).catch(() => {});
    }
    return { code: 0 };
  }

  if (action === 'delete') {
    if (!id) return { code: 400, message: '缺少 id' };
    const old = await db.collection('banners').doc(id).get().catch(() => null);
    await db.collection('banners').doc(id).remove().catch(() => {});
    if (old && old.data && old.data.image_url && old.data.image_url.startsWith('cloud://')) {
      await cloud.deleteFile({ fileList: [old.data.image_url] }).catch(() => {});
    }
    return { code: 0 };
  }

  if (action === 'migrate') {
    // 一次性兼容:给历史数据(无 type 字段)补 home_banner
    let migrated = 0;
    const batchSize = 100;
    for (let skip = 0; ; skip += batchSize) {
      const res = await db
        .collection('banners')
        .where({ type: _.exists(false) })
        .limit(batchSize)
        .get();
      if (!res.data.length) break;
      for (const doc of res.data) {
        await db.collection('banners').doc(doc._id).update({ data: { type: 'home_banner' } });
        migrated++;
      }
      if (res.data.length < batchSize) break;
    }
    return { code: 0, data: { migrated } };
  }

  return { code: 400, message: '未知操作' };
};
