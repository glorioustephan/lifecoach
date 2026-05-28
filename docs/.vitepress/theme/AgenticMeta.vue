<script setup lang="ts">
import { computed } from 'vue'
import { useData } from 'vitepress'

const { frontmatter } = useData()

const fm = computed(() => frontmatter.value || {})

const hasMeta = computed(() => {
  const f = fm.value
  return !!(
    f.owner ||
    f.status ||
    f.source ||
    f.audience ||
    f.last_implemented ||
    f.code_paths ||
    f.consumers ||
    f.produces ||
    f.pair ||
    f.generator
  )
})

const audiences = computed(() => {
  const a = fm.value.audience
  if (!a) return []
  return Array.isArray(a) ? a : [a]
})

const codePaths = computed(() => {
  const c = fm.value.code_paths
  if (!c) return []
  return Array.isArray(c) ? c : [c]
})

const consumers = computed(() => {
  const c = fm.value.consumers
  if (!c) return []
  return Array.isArray(c) ? c : [c]
})

const pair = computed(() => {
  const p = fm.value.pair
  if (!p) return []
  return Array.isArray(p) ? p : [p]
})
</script>

<template>
  <aside v-if="hasMeta" class="agentic-meta">
    <div class="agentic-meta__row">
      <span v-if="fm.status" :class="['agentic-meta__pill', `is-${fm.status}`]">
        {{ fm.status }}
      </span>
      <span v-if="fm.source" class="agentic-meta__tag">source: {{ fm.source }}</span>
      <span v-if="fm.owner" class="agentic-meta__tag">owner: {{ fm.owner }}</span>
      <span v-for="a in audiences" :key="a" class="agentic-meta__tag">audience: {{ a }}</span>
      <span v-if="fm.last_implemented" class="agentic-meta__tag">
        last implemented: {{ fm.last_implemented }}
      </span>
      <span v-if="fm.updated" class="agentic-meta__tag">updated: {{ fm.updated }}</span>
    </div>
    <dl v-if="codePaths.length || consumers.length || pair.length || fm.generator" class="agentic-meta__dl">
      <template v-if="fm.generator">
        <dt>generator</dt><dd><code>{{ fm.generator }}</code></dd>
      </template>
      <template v-if="codePaths.length">
        <dt>code paths</dt>
        <dd>
          <code v-for="p in codePaths" :key="p">{{ p }}</code>
        </dd>
      </template>
      <template v-if="consumers.length">
        <dt>consumers</dt>
        <dd>
          <code v-for="c in consumers" :key="c">{{ c }}</code>
        </dd>
      </template>
      <template v-if="pair.length">
        <dt>pair</dt>
        <dd>
          <code v-for="p in pair" :key="p">{{ p }}</code>
        </dd>
      </template>
    </dl>
  </aside>
</template>

<style scoped>
.agentic-meta {
  margin: 0 0 1.5rem;
  padding: 0.75rem 1rem;
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  background: var(--vp-c-bg-soft);
  font-size: 0.85rem;
}
.agentic-meta__row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem 0.6rem;
  align-items: center;
}
.agentic-meta__pill {
  display: inline-block;
  padding: 0.1rem 0.55rem;
  border-radius: 999px;
  font-weight: 600;
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  background: var(--vp-c-default-soft);
  color: var(--vp-c-text-1);
}
.agentic-meta__pill.is-ready { background: var(--vp-c-success-soft); color: var(--vp-c-success-1); }
.agentic-meta__pill.is-draft { background: var(--vp-c-warning-soft); color: var(--vp-c-warning-1); }
.agentic-meta__pill.is-in-progress { background: var(--vp-c-tip-soft); color: var(--vp-c-tip-1); }
.agentic-meta__pill.is-done { background: var(--vp-c-brand-soft); color: var(--vp-c-brand-1); }
.agentic-meta__pill.is-superseded { background: var(--vp-c-danger-soft); color: var(--vp-c-danger-1); }
.agentic-meta__tag {
  color: var(--vp-c-text-2);
  font-family: var(--vp-font-family-mono);
  font-size: 0.75rem;
}
.agentic-meta__dl {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 0.25rem 0.75rem;
  margin: 0.6rem 0 0;
  padding: 0.6rem 0 0;
  border-top: 1px dashed var(--vp-c-divider);
}
.agentic-meta__dl dt {
  font-family: var(--vp-font-family-mono);
  font-size: 0.75rem;
  color: var(--vp-c-text-2);
}
.agentic-meta__dl dd {
  margin: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
}
.agentic-meta__dl code {
  font-size: 0.75rem;
  padding: 0.05rem 0.35rem;
}
</style>
