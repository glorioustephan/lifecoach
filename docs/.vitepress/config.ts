import { defineConfig, type DefaultTheme } from 'vitepress'
import { readdirSync, statSync, readFileSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'

const DOCS_ROOT = resolve(__dirname, '..')

const SECTIONS: Array<{ text: string; dir: string }> = [
  { text: 'Architecture', dir: 'architecture' },
  { text: 'Reference', dir: 'reference' },
  { text: 'Specs', dir: 'specs' },
  { text: 'Briefs', dir: 'briefs' },
  { text: 'Taxonomies', dir: 'taxonomies' },
  { text: 'Evals', dir: 'evals' },
  { text: 'Prompts', dir: 'prompts' },
]

const SECTION_DIRS = new Set(SECTIONS.map((s) => s.dir))

type SidebarItem = DefaultTheme.SidebarItem

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

function prettify(slug: string): string {
  return slug
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
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
        subdirs.push({ text: prettify(name), items: children, collapsed: true })
      }
    } else if (name.endsWith('.md')) {
      const slug = name.replace(/\.md$/, '')
      const link = `/${dirRel}/${slug === 'index' ? '' : slug}`
      files.push({ text: readTitle(abs, prettify(slug)), link })
    }
  }
  files.sort((a, b) => {
    const at = (a.text ?? '').toLowerCase()
    const bt = (b.text ?? '').toLowerCase()
    if (at === 'index') return -1
    if (bt === 'index') return 1
    return at.localeCompare(bt)
  })
  subdirs.sort((a, b) => (a.text ?? '').localeCompare(b.text ?? ''))
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

// Loose root markdown files (anything in docs/*.md that isn't index.md).
function rootGuides(): SidebarItem[] {
  return readdirSync(DOCS_ROOT)
    .filter((name) => name.endsWith('.md') && name !== 'index.md' && !name.startsWith('.'))
    .map((name) => {
      const slug = name.replace(/\.md$/, '')
      return {
        text: readTitle(join(DOCS_ROOT, name), prettify(slug)),
        link: `/${slug}`,
      }
    })
    .sort((a, b) => (a.text ?? '').localeCompare(b.text ?? ''))
}

const guides = rootGuides()
const activeSections = SECTIONS.filter((s) => hasMarkdown(join(DOCS_ROOT, s.dir)))

const nav: DefaultTheme.NavItem[] = [
  { text: 'Home', link: '/' },
  ...(guides.length
    ? [{ text: 'Guides', items: guides.map((g) => ({ text: g.text!, link: g.link! })) }]
    : []),
  ...activeSections.map((s) => ({ text: s.text, link: `/${s.dir}/` })),
]

const rootSidebar: SidebarItem[] = [
  ...(guides.length ? [{ text: 'Guides', items: guides }] : []),
  ...activeSections.map((s) => ({
    text: s.text,
    link: `/${s.dir}/`,
    items: walk(join(DOCS_ROOT, s.dir), s.dir),
    collapsed: true,
  })),
]

const sidebar: DefaultTheme.SidebarMulti = {
  '/': rootSidebar,
}
for (const s of activeSections) {
  sidebar[`/${s.dir}/`] = [
    { text: s.text, items: walk(join(DOCS_ROOT, s.dir), s.dir) },
  ]
}
// Also pin the guides sidebar to each loose root page individually so
// navigating to e.g. /deployment keeps the same left nav.
for (const g of guides) {
  if (g.link) sidebar[g.link] = rootSidebar
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
    socialLinks: [
      { icon: 'github', link: 'https://github.com/glorioustephan/lifecoach' },
    ],
  },
})
