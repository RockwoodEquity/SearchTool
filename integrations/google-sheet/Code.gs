/**
 * Rockwood Search: live Google Sheet copy of the Master Database.
 *
 * Paste this into the sheet's Apps Script editor (Extensions > Apps Script), then use the new
 * "Rockwood Search" menu: "1. Connect" and "2. Turn on automatic sync". See README.md next to this file.
 *
 * Every few minutes it reads the app's private feed and rewrites one tab per week, named
 * "Week of M/D/YYYY" (the Monday). A company goes on the tab of the week it was sourced. Each tab is
 * sorted by Add-On / Platform, then category, with the Website and Source cells clickable.
 *
 * The app's columns are a COPY and are overwritten when that week's data changes (editing them shows a
 * warning). The "Notes (editable)" column is yours: type anything there. Notes stay with their company when
 * the tab is rewritten, re-sorted or filtered. Keep and pass decisions are made in the app.
 */

var DEFAULT_FEED_URL = 'https://rockwood-search-tool.vercel.app/api/sheet-feed';
var SYNC_EVERY_MINUTES = 5;
var INFO_TAB = 'Sync info';
var NOTES_HEADER = 'Notes (editable)';

var COLUMNS = [
  { header: 'Type', key: 'type', width: 80 },
  { header: 'Category', key: 'category', width: 220 },
  { header: 'Mode', key: 'mode', width: 130 },
  { header: 'Company', key: 'company', width: 230 },
  { header: 'Sourced by (email)', key: 'sourced_by', width: 220 },
  { header: 'Review', key: 'review', width: 80 },
  { header: 'Website', key: 'website', width: 170, link: true },
  { header: 'Source', key: 'source_url', width: 170, link: true },
  { header: 'Location', key: 'location', width: 170 },
  { header: 'Employees', key: 'employees', width: 90 },
  { header: 'Est. Revenue / Asking Price', key: 'revenue_or_price', width: 190 },
  { header: 'Revenue / EBITDA Filter', key: 'search_filters', width: 160 },
  { header: 'Why it fits', key: 'why_fits', width: 430, wrap: true },
  { header: 'Broker / Currently for sale?', key: 'broker_source', width: 170 },
  { header: 'Listing Date', key: 'listing_date', width: 100, date: true },
  { header: 'Date Sourced', key: 'date_sourced', width: 100, date: true },
  { header: 'Contact', key: 'contact', width: 170 },
  { header: 'Already PE-owned?', key: 'pe_owned', width: 130 },
  { header: NOTES_HEADER, key: '__notes', width: 320, wrap: true, editable: true },
  { header: 'ID', key: 'id', width: 50, hidden: true }
];

var TYPE_ORDER = { 'Add-On': 0, 'Platform': 1 };
var MODE_ORDER = { 'For-Sale Listing': 0, 'Proprietary Target': 1 };

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Rockwood Search')
    .addItem('1. Connect', 'connect')
    .addItem('2. Turn on automatic sync', 'installTrigger')
    .addSeparator()
    .addItem('Sync now', 'syncNow')
    .addItem('Turn off automatic sync', 'removeTrigger')
    .addToUi();
}

/** Asks for the feed address and the secret key, and keeps them in this script's private properties. */
function connect() {
  var ui = SpreadsheetApp.getUi();
  var props = PropertiesService.getScriptProperties();

  var url = ui.prompt('Feed address', 'Press OK to keep the address shown, or paste a different one.\n\n' + (props.getProperty('FEED_URL') || DEFAULT_FEED_URL), ui.ButtonSet.OK_CANCEL);
  if (url.getSelectedButton() !== ui.Button.OK) return;
  var typed = url.getResponseText().trim();
  props.setProperty('FEED_URL', /^https:\/\//.test(typed) ? typed : (props.getProperty('FEED_URL') || DEFAULT_FEED_URL));

  var key = ui.prompt('Secret key', 'Paste the secret key you were given.', ui.ButtonSet.OK_CANCEL);
  if (key.getSelectedButton() !== ui.Button.OK) return;
  var keyText = key.getResponseText().trim();
  if (keyText.length < 32) {
    ui.alert('That key looks too short. Nothing was saved.');
    return;
  }
  props.setProperty('FEED_KEY', keyText);
  ui.alert('Connected. Now choose "2. Turn on automatic sync".');
}

function installTrigger() {
  removeTrigger();
  ScriptApp.newTrigger('sync').timeBased().everyMinutes(SYNC_EVERY_MINUTES).create();
  syncNow();
}

function removeTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'sync') ScriptApp.deleteTrigger(t);
  });
}

/** Menu version of sync: tells you what happened. */
function syncNow() {
  var ui = SpreadsheetApp.getUi();
  try {
    var result = sync();
    ui.alert('Synced ' + result.companies + ' companies into ' + result.weeks + ' weekly tab(s).');
  } catch (err) {
    ui.alert('Sync failed: ' + err.message);
  }
}

function sync() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw new Error('Another sync is already running.');
  try {
    return runSync();
  } catch (err) {
    writeInfo(SpreadsheetApp.getActiveSpreadsheet(), ['Last sync', 'FAILED: ' + err.message], null);
    throw err;
  } finally {
    lock.releaseLock();
  }
}

function runSync() {
  var props = PropertiesService.getScriptProperties();
  var url = props.getProperty('FEED_URL') || DEFAULT_FEED_URL;
  var key = props.getProperty('FEED_KEY');
  if (!key) throw new Error('Not connected yet. Use Rockwood Search > 1. Connect.');

  var response = UrlFetchApp.fetch(url, { headers: { Authorization: 'Bearer ' + key }, muteHttpExceptions: true });
  var code = response.getResponseCode();
  if (code === 401) throw new Error('The secret key was refused. Use Rockwood Search > 1. Connect to enter it again.');
  if (code !== 200) throw new Error('The app answered with error ' + code + '.');
  var feed = JSON.parse(response.getContentText());
  var rows = feed.rows;
  if (!Array.isArray(rows)) throw new Error('The app sent an unexpected reply.');

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var weeks = groupByWeek(rows);
  var weekKeys = Object.keys(weeks).sort().reverse(); // newest week first
  var titles = weekKeys.map(weekTitle);

  var hashes = JSON.parse(props.getProperty('HASHES') || '{}');
  var written = 0;
  weekKeys.forEach(function (weekKey, i) {
    var title = titles[i];
    var sorted = sortRows(weeks[weekKey]);
    var hash = digest(JSON.stringify(sorted));
    var existing = ss.getSheetByName(title);
    if (!existing || hashes[title] !== hash) {
      writeWeek(ss, title, sorted);
      hashes[title] = hash;
      written++;
    }
  });

  // Weekly tabs come first, newest on the left.
  titles.forEach(function (title, i) {
    var sheet = ss.getSheetByName(title);
    if (sheet.getIndex() !== i + 1) {
      ss.setActiveSheet(sheet);
      ss.moveActiveSheet(i + 1);
    }
  });

  // The copy follows the app: a week with nothing left in it goes away. Never when the feed is empty,
  // so a temporary problem cannot wipe the sheet.
  if (rows.length > 0) {
    ss.getSheets().forEach(function (sheet) {
      var name = sheet.getName();
      if (/^Week of \d/.test(name) && titles.indexOf(name) === -1 && ss.getSheets().length > 1) {
        ss.deleteSheet(sheet);
        delete hashes[name];
      }
    });
  }

  // The empty starter tab is no longer needed.
  var starter = ss.getSheetByName('Sheet1');
  if (starter && starter.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(starter);

  props.setProperty('HASHES', JSON.stringify(hashes));
  var tz = ss.getSpreadsheetTimeZone ? ss.getSpreadsheetTimeZone() : Session.getScriptTimeZone();
  writeInfo(ss, ['Last sync', Utilities.formatDate(new Date(), tz, 'M/d/yyyy h:mm a') + ' (' + tz + ')'], {
    companies: rows.length,
    weeks: weekKeys.length,
    updated: written
  });
  return { companies: rows.length, weeks: weekKeys.length, updated: written };
}

function groupByWeek(rows) {
  var weeks = {};
  rows.forEach(function (row) {
    (weeks[row.week_start] = weeks[row.week_start] || []).push(row);
  });
  return weeks;
}

/** "2026-10-26" -> "Week of 10/26/2026" */
function weekTitle(weekStart) {
  var p = weekStart.split('-');
  return 'Week of ' + Number(p[1]) + '/' + Number(p[2]) + '/' + p[0];
}

/** Add-On then Platform, then category A-Z, then for-sale before proprietary, then newest first. */
function sortRows(rows) {
  return rows.slice().sort(function (a, b) {
    return (
      (TYPE_ORDER[a.type] - TYPE_ORDER[b.type]) ||
      a.category.toLowerCase().localeCompare(b.category.toLowerCase()) ||
      (MODE_ORDER[a.mode] - MODE_ORDER[b.mode]) ||
      b.date_sourced.localeCompare(a.date_sourced) ||
      a.company.toLowerCase().localeCompare(b.company.toLowerCase())
    );
  });
}

function digest(text) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, text, Utilities.Charset.UTF_8)
    .map(function (b) {
      return ('0' + (b & 0xff).toString(16)).slice(-2);
    })
    .join('');
}

function toDate(iso) {
  if (!iso) return '';
  var p = String(iso).slice(0, 10).split('-');
  return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
}

/** The clickable text for a link: its site name, such as bizbuysell.com. */
function linkLabel(url) {
  var m = /^https?:\/\/(?:www\.)?([^\/?#]+)/i.exec(url);
  return m ? m[1] : url;
}

function richLink(url) {
  var builder = SpreadsheetApp.newRichTextValue();
  if (!url) return builder.setText('').build();
  if (!/^https?:\/\//i.test(url)) return builder.setText(url).build();
  return builder.setText(linkLabel(url)).setLinkUrl(url).build();
}

/** Notes typed in the sheet, by company id, read before a tab is rewritten. */
function readNotes(sheet) {
  var notes = {};
  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  if (lastRow < 2 || lastCol < 1) return notes;
  var values = sheet.getRange(1, 1, lastRow, lastCol).getValues();
  var noteCol = values[0].indexOf(NOTES_HEADER);
  var idCol = values[0].indexOf('ID');
  if (noteCol < 0 || idCol < 0) return notes;
  for (var i = 1; i < values.length; i++) {
    var note = values[i][noteCol];
    if (note !== '' && values[i][idCol] !== '') notes[String(values[i][idCol])] = note;
  }
  return notes;
}

function writeWeek(ss, title, rows) {
  var sheet = ss.getSheetByName(title) || ss.insertSheet(title);
  var notes = readNotes(sheet);
  var oldFilter = sheet.getFilter();
  if (oldFilter) oldFilter.remove();
  sheet.getProtections(SpreadsheetApp.ProtectionType.RANGE).forEach(function (p) { p.remove(); });
  sheet.clear();

  var cols = COLUMNS.length;
  var header = sheet.getRange(1, 1, 1, cols);
  header.setValues([COLUMNS.map(function (c) { return c.header; })]);
  header.setFontWeight('bold').setBackground('#1a1a2e').setFontColor('#ffffff');
  sheet.setFrozenRows(1);
  sheet.setFrozenColumns(4);

  var body = sheet.getRange(2, 1, rows.length, cols);
  body.setValues(
    rows.map(function (row) {
      return COLUMNS.map(function (c) {
        if (c.link) return row[c.key] ? linkLabel(row[c.key]) : '';
        if (c.date) return toDate(row[c.key]);
        if (c.key === '__notes') return notes[String(row.id)] || '';
        return row[c.key] == null ? '' : row[c.key];
      });
    })
  );

  COLUMNS.forEach(function (c, i) {
    var column = sheet.getRange(2, i + 1, rows.length, 1);
    if (c.link) column.setRichTextValues(rows.map(function (row) { return [richLink(row[c.key])]; }));
    if (c.date) column.setNumberFormat('m/d/yyyy');
    if (c.wrap) column.setWrap(true);
    sheet.setColumnWidth(i + 1, c.width);
    if (c.hidden) sheet.hideColumns(i + 1);
  });
  body.setVerticalAlignment('top');

  // Passed companies are greyed out; kept ones are marked green.
  var reviewCol = COLUMNS.map(function (c) { return c.key; }).indexOf('review');
  body.setFontColors(
    rows.map(function (row) {
      return COLUMNS.map(function () { return row.review === 'Passed' ? '#9aa0a6' : '#1a1a1a'; });
    })
  );
  sheet.getRange(2, reviewCol + 1, rows.length, 1).setBackgrounds(
    rows.map(function (row) { return [row.review === 'Kept' ? '#e3f4ea' : null]; })
  );

  sheet.getRange(1, 1, rows.length + 1, cols).createFilter();

  // Everything except the Notes column is app data: warn before anyone types over it.
  var notesIndex = COLUMNS.map(function (c) { return c.key; }).indexOf('__notes');
  var guarded = [sheet.getRange(1, 1, rows.length + 1, notesIndex), sheet.getRange(1, notesIndex + 2, rows.length + 1, cols - notesIndex - 1)];
  guarded.forEach(function (range) {
    range.protect().setWarningOnly(true).setDescription('Copied from Rockwood Search. It is overwritten when this week changes. Use the Notes column for your own comments.');
  });
  return sheet;
}

function writeInfo(ss, statusLine, counts) {
  var sheet = ss.getSheetByName(INFO_TAB) || ss.insertSheet(INFO_TAB);
  var lines = [
    ['Rockwood Search: live copy of the Master Database', ''],
    ['', ''],
    statusLine
  ];
  if (counts) {
    lines.push(['Companies', counts.companies], ['Weekly tabs', counts.weeks], ['Tabs rewritten this sync', counts.updated]);
  }
  lines.push(
    ['', ''],
    ['The columns from the app are a copy: they are overwritten (checked every ' + SYNC_EVERY_MINUTES + ' minutes) when that week changes, so do not edit them.', ''],
    ['The Notes (editable) column is yours. Notes stay with their company. Keep and pass decisions are made in the app.', '']
  );
  sheet.clear();
  sheet.getRange(1, 1, lines.length, 2).setValues(lines);
  sheet.getRange(1, 1).setFontWeight('bold');
  sheet.setColumnWidth(1, 260);
  sheet.setColumnWidth(2, 320);
  var last = ss.getSheets().length;
  if (sheet.getIndex() !== last) {
    ss.setActiveSheet(sheet);
    ss.moveActiveSheet(last);
  }
}
