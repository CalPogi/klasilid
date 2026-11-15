<script lang="ts">
  let { title }: { title: string } = $props();
</script>

<div class="page on">
  <div class="cls-head"><div><h2>{title}</h2><p>Coming in the next update</p></div></div>
  <div class="panel soon">
    <b>{title} is being built.</b>
    <p class="sub2">It's part of the next update. Attendance and corrections already work from Today and Attendance.</p>
    <a class="btn ghost" href="#/today" style="width:auto;padding:0 18px">Back to Today</a>
  </div>
</div>

<style>
  .soon { display: flex; flex-direction: column; align-items: flex-start; gap: 8px; }
</style>
