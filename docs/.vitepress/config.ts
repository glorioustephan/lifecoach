import { defineConfig } from 'vitepress'
import { readdirSync, statSync, readFileSync, existsSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

const DOCS_ROOT = resolve(__dirname, '..')

const SECTIONS = [
  { text: 'Architecture', dir: 'architecture' },
  { text: 'Reference', dir: 'reference' },
  { text: 'Specs', dir: 'specs' },
  { text: 'Briefs', dir: 'briefs' },
  { text: 'Taxonomies', dir: 'taxonomies' },
  { text: 'Evals', dir: 'evals' },
  { text: 'Prompts', dir: 'prompts' },
]

type SidebarItem = { text: string; link?: string; items?: SidebarItem[]; collapsed?: boolean }

function readTitle(absPath: string, fallback: string): string {
  try {
    const raw = readFileSync(absPath, 'utf8')
    const fm = raw.match(/^---\n([\s\S]*?)\n---/)
    if (fm) {
      const t = fm[1].match(/^title:\s*(.+)$/m)
      if (t) return t[1].trim().replace(/^['"]|['"]$/g, '')
    }
    const h1 = raw.match(/^#\s+(.+)$/m)
    if (h1) return h1[1].trim()
  } catch {}
  return fallback
}

function walk(dirAbs: string, dirRel: string): SidebarItem[] {
  if (!existsSync(dirAbs)) return []
  const entries = readdirSync(dirAbs).filter((e) => !e.startsWith('.'))
  const files: SidebarItem[] = []
  const subdirs: SidebarItem[] = []
  for (const name of entries) {
    const abs = join(dirAbs, name)
    const rel = `${dirRel}/${name}`
    const st = statSync(abs)
    if (st.isDirectory()) {
      const children = walk(abs, rel)
      if (children.length) {
        subdirs.push({ text: name, items: children, collapsed: true })
      }
    } else if (name.endsWith('.md')) {
      const slug = name.replace(/\.md$/, '')
      const link = `/${dirRel}/${slug === 'index' ? '' : slug}`
      files.push({ text: readTitle(abs, slug), link })
    }
  }
  files.sort((a, b) => {
    if (a.text.toLowerCase() === 'index') return -1
    if (b.text.toLowerCase() === 'index') return 1
    return a.text.localeCompare(b.text)
  })
  subdirs.sort((a, b) => a.text.localeCompare(b.text))
  return [...files, ...subdirs]
}

function hasMarkdown(dirAbs: string): boolean {
  if (!existsSync(dirAbs)) return false
  const stack = [dirAbs]
  while (stack.length) {
    const cur = stack.pop()!
    for (const name of readdirSync(cur)) {
      if (name.startsWith('.')) continue
      const abs = join(cur, name)
      const st = statSync(abs)
      if (st.isDirectory()) stack.push(abs)
      else if (name.endsWith('.md')) return true
    }
  }
  return false
}

const activeSections = SECTIONS.filter((s) => hasMarkdown(join(DOCS_ROOT, s.dir)))

const nav = activeSections.map((s) => ({ text: s.text, link: `/${s.dir}/` }))

const sidebar: Record<string, SidebarItem[]> = {}
for (const s of activeSections) {
  sidebar[`/${s.dir}/`] = [
    { text: s.text, items: walk(join(DOCS_ROOT, s.dir), s.dir) },
  ]
}

export default defineConfig({
  title: 'lifecoach docs',
  description: 'Dual-audience corpus for humans and agents.',
  base: process.env.DOCS_BASE ?? '/lifecoach/',
  srcDir: '.',
  cleanUrls: true,
  lastUpdated: true,
  ignoreDeadLinks: true,
  themeConfig: {
    nav,
    sidebar,
    outline: [2, 3],
    socialLinks: [],
  },
})
