// 云函数调用封装:统一 loading 与错误提示
function callFunction(name, data = {}, options = {}) {
  const { showLoading = false, loadingText = '加载中...', silent = false } = options;
  if (showLoading) {
    wx.showLoading({ title: loadingText, mask: true });
  }
  return wx.cloud
    .callFunction({ name, data })
    .then((res) => {
      const result = res.result || {};
      if (result.code !== 0) {
        const err = new Error(result.message || '操作失败');
        err.code = result.code;
        throw err;
      }
      return result.data;
    })
    .catch((err) => {
      console.error(`[cloud] ${name} 调用失败`, err);
      if (!silent) {
        wx.showToast({
          title: err.message || '网络异常,请稍后重试',
          icon: 'none'
        });
      }
      throw err;
    })
    .finally(() => {
      if (showLoading) wx.hideLoading();
    });
}

module.exports = { callFunction };
