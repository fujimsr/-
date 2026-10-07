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
    .addSeparator()
    .addItem('投稿フォームを作成', 'createPostForm')
    .addItem('投稿フォームのURLを表示', 'showFormUrl')
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
  PropertiesService.getScriptProperties().setProperty('spreadsheetId', ss.getId());

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

// ---------------------------------------------------------------
// 投稿フォーム（タブレットで撮影 → フォーム送信 → シートに自動で1行追加）
// ---------------------------------------------------------------
const FORM_PROP = 'postFormId';
const Q = {
  TYPE: '種類',
  TITLE: 'タイトル',
  BODY: '内容',
  IMAGES: '画像',
  DEADLINE: '提出期限',
  SUBMIT_WHAT: '提出するもの',
  IMPORTANT: '重要なお知らせ',
  PUBLISH: '公開',
};
const TYPE = { HANDOUT: '配布物（お手紙）', SUBMISSION: '提出物', NOTICE: 'お知らせ' };
const PUBLISH_NOW = 'すぐ公開する';
const ALLOWED_KEY = '投稿できるメール';

/** メニューから1回だけ実行：投稿フォームを作り、送信時の自動処理を登録する */
function createPostForm() {
  const ui = SpreadsheetApp.getUi();
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty(FORM_PROP)) {
    ui.alert('投稿フォームはすでに作成済みです。\nメニュー「投稿フォームのURLを表示」から開けます。');
    return;
  }
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const info = readSettings_(ss);

  const form = FormApp.create(((info.className || '') + ' 学級だより 投稿').trim())
    .setDescription('タブレットで撮影したお手紙などを投稿します。送信すると保護者ページ用のシートに追加されます。')
    .setConfirmationMessage('受け付けました。「すぐ公開する」を選ばなかった場合は、スプレッドシートで「公開」にチェックすると保護者ページに出ます。')
    .setAllowResponseEdits(false)
    .setShowLinkToRespondAgain(true);
  try {
    form.setEmailCollectionType(FormApp.EmailCollectionType.VERIFIED);
  } catch (e) {
    form.setCollectEmail(true);
  }

  form.addMultipleChoiceItem().setTitle(Q.TYPE).setRequired(true)
    .setChoiceValues([TYPE.HANDOUT, TYPE.SUBMISSION, TYPE.NOTICE]);
  form.addTextItem().setTitle(Q.TITLE).setRequired(true);
  form.addParagraphTextItem().setTitle(Q.BODY);
  // ※「画像」（ファイルのアップロード）はスクリプトから作れないため、README の手順で手動追加する
  form.addDateItem().setTitle(Q.DEADLINE).setHelpText('配布物・提出物で、提出が必要なときだけ');
  form.addTextItem().setTitle(Q.SUBMIT_WHAT).setHelpText('配布物のときだけ（例：参加票）');
  form.addCheckboxItem().setTitle(Q.IMPORTANT).setChoiceValues(['重要']).setHelpText('お知らせのときだけ。ページの一番上に表示されます');
  form.addMultipleChoiceItem().setTitle(Q.PUBLISH).setRequired(true)
    .setChoiceValues(['下書きにする（あとでシートで公開）', PUBLISH_NOW]);

  props.setProperty(FORM_PROP, form.getId());
  ScriptApp.newTrigger('onPostFormSubmit').forForm(form).onFormSubmit().create();

  // 投稿できる人：作成者のメールを登録（設定シートで追加可能。カンマ区切り）
  const me = Session.getEffectiveUser().getEmail();
  const st = ss.getSheetByName(SHEET.SETTINGS);
  if (st && me && !readSettingRaw_(ss, ALLOWED_KEY)) st.appendRow([ALLOWED_KEY, me]);

  ui.alert(
    '投稿フォームを作成しました。\n\n' +
    '【最後に1つだけ手作業が必要です】\n' +
    'フォームの編集画面で「画像」という名前の「ファイルのアップロード」の質問を追加してください（README参照）。\n\n' +
    '編集：' + form.getEditUrl() + '\n' +
    '投稿用URL：' + form.getPublishedUrl()
  );
}

function showFormUrl() {
  const id = PropertiesService.getScriptProperties().getProperty(FORM_PROP);
  if (!id) {
    SpreadsheetApp.getUi().alert('まだ投稿フォームがありません。メニュー「投稿フォームを作成」を実行してください。');
    return;
  }
  const form = FormApp.openById(id);
  SpreadsheetApp.getUi().alert('投稿用URL：' + form.getPublishedUrl() + '\n\n編集：' + form.getEditUrl());
}

/** フォーム送信時に自動で呼ばれる（インストール型トリガー） */
function onPostFormSubmit(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet() || SpreadsheetApp.openById(findSpreadsheetId_());
    const r = e.response;

    // 登録されたメール以外からの投稿は無視（フォームのURLが漏れても掲載されない）
    const email = String(r.getRespondentEmail() || '').toLowerCase();
    const allowed = String(readSettingRaw_(ss, ALLOWED_KEY) || '').toLowerCase()
      .split(/[,、\s]+/).filter(String);
    if (!email || allowed.indexOf(email) === -1) {
      console.warn('許可されていないメールからの投稿を無視しました: ' + email);
      return;
    }

    const a = {};
    r.getItemResponses().forEach(ir => { a[ir.getItem().getTitle()] = ir.getResponse(); });

    const type = str_(a[Q.TYPE]);
    const title = str_(a[Q.TITLE]);
    const body = str_(a[Q.BODY]);
    const deadline = parseYmd_(a[Q.DEADLINE]);
    const publish = str_(a[Q.PUBLISH]) === PUBLISH_NOW;
    const today = new Date(r.getTimestamp());
    const dateOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const images = [].concat(a[Q.IMAGES] || [])
      .map(id => 'https://drive.google.com/file/d/' + id + '/view').join('\n');

    if (type === TYPE.HANDOUT) {
      appendPost_(ss, SHEET.HANDOUTS, [publish, dateOnly, title, body, images, deadline || '', str_(a[Q.SUBMIT_WHAT])]);
    } else if (type === TYPE.SUBMISSION) {
      appendPost_(ss, SHEET.SUBMISSIONS, [publish, deadline || '', title, body]);
    } else if (type === TYPE.NOTICE) {
      const important = [].concat(a[Q.IMPORTANT] || []).length > 0;
      appendPost_(ss, SHEET.NOTICES, [publish, dateOnly, title, body, important]);
    }
    CacheService.getScriptCache().remove(CACHE_KEY);
  } finally {
    lock.releaseLock();
  }
}

// タイトル列（C列）が空いている最初の行に書き込む（チェックボックスが先に入っているため appendRow は使わない）
function appendPost_(ss, name, values) {
  const sh = ss.getSheetByName(name);
  const last = Math.max(sh.getLastRow(), 1);
  const titles = last > 1 ? sh.getRange(2, 3, last - 1, 1).getValues() : [];
  let row = titles.findIndex(t => str_(t[0]) === '');
  row = row === -1 ? last + 1 : row + 2;
  sh.getRange(row, 1, 1, values.length).setValues([values]);
  if (sh.getRange(row, 1).getDataValidation() === null) sh.getRange(row, 1).insertCheckboxes();
  if (name === SHEET.NOTICES && sh.getRange(row, 5).getDataValidation() === null) sh.getRange(row, 5).insertCheckboxes();
}

function readSettingRaw_(ss, key) {
  const sh = ss.getSheetByName(SHEET.SETTINGS);
  if (!sh || sh.getLastRow() < 1) return '';
  const hit = sh.getRange(1, 1, sh.getLastRow(), 2).getValues().filter(r => str_(r[0]) === key)[0];
  return hit ? hit[1] : '';
}

function parseYmd_(v) {
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(str_(v));
  return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
}

// フォームのトリガーから呼ばれたとき用（通常はコンテナバインドなので getActiveSpreadsheet で取れる）
function findSpreadsheetId_() {
  const id = PropertiesService.getScriptProperties().getProperty('spreadsheetId');
  if (!id) throw new Error('スプレッドシートが見つかりません。setup をもう一度実行してください。');
  return id;
}
