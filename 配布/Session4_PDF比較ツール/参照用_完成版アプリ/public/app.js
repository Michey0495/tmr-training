// DOM要素の取得
const uploadArea1 = document.getElementById('uploadArea1')
const uploadArea2 = document.getElementById('uploadArea2')
const fileInput1 = document.getElementById('fileInput1')
const fileInput2 = document.getElementById('fileInput2')
const fileName1 = document.getElementById('fileName1')
const fileName2 = document.getElementById('fileName2')
const compareBtn = document.getElementById('compareBtn')
const loading = document.getElementById('loading')
const errorArea = document.getElementById('errorArea')
const resultSection = document.getElementById('resultSection')

// 選択されたファイルを保持
let selectedFile1 = null
let selectedFile2 = null

// 比較結果を保持（形式変換で使う）
let currentResult = null
let currentFile1Name = ''
let currentFile2Name = ''

// アップロードエリアの設定
function setupUploadArea(area, input, fileNameEl, fileNum) {
  area.addEventListener('click', () => input.click())

  area.addEventListener('dragover', (e) => {
    e.preventDefault()
    area.classList.add('dragover')
  })

  area.addEventListener('dragleave', () => {
    area.classList.remove('dragover')
  })

  area.addEventListener('drop', (e) => {
    e.preventDefault()
    area.classList.remove('dragover')
    const file = e.dataTransfer.files[0]
    if (file && file.type === 'application/pdf') {
      setFile(fileNum, file, area, fileNameEl)
    } else {
      showError('PDFファイルのみアップロード可能です')
    }
  })

  input.addEventListener('change', () => {
    const file = input.files[0]
    if (file) {
      setFile(fileNum, file, area, fileNameEl)
    }
  })
}

function setFile(num, file, area, fileNameEl) {
  if (num === 1) {
    selectedFile1 = file
  } else {
    selectedFile2 = file
  }
  area.classList.add('has-file')
  fileNameEl.textContent = file.name
  fileNameEl.classList.add('selected')
  updateCompareButton()
}

function updateCompareButton() {
  compareBtn.disabled = !(selectedFile1 && selectedFile2)
}

function showError(message) {
  errorArea.textContent = message
  errorArea.hidden = false
  setTimeout(() => { errorArea.hidden = true }, 5000)
}

function hideError() {
  errorArea.hidden = true
}

// 一致項目のHTML生成
function renderMatches(matches) {
  if (!matches || matches.length === 0) {
    return '<p style="color: var(--warm-gray-400); font-size: 14px;">一致する項目はありません</p>'
  }
  return matches.map(item => `
    <div class="match-item">
      <span class="category">${escapeHtml(item.category)}</span>
      <span class="detail">${escapeHtml(item.detail)}</span>
    </div>
  `).join('')
}

// 相違点テーブルのHTML生成
function renderDifferences(diffs) {
  if (!diffs || diffs.length === 0) {
    return '<p style="color: var(--warm-gray-400); font-size: 14px;">相違点はありません</p>'
  }

  const sigLabel = { high: '高', medium: '中', low: '低' }

  const rows = diffs.map(d => `
    <tr>
      <td class="col-category">${escapeHtml(d.category)}</td>
      <td class="col-doc">${escapeHtml(d.document1_content)}</td>
      <td class="col-doc">${escapeHtml(d.document2_content)}</td>
      <td class="col-sig">
        <span class="significance-badge ${d.significance}">
          ${sigLabel[d.significance] || d.significance}
        </span>
      </td>
    </tr>
  `).join('')

  return `
    <table class="diff-table">
      <thead>
        <tr>
          <th class="col-category">項目</th>
          <th class="col-doc">文書1</th>
          <th class="col-doc">文書2</th>
          <th class="col-sig">重要度</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `
}

// 片方のみの項目
function renderOnlyItems(items) {
  if (!items || items.length === 0) {
    return '<p style="color: var(--warm-gray-400); font-size: 14px;">該当なし</p>'
  }
  return items.map(item => `
    <div class="only-item">
      <span class="category">${escapeHtml(item.category)}</span>
      <span class="detail">${escapeHtml(item.detail)}</span>
    </div>
  `).join('')
}

// HTMLエスケープ
function escapeHtml(str) {
  if (!str) return ''
  const div = document.createElement('div')
  div.textContent = str
  return div.innerHTML
}

// 比較結果を画面に描画
function renderResult(data) {
  const result = data.result

  // 文書概要
  document.getElementById('doc1Name').textContent = result.document1.name
  document.getElementById('doc1Overview').textContent = result.document1.overview
  document.getElementById('doc2Name').textContent = result.document2.name
  document.getElementById('doc2Overview').textContent = result.document2.overview
  document.getElementById('summaryText').textContent = result.summary

  // 一致点
  document.getElementById('matchesList').innerHTML = renderMatches(result.matches)

  // 相違点
  document.getElementById('differencesList').innerHTML = renderDifferences(result.differences)

  // 片方のみ
  document.getElementById('onlyDoc1').innerHTML = renderOnlyItems(result.only_in_document1)
  document.getElementById('onlyDoc2').innerHTML = renderOnlyItems(result.only_in_document2)

  resultSection.hidden = false
  resultSection.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

// 比較の実行
async function executeCompare() {
  if (!selectedFile1 || !selectedFile2) return

  hideError()
  resultSection.hidden = true
  document.getElementById('convertResult').hidden = true
  loading.hidden = false
  compareBtn.disabled = true

  const formData = new FormData()
  formData.append('pdfs', selectedFile1)
  formData.append('pdfs', selectedFile2)

  try {
    const response = await fetch('/api/compare', {
      method: 'POST',
      body: formData
    })

    const data = await response.json()

    if (!response.ok) {
      throw new Error(data.error || '比較に失敗しました')
    }

    // 結果を保持
    currentResult = data.result
    currentFile1Name = data.file1
    currentFile2Name = data.file2

    renderResult(data)
  } catch (error) {
    showError(error.message)
  } finally {
    loading.hidden = true
    compareBtn.disabled = false
  }
}

// 形式変換の実行
async function convertFormat(type) {
  if (!currentResult) return

  const convertResult = document.getElementById('convertResult')
  const convertTitle = document.getElementById('convertTitle')
  const convertContent = document.getElementById('convertContent')
  const btn = type === 'report' ? document.getElementById('reportBtn') : document.getElementById('emailBtn')

  btn.disabled = true
  btn.textContent = '変換中...'

  try {
    const response = await fetch(`/api/convert/${type}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        comparisonResult: currentResult,
        file1: currentFile1Name,
        file2: currentFile2Name
      })
    })

    const data = await response.json()

    if (!response.ok) {
      throw new Error(data.error || '変換に失敗しました')
    }

    const content = type === 'report' ? data.report : data.email
    convertTitle.textContent = type === 'report' ? 'レポート形式' : 'メール形式'
    convertContent.textContent = content
    convertResult.hidden = false
    convertResult.scrollIntoView({ behavior: 'smooth', block: 'start' })
  } catch (error) {
    showError(error.message)
  } finally {
    btn.disabled = false
    btn.textContent = type === 'report' ? 'レポート形式で出力' : 'メール形式に変換'
  }
}

// コピー機能
function copyConvertResult() {
  const content = document.getElementById('convertContent').textContent
  navigator.clipboard.writeText(content).then(() => {
    const btn = document.getElementById('copyBtn')
    btn.textContent = 'コピーしました'
    setTimeout(() => { btn.textContent = 'コピー' }, 2000)
  })
}

// イベントリスナーの設定
setupUploadArea(uploadArea1, fileInput1, fileName1, 1)
setupUploadArea(uploadArea2, fileInput2, fileName2, 2)

compareBtn.addEventListener('click', executeCompare)
document.getElementById('reportBtn').addEventListener('click', () => convertFormat('report'))
document.getElementById('emailBtn').addEventListener('click', () => convertFormat('email'))
document.getElementById('copyBtn').addEventListener('click', copyConvertResult)
