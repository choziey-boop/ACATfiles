// 生成猫咪详情页小程序码(用 wxacode.get,path 直接带 id,不走 scene 编码)
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

exports.main = async (event) => {
  const { catId } = event;
  if (!catId) return { code: -1, message: '缺少 catId' };

  try {
    console.log('[getCatQrcode] 传入 catId:', catId, '长度:', catId.length);
    const path = `pages/cat-detail/index?id=${catId}`;
    console.log('[getCatQrcode] 小程序码 path:', path);

    // 用 wxacode.get:扫码后小程序直接收到 options.id(页面 onLoad 已支持)
    const result = await cloud.openapi.wxacode.get({
      path,
      width: 430,
      auto_color: false,
      line_color: { r: 0, g: 0, b: 0 }
    });

    console.log('[getCatQrcode] result 类型:', typeof result);
    console.log('[getCatQrcode] result.buffer:', result.buffer ? '存在' : '不存在');
    if (result.buffer) {
      console.log('[getCatQrcode] buffer 长度:', result.buffer.length);
    }

    // 防御:检查 buffer 是否有效
    if (!result.buffer || result.buffer.length === 0) {
      return { code: -1, message: '小程序码数据为空' };
    }

    // 转 base64
    const base64 = result.buffer.toString('base64');
    console.log('[getCatQrcode] base64 长度:', base64.length);

    // 上传云存储(供下载功能用)
    let fileID = '', tempUrl = '';
    try {
      const upload = await cloud.uploadFile({
        cloudPath: `qrcode/${catId}.png`,
        fileContent: result.buffer
      });
      fileID = upload.fileID || '';
      const urlRes = await cloud.getTempFileURL({ fileList: [fileID] });
      tempUrl = (urlRes.fileList && urlRes.fileList[0] && urlRes.fileList[0].tempFileURL) || '';
    } catch (e) {
      console.error('[getCatQrcode] 上传失败(不影响海报):', e.message);
    }

    return { code: 0, data: { fileID, tempUrl, base64 } };
  } catch (err) {
    console.error('[getCatQrcode] 失败:', err);
    return { code: -1, message: err.message || '生成失败' };
  }
};
