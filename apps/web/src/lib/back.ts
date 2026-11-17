/**
 * Lets Android's back button (and the browser's) close a sheet or menu instead of leaving the screen.
 * Pushes a history entry; back pops it and calls onclose. The returned cleanup, run when the sheet closes
 * some other way, removes that entry again so the next back press leaves the screen as expected.
 */
export function closeOnBack(onclose: () => void): () => void {
  history.pushState({ klSheet: true }, '');
  let popped = false;
  const pop = () => { popped = true; onclose(); };
  addEventListener('popstate', pop);
  return () => {
    removeEventListener('popstate', pop);
    if (!popped && history.state?.klSheet) history.back();
  };
}
