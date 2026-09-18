// 上传单张图片到云存储(先压缩,省存储与 CDN 流量),返回 fileID
// dir: 存储目录,如 'cat-images' / 'cat-images/avatar' / 'activity-images'
// 压缩策略:长边超过 maxEdge 先用离屏 canvas 等比缩小,再 wx.compressImage 压质量
// 注意:wx API 一律用回调写法,部分 API 在部分平台上不返回 Promise
const DEFAULT_MAX_EDGE = 2000;

// 长边超限则等比缩小,失败一律回退原图
function resizeIfNeeded(filePath, maxEdge) {
  return new Promise((resolve) => {
    wx.getImageInfo({
      src: filePath,
      success: (info) => {
        const w0 = info.width;
        const h0 = info.height;
        const longEdge = Math.max(w0, h0);
        if (!longEdge || longEdge <= maxEdge) {
          resolve(filePath);
          return;
        }
        const scale = maxEdge / longEdge;
        const w = Math.round(w0 * scale);
        const h = Math.round(h0 * scale);
        try {
          const canvas = wx.createOffscreenCanvas({ type: '2d' });
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          const img = canvas.createImage();
          img.onload = () => {
            ctx.drawImage(img, 0, 0, w, h);
            wx.canvasToTempFilePath({
              canvas,
              destWidth: w,
              destHeight: h,
              fileType: 'jpg', // 默认 png 会让照片体积反而变大
              quality: 0.92,
              success: (r) => resolve(r.tempFilePath),
              fail: () => resolve(filePath)
            });
          };
          img.onerror = () => resolve(filePath);
          img.src = filePath;
        } catch (e) {
          console.warn('离屏 canvas 不可用,跳过尺寸压缩', e);
          resolve(filePath);
        }
      },
      fail: () => resolve(filePath)
    });
  });
}

function uploadImage(filePath, dir = 'cat-images', maxEdge = DEFAULT_MAX_EDGE) {
  const ext = filePath.match(/\.(\w+)$/) ? filePath.match(/\.(\w+)$/)[1] : 'jpg';
  const cloudPath = `${dir}/${Date.now()}-${Math.floor(Math.random() * 1e6)}.${ext}`;
  return resizeIfNeeded(filePath, maxEdge)
    .then(
      (p) =>
        new Promise((resolve) => {
          if (!wx.compressImage) return resolve(p);
          wx.compressImage({
            src: p,
            quality: 70,
            success: (r) => resolve(r.tempFilePath),
            fail: () => resolve(p)
          });
        })
    )
    .then((p) => uploadRaw(p, dir, cloudPath));
}

// 原图直传:不做尺寸缩放与质量压缩(用于首页顶图等对清晰度要求高的场景)
function uploadImageRaw(filePath, dir = 'banner-images') {
  const ext = filePath.match(/\.(\w+)$/) ? filePath.match(/\.(\w+)$/)[1] : 'jpg';
  const cloudPath = `${dir}/${Date.now()}-${Math.floor(Math.random() * 1e6)}.${ext}`;
  return uploadRaw(filePath, dir, cloudPath);
}

function uploadRaw(filePath, dir, cloudPath) {
  return new Promise((resolve, reject) => {
    wx.cloud.uploadFile({
      cloudPath,
      filePath,
      success: (res) => resolve(res.fileID),
      fail: reject
    });
  });
}

module.exports = { uploadImage, uploadImageRaw };
