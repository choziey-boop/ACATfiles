Component({
  properties: {
    visible: { type: Boolean, value: false },
    catId: { type: String, value: '' },
    catName: { type: String, value: '' },
    catCover: { type: String, value: '' }
  },

  methods: {
    onGenPoster() {
      this.triggerEvent('poster');
    },

    onDownloadQrcode() {
      this.triggerEvent('qrcode');
    },

    onCancel() {
      this.triggerEvent('close');
    }
  }
});
