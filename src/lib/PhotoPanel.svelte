<script>
  // Photo panel for one stored result: upload new shots, pick the featured
  // one, remove existing ones. Keeps its own copy of the image list and
  // refreshes it from the server after each change.
  import { api, post } from './api.js';

  let { sub } = $props();
  // Seeded from the row, then owned here (refresh() re-reads the server).
  // svelte-ignore state_referenced_locally
  let images = $state(sub.images ?? []);
  // svelte-ignore state_referenced_locally
  let featured = $state(sub.featuredImage ?? null);
  let msg = $state({ text: '', kind: '' });
  let fileInput = $state(null);
  const say = (text, kind = '') => { msg = { text, kind }; };

  async function refresh() {
    const all = await api('/api/subsessions');
    const cur = all.find((x) => x._id === sub._id);
    images = cur?.images ?? [];
    featured = cur?.featuredImage ?? null;
  }

  // Race photos come off phones and cameras at 10-25 MB, well past what the
  // server accepts and far more than the gallery needs. Downscale to fit a
  // 2560px box and re-encode as JPEG until it lands under the cap. Files that
  // are already small pass through untouched.
  const UPLOAD_LIMIT = 7_500_000; // keep clear of the server's 8 MB cap
  const MAX_EDGE = 2560;
  async function compress(f) {
    if (!f.type.startsWith('image/') || f.type === 'image/gif') return f;
    if (f.size <= UPLOAD_LIMIT) return f;
    let bitmap;
    try { bitmap = await createImageBitmap(f); }
    catch { return f; } // unreadable here — let the server decide
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();
    const name = f.name.replace(/\.[^.]+$/, '') + '.jpg';
    for (const q of [0.85, 0.72, 0.6, 0.45]) {
      const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', q));
      if (blob && blob.size <= UPLOAD_LIMIT) return new File([blob], name, { type: 'image/jpeg' });
    }
    return f; // still too big — surface the server's error rather than guess
  }

  async function upload() {
    const files = [...(fileInput?.files ?? [])];
    if (!files.length) return say('Choose one or more images first.', 'err');
    const form = new FormData();
    let shrunk = 0;
    for (const [i, f] of files.entries()) {
      say(`Preparing ${i + 1} of ${files.length}…`);
      const out = await compress(f);
      if (out !== f) shrunk++;
      form.append('images', out, out.name);
    }
    say(`Uploading${shrunk ? ` (${shrunk} resized)` : ''}…`);
    const r = await fetch(`/api/admin/subsessions/${encodeURIComponent(sub._id)}/images`, { method: 'POST', body: form });
    if (r.status === 401) return (location.href = '/admin/login');
    const res = await r.json();
    const failed = (res.failed ?? []).map((f) => `${f.name}: ${f.error}`).join('; ');
    say(res.ok
      ? `Added ${res.added.length}${shrunk ? ` (${shrunk} resized)` : ''}.${failed ? ` Skipped — ${failed}` : ''}`
      : `Error: ${res.error ?? failed}`, res.ok ? 'ok' : 'err');
    fileInput.value = '';
    await refresh();
  }

  async function remove(img) {
    if (!confirm(`Remove ${img.name}?`)) return;
    const res = await post(`/api/admin/subsessions/${encodeURIComponent(sub._id)}/images?url=${encodeURIComponent(img.url)}`, null, 'DELETE');
    if (!res.ok) return say(`Error: ${res.error}`, 'err');
    await refresh();
  }

  // One hero per round: picking a new one replaces the old.
  async function star(img) {
    const isHero = img.url === featured;
    const res = await post(`/api/admin/subsessions/${encodeURIComponent(sub._id)}/featured`, { url: isHero ? null : img.url }, 'PUT');
    if (!res.ok) return say(`Error: ${res.error}`, 'err');
    say(isHero ? 'Featured photo cleared.' : 'Featured photo set.', 'ok');
    await refresh();
  }
</script>

<div class="row">
  <input type="file" accept="image/*" multiple bind:this={fileInput}>
  <button class="btn sm primary" type="button" onclick={upload}>Upload</button>
</div>
<div class="shot-admin">
  {#if !images.length}
    <p class="desc">No photos yet.</p>
  {:else}
    {#each images as img (img.url)}
      {@const isHero = img.url === featured}
      <figure class={['shot-admin-item', { 'is-featured': isHero }]}>
        <img src={img.url} alt={img.name ?? ''}>
        <div class="row">
          <button class={['btn', 'sm', { primary: isHero }]} type="button" onclick={() => star(img)}>{isHero ? '★ Featured' : '☆ Feature'}</button>
          <button class="btn sm danger" type="button" onclick={() => remove(img)}>Remove</button>
        </div>
      </figure>
    {/each}
  {/if}
</div>
<p class={['msg', msg.kind]}>{msg.text}</p>
