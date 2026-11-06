// Apply the preference before the first paint, including before React loads.
(() => {
  let theme
  try { theme = localStorage.getItem('betterplan-theme') } catch { /* Storage is optional. */ }
  if (theme !== 'dark' && theme !== 'light') theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  document.documentElement.dataset.theme = theme
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#171d18' : '#626c2c')
})()
