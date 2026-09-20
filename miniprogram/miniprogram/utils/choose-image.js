// 选图工具:iOS 的 chooseMedia 用 mediaType:['image'] 会过滤 HEIC 照片,
// 放宽为 ['image','video'] 让 HEIC 可选;选到后过滤视频、HEIC 自动转 JPEG。
// 用法:chooseImages({ count, sizeType }) → Promise<tempFilePath[]>
function chooseImages({ count = 9, sizeType = ['compressed'] } = {}) {
  return new Promise((resolve, reject) => {
    wx.chooseMedia({
      count,
      mediaType: ['image', 'video'], // 放宽以兼容 iOS HEIC;选到后只取图片
      sizeType,
      success: (res) => {
        const images = (res.tempFiles || []).filter(
          (f) => (f.fileType === 'image' || f.mediaType === 'image' || (!f.fileType && !f.mediaType))
        );
        // HEIC 转 JPEG(iOS 部分版本 chooseMedia 返回 .heic 原文件)
        const converted = images.map((f) => convertHeicIfNeeded(f.tempFilePath));
        Promise.all(converted).then((paths) => resolve(paths)).catch(reject);
      },
      fail: reject
    });
  });
}

// 若是 .heic 路径,用 compressImage 转 JPEG;否则原样返回
function convertHeicIfNeeded(filePath) {
  if (!/\.heic$/i.test(filePath)) return Promise.resolve(filePath);
  return new Promise((resolve) => {
    wx.compressImage({
      src: filePath,
      quality: 90,
      success: (r) => resolve(r.tempFilePath),
      fail: () => resolve(filePath) // 转换失败回退原图(至少管理员能看到)
    });
  });
}

module.exports = { chooseImages };
