// 云存储图片换链:cloud:// fileID → 临时公开链接
// 背景:免费版云存储权限为「仅创建者可读写」,普通用户直接读管理员传的图会被拒,
// 统一走 resolveImageUrls 云函数(服务端有完整权限)换取临时链接再展示。
// - 会话内缓存 20 分钟,避免切页/刷新重复换取
// - 换取失败静默降级:返回空映射,调用方回退用原值(管理员本人仍可直接读)
const TTL = 20 * 60 * 1000;
const cache = {}; // fileID → { url, ts }

function isCloudId(url) {
  return typeof url === 'string' && url.indexOf('cloud://') === 0;
}

// 当前仍有效的映射 {fileID: url}
function freshMap(ids) {
  const now = Date.now();
  const out = {};
  ids.forEach((id) => {
    const hit = cache[id];
    if (hit && now - hit.ts < TTL) out[id] = hit.url;
  });
  return out;
}

// 传入一组图片地址(cloud:// 或 https),返回 {fileID: 临时链接} 映射
function resolveImageUrls(urls) {
  const ids = [...new Set((urls || []).filter(isCloudId))];
  if (ids.length === 0) return Promise.resolve({});

  const stale = ids.filter((id) => !freshMap([id])[id]);
  const refresh =
    stale.length === 0
      ? Promise.resolve()
      : wx.cloud
          .callFunction({ name: 'resolveImageUrls', data: { fileIDs: stale } })
          .then((res) => {
            const map = (res.result && res.result.data && res.result.data.map) || {};
            const ts = Date.now();
            Object.keys(map).forEach((id) => {
              cache[id] = { url: map[id], ts };
            });
          })
          .catch((err) => {
            console.warn('[image-url] 换取临时链接失败', err);
          });

  return refresh.then(() => freshMap(ids));
}

module.exports = { resolveImageUrls, isCloudId };
