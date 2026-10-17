import client from './client'

// Org structure (Ф3): a tree of departments per workspace — Ректорат → проректоры →
// факультеты → кафедры / отделы. Everyone reads it; admins edit it.

export interface DepartmentHead {
  id: string
  email: string | null
  display_name: string
  last_name: string | null
  first_name: string | null
  middle_name: string | null
  avatar_url: string | null
}

export interface Department {
  id: string
  workspace_id: string
  parent_id: string | null
  name: string
  short_name: string | null
  head_id: string | null
  order: number
  head: DepartmentHead | null
  members_count: number
}

export interface DepartmentNode extends Department {
  children: DepartmentNode[]
}

export interface DepartmentInput {
  name?: string
  short_name?: string | null
  parent_id?: string | null
  head_id?: string | null
  order?: number
}

export const getDepartments = (slug: string) =>
  client.get<unknown, Department[]>(`/workspaces/${slug}/departments/`)

export const getDepartmentTree = (slug: string) =>
  client.get<unknown, DepartmentNode[]>(`/workspaces/${slug}/departments/`, {
    params: { tree: true },
  })

export const createDepartment = (slug: string, data: DepartmentInput & { name: string }) =>
  client.post<unknown, Department>(`/workspaces/${slug}/departments/`, data)

export const updateDepartment = (slug: string, id: string, data: DepartmentInput) =>
  client.patch<unknown, Department>(`/workspaces/${slug}/departments/${id}`, data)

// People, projects and sub-departments move one level up.
export const deleteDepartment = (slug: string, id: string) =>
  client.delete<unknown, void>(`/workspaces/${slug}/departments/${id}`)

/** Flatten a tree into display rows with depth (for selects and lists). */
export function flattenTree(
  nodes: DepartmentNode[],
  depth = 0,
): (DepartmentNode & { depth: number })[] {
  return nodes.flatMap((n) => [{ ...n, depth }, ...flattenTree(n.children, depth + 1)])
}

/** Build a tree from the flat list (same ordering as the backend). */
export function buildTree(departments: Department[]): DepartmentNode[] {
  const nodes = new Map<string, DepartmentNode>(
    departments.map((d) => [d.id, { ...d, children: [] }]),
  )
  const roots: DepartmentNode[] = []
  for (const node of nodes.values()) {
    const parent = node.parent_id ? nodes.get(node.parent_id) : undefined
    if (parent) parent.children.push(node)
    else roots.push(node)
  }
  return roots
}
