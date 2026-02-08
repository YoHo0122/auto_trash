/* scripts/notion_cleanup.js */
const { Client } = require("@notionhq/client");

const {
  NOTION_TOKEN,
  NOTION_DATA_SOURCE_ID,
  EXEC_DATE_PROPERTY = "実行予定日",
  AUTO_DELETE_PROPERTY = "自動削除",
  DAYS = "7",
  DRY_RUN = "true",
} = process.env;

if (!NOTION_TOKEN) throw new Error("Missing NOTION_TOKEN");
if (!NOTION_DATA_SOURCE_ID) throw new Error("Missing NOTION_DATA_SOURCE_ID");

const notion = new Client({
  auth: NOTION_TOKEN,
  // 省略可（SDKのデフォルトが2025-09-03）だが明示しておくと安全
  notionVersion: "2025-09-03",
});

function toISODateOnly(d) {
  // NotionのdateフィルタはISO8601文字列を受け取れる（例: "2021-05-10"）:contentReference[oaicite:8]{index=8}
  return d.toISOString().slice(0, 10);
}

async function main() {
  const days = Number(DAYS);
  if (!Number.isFinite(days) || days < 1) throw new Error("DAYS must be >= 1");

  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const cutoffStr = toISODateOnly(cutoff);

  // デバッグ: 時刻とフィルタ条件を詳細に出力
  console.log(`=== Debug Info ===`);
  console.log(`Current UTC: ${new Date().toISOString()}`);
  console.log(`Current JST: ${new Date().toLocaleString('ja-JP', {timeZone: 'Asia/Tokyo'})}`);
  console.log(`DAYS: ${days}`);
  console.log(`Cutoff (on_or_before): ${cutoffStr}`);
  console.log(`Filter: AUTO_DELETE_PROPERTY=${AUTO_DELETE_PROPERTY}, EXEC_DATE_PROPERTY=${EXEC_DATE_PROPERTY}`);
  console.log(`DRY_RUN: ${DRY_RUN}`);
  console.log(`==================`);

  let start_cursor = undefined;
  let totalMatched = 0;
  let totalTrashed = 0;

  while (true) {
    // data source のクエリは filter を送れる。:contentReference[oaicite:9]{index=9}
    // 日付条件は date.on_or_before などが使える。:contentReference[oaicite:10]{index=10}
    const res = await notion.dataSources.query({
  data_source_id: NOTION_DATA_SOURCE_ID,
  start_cursor,
  page_size: 100,
  filter: {
    and: [
      { property: AUTO_DELETE_PROPERTY, checkbox: { equals: true } },
      { property: EXEC_DATE_PROPERTY, date: { on_or_before: cutoffStr } },
    ],
  },
});


    const pages = res.results || [];
    totalMatched += pages.length;
    console.log(`[Query] Found ${pages.length} pages in this batch (has_more: ${res.has_more})`);

    for (const page of pages) {
      const pageId = page.id;
      if (DRY_RUN === "true") {
        console.log(`[DRY] would trash: ${pageId}`);
        continue;
      }

      // ページをゴミ箱へ（in_trash: true）:contentReference[oaicite:11]{index=11}
      await notion.pages.update({
        page_id: pageId,
        in_trash: true,
      });
      totalTrashed += 1;
      console.log(`[OK] trashed: ${pageId}`);
    }

    if (!res.has_more) break;
    start_cursor = res.next_cursor;
  }

  console.log(`Matched: ${totalMatched}`);
  console.log(`Trashed: ${totalTrashed}`);
  console.log(
    "Note: Notion APIはページの完全削除はサポートしません（ゴミ箱移動まで）。"
  ); // :contentReference[oaicite:12]{index=12}
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
