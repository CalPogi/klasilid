<script lang="ts">
  import type { Snippet } from 'svelte';
  import Logo from './Logo.svelte';
  import { platform } from '../lib/native';

  // The frame shared by the canvas boards "Sign in" and "Sign up": the card, the second box with the other page's link,
  // the two phones (hidden below 760 px) and the footer. The form inside is the page's own; its classes are styled here.
  let { title, sub, width, alt, phones, children }: {
    title: string; sub: string; width: number; alt: [text: string, href: string, label: string]; phones: [string, string]; children: Snippet;
  } = $props();

  const DL = 'https://github.com/CalPogi/klasilid-releases/releases/latest/download/';
  const web = platform() === 'web'; // the installed apps don't link to their own installers or the website
</script>

<div class="kl-page">
  <main class="kl-main">
    <div class="si-col" style:width="{width}px">
      <div class="kl-box si-card">
        <div class="si-brand"><Logo size={40} /><span>Klasilid</span></div>
        <h1>{title}</h1>
        <p class="si-sub">{sub}</p>
        {@render children()}
      </div>
      <div class="kl-box si-alt">{alt[0]} <a href={alt[1]}>{alt[2]}</a></div>
      {#if web}
        <div class="si-get">
          <span>Get the app</span>
          <a href="{DL}Klasilid.apk"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="6" y="2" width="12" height="20" rx="3"></rect><path d="M11 18h2"></path></svg>Android</a>
          <a href="{DL}Klasilid-Setup.exe"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="4" width="20" height="13" rx="2"></rect><path d="M8 21h8M12 17v4"></path></svg>Windows</a>
        </div>
      {/if}
    </div>
    <div class="kl-phones" aria-hidden="true">
      <div class="ph a"><img src="./auth/{phones[0]}.png" alt="" /></div>
      <div class="ph b"><img src="./auth/{phones[1]}.png" alt="" /></div>
    </div>
  </main>
  {#if web}
    <footer>
      <a href="../">About Klasilid</a>
      <a href="../#request">Request a door reader</a>
    </footer>
  {/if}
</div>

<style>
  .kl-page { container-type: inline-size; width: 100%; min-height: 100vh; box-sizing: border-box; background: #FFFFFF; color: #16161A;
    font-family: 'Plus Jakarta Sans', system-ui, sans-serif; font-size: 16px; line-height: 1.5; display: flex; flex-direction: column; }
  :where(.kl-page) :global(a) { color: #B04A00; }
  :where(.kl-page) :global(a:hover) { color: #8A3A00; }
  :where(.kl-page) :global(:is(a, button, input):focus-visible) { outline: 3px solid #FF7A1A; outline-offset: 2px; }
  .kl-main { flex: 1; box-sizing: border-box; padding: 40px 16px 16px; display: flex; flex-direction: row-reverse; flex-wrap: wrap; align-items: center;
    justify-content: center; gap: 32px 48px; }
  .si-col { max-width: 100%; display: flex; flex-direction: column; gap: 12px; }
  .kl-box { box-sizing: border-box; border: 1px solid #E4E4E9; border-radius: 20px; }
  .si-card { padding: 32px 32px 28px; }
  .si-brand { display: flex; align-items: center; gap: 12px; font-size: 26px; letter-spacing: -.04em; font-weight: 800; }
  h1 { margin: 26px 0 4px; font-size: 24px; letter-spacing: -.02em; font-weight: 800; }
  .si-sub { margin: 0 0 20px; font-size: 15px; color: #6B6B74; }
  .si-alt { padding: 16px 20px; text-align: center; font-size: 15px; }
  .si-alt a { font-weight: 700; text-decoration: none; display: inline-block; padding: 8px 2px; }
  .si-get { display: flex; justify-content: center; align-items: center; gap: 8px; flex-wrap: wrap; margin-top: 6px; }
  .si-get span { font-size: 14px; color: #4A4A52; margin-right: 4px; }
  .si-get a { display: inline-flex; align-items: center; gap: 8px; height: 44px; padding: 0 14px; border-radius: 12px; background: #16161A; color: #FFFFFF;
    text-decoration: none; font-size: 14px; font-weight: 700; }
  .kl-phones { position: relative; width: 380px; height: 580px; flex: none; }
  .ph { position: absolute; width: 250px; border-radius: 36px; background: #16161A; padding: 9px; box-sizing: border-box; }
  .ph.a { left: 0; top: 0; box-shadow: 0 30px 60px -36px rgba(16,16,24,.5); }
  .ph.b { right: 0; top: 52px; box-shadow: 0 40px 80px -30px rgba(16,16,24,.6); }
  .ph img { display: block; width: 100%; height: auto; border-radius: 28px; }
  footer { box-sizing: border-box; padding: 16px 16px 32px; display: flex; flex-wrap: wrap; justify-content: center; gap: 4px 18px; font-size: 13px; }
  footer a { color: #6B6B74; text-decoration: none; padding: 8px 4px; }
  @container (max-width: 760px) {
    .kl-phones { display: none; }
    .kl-box { border-color: transparent; }
    .si-card { padding: 8px 4px 4px; }
    .kl-main { padding-top: 20px; }
  }

  /* The page's form (canvas classes kl-label, kl-input, kl-help, kl-err). */
  :where(.kl-page) :global(form) { display: flex; flex-direction: column; }
  :where(.kl-page) :global(.kl-label) { display: block; font-size: 14px; font-weight: 700; margin: 0 0 6px; }
  :where(.kl-page) :global(.kl-input) { box-sizing: border-box; width: 100%; height: 48px; border: 1.5px solid #D5D5DC; border-radius: 12px; padding: 0 14px; font: inherit;
    font-size: 16px; background: #FFFFFF; color: #16161A; }
  .kl-page :global(.kl-input) { color: #16161A; background: #FFFFFF; } /* beats the app's dark-theme input colour; the page is always light */
  :where(.kl-page) :global(.kl-input:focus) { border-color: #16161A; }
  :where(.kl-page) :global(.kl-input[aria-invalid='true']) { border-color: #D92D3A; }
  :where(.kl-page) :global(.kl-help) { font-size: 13px; color: #6B6B74; margin: 6px 0 0; }
  :where(.kl-page) :global(.kl-err) { font-size: 13px; color: #B0202C; font-weight: 600; margin: 6px 0 0; }
  :where(.kl-page) :global(.si-alert) { background: #FDEBEC; color: #B0202C; border-radius: 12px; padding: 12px 14px; margin: 0 0 18px; font-size: 14px; }
  :where(.kl-page) :global(.si-go) { margin-top: 22px; width: 100%; height: 48px; border: 0; border-radius: 12px; background: #FF7A1A; color: #16161A; font: inherit;
    font-size: 16px; font-weight: 700; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 10px; }
  :where(.kl-page) :global(.si-go:disabled) { opacity: .7; cursor: default; }
  :where(.kl-page) :global(.kl-spin) { width: 18px; height: 18px; border-radius: 50%; border: 2.5px solid rgba(22,22,26,.25); border-top-color: #16161A;
    animation: kl-spin .8s linear infinite; }
  @keyframes -global-kl-spin { to { transform: rotate(360deg); } }
  @media (prefers-reduced-motion: reduce) { :where(.kl-page) :global(.kl-spin) { animation: none; } }
  :where(.kl-page) :global(.si-note) { margin: 18px 0 0; font-size: 14px; color: #4A4A52; }
</style>
