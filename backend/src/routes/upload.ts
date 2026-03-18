import { Router, Response } from 'express'
import multer from 'multer'
import path from 'path'
import OpenAI from 'openai'
import pdfParse from 'pdf-parse'
import db from '../db/client'
import { authenticate, AuthRequest } from '../middleware/auth'

const router = Router()
router.use(authenticate)

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (_: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
    const allowed = ['.pdf', '.png', '.jpg', '.jpeg', '.txt']
    const ext = path.extname(file.originalname).toLowerCase()
    allowed.includes(ext) ? cb(null, true) : cb(new Error('Only PDF, PNG, JPG, TXT allowed'))
  },
  limits: { fileSize: 10 * 1024 * 1024 },
})

// POST /api/upload/extract-text — extract text only, no DB storage (used by AI Setup)
router.post('/extract-text', upload.single('file'), async (req: AuthRequest, res: Response) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No file uploaded.' })

    const { mimetype, buffer } = req.file
    let rawText = ''

    if (mimetype === 'application/pdf') {
      const parsed = await pdfParse(buffer)
      rawText = parsed.text
    } else if (mimetype.startsWith('image/')) {
      const b64 = buffer.toString('base64')
      const vRes = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: 'Extract all text from this image exactly as written. Output only the text, nothing else.' },
            { type: 'image_url', image_url: { url: `data:${mimetype};base64,${b64}` } },
          ],
        }],
        max_tokens: 4000,
      })
      rawText = vRes.choices[0].message.content || ''
    } else {
      rawText = buffer.toString('utf-8')
    }

    if (!rawText.trim()) return res.status(400).json({ message: 'No text could be extracted from this file.' })

    res.json({ text: rawText, length: rawText.length })
  } catch (err: any) {
    console.error('Extract-text error:', err)
    res.status(500).json({ message: err.message || 'Text extraction failed.' })
  }
})

// POST /api/upload/document
router.post('/document', upload.single('file'), async (req: AuthRequest, res: Response) => {
  try {
    const { courseId, docType } = req.body
    if (!courseId || !docType) return res.status(400).json({ message: 'courseId and docType required.' })
    if (!req.file) return res.status(400).json({ message: 'No file uploaded.' })

    // Verify course ownership
    const owner = await db.query('SELECT id FROM courses WHERE id=$1 AND user_id=$2', [courseId, req.userId])
    if (owner.rows.length === 0) return res.status(403).json({ message: 'Course not found.' })

    const { originalname, mimetype, buffer } = req.file
    let rawText = ''

    if (mimetype === 'application/pdf') {
      const parsed = await pdfParse(buffer)
      rawText = parsed.text
    } else if (mimetype.startsWith('image/')) {
      const b64 = buffer.toString('base64')
      const vRes = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: 'Extract all text from this image exactly as written. Output only the text, nothing else.' },
            { type: 'image_url', image_url: { url: `data:${mimetype};base64,${b64}` } },
          ],
        }],
        max_tokens: 4000,
      })
      rawText = vRes.choices[0].message.content || ''
    } else {
      rawText = buffer.toString('utf-8')
    }

    if (!rawText.trim()) return res.status(400).json({ message: 'No text could be extracted.' })

    // Delete old chunks for this course+type
    await db.query('DELETE FROM documents WHERE course_id=$1 AND type=$2', [courseId, docType])

    // Chunk ~700 tokens each
    const chunks = chunkText(rawText, 700)
    let stored = 0

    for (let i = 0; i < chunks.length; i++) {
      const embRes = await openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: chunks[i],
      })
      const vec = `[${embRes.data[0].embedding.join(',')}]`
      await db.query(
        `INSERT INTO documents(course_id, type, filename, raw_text, chunk_index, chunk_text, embedding, file_data, mime_type)
         VALUES($1,$2,$3,$4,$5,$6,$7::vector,$8,$9)`,
        [courseId, docType, originalname,
         i === 0 ? rawText : null,
         i, chunks[i], vec,
         i === 0 ? buffer : null,
         i === 0 ? mimetype : null]
      )
      stored++
    }

    res.json({ message: 'Document processed.', filename: originalname, chunks: stored, docType })
  } catch (err: any) {
    console.error('Upload error:', err)
    res.status(500).json({ message: err.message || 'Upload failed.' })
  }
})

// GET /api/upload/documents/:courseId — list uploaded docs
router.get('/documents/:courseId', async (req: AuthRequest, res: Response) => {
  try {
    const { courseId } = req.params
    const owner = await db.query('SELECT id FROM courses WHERE id=$1 AND user_id=$2', [courseId, req.userId])
    if (owner.rows.length === 0) return res.status(403).json({ message: 'Course not found.' })

    const result = await db.query(
      `SELECT type, filename, COUNT(*) as chunks, MAX(created_at) as uploaded_at
       FROM documents WHERE course_id=$1 AND type != 'ai_setup' GROUP BY type, filename ORDER BY type`,
      [courseId]
    )
    res.json(result.rows)
  } catch (err) {
    res.status(500).json({ message: 'Server error.' })
  }
})

// GET /api/upload/documents/:courseId/:type/file — serve original uploaded file
router.get('/documents/:courseId/:type/file', async (req: AuthRequest, res: Response) => {
  try {
    const { courseId, type } = req.params
    const owner = await db.query('SELECT id FROM courses WHERE id=$1 AND user_id=$2', [courseId, req.userId])
    if (owner.rows.length === 0) return res.status(403).json({ message: 'Course not found.' })
    const result = await db.query(
      'SELECT file_data, mime_type, filename FROM documents WHERE course_id=$1 AND type=$2 AND chunk_index=0',
      [courseId, type]
    )
    if (result.rows.length === 0 || !result.rows[0].file_data) {
      // Fall back to serving raw text if no file stored
      return res.status(404).json({ message: 'Original file not stored. View extracted text instead.' })
    }
    const { file_data, mime_type, filename } = result.rows[0]
    res.setHeader('Content-Type', mime_type || 'application/octet-stream')
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`)
    res.send(file_data)
  } catch (err) {
    res.status(500).json({ message: 'Server error.' })
  }
})

// GET /api/upload/documents/:courseId/:type/text — return raw extracted text for viewing
router.get('/documents/:courseId/:type/text', async (req: AuthRequest, res: Response) => {
  try {
    const { courseId, type } = req.params
    const owner = await db.query('SELECT id FROM courses WHERE id=$1 AND user_id=$2', [courseId, req.userId])
    if (owner.rows.length === 0) return res.status(403).json({ message: 'Course not found.' })
    const result = await db.query(
      'SELECT raw_text, filename FROM documents WHERE course_id=$1 AND type=$2 AND chunk_index=0',
      [courseId, type]
    )
    if (result.rows.length === 0) return res.status(404).json({ message: 'Document not found.' })
    res.json({ text: result.rows[0].raw_text || '', filename: result.rows[0].filename })
  } catch (err) {
    res.status(500).json({ message: 'Server error.' })
  }
})

// DELETE /api/upload/documents/:courseId/:type
router.delete('/documents/:courseId/:type', async (req: AuthRequest, res: Response) => {
  try {
    const { courseId, type } = req.params
    const owner = await db.query('SELECT id FROM courses WHERE id=$1 AND user_id=$2', [courseId, req.userId])
    if (owner.rows.length === 0) return res.status(403).json({ message: 'Course not found.' })
    await db.query('DELETE FROM documents WHERE course_id=$1 AND type=$2', [courseId, type])
    res.json({ message: 'Document deleted.' })
  } catch (err) {
    res.status(500).json({ message: 'Server error.' })
  }
})

function chunkText(text: string, targetTokens: number): string[] {
  const chunkSize = targetTokens * 4
  const chunks: string[] = []
  let i = 0
  while (i < text.length) {
    let end = Math.min(i + chunkSize, text.length)
    if (end < text.length) {
      const lastPara = text.lastIndexOf('\n\n', end)
      const lastSent = text.lastIndexOf('. ', end)
      if (lastPara > i + chunkSize * 0.6) end = lastPara + 2
      else if (lastSent > i + chunkSize * 0.6) end = lastSent + 2
    }
    const c = text.slice(i, end).trim()
    if (c.length > 20) chunks.push(c)
    i = end
  }
  return chunks
}

export default router
