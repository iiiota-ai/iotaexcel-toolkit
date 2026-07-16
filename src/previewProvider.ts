import * as vscode from 'vscode';

import { IotaBytesFile, parseIotaBytes } from './iotaBytes';

export class IotaBytesPreviewProvider implements vscode.CustomReadonlyEditorProvider {
  public static readonly viewType = 'iotaexcel-toolkit.bytesPreview';

  public constructor(private readonly extensionUri: vscode.Uri) {}

  public async openCustomDocument(uri: vscode.Uri): Promise<vscode.CustomDocument> {
    return {
      uri,
      dispose: () => {},
    };
  }

  public async resolveCustomEditor(
    document: vscode.CustomDocument,
    webviewPanel: vscode.WebviewPanel,
  ): Promise<void> {
    webviewPanel.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri],
    };

    try {
      const data = await vscode.workspace.fs.readFile(document.uri);
      const parsed = parseIotaBytes(data);
      webviewPanel.webview.html = this.renderPreview(document.uri, parsed, webviewPanel.webview);
    } catch (error) {
      webviewPanel.webview.html = this.renderError(document.uri, error, webviewPanel.webview);
    }
  }

  private renderPreview(uri: vscode.Uri, file: IotaBytesFile, webview: vscode.Webview): string {
    const nonce = createNonce();
    const payload = safeJson({
      fileName: uri.fsPath.split(/[\\/]/).pop() ?? uri.fsPath,
      meta: {
        version: file.version,
        schemaHash: file.schemaHash,
        selfDescribing: file.selfDescribing,
      },
      keyFieldNo: file.keyFieldNo,
      fields: file.fields,
      rows: file.rows,
    });

    return html(webview, nonce, `
      <main class="shell">
        <header class="topbar">
          <div class="titleBlock">
            <h1 id="fileName"></h1>
            <p id="summary"></p>
          </div>
        </header>

        <section class="metaList" aria-label="Metadata" id="metaList"></section>

        <section class="tools" aria-label="Preview tools">
          <div class="toolGroup searchGroup">
            <label>
              <span>Search</span>
              <input id="searchInput" type="search" placeholder="Value or field" />
            </label>
            <button id="searchButton" title="Search">Find</button>
            <button id="prevMatch" title="Previous match">&lt;</button>
            <button id="nextMatch" title="Next match">&gt;</button>
            <label class="checkLabel" title="Match case">
              <input id="caseSensitive" type="checkbox" />
              <span>Aa</span>
            </label>
            <label class="checkLabel" title="Match whole word">
              <input id="wholeWord" type="checkbox" />
              <span>ab</span>
            </label>
            <label class="checkLabel" title="Use regular expression">
              <input id="regexMode" type="checkbox" />
              <span>.*</span>
            </label>
          </div>
          <div class="toolStatus" id="searchInfo" aria-live="polite">0 of 0</div>
          <div class="toolGroup">
            <label>
              <span>Row</span>
              <input id="rowInput" type="number" min="0" placeholder="0" />
            </label>
            <button id="rowButton" title="Go to row">Go</button>
          </div>
          <div class="toolGroup columnGroup">
            <label>
              <span>Column</span>
              <input id="columnInput" type="text" placeholder="field or no" />
            </label>
            <button id="columnButton" title="Go to column">Go</button>
          </div>
          <div class="pager" aria-label="Pagination">
            <button id="firstPage" title="First page" aria-label="First page">|&lt;</button>
            <button id="prevPage" title="Previous page" aria-label="Previous page">&lt;</button>
            <span id="pageInfo"></span>
            <button id="nextPage" title="Next page" aria-label="Next page">&gt;</button>
            <button id="lastPage" title="Last page" aria-label="Last page">&gt;|</button>
            <select id="pageSize" title="Rows per page" aria-label="Rows per page">
              <option value="25">25</option>
              <option value="50" selected>50</option>
              <option value="100">100</option>
              <option value="200">200</option>
            </select>
          </div>
        </section>
        <div class="toast" id="toast" role="status" aria-live="polite"></div>

        <section class="sheet" aria-label="Bytes preview">
          <div class="headerWrap" id="headerWrap">
            <table>
              <colgroup id="headerCols"></colgroup>
              <tbody id="sheetHead"></tbody>
            </table>
          </div>
          <div class="bodyWrap" id="bodyWrap">
            <table>
              <colgroup id="bodyCols"></colgroup>
              <tbody id="rowsBody"></tbody>
            </table>
          </div>
        </section>
      </main>

      <script nonce="${nonce}">
        const data = ${payload};
        const labelWidth = 86;
        const minColumnWidth = 96;
        const defaultColumnWidth = 128;
        const columnWidths = [labelWidth, ...data.fields.map(() => defaultColumnWidth)];
        let page = 0;
        let pageSize = 50;

        const els = {
          fileName: document.getElementById('fileName'),
          summary: document.getElementById('summary'),
          metaList: document.getElementById('metaList'),
          headerWrap: document.getElementById('headerWrap'),
          bodyWrap: document.getElementById('bodyWrap'),
          headerCols: document.getElementById('headerCols'),
          bodyCols: document.getElementById('bodyCols'),
          headerTable: document.getElementById('headerCols').closest('table'),
          bodyTable: document.getElementById('bodyCols').closest('table'),
          sheetHead: document.getElementById('sheetHead'),
          rowsBody: document.getElementById('rowsBody'),
          pageInfo: document.getElementById('pageInfo'),
          firstPage: document.getElementById('firstPage'),
          prevPage: document.getElementById('prevPage'),
          nextPage: document.getElementById('nextPage'),
          lastPage: document.getElementById('lastPage'),
          pageSize: document.getElementById('pageSize'),
          searchInput: document.getElementById('searchInput'),
          searchButton: document.getElementById('searchButton'),
          prevMatch: document.getElementById('prevMatch'),
          nextMatch: document.getElementById('nextMatch'),
          caseSensitive: document.getElementById('caseSensitive'),
          wholeWord: document.getElementById('wholeWord'),
          regexMode: document.getElementById('regexMode'),
          searchInfo: document.getElementById('searchInfo'),
          rowInput: document.getElementById('rowInput'),
          rowButton: document.getElementById('rowButton'),
          columnInput: document.getElementById('columnInput'),
          columnButton: document.getElementById('columnButton'),
          toast: document.getElementById('toast'),
        };
        let searchTerm = '';
        let searchMatcher = null;
        let searchMatches = [];
        let activeMatchIndex = -1;
        let toastTimer = 0;
        let selectedRow = -1;
        let selectedColumn = -1;
        let selectedCellRow = -1;
        let selectedCellColumn = -1;

        function text(value) {
          if (value === null || value === undefined) {
            return '';
          }
          if (typeof value === 'object') {
            return JSON.stringify(value);
          }
          return String(value);
        }

        function setColumnWidth(index, width) {
          const lowerBound = index === 0 ? labelWidth : minColumnWidth;
          columnWidths[index] = Math.max(lowerBound, Math.round(width));
          applyColumnWidths();
        }

        function applyColumnWidths() {
          const tableWidth = columnWidths.reduce((sum, width) => sum + width, 0);
          for (const target of [els.headerCols, els.bodyCols]) {
            target.replaceChildren(...columnWidths.map((width) => {
              const col = document.createElement('col');
              col.style.width = width + 'px';
              return col;
            }));
          }
          for (const table of [els.headerTable, els.bodyTable]) {
            table.style.width = tableWidth + 'px';
            table.style.minWidth = tableWidth + 'px';
          }
        }

        function labelCell(value, extraClass) {
          const th = document.createElement('th');
          th.className = extraClass ? 'rowLabel ' + extraClass : 'rowLabel';
          th.textContent = value;
          return th;
        }

        function dataCell(value) {
          const td = document.createElement('td');
          td.textContent = text(value);
          td.title = td.textContent;
          return td;
        }

        function valueCell(value, field) {
          const td = dataCell(value);
          if (field.kind === 'datetime' && value !== null && value !== undefined && value !== '') {
            td.title = formatDateTime(value);
          }
          return td;
        }

        function normalize(value) {
          return text(value);
        }

        function isSearchMatch(value, field) {
          if (!searchMatcher) {
            return false;
          }

          return [value, field.name, field.fieldNo, field.type].some((candidate) => matchesSearch(candidate));
        }

        function formatDateTime(value) {
          const seconds = Number(value);
          if (!Number.isFinite(seconds)) {
            return text(value);
          }

          const date = new Date(seconds * 1000);
          const pad = (part) => String(part).padStart(2, '0');
          return date.getFullYear()
            + '-' + pad(date.getMonth() + 1)
            + '-' + pad(date.getDate())
            + ' ' + pad(date.getHours())
            + ':' + pad(date.getMinutes())
            + ':' + pad(date.getSeconds());
        }

        function headerCell(value, field, columnIndex) {
          const th = document.createElement('th');
          th.textContent = value;
          th.title = 'fieldNo ' + field.fieldNo + (field.type ? ' / ' + field.type : '');
          if (columnIndex === selectedColumn) {
            th.classList.add('selectedColumn');
          }
          const handle = document.createElement('span');
          handle.className = 'resizeHandle';
          handle.addEventListener('pointerdown', (event) => startResize(event, columnIndex));
          th.append(handle);
          return th;
        }

        function startResize(event, columnIndex) {
          event.preventDefault();
          const startX = event.clientX;
          const startWidth = columnWidths[columnIndex];
          document.body.classList.add('resizing');

          const onMove = (moveEvent) => {
            setColumnWidth(columnIndex, startWidth + moveEvent.clientX - startX);
          };
          const onUp = () => {
            document.body.classList.remove('resizing');
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
          };

          window.addEventListener('pointermove', onMove);
          window.addEventListener('pointerup', onUp);
        }

        function renderMeta() {
          const items = [
            ['Version', data.meta.version],
            ['Self Describing', data.meta.selfDescribing ? 'true' : 'false'],
            ['Fields', data.fields.length],
            ['Rows', data.rows.length],
            ['Schema Hash', data.meta.schemaHash],
          ];

          els.metaList.replaceChildren(...items.map(([label, value]) => {
            const item = document.createElement('div');
            const labelEl = document.createElement('span');
            const valueEl = document.createElement('strong');
            labelEl.textContent = label;
            valueEl.textContent = text(value);
            valueEl.title = valueEl.textContent;
            if (label === 'Schema Hash') {
              item.classList.add('wideMeta');
              valueEl.tabIndex = 0;
            }
            item.append(labelEl, valueEl);
            return item;
          }));
        }

        function renderHeader() {
          const fieldNoRow = document.createElement('tr');
          fieldNoRow.append(labelCell('列号', 'configLabel'));
          fieldNoRow.append(...data.fields.map((field, index) => headerCell(String(field.fieldNo), field, index + 1)));

          const fieldNameRow = document.createElement('tr');
          fieldNameRow.className = 'fieldNameRow';
          fieldNameRow.append(labelCell('字段名', 'configLabel'));
          fieldNameRow.append(...data.fields.map((field, index) => {
            const name = field.fieldNo === data.keyFieldNo ? field.name + '*' : field.name;
            return headerCell(name, field, index + 1);
          }));

          const typeRow = document.createElement('tr');
          typeRow.className = 'typeRow';
          typeRow.append(labelCell('类型', 'configLabel'));
          typeRow.append(...data.fields.map((field, index) => headerCell(field.type, field, index + 1)));

          els.sheetHead.replaceChildren(
            ...(data.meta.selfDescribing ? [fieldNoRow, fieldNameRow, typeRow] : [fieldNoRow, typeRow]),
          );
        }

        function renderRows() {
          const maxPage = Math.max(0, Math.ceil(data.rows.length / pageSize) - 1);
          page = Math.min(Math.max(page, 0), maxPage);
          const start = page * pageSize;
          const rows = data.rows.slice(start, start + pageSize);

          els.rowsBody.replaceChildren(...rows.map((row, index) => {
            const absoluteIndex = start + index;
            const tr = document.createElement('tr');
            if (absoluteIndex === selectedRow) {
              tr.classList.add('selectedRow');
            }

            tr.append(labelCell(String(absoluteIndex + 1), 'dataLabel'));
            tr.append(...data.fields.map((field, fieldIndex) => {
              const td = valueCell(row[field.name], field);
              if (fieldIndex + 1 === selectedColumn) {
                td.classList.add('selectedColumn');
              }
              if (absoluteIndex === selectedCellRow && fieldIndex + 1 === selectedCellColumn) {
                td.classList.add('selectedCell');
              }
              if (isSearchMatch(row[field.name], field)) {
                td.classList.add('searchMatch');
              }
              return td;
            }));
            return tr;
          }));

          els.pageInfo.textContent = (page + 1) + ' / ' + (maxPage + 1);
          els.firstPage.disabled = page === 0;
          els.prevPage.disabled = page === 0;
          els.nextPage.disabled = page === maxPage;
          els.lastPage.disabled = page === maxPage;
        }

        function jumpToRow(rowNumber) {
          const target = Number(rowNumber);
          if (!Number.isInteger(target) || target < 1 || target > data.rows.length) {
            showToast('Row must be between 1 and ' + data.rows.length);
            return false;
          }

          selectedRow = target - 1;
          selectedCellRow = -1;
          selectedCellColumn = -1;
          page = Math.floor(selectedRow / pageSize);
          renderRows();
          requestAnimationFrame(() => {
            const row = els.rowsBody.children[selectedRow % pageSize];
            centerRow(row);
          });
          return true;
        }

        function findColumnIndex(query) {
          const value = text(query).trim().toLowerCase();
          if (!value) {
            return -1;
          }

          return data.fields.findIndex((field) => {
            const name = field.name.toLowerCase();
            const keyName = field.fieldNo === data.keyFieldNo ? (field.name + '*').toLowerCase() : name;
            return String(field.fieldNo) === value || name === value || keyName === value;
          });
        }

        function jumpToColumn(query) {
          const index = findColumnIndex(query);
          if (index < 0) {
            showToast('Column not found');
            return false;
          }

          selectedColumn = index + 1;
          selectedCellRow = -1;
          selectedCellColumn = -1;
          renderHeader();
          renderRows();
          requestAnimationFrame(() => {
            const left = columnWidths.slice(0, selectedColumn).reduce((sum, width) => sum + width, 0);
            els.bodyWrap.scrollLeft = Math.max(0, left - labelWidth);
            els.headerWrap.scrollLeft = els.bodyWrap.scrollLeft;
          });
          return true;
        }

        function createSearchMatcher(term) {
          const query = term.trim();
          if (!query) {
            return null;
          }

          const flags = els.caseSensitive.checked ? '' : 'i';
          if (els.regexMode.checked) {
            try {
              return new RegExp(query, flags);
            } catch (error) {
              showToast('Invalid regular expression');
              return null;
            }
          }

          const escaped = query.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
          const source = els.wholeWord.checked ? '\\b' + escaped + '\\b' : escaped;
          return new RegExp(source, flags);
        }

        function matchesSearch(value) {
          if (!searchMatcher) {
            return false;
          }
          searchMatcher.lastIndex = 0;
          return searchMatcher.test(text(value));
        }

        function findMatches() {
          if (!searchMatcher) {
            return [];
          }

          const matches = [];
          data.rows.forEach((row, rowIndex) => {
            data.fields.forEach((field, fieldIndex) => {
              if ([row[field.name], field.name, field.fieldNo, field.type].some((candidate) => matchesSearch(candidate))) {
                matches.push({ rowIndex, columnIndex: fieldIndex + 1 });
              }
            });
          });
          return matches;
        }

        function runSearch() {
          searchTerm = els.searchInput.value.trim();
          if (!searchTerm) {
            searchMatcher = null;
            searchMatches = [];
            activeMatchIndex = -1;
            selectedRow = -1;
            selectedCellRow = -1;
            selectedCellColumn = -1;
            setSearchInfo('0 of 0');
            renderRows();
            return;
          }

          searchMatcher = createSearchMatcher(searchTerm);
          if (!searchMatcher) {
            searchMatches = [];
            activeMatchIndex = -1;
            selectedCellRow = -1;
            selectedCellColumn = -1;
            setSearchInfo('0 of 0');
            renderRows();
            return;
          }

          searchMatches = findMatches();
          if (searchMatches.length === 0) {
            activeMatchIndex = -1;
            selectedCellRow = -1;
            selectedCellColumn = -1;
            setSearchInfo('0 of 0');
            renderRows();
            return;
          }

          activeMatchIndex = 0;
          goToActiveMatch();
        }

        function goToActiveMatch() {
          if (activeMatchIndex < 0 || activeMatchIndex >= searchMatches.length) {
            return;
          }

          const match = searchMatches[activeMatchIndex];
          selectedRow = match.rowIndex;
          selectedCellRow = match.rowIndex;
          selectedCellColumn = match.columnIndex;
          page = Math.floor(selectedRow / pageSize);
          renderHeader();
          renderRows();
          scrollToSelection();
          setSearchInfo((activeMatchIndex + 1) + ' of ' + searchMatches.length);
        }

        function scrollToSelection() {
          requestAnimationFrame(() => {
            if (selectedRow >= 0) {
              const row = els.rowsBody.children[selectedRow % pageSize];
              centerRow(row);
            }

            const columnToShow = selectedCellColumn >= 0 ? selectedCellColumn : selectedColumn;
            if (columnToShow >= 0) {
              const left = columnWidths.slice(0, columnToShow).reduce((sum, width) => sum + width, 0);
              els.bodyWrap.scrollLeft = Math.max(0, left - labelWidth);
              els.headerWrap.scrollLeft = els.bodyWrap.scrollLeft;
            }
          });
        }

        function centerRow(row) {
          if (!row) {
            return;
          }

          const top = row.offsetTop - (els.bodyWrap.clientHeight - row.offsetHeight) / 2;
          els.bodyWrap.scrollTop = Math.max(0, top);
        }

        function stepSearch(delta) {
          if (searchMatches.length === 0) {
            runSearch();
            return;
          }

          activeMatchIndex = (activeMatchIndex + delta + searchMatches.length) % searchMatches.length;
          goToActiveMatch();
        }

        function setSearchInfo(value) {
          els.searchInfo.textContent = value;
        }

        function showToast(message) {
          els.toast.textContent = message;
          els.toast.classList.add('visible');
          window.clearTimeout(toastTimer);
          toastTimer = window.setTimeout(() => {
            els.toast.classList.remove('visible');
          }, 2200);
        }

        els.bodyWrap.addEventListener('scroll', () => {
          els.headerWrap.scrollLeft = els.bodyWrap.scrollLeft;
        });
        els.headerWrap.addEventListener('scroll', () => {
          els.bodyWrap.scrollLeft = els.headerWrap.scrollLeft;
        });
        els.firstPage.addEventListener('click', () => { page = 0; renderRows(); });
        els.prevPage.addEventListener('click', () => { page -= 1; renderRows(); });
        els.nextPage.addEventListener('click', () => { page += 1; renderRows(); });
        els.lastPage.addEventListener('click', () => {
          page = Math.max(0, Math.ceil(data.rows.length / pageSize) - 1);
          renderRows();
        });
        els.pageSize.addEventListener('change', () => {
          pageSize = Number(els.pageSize.value);
          page = 0;
          renderRows();
        });
        els.searchButton.addEventListener('click', runSearch);
        els.prevMatch.addEventListener('click', () => stepSearch(-1));
        els.nextMatch.addEventListener('click', () => stepSearch(1));
        els.caseSensitive.addEventListener('change', runSearch);
        els.wholeWord.addEventListener('change', runSearch);
        els.regexMode.addEventListener('change', runSearch);
        els.searchInput.addEventListener('keydown', (event) => {
          if (event.key === 'Enter') {
            if (event.shiftKey) {
              stepSearch(-1);
            } else if (searchMatches.length > 0) {
              stepSearch(1);
            } else {
              runSearch();
            }
          }
          if (event.key === 'Escape') {
            els.searchInput.value = '';
            searchTerm = '';
            selectedCellRow = -1;
            selectedCellColumn = -1;
            setSearchInfo('0 of 0');
            renderRows();
          }
        });
        els.rowButton.addEventListener('click', () => jumpToRow(els.rowInput.value));
        els.rowInput.addEventListener('keydown', (event) => {
          if (event.key === 'Enter') {
            jumpToRow(els.rowInput.value);
          }
        });
        els.columnButton.addEventListener('click', () => jumpToColumn(els.columnInput.value));
        els.columnInput.addEventListener('keydown', (event) => {
          if (event.key === 'Enter') {
            jumpToColumn(els.columnInput.value);
          }
        });

        els.fileName.textContent = data.fileName;
        els.summary.textContent = 'IotaExcel ToolKit .bytes readonly preview';
        applyColumnWidths();
        renderMeta();
        renderHeader();
        renderRows();
      </script>
    `);
  }

  private renderError(uri: vscode.Uri, error: unknown, webview: vscode.Webview): string {
    const nonce = createNonce();
    const message = error instanceof Error ? error.message : String(error);
    const fileName = uri.fsPath.split(/[\\/]/).pop() ?? uri.fsPath;

    return html(webview, nonce, `
      <main class="shell">
        <section class="emptyState">
          <h1>${escapeHtml(fileName)}</h1>
          <p>${escapeHtml(message)}</p>
        </section>
      </main>
    `);
  }
}

function html(webview: vscode.Webview, nonce: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    :root {
      color-scheme: light dark;
      --border: color-mix(in srgb, var(--vscode-foreground) 14%, transparent);
      --soft: color-mix(in srgb, var(--vscode-foreground) 5%, transparent);
      --soft-strong: color-mix(in srgb, var(--vscode-foreground) 9%, transparent);
      --muted: color-mix(in srgb, var(--vscode-foreground) 62%, transparent);
      --header: var(--vscode-sideBar-background);
    }

    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
    }

    .shell {
      min-width: 760px;
      height: 100vh;
      display: flex;
      flex-direction: column;
      padding: 14px;
      overflow: hidden;
    }

    .topbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex: 0 0 auto;
      gap: 18px;
      padding-bottom: 12px;
      border-bottom: 1px solid var(--border);
    }

    .titleBlock {
      min-width: 0;
    }

    h1 {
      margin: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: 18px;
      line-height: 1.3;
      font-weight: 650;
    }

    p {
      margin: 4px 0 0;
      color: var(--muted);
    }

    .pager {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-left: auto;
      white-space: nowrap;
    }

    button,
    select,
    input {
      height: 28px;
      border: 1px solid transparent;
      border-radius: 4px;
      padding: 0 9px;
      font: inherit;
    }

    button {
      color: var(--vscode-button-foreground);
      background: var(--vscode-button-background);
    }

    select,
    input {
      color: var(--vscode-dropdown-foreground);
      background: var(--vscode-dropdown-background);
      border-color: var(--vscode-dropdown-border);
    }

    button:disabled {
      opacity: 0.45;
    }

    #pageInfo {
      min-width: 72px;
      text-align: center;
      color: var(--muted);
    }

    .metaList {
      display: flex;
      flex: 0 0 auto;
      gap: 8px;
      padding: 10px 0;
      overflow-x: auto;
      border-bottom: 1px solid var(--border);
    }

    .metaList div {
      min-width: 112px;
      max-width: 420px;
      padding: 7px 9px;
      border: 1px solid var(--border);
      border-radius: 4px;
      background: var(--soft);
    }

    .metaList .wideMeta {
      min-width: 260px;
      flex: 1 1 420px;
    }

    .metaList span {
      display: block;
      color: var(--muted);
      font-size: 11px;
      margin-bottom: 3px;
    }

    .metaList strong {
      display: block;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-weight: 600;
    }

    .metaList .wideMeta strong {
      overflow: visible;
      text-overflow: clip;
      user-select: text;
      cursor: text;
      white-space: normal;
      word-break: break-all;
    }

    .tools {
      display: flex;
      align-items: center;
      flex: 0 0 auto;
      flex-wrap: wrap;
      gap: 8px 14px;
      padding: 10px 0 0;
    }

    .toolGroup {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
    }

    .tools label {
      display: flex;
      align-items: center;
      gap: 6px;
      min-width: 0;
      color: var(--muted);
    }

    .tools input {
      width: 150px;
      min-width: 92px;
    }

    .tools .checkLabel {
      gap: 4px;
    }

    .tools .checkLabel input {
      width: auto;
      min-width: 0;
      height: auto;
      margin: 0;
    }

    .tools #rowInput {
      width: 82px;
      min-width: 72px;
    }

    .searchGroup input {
      width: 150px;
    }

    .toolStatus {
      flex: 0 1 160px;
      min-width: 96px;
      max-width: 220px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      color: var(--muted);
    }

    .columnGroup input {
      width: 150px;
    }

    .toast {
      position: fixed;
      top: 14px;
      right: 14px;
      z-index: 10;
      max-width: min(360px, calc(100vw - 28px));
      padding: 8px 10px;
      border: 1px solid var(--vscode-inputValidation-warningBorder);
      border-radius: 4px;
      color: var(--vscode-inputValidation-warningForeground, var(--vscode-foreground));
      background: var(--vscode-inputValidation-warningBackground, var(--vscode-editorWidget-background));
      box-shadow: 0 4px 14px color-mix(in srgb, #000 24%, transparent);
      opacity: 0;
      pointer-events: none;
      transform: translateY(-4px);
      transition: opacity 120ms ease, transform 120ms ease;
    }

    .toast.visible {
      opacity: 1;
      transform: translateY(0);
    }

    .sheet {
      display: flex;
      flex: 1 1 auto;
      min-height: 0;
      flex-direction: column;
      margin-top: 10px;
      border: 1px solid var(--border);
      background: var(--vscode-editor-background);
    }

    .headerWrap {
      flex: 0 0 auto;
      overflow-x: auto;
      overflow-y: hidden;
      scrollbar-width: none;
      border-bottom: 1px solid color-mix(in srgb, var(--vscode-foreground) 28%, transparent);
      background: var(--header);
    }

    .headerWrap::-webkit-scrollbar {
      display: none;
    }

    .bodyWrap {
      flex: 1 1 auto;
      min-height: 0;
      overflow: auto;
    }

    table {
      border-collapse: separate;
      border-spacing: 0;
      table-layout: fixed;
    }

    th,
    td {
      height: 30px;
      padding: 6px 10px;
      border-bottom: 1px solid var(--border);
      border-right: 1px solid var(--border);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      text-align: left;
      vertical-align: middle;
    }

    td {
      background: var(--vscode-editor-background);
    }

    th {
      position: relative;
      background: var(--header);
      font-weight: 650;
    }

    .fieldNameRow th {
      background: color-mix(in srgb, var(--vscode-button-background) 16%, var(--header));
    }

    .typeRow th {
      background: color-mix(in srgb, var(--vscode-charts-blue) 14%, var(--header));
    }

    .rowLabel {
      position: sticky;
      left: 0;
      z-index: 4;
      width: 86px;
      min-width: 86px;
      max-width: 86px;
      color: var(--muted);
      text-align: center;
      background: var(--header);
      background-clip: border-box;
      box-shadow: 1px 0 0 var(--border);
    }

    .bodyWrap .rowLabel {
      z-index: 5;
      font-weight: 400;
      background: var(--vscode-editor-background);
      box-shadow: 1px 0 0 var(--border);
    }

    .bodyWrap tr:nth-child(odd) .rowLabel {
      background: var(--vscode-editor-background);
      box-shadow: 1px 0 0 var(--border);
    }

    .bodyWrap tr:nth-child(even) .rowLabel {
      background: color-mix(in srgb, var(--vscode-foreground) 5%, var(--vscode-editor-background));
      box-shadow: 1px 0 0 var(--border);
    }

    .resizeHandle {
      position: absolute;
      top: 0;
      right: -3px;
      width: 7px;
      height: 100%;
      cursor: col-resize;
      user-select: none;
    }

    .resizeHandle:hover {
      background: var(--vscode-focusBorder);
    }

    .resizing,
    .resizing * {
      cursor: col-resize !important;
      user-select: none !important;
    }

    tr:nth-child(even) td {
      background: color-mix(in srgb, var(--vscode-foreground) 5%, var(--vscode-editor-background));
    }

    tr:hover td,
    tr:hover .dataLabel {
      background: color-mix(in srgb, var(--vscode-foreground) 9%, var(--vscode-editor-background));
    }

    tr:hover .dataLabel {
      box-shadow: 1px 0 0 var(--border);
    }

    .selectedRow td,
    .selectedRow .dataLabel {
      background: color-mix(in srgb, var(--vscode-list-activeSelectionBackground) 36%, var(--vscode-editor-background));
    }

    .selectedRow .dataLabel {
      background: color-mix(in srgb, var(--vscode-list-activeSelectionBackground) 52%, var(--vscode-editor-background));
      box-shadow: 1px 0 0 var(--border);
    }

    th.selectedColumn,
    td.selectedColumn {
      outline: 1px solid var(--vscode-focusBorder);
      outline-offset: -1px;
    }

    td.selectedCell {
      outline: 2px solid var(--vscode-focusBorder);
      outline-offset: -2px;
    }

    td.searchMatch {
      background: color-mix(in srgb, var(--vscode-editor-findMatchBackground) 72%, var(--vscode-editor-background));
    }

    .emptyState {
      max-width: 760px;
      margin: 12vh auto 0;
      padding: 20px;
      border: 1px solid var(--border);
      border-radius: 6px;
      background: var(--soft);
    }

    @media (max-width: 820px) {
      .shell {
        min-width: 620px;
      }

      .topbar {
        align-items: flex-start;
        flex-direction: column;
      }

      .pager {
        flex: 1 0 100%;
        justify-content: flex-end;
      }
    }
  </style>
</head>
<body>
${body}
</body>
</html>`;
}

function safeJson(value: unknown): string {
  return JSON.stringify(value).replace(/[<>&\u2028\u2029]/g, (char) => {
    switch (char) {
      case '<':
        return '\\u003c';
      case '>':
        return '\\u003e';
      case '&':
        return '\\u0026';
      case '\u2028':
        return '\\u2028';
      case '\u2029':
        return '\\u2029';
      default:
        return char;
    }
  });
}

function createNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let value = '';
  for (let i = 0; i < 32; i++) {
    value += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  return value;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
