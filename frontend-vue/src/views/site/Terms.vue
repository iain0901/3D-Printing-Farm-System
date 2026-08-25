<template>
  <div class="legal-page">
    <site-hero eyebrow="TERMS" title="服務條款" lead="最後更新：2026-08-24" slim />

    <section class="block narrow legal">
      <!-- 草稿版本：正式上線前請由法務／法律專業審閱調整 -->
      <h2>一、服務內容</h2>
      <p>
        3DRFM 三點成型（以下稱「本站」）提供 3D 列印代印、3D 建模與小量製造服務。 委託流程為：線上估價或詢價 → 專員確認切片與細節 → 正式報價
        → 客戶確認 → 生產 → 出貨。
      </p>

      <h2>二、報價與付款</h2>
      <p>
        線上估價屬初步參考，正式報價以專員依實際切片結果確認後為準，並載明金額、規格、數量與有效期限（預設 7 日）。
        客戶確認報價後始進入生產排程；付款方式與期程以報價單或訂單頁面標示為準。未於期限內付款者，本站得調整交期或取消排程。
      </p>

      <h2>三、客戶模型與智慧財產權</h2>
      <p>
        客戶上傳之模型檔案，其智慧財產權歸客戶所有。檔案僅用於本案生產、品檢與出貨所需，
        未經客戶同意不用於展示、行銷、轉售或交付第三人。客戶應保證其委印內容未侵害他人權利；
        違禁品、侵權品或依法不得製造之物品，本站有權拒絕或終止製作。
      </p>

      <h2>四、品質、公差與重印</h2>
      <p>
        FDM 列印具先天製程特性（層紋、支撐痕、材料收縮），一般尺寸公差約 ±0.2～0.5mm，視幾何與擺放方向而定。
        有裝配或關鍵尺寸需求者，請於下單時明確告知並建議加購尺寸檢查。 因本站切片參數或操作導致之列印異常，經判定後免費重印；
        客戶提供之模型本身設計缺陷所造成之問題，將由專員提出說明與修改建議後另行報價。
      </p>

      <h2>五、交期</h2>
      <p>
        交期以正式報價或訂單標示為準。因材料供應、不可抗力或客戶因素（檔案修改、確認延遲）導致延誤時，
        本站將主動通知並協調新交期；急件服務依方案頁所列加成計費。
      </p>

      <h2>六、退換貨</h2>
      <p>
        客製化製品不適用七天鑑賞期。成品與報價規格不符、運輸損壞或品檢漏檢之瑕疵， 請於收到貨 7
        日內附照片聯繫，經確認後安排重印、修補或按比例退款。
      </p>

      <h2>七、責任限制</h2>
      <p>本站對委印成品之賠償責任，以其對應訂單之實付金額為上限，不含間接損失或衍生損害。</p>

      <h2>八、條款修訂</h2>
      <p>本條款如有修訂，將公布於本頁並更新「最後更新」日期；重大變更將於客戶入口公告。 下單即視為同意當時生效之條款。</p>

      <h2>九、聯絡方式</h2>
      <p>
        條款相關問題請透過
        <router-link to="/contact">聯絡我們</router-link>
        詢問。
      </p>
    </section>
  </div>
</template>

<script>
  import SiteHero from '@/components/site/SiteHero'

  export default { name: 'SiteTerms', components: { SiteHero } }
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
