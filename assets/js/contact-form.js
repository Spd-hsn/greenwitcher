(() => {
  const form = document.querySelector('.contact-form');
  if (!form) return;

  const button = form.querySelector('.submit-btn');
  const status = form.querySelector('.form-status');

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    status.textContent = '';
    status.className = 'form-status';

    if (!form.reportValidity()) return;

    const data = new FormData(form);
    const token = data.get('cf-turnstile-response');
    if (!token) {
      status.textContent = status.dataset.error;
      status.classList.add('is-error');
      return;
    }

    button.disabled = true;
    button.textContent = button.dataset.sending;

    try {
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({
          name: data.get('name'),
          email: data.get('email'),
          message: data.get('message'),
          website: data.get('website'),
          language: form.dataset.lang || 'sk',
          turnstileToken: token,
        }),
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.success) throw new Error(result.message || 'Request failed');

      form.reset();
      if (window.turnstile) window.turnstile.reset();
      status.textContent = status.dataset.success;
      status.classList.add('is-success');
    } catch (error) {
      console.error('Contact form error:', error);
      if (window.turnstile) window.turnstile.reset();
      status.textContent = status.dataset.error;
      status.classList.add('is-error');
    } finally {
      button.disabled = false;
      button.textContent = button.dataset.default;
    }
  });
})();
