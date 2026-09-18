// 自定义 tabBar:悬浮胶囊样式(设计稿 Tab栏)
// 选中态由各个 tab 页 onShow 里通过 this.getTabBar().setData({ selected }) 设置
Component({
  data: {
    selected: 0,
    list: [
      {
        pagePath: '/pages/home/index',
        text: '首页',
        icon: '/assets/tab-home.svg',
        activeIcon: '/assets/tab-home-active.svg'
      },
      {
        pagePath: '/pages/cats/index',
        text: '猫咪档案',
        icon: '/assets/tab-cats.svg',
        activeIcon: '/assets/tab-cats-fill.svg'
      },
      {
        pagePath: '/pages/about/index',
        text: '关于我们',
        icon: '/assets/tab-about.svg',
        activeIcon: '/assets/tab-about-active.svg'
      }
    ]
  },

  methods: {
    switchTab(e) {
      const { path } = e.currentTarget.dataset;
      wx.switchTab({ url: path });
    }
  }
});
