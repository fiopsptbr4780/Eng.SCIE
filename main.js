/**
 * Eng.SCIE — Script Principal
 * Gestão de navegação, formulário com validação acessível e animações de scroll.
 */

document.addEventListener('DOMContentLoaded', () => {
  // ==========================================================================
  // Smooth scroll acessível com gestão de foco
  // ==========================================================================
  document.querySelectorAll('a[href^="#"]').forEach(a => {
    a.addEventListener('click', function(e) {
      const href = this.getAttribute('href');
      if (href === '#' || href.length <= 1) return;
      const el = document.querySelector(href);
      if (el) {
        e.preventDefault();
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        if (!el.hasAttribute('tabindex')) {
          el.setAttribute('tabindex', '-1');
        }
        el.focus({ preventScroll: true });
      }
    });
  });

  // ==========================================================================
  // Cookie consent (RGPD)
  // ==========================================================================
  const cookieBanner = document.getElementById('cookieBanner');
  const COOKIE_KEY = 'engscie_cookie_consent';
  if (cookieBanner) {
    if (!localStorage.getItem(COOKIE_KEY)) {
      setTimeout(() => cookieBanner.classList.add('show'), 600);
    }
    const acceptBtn = document.getElementById('cookieAccept');
    const declineBtn = document.getElementById('cookieDecline');
    
    if (acceptBtn) {
      acceptBtn.addEventListener('click', () => {
        localStorage.setItem(COOKIE_KEY, 'accepted');
        cookieBanner.classList.remove('show');
      });
    }
    if (declineBtn) {
      declineBtn.addEventListener('click', () => {
        localStorage.setItem(COOKIE_KEY, 'declined');
        cookieBanner.classList.remove('show');
      });
    }
  }

  // ==========================================================================
  // Menu móvel com aria-expanded e fecho ao clicar fora / ESC
  // ==========================================================================
  const navToggle = document.getElementById('navToggle');
  const navMenu = document.getElementById('navMenu');

  function closeNavMenu() {
    if (navMenu && navMenu.classList.contains('open')) {
      navMenu.classList.remove('open');
      navToggle.setAttribute('aria-label', 'Abrir menu');
      navToggle.setAttribute('aria-expanded', 'false');
      navToggle.textContent = '☰';
    }
  }

  if (navToggle && navMenu) {
    navToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = navMenu.classList.toggle('open');
      navToggle.setAttribute('aria-label', isOpen ? 'Fechar menu' : 'Abrir menu');
      navToggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      navToggle.textContent = isOpen ? '✕' : '☰';
    });

    navMenu.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', closeNavMenu);
    });

    document.addEventListener('click', (e) => {
      if (!navMenu.contains(e.target) && !navToggle.contains(e.target)) {
        closeNavMenu();
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeNavMenu();
      }
    });
  }

  // ==========================================================================
  // Formulário com validação acessível em Português e feedback inline
  // ==========================================================================
  const contactForm = document.getElementById('contactForm');
  const submitBtn = document.getElementById('submitBtn');
  const formSuccess = document.getElementById('formSuccess');
  const formError = document.getElementById('formError');
  const formResetBtn = document.getElementById('formResetBtn');

  if (contactForm) {
    const requiredInputs = contactForm.querySelectorAll('[required]');
    requiredInputs.forEach(input => {
      input.addEventListener('invalid', function() {
        if (this.validity.valueMissing) {
          if (this.type === 'checkbox') {
            this.setCustomValidity('É necessário aceitar a Política de Privacidade para prosseguir.');
          } else {
            this.setCustomValidity('Por favor, preencha este campo obrigatório.');
          }
        } else if (this.validity.typeMismatch && this.type === 'email') {
          this.setCustomValidity('Por favor, introduza um endereço de e-mail válido.');
        } else {
          this.setCustomValidity('');
        }
      });
      input.addEventListener('input', function() {
        this.setCustomValidity('');
      });
      input.addEventListener('change', function() {
        this.setCustomValidity('');
      });
    });

    contactForm.addEventListener('submit', async function(e) {
      e.preventDefault();
      if (formError) formError.style.display = 'none';

      if (!contactForm.checkValidity()) {
        contactForm.reportValidity();
        return;
      }

      const originalText = submitBtn.textContent;
      submitBtn.textContent = '⏳ A enviar...';
      submitBtn.disabled = true;
      submitBtn.style.opacity = '0.7';

      try {
        const formData = new FormData(contactForm);
        const response = await fetch(contactForm.action, {
          method: 'POST',
          body: formData,
          headers: { 'Accept': 'application/json' }
        });

        if (response.ok) {
          contactForm.reset();
          contactForm.style.display = 'none';
          if (formSuccess) formSuccess.style.display = 'block';
        } else {
          throw new Error('Erro de envio');
        }
      } catch (error) {
        submitBtn.textContent = originalText;
        submitBtn.disabled = false;
        submitBtn.style.opacity = '1';
        if (formError) {
          formError.textContent = '⚠️ Ocorreu um erro no envio do pedido. Por favor, tente novamente ou envie um e-mail diretamente para tlsengmecanico@gmail.com.';
          formError.style.display = 'block';
        }
      }
    });
  }

  if (formResetBtn) {
    formResetBtn.addEventListener('click', () => {
      if (formSuccess) formSuccess.style.display = 'none';
      if (formError) formError.style.display = 'none';
      contactForm.style.display = 'flex';
      submitBtn.textContent = '📩 Enviar Pedido';
      submitBtn.disabled = false;
      submitBtn.style.opacity = '1';
      submitBtn.style.background = 'var(--accent)';
    });
  }

  // ==========================================================================
  // Scroll reveal fallback para navegadores sem Scroll-Driven Animations nativo
  // ==========================================================================
  if (!CSS.supports('(animation-timeline: view()) and (animation-range: entry)')) {
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const serviceCards = document.querySelectorAll('.service-card');
      const observer = new IntersectionObserver((entries, obs) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            obs.unobserve(entry.target);
          }
        });
      }, {
        threshold: 0.15,
        rootMargin: '0px 0px -40px 0px'
      });

      serviceCards.forEach((card, index) => {
        card.classList.add('reveal-init');
        card.style.transitionDelay = `${(index % 3) * 120}ms`;
        observer.observe(card);
      });
    }
  }
});
