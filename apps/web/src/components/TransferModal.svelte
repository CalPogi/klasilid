<script lang="ts">
  import type { IsoDate } from '@klasilid/core';
  import type { KlasilidDb } from '../lib/db';
  import { fmtDay } from '../lib/format';
  import { transferOut } from '../lib/students';
  import Modal from './Modal.svelte';

  // Markup follows the mockup's transfer modal (#xferModal).
  let { db, enrollmentId, name, days, today, onclose, ondone }: {
    db: KlasilidDb; enrollmentId: string; name: string; days: IsoDate[]; today: IsoDate; onclose: () => void; ondone: () => void;
  } = $props();
  let lastDay = $state('');
  let school = $state('');
  $effect(() => { lastDay ||= days[0] ?? today; });

  async function save() {
    await transferOut(db, enrollmentId, lastDay, school);
    ondone();
  }
</script>

<Modal labelledby="xfTitle" {onclose}>
  <h4 id="xfTitle">Mark as transferred out</h4>
  <div class="meta">{name} leaves the seat plan and SF2 after their last day. Their records stay, view only.</div>
  <div class="fgrid">
    <div><label for="xfDate">Last day</label><select id="xfDate" bind:value={lastDay}>{#each days as d}<option value={d}>{d === today ? `Today · ${fmtDay(d)}` : fmtDay(d)}</option>{/each}</select></div>
    <div><label for="xfTo">New school</label><input id="xfTo" placeholder="Name of the new school" bind:value={school} /></div>
  </div>
  <div class="actions"><button class="btn ghost" type="button" onclick={onclose}>Cancel</button><button class="btn" type="button" onclick={save}>Save</button></div>
</Modal>
