Component({
  properties: {
    cat: {
      type: Object,
      value: {}
    },
    // 是否展示"急寻领养"角标(领养中心使用)
    showUrgent: {
      type: Boolean,
      value: false
    }
  },
  methods: {
    onTap() {
      const { cat } = this.properties;
      if (!cat || !cat._id) return;
      wx.navigateTo({
        url: `/pages/cat-detail/index?id=${cat._id}`
      });
    }
  }
});
