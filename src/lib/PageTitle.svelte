<script>
  // The one page title used across every page. Styling is scoped here so no
  // stray global rule can override it and let the pages drift out of sync.
  // `inline` drops the bottom margin for header rows that pair the title with a
  // picker or button (the row handles its own spacing).
  let { inline = false, children } = $props();
</script>

<h2 class={['page-title', { inline }]}>{@render children()}</h2>

<style>
  .page-title {
    margin: 0 0 1.6rem; color: var(--text);
    font-family: var(--display); font-weight: 700; font-style: italic;
    text-transform: uppercase; letter-spacing: 0.03em;
    font-size: clamp(1.3rem, 3vw, 1.7rem); line-height: 1.1;
  }
  .inline { margin: 0; }
</style>
