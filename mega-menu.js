(function() {
  'use strict';

  /**
   * Optimized MegaMenu
   */
  function MegaMenu(options = {}) {
    // Merged configuration with defaults
    const config = {
      clickToShow: false,
      folderClickThrough: false,
      showOnMobile: true,
      menuWidth: 'full',
      memberLinks: [],
      adaptiveHeaderTheme: null,
      ...options
    };
    
    // Consolidated state
    const state = {
      initialized: false,
      activeMenuId: null,
      headerHeight: null,
      themes: { header: null, headerMobile: null },
      loadCache: new Map(), // Combined loading and loaded tracking
      isInIframe: window.self !== window.top,
      isTouchDevice: 'ontouchstart' in window || navigator.maxTouchPoints > 0
    };
    
    // Cached DOM elements with lazy initialization
    const dom = {
      get header() { return this._header ??= document.querySelector('#header'); },
      get headerMenu() { return this._headerMenu ??= document.querySelector('#header .header-menu'); },
      get container() { return this._container ??= document.body; },
      get megaContainer() { return this._megaContainer ??= this.createMegaContainer(); },
      
      createMegaContainer() {
        const container = document.createElement('div');
        container.id = 'mega-container';
        document.body.appendChild(container);
        return container;
      }
    };
    
    // Cleanup registry
    const cleanup = new Set();
    
    // Utility functions
    const utils = {
      debounce: (fn, ms) => {
        let timeout;
        return (...args) => {
          clearTimeout(timeout);
          timeout = setTimeout(() => fn(...args), ms);
          cleanup.add(() => clearTimeout(timeout));
        };
      },
      
      requestTask: (fn, options = {}) => {
        if ('requestIdleCallback' in window) {
          const id = requestIdleCallback(fn, options);
          cleanup.add(() => cancelIdleCallback(id));
          return id;
        }
        const id = setTimeout(fn, 0);
        cleanup.add(() => clearTimeout(id));
        return id;
      },
      
      findFocusable: (container) => Array.from(container.querySelectorAll(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), ' + 
        'textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), [contenteditable], [role="button"]'
      ))
    };
    
    /**
     * Enhanced content fetching with better caching
     */
    async function fetchMenuContent(linkPath, customPath = null) {
      if (state.loadCache.has(linkPath)) {
        return state.loadCache.get(linkPath);
      }
      
      const fetchUrl = `/mega-page-${customPath || linkPath.slice(5)}`;
      const promise = fetch(fetchUrl, { priority: 'low' })
        .then(response => response.ok ? response.text() : Promise.reject(`HTTP ${response.status}`))
        .then(html => ({ linkPath, html, loaded: true }))
        .catch(error => {
          console.warn(`Failed to load mega menu: ${linkPath}`, error);
          return null;
        });
      
      state.loadCache.set(linkPath, promise);
      return promise;
    }
    
    /**
     * Early prefetch optimization
     */
    function prefetchContent() {
      const links = document.querySelectorAll('.header-display-desktop .header-nav-folder-title[href^="/mega-"]');
      const memberLinks = config.memberLinks.map(id => 
        document.querySelector(`.header-display-desktop .header-nav-folder-title[href="${id}"]`)
      ).filter(Boolean);
      
      [...links, ...memberLinks].forEach(link => {
        const linkPath = link.getAttribute('data-mega-path') || link.getAttribute('href').slice(1);
        const isMember = config.memberLinks.includes(link.getAttribute('href'));
        fetchMenuContent(linkPath, isMember ? link.getAttribute('href') : null);
      });
    }
    
    /**
     * Process menu links with improved efficiency
     */
    function processMenuLinks() {
      const megaLinks = Array.from(document.querySelectorAll('.header-display-desktop .header-nav-folder-title[href^="/mega-"]'));
      const memberLinks = config.memberLinks.map(id => {
        const link = document.querySelector(`.header-display-desktop .header-nav-folder-title[href="${id}"]`);
        if (link) {
          link.setAttribute('data-mega-path', '/mega-' + id);
          link.classList.add('member-link');
        }
        return link;
      }).filter(Boolean);
      
      // Set paths for standard links
      megaLinks.forEach(link => link.setAttribute('data-mega-path', link.getAttribute('href')));
      
      const allLinks = [...megaLinks, ...memberLinks];
      
      // Process all menus in parallel with better error handling
      Promise.allSettled(allLinks.map(processMenu)).then(() => {
        console.log('Mega menu initialization complete');
      });
      
      return allLinks;
    }
    
    /**
     * Menu processing
     */
    async function processMenu(trigger) {
      const linkPath = trigger.getAttribute('data-mega-path').slice(1);
      const isMember = trigger.classList.contains('member-link');
      
      try {
        const result = await fetchMenuContent(linkPath, isMember ? trigger.getAttribute('href') : null);
        if (!result) return;
        
        utils.requestTask(() => {
          const container = createMenuContainer(linkPath);
          const content = parseMenuContent(result.html);
          
          if (content.section) {
            container.appendChild(content.section);
            if (content.theme) container.setAttribute('data-section-theme', content.theme);
            
            container.classList.add('mega-menu-loaded');
            setupMenuTrigger(trigger, linkPath);
            
            // Initialize Squarespace blocks
            initializeSquarespaceBlocks(container);
          }
        });
      } catch (error) {
        console.error(`Failed to process menu ${linkPath}:`, error);
      }
    }
    
    /**
     * Create menu container
     */
    function createMenuContainer(linkPath) {
      const container = document.createElement('div');
      container.id = linkPath;
      container.className = 'mega-menu-item';
      dom.megaContainer.appendChild(container);
      return container;
    }
    
    /**
     * Parse menu content
     */
    function parseMenuContent(html) {
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      const section = doc.querySelector('#page .page-section');
      
      return {
        section: section?.cloneNode(true),
        theme: section?.getAttribute('data-section-theme')
      };
    }
    
    /**
     * Initialize Squarespace blocks with error handling
     */
    function initializeSquarespaceBlocks(container) {
      if (!window.Squarespace || !window.Y) return;
      
      utils.requestTask(() => {
        try {
          window.Squarespace.initializePageContent(window.Y, window.Y.one(container));
          window.Squarespace.initializeNativeVideo?.(window.Y, window.Y.one(container));
        } catch (error) {
          console.warn('Squarespace initialization failed:', error);
        }
      }, { timeout: 2000 });
    }
    
    /**
     * Simplified menu trigger setup
     */
    function setupMenuTrigger(trigger, menuId) {
      const menu = document.getElementById(menuId);
      if (!menu) return;
      
      // Set accessibility attributes
      trigger.classList.add('mega-link');
      trigger.setAttribute('aria-haspopup', 'true');
      trigger.setAttribute('aria-controls', menuId);
      trigger.setAttribute('aria-expanded', 'false');
      
      trigger.parentElement.classList.add('mega-menu');
      menu.setAttribute('aria-hidden', 'true');
      
      // Set initial tabindex
      utils.findFocusable(menu).forEach(el => el.setAttribute('tabindex', '-1'));
      
      // Event listeners based on configuration
      if (config.clickToShow === true || config.clickToShow === 'true') {
        trigger.addEventListener('click', e => {
          e.preventDefault();
          toggleMenu(trigger, menu);
        });
      } else {
        const parent = trigger.parentElement;
        parent.addEventListener('mouseenter', () => openMenu(trigger, menu, false), { passive: true });
        parent.addEventListener('mouseleave', () => closeMenu(trigger, menu, false), { passive: true });
        menu.addEventListener('mouseenter', () => openMenu(trigger, menu, false), { passive: true });
        menu.addEventListener('mouseleave', () => closeMenu(trigger, menu, false), { passive: true });
      }
      
      // Keyboard support
      trigger.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          toggleMenu(trigger, menu);
        }
      });
      
      // Folder click-through
      if ((config.folderClickThrough === true || config.folderClickThrough === 'true') && 
          !(config.clickToShow === true || config.clickToShow === 'true') && 
          !trigger.classList.contains('member-link')) {
        trigger.addEventListener('click', function() {
          window.location.href = '/' + this.getAttribute('href').slice(6);
        });
      }
    }
    
    /**
     * Menu state management
     */
    function toggleMenu(trigger, menu) {
      const isOpen = trigger.getAttribute('aria-expanded') === 'true';
      isOpen ? closeMenu(trigger, menu) : openMenu(trigger, menu);
    }
    
    function openMenu(trigger, menu, shouldFocus = true) {
      if (state.activeMenuId === menu.id) return;
      
      // Close current menu if different
      if (state.activeMenuId && state.activeMenuId !== menu.id) {
        const current = {
          trigger: document.querySelector(`.mega-link[aria-controls="${state.activeMenuId}"]`),
          menu: document.getElementById(state.activeMenuId)
        };
        if (current.trigger && current.menu) {
          closeMenu(current.trigger, current.menu, false);
        }
      }
      
      updateHeaderHeight();
      
      requestAnimationFrame(() => {
        // Update accessibility
        trigger.setAttribute('aria-expanded', 'true');
        menu.setAttribute('aria-hidden', 'false');
        menu.classList.add('active');
        
        // Enable focus
        utils.findFocusable(menu).forEach(el => el.setAttribute('tabindex', '0'));
        
        // Handle adaptive theme
        handleAdaptiveTheme(menu, true);
        
        // Keyboard trap
        setupKeyboardTrap(menu, trigger);
      });
      
      if (shouldFocus) {
        setTimeout(() => {
          const focusable = utils.findFocusable(menu);
          focusable[0]?.focus();
        }, 50);
      }
      
      // Always add scroll listener
      window.addEventListener('scroll', handleScroll, { passive: true });
      state.activeMenuId = menu.id;
    }
    
    function closeMenu(trigger, menu, shouldFocus = true) {
      removeKeyboardTrap(menu);
      
      const menuHasFocus = menu.contains(document.activeElement);
      if (menuHasFocus) trigger.focus();
      
      requestAnimationFrame(() => {
        utils.findFocusable(menu).forEach(el => el.setAttribute('tabindex', '-1'));
        
        trigger.setAttribute('aria-expanded', 'false');
        menu.setAttribute('aria-hidden', 'true');
        menu.classList.remove('active');
        
        handleAdaptiveTheme(menu, false);
      });
      
      if (shouldFocus && !menuHasFocus) {
        setTimeout(() => trigger.focus(), 10);
      }
      
      window.removeEventListener('scroll', handleScroll);
      state.activeMenuId = null;
    }
    
    /**
     * Adaptive theme handling
     */
    function handleAdaptiveTheme(menu, isOpening) {
      if (!dom.header) return;
      
      if (isOpening) {
        if (config.adaptiveHeaderTheme?.toLowerCase() === 'transparent') {
          dom.header.classList.add('cse-transparent');
        } else if (config.adaptiveHeaderTheme) {
          if (dom.header.getAttribute('data-header-style') === 'dynamic') {
            dom.header.setAttribute('data-section-theme', config.adaptiveHeaderTheme);
          }
        } else if (dom.header.getAttribute('data-header-style') === 'dynamic') {
          const theme = menu.getAttribute('data-section-theme') || 
                       menu.querySelector('.page-section')?.getAttribute('data-section-theme');
          if (theme) dom.header.setAttribute('data-section-theme', theme);
        }
      } else {
        // Restore original theme
        if (config.adaptiveHeaderTheme?.toLowerCase() === 'transparent') {
          dom.header.classList.remove('cse-transparent');
        }
        if (state.themes.header && dom.header.getAttribute('data-header-style') === 'dynamic') {
          dom.header.setAttribute('data-section-theme', state.themes.header);
        }
      }
    }
    
    /**
     * Keyboard trap management
     */
    function setupKeyboardTrap(menu, trigger) {
      removeKeyboardTrap(menu);
      
      const handler = (e) => {
        if (e.key === 'Tab') {
          const focusable = utils.findFocusable(menu);
          if (focusable.length === 0) return;
          
          const [first, last] = [focusable[0], focusable[focusable.length - 1]];
          
          if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        } else if (e.key === 'Escape') {
          e.preventDefault();
          closeMenu(trigger, menu);
        }
      };
      
      menu._keyboardHandler = handler;
      menu.addEventListener('keydown', handler);
    }
    
    function removeKeyboardTrap(menu) {
      if (menu._keyboardHandler) {
        menu.removeEventListener('keydown', menu._keyboardHandler);
        menu._keyboardHandler = null;
      }
    }
    
    /**
     * Event handlers
     */
    function updateHeaderHeight() {
      if (dom.header) {
        state.headerHeight = dom.header.getBoundingClientRect().height;
        document.body.style.setProperty('--csemegaheaderheight', `${state.headerHeight}px`);
      }
    }
    
    const handleResize = utils.debounce(() => {
      state.headerHeight = null;
      if (state.activeMenuId) updateHeaderHeight();
    }, 100);
    
    function handleKeyDown(e) {
      if (e.key === 'Escape' && state.activeMenuId) {
        const trigger = document.querySelector(`.mega-link[aria-controls="${state.activeMenuId}"]`);
        const menu = document.getElementById(state.activeMenuId);
        if (trigger && menu) closeMenu(trigger, menu);
      }
    }
    
    function handleDocumentClick(e) {
      if (!state.activeMenuId) return;
      
      const menu = document.getElementById(state.activeMenuId);
      const trigger = document.querySelector(`.mega-link[aria-controls="${state.activeMenuId}"]`);
      
      if (menu && trigger && !menu.contains(e.target) && !trigger.contains(e.target)) {
        closeMenu(trigger, menu, false);
      }
    }
    
    function handleScroll() {
      if (!state.activeMenuId) return;
      
      const menu = document.getElementById(state.activeMenuId);
      const trigger = document.querySelector(`.mega-link[aria-controls="${state.activeMenuId}"]`);
      
      if (menu?.querySelector('.page-section') && trigger) {
        closeMenu(trigger, menu, false);
      }
    }
    
    /**
     * Mobile menu handling with theme support
     */
    function setupMobileMenu() {
      if (!config.showOnMobile || config.showOnMobile === 'false' || !dom.headerMenu) return;
      
      const observer = new MutationObserver((mutations) => {
        mutations.forEach(mutation => {
          if (mutation.target === dom.container && mutation.attributeName === 'class') {
            const isOpen = dom.container.classList.contains('header--menu-open');
            isOpen ? loadMobileContent() : cleanupMobileContent();
          }
        });
      });
      
      observer.observe(dom.container, { attributes: true, attributeFilter: ['class'] });
      cleanup.add(() => observer.disconnect());
      
      // Set up folder observer for theme changes
      setupMobileFolderObserver();
    }
    
    function setupMobileFolderObserver() {
      if (!config.showOnMobile || config.showOnMobile === 'false' || !dom.headerMenu) return;
      
      const observer = new MutationObserver((mutations) => {
        mutations.forEach(mutation => {
          if (mutation.type === 'attributes' && 
              mutation.attributeName === 'class' && 
              mutation.target.classList.contains('header-menu-nav-folder')) {
            handleMobileFolderChange(mutation.target);
          }
        });
      });
      
      // Create a selector that includes both mega folders and member folders
      const selectors = [
        '.header-menu-nav-folder[data-folder^="/mega-"]',
        ...config.memberLinks.map(link => `.header-menu-nav-folder[data-folder="${link}"]`)
      ];
      
      const mobileFolders = Array.from(dom.headerMenu.querySelectorAll(selectors.join(', ')));
      mobileFolders.forEach(folder => {
        observer.observe(folder, { attributes: true, attributeFilter: ['class'] });
      });
      
      cleanup.add(() => observer.disconnect());
    }
    
    function handleMobileFolderChange(folder) {
      if (!dom.container.classList.contains('header--menu-open') || 
      !config.showOnMobile || 
      config.showOnMobile === 'false' || 
      !dom.headerMenu) return;
      
      const isActive = folder.classList.contains('header-menu-nav-folder--active');
      const folderPath = folder.getAttribute('data-folder');
      
      // Check if this is a mega folder or member folder
      const isMegaFolder = folderPath?.startsWith('/mega-');
      const isMemberFolder = config.memberLinks.includes(folderPath);
      
      if (isActive && (isMegaFolder || isMemberFolder)) {
        const megaContent = folder.querySelector('.mobile-mega-content');
        if (megaContent) {
          const theme = megaContent.getAttribute('data-section-theme');
          if (theme) {
            dom.headerMenu.setAttribute('data-section-theme', theme);
            if (dom.container.classList.contains('header--menu-open')) {
              dom.header.setAttribute('data-section-theme', theme);
            }
          }
        }
      } else {
        // Restore original theme
        if (state.themes.headerMobile) {
          dom.headerMenu.setAttribute('data-section-theme', state.themes.headerMobile);
          if (dom.container.classList.contains('header--menu-open')) {
            dom.header.setAttribute('data-section-theme', state.themes.headerMobile);
          }
        }
      }
    }
    
    function loadMobileContent() {
      if (!config.showOnMobile || config.showOnMobile === 'false') return;
      
      // Load mobile content with theme support
      utils.requestTask(() => {
        // Create selectors for both mega folders and member folders
        const selectors = [
          '.header-menu-nav-folder[data-folder^="/mega-"]',
          ...config.memberLinks.map(link => `.header-menu-nav-folder[data-folder="${link}"]`)
        ];
        
        const mobileFolders = Array.from(dom.headerMenu.querySelectorAll(selectors.join(', ')));
        
        mobileFolders.forEach(folder => {
          const folderPath = folder.getAttribute('data-folder');
          const isMemberFolder = config.memberLinks.includes(folderPath);
          
          // Determine the mega path
          let megaPath;
          if (isMemberFolder) {
            megaPath = 'mega-' + folderPath;
          } else {
            megaPath = folderPath.slice(1); // Remove leading slash
          }
          
          const desktopMenu = document.getElementById(megaPath);
          
          if (desktopMenu && !folder.querySelector('.mobile-mega-content')) {
            const mobileContent = document.createElement('div');
            mobileContent.className = 'mobile-mega-content';
            mobileContent.setAttribute('data-mega-path', megaPath);
            
            // Copy content and preserve theme
            const firstSection = desktopMenu.querySelector('.page-section');
            if (firstSection) {
              mobileContent.appendChild(firstSection.cloneNode(true));
              
              const sectionTheme = firstSection.getAttribute('data-section-theme') || 
                                 desktopMenu.getAttribute('data-section-theme');
              if (sectionTheme) {
                mobileContent.setAttribute('data-section-theme', sectionTheme);
              }
            }
            
            // Add .btn class to button blocks
            mobileContent.querySelectorAll('.button-block a').forEach(btn => btn.classList.add('btn'));
            
            folder.appendChild(mobileContent);
            initializeSquarespaceBlocks(mobileContent);
          }
        });
      });
    }
    
    function cleanupMobileContent() {
      const mobileFolders = Array.from(dom.headerMenu?.querySelectorAll('.header-menu-nav-folder') || []);
      mobileFolders.forEach(folder => {
        folder.querySelectorAll('.mobile-mega-content').forEach(content => content.remove());
      });
      
      // Restore original mobile theme
      if (dom.headerMenu && state.themes.headerMobile) {
        dom.headerMenu.setAttribute('data-section-theme', state.themes.headerMobile);
      }
      
      // Restore original header theme
      if (dom.header && state.themes.header) {
        dom.header.setAttribute('data-section-theme', state.themes.header);
      }
    }
    
    /**
     * Initialization and cleanup
     */
    function init() {
      // Store original themes
      state.themes.header = dom.header?.getAttribute('data-section-theme');
      state.themes.headerMobile = dom.headerMenu?.getAttribute('data-section-theme');
      
      // Apply configuration
      if (config.menuWidth === 'inset') {
        dom.container.classList.add('cse-mega-inset');
        if (config.clickToShow) dom.megaContainer.classList.add('mega-inset-click');
      }
      
      if (config.adaptiveHeaderTheme) {
        dom.container.classList.add('cse-adaptive-theme');
      }
      
      // Process menus
      processMenuLinks();
      
      // Setup event listeners
      window.addEventListener('resize', handleResize, { passive: true });
      document.addEventListener('keydown', handleKeyDown);
      document.addEventListener('click', handleDocumentClick);
      
      // Mobile setup
      setupMobileMenu();
      
      // Edit mode detection
      if (state.isInIframe) {
        const observer = new MutationObserver((mutations) => {
          mutations.forEach(mutation => {
            if (mutation.target.classList?.contains('sqs-edit-mode-active')) {
              destroy();
            }
          });
        });
        
        observer.observe(dom.container, { attributes: true, attributeFilter: ['class'] });
        cleanup.add(() => observer.disconnect());
      }
      
      state.initialized = true;
    }
    
    function destroy() {
      // Execute all cleanup functions
      cleanup.forEach(fn => fn());
      cleanup.clear();
      
      // Remove event listeners
      window.removeEventListener('resize', handleResize);
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('click', handleDocumentClick);
      if (state.activeMenuId) window.removeEventListener('scroll', handleScroll);
      
      // Remove DOM elements
      dom.megaContainer?.remove();
      
      // Restore themes
      if (dom.header && state.themes.header) {
        dom.header.setAttribute('data-section-theme', state.themes.header);
        dom.header.classList.remove('cse-transparent');
      }
      
      if (dom.headerMenu && state.themes.headerMobile) {
        dom.headerMenu.setAttribute('data-section-theme', state.themes.headerMobile);
      }
      
      // Remove classes
      dom.container.classList.remove('cse-mega-inset', 'cse-adaptive-theme');
      
      // Clear state
      state.initialized = false;
      state.loadCache.clear();
      
      // Remove from global tracking
      window.megaMenuInstances?.delete(instance);
    }
    
    // Create instance
    const instance = { config, state, destroy };
    
    // Global tracking
    if (!window.megaMenuInstances) window.megaMenuInstances = new Set();
    window.megaMenuInstances.add(instance);
    
    // Early prefetch
    prefetchContent();
    
    // Initialize
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }
    
    return instance;
  }
  
  // Export
  window.MegaMenu = MegaMenu;
})();
