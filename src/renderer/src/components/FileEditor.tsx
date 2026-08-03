import { useEffect, useRef, useState } from 'react'
import { EditorState, type Extension } from '@codemirror/state'
import { EditorView, keymap } from '@codemirror/view'
import { indentWithTab } from '@codemirror/commands'
import { basicSetup } from 'codemirror'
import { javascript } from '@codemirror/lang-javascript'
import { python } from '@codemirror/lang-python'
import { css } from '@codemirror/lang-css'
import { html } from '@codemirror/lang-html'
import { json } from '@codemirror/lang-json'
import { markdown } from '@codemirror/lang-markdown'
import { oneDark } from '@codemirror/theme-one-dark'

type Props = {
  projectPath: string
  filePath: string
  onClose: () => void
}

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'ico', 'bmp'])

function isImage(fileName: string): boolean {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? ''
  return IMAGE_EXTENSIONS.has(ext)
}

function languageFor(fileName: string): Extension | null {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? ''
  if (['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs'].includes(ext)) return javascript({ jsx: true, typescript: ext.startsWith('ts') })
  if (ext === 'py') return python()
  if (['css', 'scss', 'less'].includes(ext)) return css()
  if (ext === 'html') return html()
  if (ext === 'json') return json()
  if (['md', 'mdx'].includes(ext)) return markdown()
  return null
}

export default function FileEditor({ projectPath, filePath, onClose }: Props): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const savedContentRef = useRef('')
  const [dirty, setDirty] = useState(false)
  const [status, setStatus] = useState<'loading' | 'binary' | 'ready' | 'error'>('loading')
  const [errorText, setErrorText] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function save(): Promise<void> {
    const view = viewRef.current
    if (!view || saving) return
    const content = view.state.doc.toString()
    setSaving(true)
    try {
      await window.agentstack.writeFile(projectPath, filePath, content)
      savedContentRef.current = content
      setDirty(false)
    } catch (err) {
      setErrorText(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  useEffect(() => {
    let cancelled = false
    setStatus('loading')
    setErrorText(null)
    setDirty(false)

    window.agentstack.readFile(projectPath, filePath).then(
      (result) => {
        if (cancelled) return
        if (result.binary) {
          setStatus('binary')
          return
        }
        savedContentRef.current = result.content
        if (result.truncated) setErrorText('File is large — showing the first 5MB only')

        const container = containerRef.current
        if (!container) return

        const updateListener = EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            setDirty(update.state.doc.toString() !== savedContentRef.current)
          }
        })
        const saveKeymap = keymap.of([
          {
            key: 'Mod-s',
            run: () => {
              save()
              return true
            }
          }
        ])
        const lang = languageFor(filePath)

        const state = EditorState.create({
          doc: result.content,
          extensions: [
            basicSetup,
            keymap.of([indentWithTab]),
            oneDark,
            saveKeymap,
            updateListener,
            ...(lang ? [lang] : [])
          ]
        })
        const view = new EditorView({ state, parent: container })
        viewRef.current = view
        setStatus('ready')
      },
      (err) => {
        if (cancelled) return
        setErrorText(err instanceof Error ? err.message : 'Failed to read file')
        setStatus('error')
      }
    )

    return () => {
      cancelled = true
      viewRef.current?.destroy()
      viewRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectPath, filePath])

  const fileName = filePath.split('/').pop() ?? filePath

  return (
    <div className="file-editor">
      <div className="file-editor-header">
        <span className="file-editor-name">
          {fileName}
          {dirty && <span className="file-editor-dirty-dot" title="Unsaved changes" />}
        </span>
        {errorText && <span className="file-editor-warning">{errorText}</span>}
        <button
          className="dialog-button primary file-editor-save"
          onClick={save}
          disabled={!dirty || saving || status !== 'ready'}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button className="file-editor-close" onClick={onClose} title="Close">
          ✕
        </button>
      </div>
      {status === 'binary' && isImage(filePath) && (
        <div className="file-editor-image-preview">
          <img src={`file://${filePath}`} alt={fileName} />
        </div>
      )}
      {status === 'binary' && !isImage(filePath) && (
        <div className="file-editor-empty">This file can&apos;t be previewed as text.</div>
      )}
      {status === 'error' && <div className="file-editor-empty">{errorText}</div>}
      <div
        className="file-editor-body"
        ref={containerRef}
        style={{ display: status === 'ready' ? 'block' : 'none' }}
      />
    </div>
  )
}
