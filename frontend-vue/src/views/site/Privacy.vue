<template>
  <div class="legal-page">
    <site-hero eyebrow="PRIVACY" title="隱私權政策" lead="最後更新：2026-08-24" slim />

    <section class="block narrow legal">
      <!-- 草稿版本：正式上線前請由法務／法律專業審閱調整 -->
      <h2>一、我們蒐集哪些資料</h2>
      <p>
        為提供估價與製作服務，我們會於你使用本站時蒐集：聯絡資訊（姓名、Email、電話）、
        你上傳的模型檔案與規格描述、訂單與付款紀錄、以及網站操作所需的技術性紀錄（如登入狀態）。
      </p>

      <h2>二、資料如何使用</h2>
      <p>
        僅用於：處理與履行你的案件（報價、生產、出貨、通知）、客戶支援對話、
        服務品質改善與必要的營運紀錄。我們不會將你的個人資料或模型檔案出售予任何第三方。
      </p>

      <h2>三、模型檔案的处理</h2>
      <p>
        上傳之模型以私有儲存保存，僅供本案生產人員存取。案件完成後檔案依保存期限留存，
        你可隨時透過客服要求刪除；未經同意不會用於展示、行銷或訓練用途。
      </p>

      <h2>四、第三方服務</h2>
      <p>
        本站使用以下類別的第三方服務協助助營運：雲端主機與儲存、金流服務商（付款處理）、
        客服對話平台（訊息傳遞）、物流追蹤。各服務商僅取得執行業務所必要之資料， 並受其自身隱私政策保護。
      </p>

      <h2>五、Cookie 與本地儲存</h2>
      <p>本站使用 Cookie 與瀏覽器本地儲存來維持登入狀態、記住介面設定。 這些技術不會用於跨站追蹤廣告。</p>

      <h2>六、你的權利</h2>
      <p>你可以查詢、更正或刪除你的個人資料，亦可要求匯出你的案件紀錄。 請透過聯絡頁面提出，我們將於合理期限內處理。</p>

      <h2>七、資料安全</h2>
      <p>傳輸採 HTTPS 加密；密碼以單向雜湊儲存；敏感憑證與生產環境隔離管理。 若發生資安事件影響你的資料，我們將依法通知並採取補救措施。</p>

      <h2>八、政策修訂</h2>
      <p>本政策如有修訂將公布於本頁並更新日期。繼續使用本站即視為同意修訂後內容。</p>

      <h2>九、聯絡窗口</h2>
      <p>
        隱私相關請求請透過
        <router-link to="/contact">聯絡我們</router-link>
        提出。
      </p>
    </section>
  </div>
</template>

<script>
  import SiteHero from '@/components/site/SiteHero'

  export default { name: 'SitePrivacy', components: { SiteHero } }
</script>

<style lang="scss" scoped>
  @import '@/styles/brand';
  @import '@/styles/public-pages';

  .legal-page {
    @include page-hero;
    .slim {
      padding: 52px 24px 40px;
      h1 {
        font-size: 32px;
        margin: 8px 0 6px;
      }
      p {
        color: #c4d0e6;
        font-size: 13px;
      }
    }
  }

  .narrow {
    max-width: 820px !important;
  }
  .legal {
    h2 {
      text-align: left;
      font-size: 19px;
      margin: 30px 0 8px;
      color: #17223b;
    }
    p {
      color: #475467;
      line-height: 2;
      font-size: 14px;
      margin: 0;
    }
    a {
      color: #3563e9;
    }
  }
</style>
