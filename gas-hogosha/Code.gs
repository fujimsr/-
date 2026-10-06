/**
 * 保護者向けページ（学級だより Web版）
 *
 * スプレッドシートに「コンテナバインド」して使います。
 *   1. スプレッドシート → 拡張機能 → Apps Script を開き、このファイルと index.html を貼り付け
 *   2. setup を1回だけ実行（シートと見出しが作られます）
 *   3. デプロイ → 新しいデプロイ → ウェブアプリ
 * 詳しくは README.md を参照。
 */

const SHEET = {
  SETTINGS: '設定',
  HANDOUTS: '配布物',
  SUBMISSIONS: '提出物',
  NOTICES: 'お知らせ',
};

const HEADERS = {
  [SHEET.HANDOUTS]: ['公開', '配布日', 'タイトル', '内容', '画像（DriveのURL・複数は改行）', '提出期限', '提出するもの'],
  [SHEET.SUBMISSIONS]: ['公開', '提出期限', 'タイトル', '内容'],
  [SHEET.NOTICES]: ['公開', '日付', 'タイトル', '内容', '重要'],
};

const TZ = 'Asia/Tokyo';
const CACHE_KEY = 'pageData';
const CACHE_SEC = 300;

// ---------------------------------------------------------------
// Webアプリ
// ---------------------------------------------------------------
function doGet() {
  const data = getPageData_();
  const t = HtmlService.createTemplateFromFile('index');
  // </script> などで閉じられないよう < をエスケープして埋め込む
  t.dataJson = JSON.stringify(data).replace(/</g, '\\u003c');
  const title = [data.info.className, data.info.title].filter(String).join(' ') || '学級だより';
  return t.evaluate()
    .setTitle(title)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);
}

/**
 * 画像を data URL で返す（クライアントから google.script.run で呼ばれる）。
 * 誰でも呼べる関数なので、「公開中の配布物に載っている画像」以外は返さない。
 */
function getImage(fileId, width) {
  const allowed = getPageData_().handouts.some(h => h.images.indexOf(fileId) !== -1);
  if (!allowed) throw new Error('この画像は表示できません');

  const w = Math.min(Math.max(Number(width) || 800, 200), 2000);
  const blob = fetchResized_(fileId, w) || DriveApp.getFileById(fileId).getBlob();
  const type = blob.getContentType();
  if (!/^image\//.test(type)) throw new Error('画像ファイルではありません');
  return 'data:' + type + ';base64,' + Utilities.base64Encode(blob.getBytes());
}

// Drive のサムネイル機能で縮小（スマホ写真は数MBあるため）。失敗したら null。
function fetchResized_(fileId, width) {
  try {
    const res = UrlFetchApp.fetch(
      'https://drive.google.com/thumbnail?id=' + encodeURIComponent(fileId) + '&sz=w' + width,
      { headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, muteHttpExceptions: true }
    );
    if (res.getResponseCode() !== 200) return null;
    const blob = res.getBlob();
    return /^image\//.test(blob.getContentType()) ? blob : null;
  } catch (e) {
    return null;
  }
}

// ---------------------------------------------------------------
// データ読み込み
// ---------------------------------------------------------------
function getPageData_() {
  const cache = CacheService.getScriptCache();
  const hit = cache.get(CACHE_KEY);
  if (hit) return JSON.parse(hit);

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const data = {
    info: readSettings_(ss),
    handouts: readRows_(ss, SHEET.HANDOUTS).map(r => ({
      date: fmtDate_(r[1]),
      title: str_(r[2]),
      description: str_(r[3]),
      images: parseDriveIds_(r[4]),
      deadline: fmtDate_(r[5]),
      submitWhat: str_(r[6]),
    })),
    submissions: readRows_(ss, SHEET.SUBMISSIONS).map(r => ({
      deadline: fmtDate_(r[1]),
      title: str_(r[2]),
      note: str_(r[3]),
    })),
    notices: readRows_(ss, SHEET.NOTICES).map(r => ({
      date: fmtDate_(r[1]),
      title: str_(r[2]),
      body: str_(r[3]),
      important: r[4] === true,
    })),
  };

  const json = JSON.stringify(data);
  if (json.length < 90000) cache.put(CACHE_KEY, json, CACHE_SEC);
  return data;
}

// 「公開」にチェックがあり、タイトルが空でない行だけ返す
function readRows_(ss, name) {
  const sh = ss.getSheetByName(name);
  if (!sh || sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, HEADERS[name].length).getValues()
    .filter(r => r[0] === true && str_(r[2]) !== '');
}

function readSettings_(ss) {
  const sh = ss.getSheetByName(SHEET.SETTINGS);
  const map = {};
  if (sh && sh.getLastRow() >= 1) {
    sh.getRange(1, 1, sh.getLastRow(), 2).getValues().forEach(r => { map[str_(r[0])] = r[1]; });
  }
  return {
    school: str_(map['学校名']),
    className: str_(map['クラス名']),
    title: str_(map['ページタイトル']),
    contact: str_(map['フッターの一言']),
    updated: Utilities.formatDate(lastUpdated_(ss), TZ, 'yyyy-MM-dd'),
  };
}

function lastUpdated_(ss) {
  try {
    return DriveApp.getFileById(ss.getId()).getLastUpdated();
  } catch (e) {
    return new Date();
  }
}

function fmtDate_(v) {
  if (Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v)) return Utilities.formatDate(v, TZ, 'yyyy-MM-dd');
  const m = /^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/.exec(str_(v));
  return m ? m[1] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[3]).slice(-2) : '';
}

function str_(v) {
  return v === null || v === undefined ? '' : String(v).trim();
}

// Drive の共有URL / ファイルID を改行・カンマ区切りで受け取り、ID の配列にする
function parseDriveIds_(v) {
  return str_(v).split(/[\n,、\s]+/).map(s => {
    const m = /\/d\/([\w-]{20,})/.exec(s) || /[?&]id=([\w-]{20,})/.exec(s) || /^([\w-]{20,})$/.exec(s);
    return m ? m[1] : '';
  }).filter(String);
}

// ---------------------------------------------------------------
// スプレッドシート側
// ---------------------------------------------------------------
function onOpen() {
  SpreadsheetApp.getUi().createMenu('学級だより')
    .addItem('ページにすぐ反映する', 'clearCache')
    .addItem('ページのURLを表示', 'showUrl')
    .addToUi();
}

// 編集したらキャッシュを消して、すぐページに反映させる
function onEdit() {
  CacheService.getScriptCache().remove(CACHE_KEY);
}

function clearCache() {
  CacheService.getScriptCache().remove(CACHE_KEY);
  SpreadsheetApp.getActive().toast('反映しました。ページを再読み込みしてください。');
}

function showUrl() {
  const url = ScriptApp.getService().getUrl();
  SpreadsheetApp.getUi().alert(url ? url : 'まだデプロイされていません。「デプロイ → 新しいデプロイ」から公開してください。');
}

/** 初回に1回だけ実行：シート・見出し・チェックボックス・サンプル行を作る */
function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  let st = ss.getSheetByName(SHEET.SETTINGS);
  if (!st) {
    st = ss.insertSheet(SHEET.SETTINGS);
    st.getRange(1, 1, 4, 2).setValues([
      ['学校名', '〇〇市立〇〇小学校'],
      ['クラス名', '3年1組'],
      ['ページタイトル', '学級だより'],
      ['フッターの一言', 'ご不明な点は連絡帳または学校までお問い合わせください。'],
    ]);
    st.setColumnWidth(1, 140).setColumnWidth(2, 360);
  }

  const today = new Date();
  const addDays = n => new Date(today.getFullYear(), today.getMonth(), today.getDate() + n);
  const samples = {
    [SHEET.HANDOUTS]: [[true, addDays(0), '校外学習のお知らせ', '10月23日に〇〇公園へ行きます。\n参加票をご提出ください。', '', addDays(3), '参加票']],
    [SHEET.SUBMISSIONS]: [[true, addDays(8), '図工で使う空き箱', 'お菓子の箱など1〜2個']],
    [SHEET.NOTICES]: [[true, addDays(-1), '体操服の名前の確認をお願いします', '落とし物が増えています。', true]],
  };

  Object.keys(HEADERS).forEach(name => {
    if (ss.getSheetByName(name)) return;
    const sh = ss.insertSheet(name);
    const h = HEADERS[name];
    sh.getRange(1, 1, 1, h.length).setValues([h]).setFontWeight('bold').setBackground('#e3f1ea');
    sh.setFrozenRows(1);
    sh.getRange(2, 1, 500, 1).insertCheckboxes();
    if (name === SHEET.NOTICES) sh.getRange(2, 5, 500, 1).insertCheckboxes();
    h.forEach((label, i) => {
      if (/日|期限/.test(label)) sh.getRange(2, i + 1, 500, 1).setNumberFormat('yyyy/mm/dd');
      sh.setColumnWidth(i + 1, /内容|画像/.test(label) ? 320 : i === 0 ? 50 : 140);
    });
    sh.getRange(2, 1, 500, h.length).setWrap(true).setVerticalAlignment('top');
    const rows = samples[name];
    sh.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
  });

  const sheet1 = ss.getSheetByName('シート1') || ss.getSheetByName('Sheet1');
  if (sheet1 && sheet1.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(sheet1);
  clearCache();
}
