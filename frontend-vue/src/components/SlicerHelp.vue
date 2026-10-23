<template>
  <teleport to="body">
    <button v-if="inWorkspace" class="rfm-help-directory" type="button" aria-label="功能說明目錄" @click="openDirectory">
      ?
      <span>功能說明</span>
    </button>
    <button
      v-if="anchor && topic"
      ref="question"
      class="rfm-feature-question"
      type="button"
      :style="position"
      :aria-label="'說明：' + topic.title"
      :data-help-topic="topic.id"
      aria-haspopup="dialog"
      @pointerenter="keep"
      @pointerleave="leave"
      @focus="keep"
      @click.stop="open(topic)"
      @keydown="questionKey"
    >
      ?
    </button>
    <el-dialog
      v-model="visible"
      :title="current?.title || '功能說明目錄'"
      class="brand-dialog rfm-feature-dialog"
      width="480px"
      :z-index="5000"
      :transition="{ name: 'rfm-help', css: false }"
      destroy-on-close
      append-to-body
      @closed="current = null"
      @close-auto-focus="restoreAfterRelease"
    >
      <template v-if="current">
        <p class="rfm-help-copy">{{ current.description }}</p>
        <button class="rfm-help-back" type="button" @click="current = null">查看所有功能說明</button>
      </template>
      <template v-else>
        <p class="rfm-help-copy">滑到功能上點問號，或聚焦功能後按 F1。手機也能從這裡查詢。</p>
        <input v-model="search" class="rfm-help-search" type="search" aria-label="搜尋功能說明" placeholder="例如：自動朝向、支撐、上色" />
        <div class="rfm-help-topics">
          <button v-for="item in filtered" :key="item.id" type="button" @click="current = item">{{ item.title }}</button>
        </div>
        <p v-if="!filtered.length" role="status">沒有符合的說明，請試試其他關鍵字。</p>
      </template>
    </el-dialog>
  </teleport>
</template>
<script setup>
  import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
  import { useRoute } from 'vue-router'
  import { resolveSlicerHelp, slicerHelpTopics } from '@/utils/slicer-help.mjs'
  const route = useRoute()
  const inWorkspace = computed(() => /^(\/cloud-slicer|\/free-print\/[^/]+\/slicer|\/slicer(?:\/|$)|\/quote(?:\/new)?$)/.test(route.path))
  const anchor = ref(null),
    topic = ref(null),
    question = ref(null),
    position = ref({}),
    visible = ref(false),
    current = ref(null),
    search = ref('')
  const filtered = computed(() => slicerHelpTopics.filter((t) => (t.title + t.description).includes(search.value.trim())))
  let timer, returnTarget, observer
  const controls = 'button, input:not([type="file"]), select, textarea, summary'
  function labelOf(element) {
    return (
      element.getAttribute('data-help') ||
      element.getAttribute('aria-label') ||
      (element.matches('input,select,textarea') ? element.closest('label')?.textContent : element.textContent) ||
      ''
    )
  }
  function targetOf(event) {
    const element = event.target?.closest?.(controls) || event.target?.closest?.('label')?.querySelector(controls)
    return element?.closest('.slicer-lab, .quote-workbench .workbench-wrap') && element.getClientRects().length ? element : null
  }
  function keep() {
    clearTimeout(timer)
  }
  function clear() {
    anchor.value = null
    topic.value = null
  }
  function leave() {
    clearTimeout(timer)
    if (!anchor.value) return
    timer = setTimeout(() => {
      if (document.activeElement !== question.value) clear()
    }, 240)
  }
  function locate() {
    if (!anchor.value?.isConnected) return clear()
    const rect = anchor.value.getBoundingClientRect()
    if (rect.bottom < 0 || rect.top > innerHeight) return clear()
    position.value = {
      left: Math.max(4, Math.min(innerWidth - 36, rect.right - 28)) + 'px',
      top: Math.max(4, Math.min(innerHeight - 48, rect.top - 30)) + 'px',
    }
  }
  function enter(event) {
    if (visible.value || event.target?.closest?.('.rfm-feature-question, .rfm-help-directory')) return
    const target = targetOf(event)
    if (!target) {
      if (event.type === 'focusin') clear()
      else leave()
      return
    }
    keep()
    const resolved = resolveSlicerHelp(labelOf(target))
    if (!resolved) return clear()
    anchor.value = target
    topic.value = resolved
    locate()
  }
  function open(item) {
    returnTarget = anchor.value || document.activeElement
    current.value = item
    visible.value = true
    keep()
  }
  function openDirectory() {
    clear()
    search.value = ''
    open(null)
  }
  function restoreFocus() {
    current.value = null
    clear()
    if (returnTarget?.isConnected && !returnTarget.disabled) {
      returnTarget.focus({ preventScroll: true })
      // ElDialog may already have restored this same element; focus() then emits no focusin.
      // Re-anchor explicitly so its question remains reachable with the next Tab / F1.
      enter({ target: returnTarget, type: 'focusin' })
    }
  }
  function restoreAfterRelease() {
    // Element Plus emits this before its own focus restoration. Run after the trap releases,
    // otherwise it would overwrite our target with the floating question that opened it.
    nextTick(restoreFocus)
  }
  function key(event) {
    if (event.key === 'Escape' && !visible.value) {
      clear()
      return
    }
    if (visible.value) return
    const target = targetOf(event)
    const resolved = target && resolveSlicerHelp(labelOf(target))
    if (!resolved) return
    if (event.key === 'F1') {
      event.preventDefault()
      anchor.value = target
      topic.value = resolved
      open(resolved)
    } else if (event.key === 'Tab' && !event.shiftKey) {
      event.preventDefault()
      anchor.value = target
      topic.value = resolved
      locate()
      nextTick(() => question.value?.focus({ preventScroll: true }))
    }
  }
  function questionKey(event) {
    if (event.key !== 'Tab') return
    event.preventDefault()
    const original = anchor.value
    if (!original?.isConnected) return clear()
    const scope = original.closest('.slicer-lab, .workbench-wrap')
    const available = [...scope.querySelectorAll('button, input, select, textarea, summary, a[href], [tabindex="0"]')].filter(
      (el) => !el.disabled && el.checkVisibility() && (!el.closest('details:not([open])') || el.tagName === 'SUMMARY') && el.tabIndex >= 0
    )
    const next = event.shiftKey ? original : available[available.indexOf(original) + 1]
    clear()
    nextTick(() => (next || document.querySelector('.rfm-help-directory'))?.focus({ preventScroll: true }))
  }
  watch(
    () => route.path,
    () => {
      visible.value = false
      returnTarget = null
      clear()
    }
  )
  onMounted(() => {
    // Use actual movement, not pointerover: removing the modal under a stationary mouse
    // must not overwrite the keyboard's focused help target.
    document.addEventListener('pointermove', enter, true)
    document.addEventListener('focusin', enter)
    document.addEventListener('keydown', key, true)
    window.addEventListener('scroll', locate, true)
    window.addEventListener('resize', locate)
    // Never leave a stale help target after a model, panel or route is replaced.
    observer = new MutationObserver(() => {
      if (anchor.value && !anchor.value.isConnected) clear()
    })
    observer.observe(document.body, { childList: true, subtree: true })
  })
  onBeforeUnmount(() => {
    keep()
    observer?.disconnect()
    document.removeEventListener('pointermove', enter, true)
    document.removeEventListener('focusin', enter)
    document.removeEventListener('keydown', key, true)
    window.removeEventListener('scroll', locate, true)
    window.removeEventListener('resize', locate)
  })
</script>
<style>
  .rfm-feature-question,
  .rfm-help-directory {
    /* The legacy admin theme applies transition: all to *. Anchors must never drift. */
    transition: none;
    position: fixed;
    z-index: 2001;
    box-sizing: border-box;
    border: 1px solid #173cc5;
    background: #fffdfa;
    color: #173cc5;
    font: 700 15px/1.2 var(--rfm-font, sans-serif);
    cursor: pointer;
    box-shadow: 0 3px 12px #192e5320;
  }
  .rfm-feature-question {
    z-index: 4000;
    width: 32px;
    height: 32px;
    border-radius: 50%;
    padding: 0;
  }
  .rfm-help-directory {
    right: 16px;
    bottom: 16px;
    border-radius: 4px;
    padding: 10px 12px;
    display: flex;
    gap: 8px;
    align-items: center;
  }
  .rfm-help-directory span {
    font-size: 12px;
  }
  .rfm-feature-question:focus-visible,
  .rfm-help-directory:focus-visible,
  .rfm-feature-dialog button:focus-visible {
    outline: 2px solid #173cc5;
    outline-offset: 3px;
  }
  .rfm-feature-dialog {
    max-width: calc(100vw - 24px);
  }
  .rfm-feature-dialog,
  .rfm-feature-dialog * {
    transition: none;
  }
  .rfm-help-copy {
    line-height: 1.9;
    color: #192e53;
    margin: 0 0 20px;
    overflow-wrap: anywhere;
  }
  .rfm-help-search {
    width: 100%;
    box-sizing: border-box;
    border: 1px solid #d8d5cc;
    border-radius: 4px;
    background: #fffdfa;
    padding: 12px;
    font: inherit;
  }
  .rfm-help-topics {
    max-height: 45vh;
    overflow: auto;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
    margin-top: 16px;
  }
  .rfm-help-topics button,
  .rfm-help-back {
    border: 1px solid #d8d5cc;
    background: #f7f3e9;
    color: #192e53;
    font: inherit;
    padding: 10px;
    border-radius: 4px;
    cursor: pointer;
    text-align: left;
  }
  @media (pointer: coarse) {
    .rfm-feature-question {
      width: 44px;
      height: 44px;
      transform: translate(-6px, 0);
    }
    .rfm-help-directory {
      bottom: max(12px, env(safe-area-inset-bottom));
    }
    .rfm-help-topics button {
      min-height: 44px;
    }
  }
</style>
