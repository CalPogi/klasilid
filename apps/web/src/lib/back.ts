/**
 * Lets Android's back button (and the browser's) close a sheet or menu instead of leaving the screen.
 * Each open sheet pushes a history entry; back closes the top-most sheet. A sheet closed some other way
 * removes its entry with history.back(), and that back step is recognised as ours and ignored.
 * A sheet opened while such a step is still on its way (Add student handing over to Register card) waits
 * for it to land before pushing its own entry, so the step is never cancelled or mistaken for the user's.
 */
const open: (() => void)[] = [];
let ownBacks = 0;
let waiting: (() => void)[] = [];
let listening = false;

function settle() {
  const w = waiting;
  waiting = [];
  w.forEach(f => f());
}
function onPop() {
  if (ownBacks) { ownBacks--; if (!ownBacks) settle(); return; }
  open.pop()?.();
}

/** Resolves once no back step of ours is still on its way (tests start from a quiet history with it). */
export function historyIdle(): Promise<void> {
  return ownBacks ? new Promise(r => waiting.push(() => r())) : Promise.resolve();
}

export function closeOnBack(onclose: () => void): () => void {
  if (!listening) { addEventListener('popstate', onPop); listening = true; }
  let pushed = false;
  let done = false;
  const close = () => { done = true; onclose(); };
  const push = () => { if (done) return; history.pushState({ klSheet: true }, ''); pushed = true; open.push(close); };
  if (ownBacks) waiting.push(push);
  else push();
  return () => {
    waiting = waiting.filter(f => f !== push);
    const i = open.indexOf(close);
    if (i >= 0) open.splice(i, 1);
    // Only step back over our own entry; if the screen already navigated on, leave history alone.
    if (!done && pushed && history.state?.klSheet) {
      ownBacks++;
      history.back();
      setTimeout(() => { if (ownBacks) { ownBacks = 0; settle(); } }, 500); // a back step that never lands must not block later sheets
    }
    done = true;
  };
}
