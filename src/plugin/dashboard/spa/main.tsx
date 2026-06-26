import { render } from 'preact';
import { App, boot } from './app.js';

const root = document.getElementById('app');
if (root) {
  render(<App />, root);
  void boot();
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => undefined);
  });
}
