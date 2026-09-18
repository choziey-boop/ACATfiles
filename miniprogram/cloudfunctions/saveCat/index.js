// 新增/更新猫咪档案(仅管理员);同步替换相册图片
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

const ALLOWED_STATUS = ['available', 'adopted', 'checking', 'graduated', 'missing'];
const ALLOWED_GENDER = ['male', 'female', 'unknown'];

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

  const { id, cat, images = [] } = event;
  if (!cat || !cat.name || !cat.name.trim()) {
    return { code: 400, message: '猫咪名字不能为空' };
  }
  if (!cat.avatar) {
    return { code: 400, message: '头像不能为空' };
  }
  if (!cat.cover_image) {
    return { code: 400, message: '照片不能为空' };
  }

  // 白名单字段,防止客户端写入额外字段
  const data = {
    name: String(cat.name).trim().slice(0, 50),
    code: String(cat.code || '').trim().slice(0, 20),
    gender: ALLOWED_GENDER.includes(cat.gender) ? cat.gender : 'unknown',
    age: String(cat.age || '').slice(0, 30), // 旧字段,新数据以 birthday 为准
    birthday: String(cat.birthday || '').slice(0, 10),
    is_neutered: !!cat.is_neutered,
    neutered_date: String(cat.neutered_date || ''),
    description: String(cat.description || '').slice(0, 2000),
    status: ALLOWED_STATUS.includes(cat.status) ? cat.status : 'available',
    campus_area: String(cat.campus_area || '').slice(0, 50),
    tags: Array.isArray(cat.tags) ? cat.tags.slice(0, 20).map((t) => String(t).slice(0, 20)) : [],
    sort_weight: Number(cat.sort_weight) || 0,
    urgent: !!cat.urgent,
    popularity: Number(cat.popularity) || 0,
    avatar: String(cat.avatar),
    cover_image: String(cat.cover_image),
    updated_at: db.serverDate()
  };

  let catId = id;
  const staleFiles = []; // 待清理的旧文件
  if (id) {
    // 编辑态:保留原编号,不允许修改
    const oldCat = await db.collection('cats').doc(id).get().catch(() => null);
    if (oldCat && oldCat.data) {
      data.code = oldCat.data.code || ''; // 编号不可改
      if (oldCat.data.avatar && oldCat.data.avatar !== data.avatar) {
        staleFiles.push(oldCat.data.avatar);
      }
      if (oldCat.data.cover_image && oldCat.data.cover_image !== data.cover_image) {
        staleFiles.push(oldCat.data.cover_image);
      }
    }
    await db.collection('cats').doc(id).update({ data });
  } else {
    // 新增:自动生成编号 CAT-001, CAT-002 ...
    if (!data.code) {
      const counter = await db.collection('counters').doc('cat_code').get().catch(() => null);
      const seq = (counter && counter.data && counter.data.seq) || 0;
      const next = seq + 1;
      data.code = 'CAT-' + String(next).padStart(3, '0');
      if (counter) {
        await db.collection('counters').doc('cat_code').update({ data: { seq: next } });
      } else {
        await db.collection('counters').add({ data: { _id: 'cat_code', seq: next } });
      }
    }
    data.created_at = db.serverDate();
    const res = await db.collection('cats').add({ data });
    catId = res._id;
  }

  // 重建相册:删除旧记录后按新顺序写入
  const imagesCol = db.collection('cat_images');
  const old = await imagesCol.where({ cat_id: catId }).limit(100).get();
  const newUrls = new Set((images || []).map((img) => String(img.image_url)));
  // 被移出相册的图片文件待清理
  old.data.forEach((img) => {
    if (!newUrls.has(img.image_url)) staleFiles.push(img.image_url);
  });
  // 「首页轮播」标记跟随图片 URL 保留(表单重建相册时不丢失)
  const bannerUrls = new Set(old.data.filter((img) => img.is_banner).map((img) => img.image_url));
  await Promise.all(old.data.map((img) => imagesCol.doc(img._id).remove().catch(() => {})));
  await Promise.all(
    (images || []).slice(0, 50).map((img, idx) =>
      imagesCol.add({
        data: {
          cat_id: catId,
          image_url: String(img.image_url),
          is_main: idx === 0,
          is_banner: bannerUrls.has(String(img.image_url)),
          sort: typeof img.sort === 'number' ? img.sort : idx
        }
      })
    )
  );

  await deleteFiles(staleFiles);

  return { code: 0, data: { id: catId } };
};
