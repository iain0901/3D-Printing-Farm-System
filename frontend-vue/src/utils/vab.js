import { loadingText, messageDuration, title } from '@/config'
import * as lodash from 'lodash'
import { ElLoading, ElMessage, ElMessageBox, ElNotification } from 'element-plus'
import mitt from 'mitt'
import store from '@/store'
import { getAccessToken } from '@/utils/accessToken'

const accessToken = store.getters['user/accessToken']
const layout = store.getters['settings/layout']

const install = (app) => {
  const gp = app.config.globalProperties
  /* 全局accessToken */
  gp.$baseAccessToken = () => {
    return accessToken || getAccessToken()
  }
  /* 全局标题 */
  gp.$baseTitle = (() => {
    return title
  })()
  /* 全局加载层 */
  gp.$baseLoading = (index, text) => {
    let loading
    if (!index) {
      loading = ElLoading.service({
        lock: true,
        text: text || loadingText,
        background: 'hsla(0,0%,100%,.8)',
      })
    } else {
      loading = ElLoading.service({
        lock: true,
        text: text || loadingText,
        spinner: `vab-loading-type${index}`,
        background: 'hsla(0,0%,100%,.8)',
      })
    }
    return loading
  }
  /* 全局多彩加载层 */
  gp.$baseColorfullLoading = (index, text) => {
    let loading
    if (!index) {
      loading = ElLoading.service({
        lock: true,
        text: text || loadingText,
        spinner: 'dots-loader',
        background: 'hsla(0,0%,100%,.8)',
      })
    } else {
      switch (index) {
        case 1:
          index = 'dots'
          break
        case 2:
          index = 'gauge'
          break
        case 3:
          index = 'inner-circles'
          break
        case 4:
          index = 'plus'
          break
      }
      loading = ElLoading.service({
        lock: true,
        text: text || loadingText,
        spinner: `${index}-loader`,
        background: 'hsla(0,0%,100%,.8)',
      })
    }
    return loading
  }
  /* 全局Message */
  gp.$baseMessage = (message, type) => {
    ElMessage({
      offset: 60,
      showClose: true,
      message: message,
      type: type,
      dangerouslyUseHTMLString: true,
      duration: messageDuration,
    })
  }

  /* 全局Alert */
  gp.$baseAlert = (content, title, callback) => {
    ElMessageBox.alert(content, title || '温馨提示', {
      confirmButtonText: '确定',
      dangerouslyUseHTMLString: true,
      callback: () => {
        if (callback) {
          callback()
        }
      },
    })
  }

  /* 全局Confirm */
  gp.$baseConfirm = (content, title, callback1, callback2) => {
    ElMessageBox.confirm(content, title || '温馨提示', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      closeOnClickModal: false,
      type: 'warning',
    })
      .then(() => {
        if (callback1) {
          callback1()
        }
      })
      .catch(() => {
        if (callback2) {
          callback2()
        }
      })
  }

  /* 全局Notification */
  gp.$baseNotify = (message, title, type, position) => {
    ElNotification({
      title: title,
      message: message,
      position: position || 'top-right',
      type: type || 'success',
      duration: messageDuration,
    })
  }

  /* 全局TableHeight */
  gp.$baseTableHeight = (formType) => {
    let height = window.innerHeight
    let paddingHeight = 400
    const formHeight = 50

    if (layout === 'vertical') {
      paddingHeight = 365
    }

    if ('number' == typeof formType) {
      height = height - paddingHeight - formHeight * formType
    } else {
      height = height - paddingHeight
    }
    return height
  }

  /* 全局lodash */
  gp.$baseLodash = lodash
  /* 全局事件总线（Vue 3 移除了实例事件，改用 mitt） */
  gp.$baseEventBus = mitt()
}

export default install
