<template>
  <el-dialog :before-close="handleClose" :close-on-click-modal="false" :title="title" v-model="dialogFormVisible" width="909px">
    <div class="upload">
      <el-alert
        :closable="false"
        :title="`支援 jpg、jpeg、png 格式；單次最多可選擇 ${limit} 張圖片，每張不可大於 ${size}M，超出大小會自動排除。`"
        type="info"
      />
      <br />
      <el-upload
        ref="upload"
        accept="image/png, image/jpeg"
        :action="action"
        :auto-upload="false"
        class="upload-content"
        :close-on-click-modal="false"
        :data="data"
        :file-list="fileList"
        :headers="headers"
        :limit="limit"
        list-type="picture-card"
        :multiple="true"
        :name="name"
        :on-change="handleChange"
        :on-error="handleError"
        :on-exceed="handleExceed"
        :on-preview="handlePreview"
        :on-progress="handleProgress"
        :on-remove="handleRemove"
        :on-success="handleSuccess"
      >
        <template #trigger><i class="el-icon-plus"></i></template>
        <el-dialog append-to-body title="查看大圖" v-model="dialogVisible">
          <div>
            <img alt="" :src="dialogImageUrl" width="100%" />
          </div>
        </el-dialog>
      </el-upload>
    </div>
    <template #footer><div class="dialog-footer" style="position: relative; padding-right: 15px; text-align: right">
      <div v-if="show" style="position: absolute; top: 10px; left: 15px; color: #999">
        正在上傳…目前成功：{{ imgSuccessNum }} 張；失敗：{{ imgErrorNum }} 張
      </div>
      <el-button type="primary" @click="handleClose">關閉</el-button>
      <el-button :loading="loading" size="small" style="margin-left: 10px" type="success" @click="submitUpload">開始上傳</el-button>
    </div></template>
  </el-dialog>
</template>

<script>
  export default {
    name: 'VabUpload',
    props: {
      url: {
        type: String,
        default: '/upload',
        required: true,
      },
      name: {
        type: String,
        default: 'file',
        required: true,
      },
      limit: {
        type: Number,
        default: 50,
        required: true,
      },
      size: {
        type: Number,
        default: 1,
        required: true,
      },
    },
    data() {
      return {
        show: false,
        loading: false,
        dialogVisible: false,
        dialogImageUrl: '',
        action: 'https://vab-unicloud-3a9da9.service.tcloudbase.com/upload',
        headers: {},
        fileList: [],
        picture: 'picture',
        imgNum: 0,
        imgSuccessNum: 0,
        imgErrorNum: 0,
        typeList: null,
        title: '上傳',
        dialogFormVisible: false,
        data: {},
      }
    },
    computed: {
      percentage() {
        if (this.allImgNum == 0) return 0
        return this.$baseLodash.round(this.imgNum / this.allImgNum, 2) * 100
      },
    },
    methods: {
      submitUpload() {
        this.$refs.upload.submit()
      },
      handleProgress() {
        this.loading = true
        this.show = true
      },
      handleChange(file, fileList) {
        if (file.size > 1048576 * this.size) {
          fileList.map((item, index) => {
            if (item === file) {
              fileList.splice(index, 1)
            }
          })
          this.fileList = fileList
        } else {
          this.allImgNum = fileList.length
        }
      },
      handleSuccess(response, file, fileList) {
        this.imgNum = this.imgNum + 1
        this.imgSuccessNum = this.imgSuccessNum + 1
        if (fileList.length === this.imgNum) {
          setTimeout(() => {
            this.$baseMessage(`上傳完成！共上傳 ${fileList.length} 張圖片`, 'success')
          }, 1000)
        }

        setTimeout(() => {
          this.loading = false
          this.show = false
        }, 1000)
      },
      handleError() {
        this.imgNum = this.imgNum + 1
        this.imgErrorNum = this.imgErrorNum + 1
        this.$baseMessage(`檔案 [${file.raw.name}] 上傳失敗，檔案大小為 ${this.$baseLodash.round(file.raw.size / 1024, 0)}KB`, 'error')
        setTimeout(() => {
          this.loading = false
          this.show = false
        }, 1000)
      },
      handleRemove() {
        this.imgNum = this.imgNum - 1
        this.allNum = this.allNum - 1
      },
      handlePreview(file) {
        this.dialogImageUrl = file.url
        this.dialogVisible = true
      },
      handleExceed(files, fileList) {
        this.$baseMessage(
          `目前限制選擇 ${this.limit} 個檔案，本次選擇了
             ${files.length}
             個檔案`,
          'error'
        )
      },
      handleShow(data) {
        this.title = '上傳'
        this.data = data
        this.dialogFormVisible = true
      },
      handleClose() {
        this.fileList = []
        this.picture = 'picture'
        this.allImgNum = 0
        this.imgNum = 0
        this.imgSuccessNum = 0
        this.imgErrorNum = 0
        /* if ("development" === process.env.NODE_ENV) {
      this.api = process.env.VUE_APP_BASE_API;
    } else {
      this.api = `${window.location.protocol}//${window.location.host}`;
    }

    this.action = this.api + this.url; */
        this.dialogFormVisible = false
      },
    },
  }
</script>

<style lang="scss" scoped>
  .upload {
    height: 500px;

    .upload-content {
      .el-upload__tip {
        display: block;
        height: 30px;
        line-height: 30px;
      }

      ::v-deep {
        .el-upload--picture-card {
          width: 128px;
          height: 128px;
          margin: 3px 8px 8px 8px;
          border: 2px dashed #c0ccda;
        }

        .el-upload-list--picture {
          margin-bottom: 20px;
        }

        .el-upload-list--picture-card {
          .el-upload-list__item {
            width: 128px;
            height: 128px;
            margin: 3px 8px 8px 8px;
          }
        }
      }
    }
  }
</style>
