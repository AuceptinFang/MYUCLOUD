const modules = import.meta.env.MODE === 'pages'
  ? import.meta.glob('./jwgl-eval/index.vue', { eager: true })
  : import.meta.glob('./*/index.vue', { eager: true })

export function usePlugins() {
  const plugins = []

  for (const [path, mod] of Object.entries(modules)) {
    const dir = path.split("/")[1]
    const meta = mod.meta ?? { name: dir, view: dir }

    plugins.push({
      view: meta.view ?? dir,
      name: meta.name ?? dir,
      component: mod.default,
    })
  }

  return plugins
}
