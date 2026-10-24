# 建立人與 AI 的共編紀錄

- 日期：2026-10-24（Asia/Taipei）
- 工作者／工具：本對話 Codex
- 工作 ID：COLLAB-20261024-01
- 基準 commit：`e9803ae`
- 本次 commit：隨本紀錄的提交；可用 `git log -- collaboration/changes/2026-10-24-codex-collaboration-records.md` 查詢。
- 狀態：已完成。

## 目的與授權範圍

使用者要求在 GitHub 專案建立紀錄資料夾，讓雙方 AI 與 UI/UX 協作者記錄修改、保留設計理由，降低後續工作把協作者成果覆寫回去的風險。本次只改協作文件和 README 入口，不改網站程式、版型、樣式或功能。

## 修改內容

| 檔案 | 改動與原因 |
| --- | --- |
| `AGENTS.md` | 要求動手前讀取共編紀錄、查 Git 與目標檔案；保留他人改動與確認設計，完成後記錄交接 |
| `collaboration/README.md` | 提供共編流程、圓角決策示例、分支說明及可交給另一位協作者的提示文字 |
| `collaboration/DESIGN_DECISIONS.md` | 登錄已有使用者要求；不自行批准圓角、配色或間距 |
| `collaboration/CURRENT_WORK.md` | 建立具體範圍與基準 commit 的分工紀錄；未知協作者保留待認領 |
| `collaboration/HANDOFF.md` | 記錄 UI/UX 分工待確認，以及既有印表機／影像後端待接手界線 |
| `collaboration/templates/CHANGE_RECORD.md` | 提供每次工作可複製的修改紀錄範本 |
| `collaboration/changes/2026-10-24-codex-collaboration-records.md` | 留下本次協作制度建立的原因、範圍與驗證 |
| `README.md`、`README.zh-TW.md` | 加入容易找到的共編入口 |

## 保留的設計與相容性

- 保留目前全部前端與後端程式；本次沒有修改 UI/UX，沒有新增圓角、色彩、字型或間距的強制規格。
- 登錄 D-001～D-004 的來源是既有使用者要求，不是替尚未到場的 UI/UX 協作者作決定。
- 尊重目前成果交付至 `main` 的要求；未建立 GitHub 權限、CODEOWNERS、分支保護或強制審查。
- 這些文件不是檔案鎖，不能保證所有 AI 工具自動讀取；已在入口明確說明。

## 驗證

- 檢查前工作區乾淨，HEAD 與抓取後的 `origin/main` 均為 `e9803ae`。
- 7 份共編 Markdown 的本機相對連結與兩份 README 入口檢查通過；`git diff --check` 通過。
- 本次僅文件變更，不重跑網站建置與功能測試，也不沿用上一批測試數字當作本次驗證。
- 沒有連接實體硬體、修改通知設定或執行網站部署。

## 交接

另一位協作者需明確讓其 AI 先讀 `AGENTS.md` 與 `collaboration/README.md`，再登記範圍。H-001、H-002 為待確認／待接手事項；不代表本次已安排其他人開工。
