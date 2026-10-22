// Public brand navigation is deliberately independent from the authenticated application.
export const publicNavigation = [
  {
    id: 'services',
    title: '製作服務',
    heading: '從原型到小量製造',
    description: '依製作階段，找到適合的服務。',
    links: [
      { label: 'FDM 服務總覽', to: '/services', description: '認識我們的製作範圍' },
      { label: '免費列印', to: '/free-print', description: '選擇校園站點・清華大學水木書苑' },
      { label: '模型代印', to: '/services/personal-print', description: '已有模型，從單件開始' },
      { label: '小批量製作', to: '/services/small-batch', description: '樣品確認、版本與批次規劃' },
      { label: '快速急件', to: '/services/rush-print', description: '提供需求日期，確認可行排程' },
    ],
  },
  {
    id: 'applications',
    title: '應用領域',
    heading: '為不同用途，安排製作',
    description: '讓材料、結構與交付條件對應實際需求。',
    links: [
      { label: '學校與實驗室', to: '/for/education', description: '研究治具、專題與文創紀念品' },
      { label: '企業與設計團隊', to: '/for/business', description: '展示模型、工業件與小批量' },
      { label: '個人與創作者', to: '/for/personal', description: '日常代印、客製物件與急件' },
      { label: '工業零件', to: '/services/industrial-parts', description: '試裝、定位與功能驗證' },
    ],
  },
  {
    id: 'resources',
    title: '技術資源',
    heading: '製作前，先確認規格',
    description: '了解材料與製程限制，讓第一次詢價更有效率。',
    links: [
      { label: '材料指南', to: '/materials', description: '六種 FDM 材料比較與選材方向' },
      { label: '雲端切片', to: '/cloud-slicer', description: '3D 模型布局與真實逐層路徑預覽' },
      { label: '檔案準備', to: '/guides/file-prep', description: '格式、尺寸單位與附件清單' },
      { label: 'FDM 設計指南', to: '/guides/fdm-design', description: '壁厚、支撐、方向與組裝公差' },
      { label: '常見問題', to: '/faq', description: '價格、交期與製作須知' },
    ],
  },
  {
    id: 'company',
    title: '關於 3DRFM',
    heading: '專注 FDM 製造服務',
    description: '從需求確認到案件追蹤，建立清楚的合作流程。',
    links: [
      { label: '品牌介紹', to: '/about', description: '了解 3DRFM 的服務理念' },
      { label: '訂製流程', to: '/process', description: '從線上初估到製作交付' },
      { label: '聯絡與合作', to: '/contact', description: '製作需求、技術支援與合作' },
    ],
  },
]
export const footerGroups = [
  {
    title: '製作與應用',
    links: [
      { label: 'FDM 服務總覽', to: '/services' },
      { label: '免費列印站點', to: '/free-print' },
      { label: '學校與實驗室', to: '/for/education' },
      { label: '企業製作', to: '/for/business' },
      { label: '個人代印', to: '/for/personal' },
      { label: '小批量製作', to: '/services/small-batch' },
    ],
  },
  { title: '技術與支援', links: publicNavigation[2].links.concat([{ label: '訂製流程', to: '/process' }]) },
  {
    title: '關於與帳戶',
    links: [
      { label: '關於 3DRFM', to: '/about' },
      { label: '聯絡與合作', to: '/contact' },
      { label: '自動估價', to: '/quote' },
      { label: '會員中心', to: '/portal/login' },
      { label: '註冊帳號', to: '/portal/register' },
    ],
  },
]
