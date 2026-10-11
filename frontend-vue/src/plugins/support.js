import { ElMessageBox } from 'element-plus'

if (!!window.ActiveXObject || 'ActiveXObject' in window) {
  ElMessageBox({
    title: '溫馨提示',
    message:
      '自 2015 年 3 月起，微軟已宣布停止支援 IE，且不再提供更新維護。請<a target="_blank" style="color:blue" href="https://www.microsoft.com/zh-tw/edge/">點選此處</a>前往微軟官網更新瀏覽器；若你使用雙核心瀏覽器，請切換為極速模式。',
    type: 'warning',
    showClose: false,
    showConfirmButton: false,
    closeOnClickModal: false,
    closeOnPressEscape: false,
    dangerouslyUseHTMLString: true,
  })
}
