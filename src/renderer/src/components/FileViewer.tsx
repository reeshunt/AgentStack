import { useState } from 'react'
import FileTree from './FileTree'
import FileEditor from './FileEditor'

type Props = {
  projectPath: string
  hidden: boolean
}

export default function FileViewer({ projectPath, hidden }: Props): React.JSX.Element {
  const [openFile, setOpenFile] = useState<string | null>(null)

  return (
    <div className={`file-viewer ${hidden ? 'view-hidden' : ''}`}>
      <div className="file-viewer-tree">
        <div className="file-viewer-tree-header">Files</div>
        <FileTree
          key={projectPath}
          projectPath={projectPath}
          selectedPath={openFile}
          onSelectFile={setOpenFile}
        />
      </div>
      <div className="file-viewer-pane">
        {openFile ? (
          <FileEditor
            key={openFile}
            projectPath={projectPath}
            filePath={openFile}
            onClose={() => setOpenFile(null)}
          />
        ) : (
          <div className="file-editor-empty">Select a file to preview or edit.</div>
        )}
      </div>
    </div>
  )
}
