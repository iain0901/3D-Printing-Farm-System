<template>
  <div class="faq-page">
    <section class="page-hero">
      <p class="eyebrow">FAQ</p>
      <h1>常見問題</h1>
      <p>找不到答案？用右下角「聯絡」或客戶入口留言，我們會盡快回覆。</p>
    </section>

    <section class="block narrow">
      <el-collapse v-for="group in groups" :key="group.title" v-model="openGroup" class="faq-group">
        <b class="group-title">{{ group.title }}</b>
        <el-collapse-item v-for="item in group.items" :key="item.q" :title="item.q" :name="item.q">
          <p>{{ item.a }}</p>
        </el-collapse-item>
      </el-collapse>

      <div class="still">
        <p>還有其他問題？</p>
        <router-link to="/contact" class="btn ghost">聯絡我們</router-link>
        <router-link to="/quote" class="btn primary">直接開始估價</router-link>
      </div>
    </section>
  </div>
</template>

<script>
  export default {
    name: 'SiteFaq',
    data() {
      return {
        openGroup: [],
        groups: [
          {
            title: '下單與報價',
            items: [
              {
                q: '沒有 3D 檔案也可以委託嗎？',
                a: '可以。在估價精靈選「需要建模協助」，描述用途、尺寸或附上草圖照片，專員會評估後報價。',
              },
              { q: '報價有效期多久？', a: '正式報價預設 7 天內有效（以報價單標示為準）。材料價格波動大的案件可能縮短。' },
              {
                q: '怎麼計價？只看重量嗎？',
                a: '以重量階梯價為基礎，同時保證機時費用：很輕但要印很久的模型，兩者取較高者計算，避免品質被犧牲。急件、多色設定與加購服務另計，全部逐項列出。',
              },
              { q: '模型拆成很多零件怎麼算？', a: '以「完整成品組數」計價——一個成品由幾個分件組成都算 1 組，不會因為拆件多收費。' },
            ],
          },
          {
            title: '生產與品質',
            items: [
              { q: '印失敗怎麼辦？', a: '切片與參數屬於我們的專業判斷，因此列印異常經判定後免費重印，不需另外付費。' },
              {
                q: '尺寸能保證多準？',
                a: 'FDM 有先天公差（一般 ±0.2~0.5mm 視幾何而定）。有裝配需求請在估價時勾選，關鍵尺寸建議提供 2D 圖並加購尺寸檢查。',
              },
              { q: '可以多色嗎？', a: '可以。多零件檔案可在網站上逐件指定顏色；組合多色與分開多色計費規則不同，估價時會說明。' },
              { q: '生產中可以改需求嗎？', a: '排程開始前可免費修改；開始列印後視進度而定，已完成的分件需重新計費。' },
            ],
          },
          {
            title: '交期與出貨',
            items: [
              { q: '一般交期多久？', a: '依排程通常 3–7 個工作天；48／24 小時急件請選擇急件選項（加成 8%–30%）。' },
              { q: '怎麼追蹤進度？', a: '送出案件後取得專屬連結；註冊會員可隨時在客戶入口查看狀態、留言與物流追蹤號碼。' },
              { q: '寄送方式？', a: '支援宅配與超商店到店依營運設定；完成照片確認後出貨。大宗或特殊包裝請洽專員。' },
            ],
          },
          {
            title: '帳號與資料',
            items: [
              {
                q: '我的模型檔案安全嗎？',
                a: '檔案以私有儲存保存，僅供本案生產使用；未經你的同意不用於展示、行銷或交付第三方。詳見隱私權政策。',
              },
              { q: '忘記密碼怎麼辦？', a: '客戶入口登入頁點「忘記密碼」，以註冊 Email 收取重設連結（一小時內有效）。' },
            ],
          },
        ],
      }
    },
  }
</script>

<style lang="scss" scoped>
  @import '@/styles/public-pages';

  .faq-page {
    @include page-hero;
    @include page-section;
  }

  .narrow {
    max-width: 820px !important;
  }

  .group-title {
    display: block;
    margin: 26px 0 4px;
    color: #3563e9;
    font-size: 15px;
    letter-spacing: 0.5px;
  }
  .faq-group {
    margin-bottom: 6px;
    p {
      color: #475467;
      line-height: 1.9;
      margin: 0;
      white-space: pre-line;
    }
  }

  .still {
    text-align: center;
    margin-top: 40px;
    p {
      color: #667085;
      margin-bottom: 12px;
    }
    .btn.primary,
    .btn.ghost {
      display: inline-block;
      border-radius: 9px;
      padding: 11px 24px;
      font-weight: 700;
      margin: 0 6px;
      text-decoration: none;
    }
    .btn.primary {
      background: #3563e9;
      color: #fff !important;
    }
    .btn.ghost {
      border: 1px solid #d5dce8;
      color: #17223b !important;
      background: #fff;
    }
  }
</style>
