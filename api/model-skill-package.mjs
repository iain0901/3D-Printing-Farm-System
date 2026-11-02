import JSZip from "jszip";
import { createHash } from "node:crypto";
export const modelSkill = `---
name: 3drfm-model-design
description: 根據用途與量測建立可編輯 FDM 模型，驗證匯出，再交接 3DRFM 報價／列印流程。
---
# FDM 建模與交接
1. 先詢問用途、關鍵尺寸、公差、配合件、色數、預算與交期。照片不是量測；缺少尺寸先問，不猜測安全承重、食品接觸或耐熱性能。
2. 使用使用者已安裝且授權的 CAD 工具建立參數化模型，保留原始檔。此 skill 本身不提供任意文字／圖片轉網格引擎，也不安裝或付費啟用工具。
3. 根據實際機型／噴嘴／材料核對最小壁厚、孔徑、間隙、懸空面與裝配順序。缺少設備設定時明確列待確認，不編造通用製程保證。多色模型以物件／材料分配保留，STL 不保留多色。
4. 可輸出毫米單位二進位 STL 或保留材料分配的 3MF，另保存 CAD 原始檔。執行套件的 validate-stl.mjs 做有界限的外框／數值檢查；它不驗證流形、壁厚、強度或 3MF，仍需 CAD／切片器檢查。
5. 讓使用者自行用網站檔案選擇器匯入，檢查方向、布局、材料、色槽與支撐，取得真正切片估時／估重後進入報價。不得以概念圖代替模型或以 AI 估算取代切片。
6. 如已連接平台 MCP，可使用 get_workspace、propose_ui_action、get_action_status；只能操作服務實際回傳的工具／控制 ID，先提出確認，再查完成或失敗。付款、密鑰、檔案挑選與機台控制不繞過本人授權。
7. 交付檔案、尺寸、已做檢查、未驗證項目、建議切片參數與實際切片結果。未真實列印就寫未試印，不宣稱已上線或可承重。
`;
const validator = `// Node.js 18+; local binary STL inspection only; no network or subprocess.
import { readFileSync, statSync } from 'node:fs';
const file = process.argv[2];
if (!file || statSync(file).size > 10 * 1024 * 1024) throw Error('Provide a binary STL under 10 MiB');
const b = readFileSync(file);
if (b.length < 84 || b.length !== 84 + 50 * b.readUInt32LE(80)) throw Error('Invalid/ASCII STL: binary STL required');
const count = b.readUInt32LE(80); if (!count) throw Error('Empty mesh');
const min = [Infinity,Infinity,Infinity], max = [-Infinity,-Infinity,-Infinity];
for (let i=0;i<count;i++) for (let v=0;v<3;v++) for(let a=0;a<3;a++) {
 const n=b.readFloatLE(84+i*50+12+v*12+a*4); if(!Number.isFinite(n)) throw Error('Non-finite vertex');
 min[a]=Math.min(min[a],n); max[a]=Math.max(max[a],n);
}
console.log(JSON.stringify({triangles:count,dimensionsAssumingMm:max.map((n,i)=>n-min[i]),
 limitations:['Units assumed, not encoded by STL','Not a manifold/wall-thickness/strength check','Verify material mapping with 3MF and real slicer']},null,2));
`;
export async function buildModelSkillPackage() {
  const files = {
    "3drfm-model-design/SKILL.md": modelSkill,
    "3drfm-model-design/validate-stl.mjs": validator,
    "README.md": `# 3DRFM FDM Skill 套件\n\n支援方式：解壓後人工安裝至有檔案型 skill 的工具。Codex：專案 .agents/skills/3drfm-model-design/；Claude Code：.claude/skills/3drfm-model-design/。依該工具版本的 skill 載入規則啟用，不保證所有聊天或 MCP 客戶端可直接匯入 ZIP。\n\n可重現流程：載入 SKILL → 用途與實測尺寸 → 使用已安裝 CAD → 保存原始檔與二進位 STL → node 3drfm-model-design/validate-stl.mjs model.stl → 人工核對 CAD／切片器 → 本人匯入網站 → 真切片／估價 → 訂單。腳本只讀所指定檔案，不連線、不啟動 CAD 或列印機。檢查不等於可列印或強度認證。\n\n此套件未呼叫外部模型，MCP 需另設 HTTP Bearer endpoint。只有提供指南與檢查腳本，不冒充伺服器自動生成任意 3D 模型。\n`,
  };
  const zip = new JSZip();
  for (const [name, content] of Object.entries(files)) zip.file(name, content);
  zip.file("manifest.json", JSON.stringify({ version: 1, files: Object.fromEntries(Object.entries(files).map(([name, content]) => [name, createHash("sha256").update(content).digest("hex")])) }, null, 2));
  return zip.generateAsync({ type: "nodebuffer" });
}
