// 批量把云存储 fileID 换成临时公开链接(免费版存储权限为「仅创建者可读写」,
// 普通用户无法直接读管理员传的图,统一走云函数中转,云函数有完整存储权限)
// getTempFileURL 单次上限 50 个,这里自动分批并行
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const BATCH = 50;

exports.main = async (event) => {
  const ids = [...new Set((event.fileIDs || []).filter((f) => typeof f === 'string' && f.startsWith('cloud://')))];
  if (ids.length === 0) return { code: 0, data: { map: {} } };

  const batches = [];
  for (let i = 0; i < ids.length; i += BATCH) {
    batches.push(ids.slice(i, i + BATCH));
  }

  const results = await Promise.all(batches.map((b) => cloud.getTempFileURL({ fileList: b })));

  const map = {};
  results.forEach((r) => {
    (r.fileList || []).forEach((item) => {
      if (item.status === 0 && item.tempFileURL) map[item.fileID] = item.tempFileURL;
    });
  });

  return { code: 0, data: { map } };
};
