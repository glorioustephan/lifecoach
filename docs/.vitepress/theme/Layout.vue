<script setup lang="ts">
import DefaultTheme from 'vitepress/theme'
import AgenticMeta from './AgenticMeta.vue'

const { Layout } = DefaultTheme
</script>

<template>
  <Layout>
    <template #doc-before>
      <AgenticMeta />
    </template>
  </Layout>
</template>
