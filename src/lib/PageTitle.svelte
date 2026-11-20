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
    font-family: var(--display); font-weight: 600;
    text-transform: uppercase; letter-spacing: 0.02em;
    font-size: clamp(1.9rem, 4vw, 2.5rem); line-height: 1;
  }
  .inline { margin: 0; }
</style>
