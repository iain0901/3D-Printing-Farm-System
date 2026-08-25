import { defineConfig } from "vitest/config";

// 全套測試含大量檔案系統整合測試；在平行 worker 與低階機器上偶發 IO 抖動。
// retry: 1 只會重跑「失敗」的測試，斷言嚴格度不變。
export default defineConfig({
  test: {
    retry: 1,
  },
});
