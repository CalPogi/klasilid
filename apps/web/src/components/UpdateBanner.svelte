<script lang="ts">
  import { openDownload, type Update } from '../lib/updates';
  import Icon from './Icon.svelte';

  // The mockup's .warn banner, used the same way as Today's network banner.
  let { update }: { update: Update } = $props();
  let busy = $state(false);

  async function act() {
    busy = true;
    try {
      if (update.kind === 'windows') await update.install();
      else await openDownload(update.url);
    } finally {
      busy = false;
    }
  }
</script>

<div class="warn net-banner" style="display:flex;margin:12px 0" role="status">
  <Icon name="download" />
  <span style="flex:1">A new version of Klasilid is ready (version {update.version}).</span>
  <button class="mini-btn" type="button" disabled={busy} onclick={act}>{update.kind === 'windows' ? 'Restart to update' : 'Download'}</button>
</div>
