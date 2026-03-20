const express = require('express')
const multer = require('multer')
const fs = require('fs')
const path = require('path')
const Anthropic = require('@anthropic-ai/sdk').default

const app = express()
const PORT = process.env.PORT || 3001

// APIキーの読み込み（.envファイルから手動で読む）
const envPath = path.join(__dirname, '.env')
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8')
  envContent.split('\n').forEach(line => {
    const [key, ...valueParts] = line.split('=')
    if (key && valueParts.length > 0) {
      process.env[key.trim()] = valueParts.join('=').trim()
    }
  })
}

// Anthropicクライアントの初期化
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
})

// ファイルアップロードの設定
const upload = multer({
  dest: path.join(__dirname, 'uploads'),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB上限
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true)
    } else {
      cb(new Error('PDFファイルのみアップロード可能です'))
    }
  }
})

// 静的ファイルの配信
app.use(express.static(path.join(__dirname, 'public')))
app.use(express.json())

// PDFをbase64に変換するユーティリティ
const pdfToBase64 = (filePath) => {
  const fileBuffer = fs.readFileSync(filePath)
  return fileBuffer.toString('base64')
}

// アップロードされた一時ファイルを削除
const cleanupFiles = (files) => {
  files.forEach(file => {
    if (fs.existsSync(file.path)) {
      fs.unlinkSync(file.path)
    }
  })
}

// メインの比較エンドポイント
app.post('/api/compare', upload.array('pdfs', 2), async (req, res) => {
  if (!req.files || req.files.length !== 2) {
    return res.status(400).json({ error: '2つのPDFファイルをアップロードしてください' })
  }

  const files = req.files

  try {
    const pdf1Base64 = pdfToBase64(files[0].path)
    const pdf2Base64 = pdfToBase64(files[1].path)

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'document',
            source: {
              type: 'base64',
              media_type: 'application/pdf',
              data: pdf1Base64
            },
            title: files[0].originalname
          },
          {
            type: 'document',
            source: {
              type: 'base64',
              media_type: 'application/pdf',
              data: pdf2Base64
            },
            title: files[1].originalname
          },
          {
            type: 'text',
            text: `あなたは文書比較の専門家です。上記2つのPDF文書を比較し、以下のJSON形式で結果を返してください。

必ず以下のJSON形式のみで回答してください（JSON以外のテキストは含めないでください）:

{
  "summary": "比較結果の概要（2〜3文）",
  "document1": {
    "name": "文書1のファイル名",
    "overview": "文書1の概要（1〜2文）"
  },
  "document2": {
    "name": "文書2のファイル名",
    "overview": "文書2の概要（1〜2文）"
  },
  "matches": [
    {
      "category": "一致カテゴリ（例: 目的、構成、用語）",
      "detail": "一致している具体的な内容"
    }
  ],
  "differences": [
    {
      "category": "差分カテゴリ",
      "document1_content": "文書1での記載内容",
      "document2_content": "文書2での記載内容",
      "significance": "high | medium | low"
    }
  ],
  "only_in_document1": [
    {
      "category": "カテゴリ",
      "detail": "文書1にのみ存在する内容"
    }
  ],
  "only_in_document2": [
    {
      "category": "カテゴリ",
      "detail": "文書2にのみ存在する内容"
    }
  ]
}`
          }
        ]
      }]
    })

    const resultText = response.content[0].text

    // JSONを抽出（コードブロックで囲まれている場合も対応）
    let jsonStr = resultText
    const jsonMatch = resultText.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (jsonMatch) {
      jsonStr = jsonMatch[1].trim()
    }

    const result = JSON.parse(jsonStr)

    res.json({
      success: true,
      result,
      file1: files[0].originalname,
      file2: files[1].originalname
    })
  } catch (error) {
    console.error('比較処理エラー:', error)
    res.status(500).json({
      error: '比較処理中にエラーが発生しました',
      detail: error.message
    })
  } finally {
    cleanupFiles(files)
  }
})

// レポート形式に変換するエンドポイント
app.post('/api/convert/report', async (req, res) => {
  const { comparisonResult, file1, file2 } = req.body

  if (!comparisonResult) {
    return res.status(400).json({ error: '比較結果データが必要です' })
  }

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      messages: [{
        role: 'user',
        content: `以下のJSON形式の文書比較結果を、正式なビジネスレポート形式に変換してください。

比較対象:
- 文書1: ${file1}
- 文書2: ${file2}

比較結果データ:
${JSON.stringify(comparisonResult, null, 2)}

以下の形式でレポートを作成してください:
- タイトル: 「文書比較レポート」
- 作成日: 本日の日付
- 構成: 概要 → 一致点 → 相違点 → 文書固有の内容 → 所見
- 箇条書きと表を適切に使用
- Markdown形式で出力

ビジネス文書として読みやすく、上司への報告に使える体裁にしてください。`
      }]
    })

    res.json({
      success: true,
      report: response.content[0].text
    })
  } catch (error) {
    console.error('レポート変換エラー:', error)
    res.status(500).json({
      error: 'レポート変換中にエラーが発生しました',
      detail: error.message
    })
  }
})

// メール形式に変換するエンドポイント
app.post('/api/convert/email', async (req, res) => {
  const { comparisonResult, file1, file2 } = req.body

  if (!comparisonResult) {
    return res.status(400).json({ error: '比較結果データが必要です' })
  }

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      messages: [{
        role: 'user',
        content: `以下のJSON形式の文書比較結果を、社内メール形式に変換してください。

比較対象:
- 文書1: ${file1}
- 文書2: ${file2}

比較結果データ:
${JSON.stringify(comparisonResult, null, 2)}

以下の形式でメールを作成してください:
- 件名: 適切な件名
- 宛先: （空欄）
- CC: （空欄）
- 本文: 丁寧なビジネスメールの体裁
  - 挨拶
  - 目的の説明
  - 比較結果の要点（重要な差分を中心に）
  - 対応が必要な事項
  - 締めの挨拶
- 差分の重要度が high のものは目立つように記載

読み手がすぐに要点を把握できる簡潔なメールにしてください。`
      }]
    })

    res.json({
      success: true,
      email: response.content[0].text
    })
  } catch (error) {
    console.error('メール変換エラー:', error)
    res.status(500).json({
      error: 'メール変換中にエラーが発生しました',
      detail: error.message
    })
  }
})

// サーバー起動
app.listen(PORT, () => {
  console.log(`PDF比較アプリが起動しました: http://localhost:${PORT}`)
})
