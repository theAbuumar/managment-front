import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getProject, type Project } from '@/api/project'
import { getStates, type State } from '@/api/state'
import type { Issue } from '@/api/issue'
import { IssueDetailPanel } from '@/features/work-items/IssueDetailPanel'

// The issue panel for workspace-wide lists (Мои задачи, главная, аналитика): rows
// come from GET WS/issues without the project's states, so they are fetched once
// per project when an issue of it is first opened.

const cache = new Map<string, Promise<{ project: Project; states: State[] }>>()

function projectContext(slug: string, projectId: string) {
  const key = `${slug}:${projectId}`
  let hit = cache.get(key)
  if (!hit) {
    hit = Promise.all([
      getProject(slug, projectId),
      getStates(slug, projectId),
    ]).then(([project, states]) => ({ project, states }))
    hit.catch(() => cache.delete(key))
    cache.set(key, hit)
  }
  return hit
}

export function WorkspaceIssuePanel({
  slug,
  issue,
  onClose,
  onUpdated,
  onDeleted,
}: {
  slug: string
  issue: Issue | null
  onClose: () => void
  onUpdated: (issue: Issue) => void
  onDeleted: (issueId: string) => void
}) {
  const navigate = useNavigate()
  const [ctx, setCtx] = useState<{
    projectId: string
    project: Project
    states: State[]
  } | null>(null)
  const projectId = issue?.project_id

  useEffect(() => {
    if (!projectId) return
    let cancelled = false
    projectContext(slug, projectId)
      .then((c) => !cancelled && setCtx({ projectId, ...c }))
      .catch(() => !cancelled && onClose())
    return () => {
      cancelled = true
    }
  }, [slug, projectId]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!issue || !ctx || ctx.projectId !== issue.project_id) return null
  return (
    <IssueDetailPanel
      issue={issue}
      project={ctx.project}
      slug={slug}
      projectId={issue.project_id}
      states={ctx.states}
      onOpenChange={(open) => !open && onClose()}
      // Keep the project brief the list rows carry.
      onUpdated={(updated) =>
        onUpdated({ ...updated, project: updated.project ?? issue.project })
      }
      onDeleted={onDeleted}
      onOpenIssue={(id) =>
        navigate(`/projects/${issue.project_id}/work-items?issue=${id}`)
      }
    />
  )
}
