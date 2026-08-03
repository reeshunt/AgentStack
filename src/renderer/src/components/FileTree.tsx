import { useEffect, useState } from 'react'
import type { FileEntry } from '../../../shared/types'

type Props = {
  projectPath: string
  selectedPath: string | null
  onSelectFile: (path: string) => void
}

function fileIcon(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico'].includes(ext)) return '🖼'
  if (['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs'].includes(ext)) return '📜'
  if (['json', 'yaml', 'yml', 'toml'].includes(ext)) return '⚙'
  if (['md', 'mdx', 'txt'].includes(ext)) return '📝'
  if (['css', 'scss', 'less'].includes(ext)) return '🎨'
  if (ext === 'html') return '🌐'
  return '📄'
}

function TreeNode({
  entry,
  depth,
  projectPath,
  selectedPath,
  onSelectFile
}: {
  entry: FileEntry
  depth: number
  projectPath: string
  selectedPath: string | null
  onSelectFile: (path: string) => void
}): React.JSX.Element {
  const [expanded, setExpanded] = useState(false)
  const [children, setChildren] = useState<FileEntry[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState(entry.name)
  const [currentEntry, setCurrentEntry] = useState(entry)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => setCurrentEntry(entry), [entry])

  async function toggleExpand(): Promise<void> {
    if (!currentEntry.isDirectory) {
      onSelectFile(currentEntry.path)
      return
    }
    if (!expanded && children === null) {
      setLoading(true)
      try {
        const list = await window.agentstack.listDirectory(projectPath, currentEntry.path)
        setChildren(list)
      } finally {
        setLoading(false)
      }
    }
    setExpanded((prev) => !prev)
  }

  async function commitRename(): Promise<void> {
    const trimmed = renameValue.trim()
    if (!trimmed || trimmed === currentEntry.name) {
      setRenaming(false)
      setRenameValue(currentEntry.name)
      return
    }
    try {
      const updated = await window.agentstack.renamePath(projectPath, currentEntry.path, trimmed)
      setCurrentEntry(updated)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Rename failed')
      setRenameValue(currentEntry.name)
    } finally {
      setRenaming(false)
    }
  }

  return (
    <div className="file-tree-node">
      <div
        className={`file-tree-row ${selectedPath === currentEntry.path ? 'file-tree-row-active' : ''}`}
        style={{ paddingLeft: 8 + depth * 14 }}
        onClick={() => !renaming && toggleExpand()}
        onDoubleClick={(e) => {
          e.stopPropagation()
          setRenaming(true)
        }}
        title={error ?? undefined}
      >
        <span className="file-tree-chevron">
          {currentEntry.isDirectory ? (expanded ? '▾' : '▸') : ''}
        </span>
        <span className="file-tree-icon">{currentEntry.isDirectory ? '📁' : fileIcon(currentEntry.name)}</span>
        {renaming ? (
          <input
            className="file-tree-rename-input"
            autoFocus
            value={renameValue}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => setRenameValue(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitRename()
              if (e.key === 'Escape') {
                setRenaming(false)
                setRenameValue(currentEntry.name)
              }
            }}
          />
        ) : (
          <span className="file-tree-name">{currentEntry.name}</span>
        )}
      </div>
      {error && <div className="file-tree-error" style={{ paddingLeft: 8 + depth * 14 + 20 }}>{error}</div>}
      {expanded && currentEntry.isDirectory && (
        <div className="file-tree-children">
          {loading && <div className="file-tree-loading" style={{ paddingLeft: 8 + (depth + 1) * 14 }}>Loading…</div>}
          {children?.map((child) => (
            <TreeNode
              key={child.path}
              entry={child}
              depth={depth + 1}
              projectPath={projectPath}
              selectedPath={selectedPath}
              onSelectFile={onSelectFile}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export default function FileTree({ projectPath, selectedPath, onSelectFile }: Props): React.JSX.Element {
  const [entries, setEntries] = useState<FileEntry[] | null>(null)

  useEffect(() => {
    setEntries(null)
    window.agentstack.listDirectory(projectPath, projectPath).then(setEntries)
  }, [projectPath])

  if (entries === null) return <div className="file-tree-loading">Loading…</div>
  if (entries.length === 0) return <div className="file-tree-empty">Empty directory</div>

  return (
    <div className="file-tree">
      {entries.map((entry) => (
        <TreeNode
          key={entry.path}
          entry={entry}
          depth={0}
          projectPath={projectPath}
          selectedPath={selectedPath}
          onSelectFile={onSelectFile}
        />
      ))}
    </div>
  )
}
