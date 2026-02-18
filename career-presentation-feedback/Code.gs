/**
 * つかめ！将来の星 — 発表評価フォーム
 * Google Apps Script バックエンド
 *
 * ════════════════════════════════════════════
 *  【セットアップ手順】
 * ════════════════════════════════════════════
 *
 * ① 保存先スプレッドシートを用意する
 *    - Google ドライブで新しいスプレッドシートを作成
 *    - URLの /d/ と /edit の間にある文字列をコピーする
 *      例: https://docs.google.com/spreadsheets/d/【ここをコピー】/edit
 *    - 下の SPREADSHEET_ID に貼り付ける
 *
 * ② Google Apps Script プロジェクトを作成する
 *    - script.google.com にアクセス
 *    - 「新しいプロジェクト」をクリック
 *    - このファイル(Code.gs)と Index.html の内容をそれぞれコピー
 *      ※ Index.html は「ファイルを追加」→「HTML」で追加
 *
 * ③ ウェブアプリとしてデプロイする
 *    - 「デプロイ」→「新しいデプロイ」をクリック
 *    - 種類: 「ウェブアプリ」を選択
 *    - 説明: 任意（例: 発表評価フォーム v1）
 *    - 実行ユーザー: 「自分（teacher@example.com）」
 *    - アクセスできるユーザー: 「全員」
 *    - 「デプロイ」をクリックして権限を承認
 *
 * ④ Google サイトに埋め込む
 *    - 発行されたウェブアプリのURLをコピー
 *    - Google サイトの編集画面で「埋め込む」→「URL」に貼り付ける
 *    - 各発表場所のページごとにサイトを用意すると便利
 *
 * ════════════════════════════════════════════
 */

// ★ 保存先スプレッドシートのIDをここに入力してください ★
const SPREADSHEET_ID = 'YOUR_SPREADSHEET_ID_HERE';

// 保存するシート名（変更可）
const SHEET_NAME = '評価一覧';

// ─────────────────────────────────────────────
// ウェブアプリのエントリーポイント
// ─────────────────────────────────────────────
function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('つかめ！将来の星 — 発表評価フォーム')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// ─────────────────────────────────────────────
// フォームデータをスプレッドシートに保存する
// ─────────────────────────────────────────────
function submitEvaluation(formData) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    let sheet = ss.getSheetByName(SHEET_NAME);

    // シートが存在しない場合は新規作成してヘッダーを設定
    if (!sheet) {
      sheet = ss.insertSheet(SHEET_NAME);
      _setupHeader(sheet);
    }

    // 星マーク文字列に変換（例: ★★★☆☆）
    const stars = '★'.repeat(formData.rating) + '☆'.repeat(5 - formData.rating);

    // データを追記
    sheet.appendRow([
      new Date(),              // タイムスタンプ
      formData.reviewerName,   // 記入者の名前
      formData.presenterName,  // 発表者の名前
      stars,                   // 評価
      formData.comment || ''   // 応援コメント（任意）
    ]);

    // 偶数行に薄い背景色を設定（読みやすくする）
    const lastRow = sheet.getLastRow();
    if (lastRow % 2 === 0) {
      sheet.getRange(lastRow, 1, 1, 5).setBackground('#EDE7F6');
    }

    return { success: true };

  } catch (e) {
    console.error('submitEvaluation error:', e);
    return { success: false, error: e.toString() };
  }
}

// ─────────────────────────────────────────────
// ヘッダー行の初期設定（内部用）
// ─────────────────────────────────────────────
function _setupHeader(sheet) {
  const headers = [
    'タイムスタンプ',
    '記入者の名前',
    '発表者の名前',
    '評価',
    '応援コメント'
  ];

  sheet.appendRow(headers);

  const range = sheet.getRange(1, 1, 1, headers.length);
  range
    .setFontWeight('bold')
    .setBackground('#6B4FBB')
    .setFontColor('white')
    .setHorizontalAlignment('center');

  // 列幅を調整
  sheet.setColumnWidth(1, 185); // タイムスタンプ
  sheet.setColumnWidth(2, 150); // 記入者の名前
  sheet.setColumnWidth(3, 150); // 発表者の名前
  sheet.setColumnWidth(4, 100); // 評価
  sheet.setColumnWidth(5, 360); // 応援コメント

  sheet.setFrozenRows(1);
}
