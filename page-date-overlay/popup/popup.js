(function () {
  const browserAPI = window.browser || window.chrome;
  const PDO = window.PDO;

  async function getActiveTab() {
    const tabs = await browserAPI.tabs.query({ active: true, currentWindow: true });
    return tabs && tabs[0] || null;
  }

  async function render() {
    const [tab, settings] = await Promise.all([getActiveTab(), PDO.getSettings()]);
    const infoEl = document.getElementById('current-info');
    if (tab && tab.url) {
      const normUrl = PDO.normalizeUrl(tab.url);
      infoEl.textContent = normUrl || tab.url;
      if (normUrl) {
        const meta = await PDO.getPageMeta(normUrl);
        if (meta) {
          const d = meta.publishedAt || 'unknown';
          const a = meta.author || '—';
          const t = meta.type || '—';
          infoEl.textContent = `${d} · ${a} · type:${t}\n${normUrl}`;
        }
      }
    } else {
      infoEl.textContent = '(no active tab)';
    }

    document.getElementById('enabled').checked = !!settings.enabled;
    document.getElementById('position').value = settings.overlayPosition || 'tr';
  }

  function send(command) {
    return getActiveTab().then(tab => {
      if (!tab) return;
      return browserAPI.tabs.sendMessage(tab.id, { command });
    }).catch(() => { /* tab might not have content script (chrome:// etc.) */ });
  }

  document.getElementById('toggle').addEventListener('click', () => send('toggle-overlay'));
  document.getElementById('pick-type').addEventListener('click', () => send('pick-type'));
  document.getElementById('dashboard').addEventListener('click', async () => {
    const url = browserAPI.runtime.getURL('newtab/index.html');
    await browserAPI.tabs.create({ url });
    window.close();
  });

  document.getElementById('enabled').addEventListener('change', async (e) => {
    await PDO.setSettings({ enabled: e.target.checked });
  });
  document.getElementById('position').addEventListener('change', async (e) => {
    await PDO.setSettings({ overlayPosition: e.target.value });
  });

  render();
})();
