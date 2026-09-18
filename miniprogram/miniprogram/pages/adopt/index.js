Page({
  data: {
    cats: [],
    loading: true
  },

  onLoad() {
    this.loadCats();
  },

  onPullDownRefresh() {
    this.loadCats().then(() => wx.stopPullDownRefresh());
  },

  loadCats() {
    this.setData({ loading: true });
    const db = wx.cloud.database();
    return db
      .collection('cats')
      .where({ status: 'available' })
      .orderBy('updated_at', 'desc')
      .limit(100)
      .get()
      .then((res) => {
        this.setData({ cats: res.data || [], loading: false });
      })
      .catch((err) => {
        console.error('加载待领养列表失败', err);
        this.setData({ loading: false });
        wx.showModal({
          title: '加载失败',
          content: (err.errMsg || String(err)) + '\n\n若提示 permission denied,请在云开发控制台把 cats 集合权限设为「所有用户可读」',
          showCancel: false
        });
      });
  }
});
