<script lang="ts">
  import type { IsoDate } from '@klasilid/core';
  import type { KlasilidDb, LLearner } from '../lib/db';
  import { fmtDay } from '../lib/format';
  import { addStudent } from '../lib/students';
  import Modal from './Modal.svelte';

  // Markup follows the mockup's add-student modal (#addStuModal).
  let { db, classId, className, days, today, now, onclose, onadded }: {
    db: KlasilidDb; classId: string; className: string; days: IsoDate[]; today: IsoDate; now: () => Date;
    onclose: () => void; onadded: (l: LLearner) => void;
  } = $props();

  let fullName = $state('');
  let lrn = $state('');
  let sex: 'M' | 'F' = $state('M');
  let joinedOn = $state('');
  let from = $state('');
  let guardianName = $state('');
  let guardianPhone = $state('');
  let error = $state('');
  let saving = $state(false);
  $effect(() => { joinedOn ||= days[0] ?? today; });

  async function save() {
    saving = true;
    error = '';
    try {
      onadded(await addStudent(db, classId, { fullName, lrn, sex, joinedOn, from, guardianName, guardianPhone }, now()));
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
      saving = false;
    }
  }
</script>

<Modal labelledby="asTitle" {onclose}>
  <h4 id="asTitle">Add student</h4><div class="meta">Adds a learner to {className}. You can register their card right after.</div>
  <div class="fgrid">
    <div class="full"><label for="asName">Full name</label><input id="asName" placeholder="Last name, First name M.I." autocomplete="off" bind:value={fullName} /></div>
    <div><label for="asLrn">LRN</label><input id="asLrn" inputmode="numeric" placeholder="12 digits" maxlength="12" autocomplete="off" bind:value={lrn} /></div>
    <div><label for="asSex">Sex</label><select id="asSex" bind:value={sex}><option value="M">Male</option><option value="F">Female</option></select></div>
    <div><label for="asJoin">Joined on</label><select id="asJoin" bind:value={joinedOn}>{#each days as d}<option value={d}>{d === today ? `Today · ${fmtDay(d)}` : fmtDay(d)}</option>{/each}</select></div>
    <div><label for="asFrom">Transferred in from</label><input id="asFrom" placeholder="Optional" autocomplete="off" bind:value={from} /></div>
    <div class="full"><label for="asParent">Parent or guardian</label><input id="asParent" placeholder="Name" autocomplete="off" bind:value={guardianName} /></div>
    <div class="full"><label for="asPhone">Parent's mobile number</label><input id="asPhone" inputmode="tel" placeholder="09XX XXX XXXX" autocomplete="off" bind:value={guardianPhone} /></div>
  </div>
  {#if error}<p class="win-err" role="alert">{error}</p>{/if}
  <div class="actions"><button class="btn ghost" type="button" onclick={onclose}>Cancel</button><button class="btn" type="button" disabled={saving || !fullName.trim()} onclick={save}>Add and register card</button></div>
</Modal>
