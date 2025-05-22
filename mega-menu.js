(function() {
  'use strict';

  /**
   * MegaMenu function
   * @param {Object} options - Configuration options for the mega menu
   */
  function MegaMenu(options = {}) {
    // Default configuration
    const config = {
      clickToShow: false,        // Use click instead of hover to open menus
      folderClickThrough: false, // Allow folder links to be clickable
      showOnMobile: true,        // Show mega menu content in mobile menu
      menuWidth: 'full',         // 'full' or 'inset'
      memberLinks: [],           // Member area links
      adaptiveHeaderTheme: null  // Custom theme for adaptive/dynamic headers when menus are open
    };
    
    // Merge provided options with defaults
    Object.assign(config, options);
    
    // State tracking
    const state = {
      initialized: false,
      activeMenuId: null,
      headerHeight: null,
      headerTheme: null,
      headerMobileTheme: null,  
      loadedMenus: new Set(),
      isInIframe: window.self !== window.top,
      isTouchDevice: detectTouchDevice()
    };
    
    // DOM element cache
    const elements = {
      header: null,
      headerMenu: null,          // Added headerMenu element
      container: null,
      megaContainer: null,
      menuLinks: [],
      mobileFolders: []          // Added mobile folders
    };
    
    // Store timeouts for proper cleanup
    const timeouts = [];
    
    // Utility functions
    const utils = {
      // Debounce function for performance optimization
      debounce: (func, wait) => {
        let timeout;
        return function() {
          const context = this;
          const args = arguments;
          clearTimeout(timeout);
          timeout = setTimeout(() => func.apply(context, args), wait);
        };
      }
    };
    
    /**
     * Detect if the device is a touch device (no mouse cursor)
     * @returns {boolean} - True if the device is a touch device
     */
    function detectTouchDevice() {
      // Primary check: Does the device support touch events?
      const hasTouchEvents = 'ontouchstart' in window || 
                            navigator.maxTouchPoints > 0 ||
                            (navigator.msMaxTouchPoints && navigator.msMaxTouchPoints > 0);
      return hasTouchEvents;
    }
    
    /**
     * Initialize the mega menu system
     */
    function init() {
      // Cache DOM elements
      cacheElements();
      
      // Create mega container
      createMegaContainer();
      
      // Apply menu width setting to body
      applyMenuWidthClass();
      
      // Find and process mega menu links
      processMegaLinks();
      
      // Set up global event listeners
      setupGlobalListeners();
      
      // Set up observer for edit mode
      setupEditModeObserver();
      
      // Set up mobile menu folder change observer - only if showOnMobile is true
      if (config.showOnMobile) {
        setupMobileMenuObserver();
      }
      
      // Mark as initialized
      state.initialized = true;
    }
    
    /**
     * Cache frequently accessed DOM elements
     */
    function cacheElements() {
      elements.header = document.querySelector('#header');
      elements.container = document.querySelector('body');
      
      // Store header theme for later
      if (elements.header) {
        state.headerTheme = elements.header.getAttribute('data-section-theme');
      }
      
      // Only cache mobile-related elements if showOnMobile is true
      if (config.showOnMobile) {
        elements.headerMenu = document.querySelector('#header .header-menu');
        
        // Store mobile header theme
        if (elements.headerMenu) {
          state.headerMobileTheme = elements.headerMenu.getAttribute('data-section-theme');
        }
        
        // Find mobile menu folders that correspond to mega menus
        if (elements.headerMenu) {
          elements.mobileFolders = Array.from(
            elements.headerMenu.querySelectorAll('.header-menu-nav-folder[data-folder^="/mega-"]')
          );
        }
      }
    }
    
    /**
     * Create the mega menu container
     */
    function createMegaContainer() {
      elements.megaContainer = document.createElement('div');
      elements.megaContainer.id = 'mega-container';
      
      // Append to body
      document.body.appendChild(elements.megaContainer);
    }
    
    /**
     * Find and process all potential mega menu links
     */
    function processMegaLinks() {
      // Get standard mega links
      const megaLinks = Array.from(document.querySelectorAll('.header-display-desktop .header-nav-folder-title[href^="/mega-"]'));
      
      // Process member area links if any
      const memberLinks = config.memberLinks.map(memberLinkId => {
        const memberLink = document.querySelector(`.header-display-desktop .header-nav-folder-title[href="${memberLinkId}"]`);
        if (memberLink) {
          memberLink.setAttribute('data-mega-path', '/mega-' + memberLinkId);
          memberLink.classList.add('member-link');
          return memberLink;
        }
        return null;
      }).filter(Boolean);
      
      // Set paths for standard mega links
      megaLinks.forEach(link => {
        link.setAttribute('data-mega-path', link.getAttribute('href'));
      });
      
      // Combine all mega links
      elements.menuLinks = [...megaLinks, ...memberLinks];
      
      // Load all menu content
      loadAllMenuContent();
    }
    
    /**
     * Preload all menu content
     */
    async function loadAllMenuContent() {
      // Process each mega link
      for (const element of elements.menuLinks) {
        try {
          const linkPath = element.getAttribute("data-mega-path").slice(1);
          const isMemberLink = element.classList.contains('member-link');
          
          // Create menu container
          const menuContainer = document.createElement('div');
          menuContainer.id = linkPath;
          menuContainer.className = 'mega-menu-item';
          elements.megaContainer.appendChild(menuContainer);
          
          // Determine page path
          let megaPagePath;
          if (isMemberLink) {
            megaPagePath = element.getAttribute('href');
          } else {
            megaPagePath = linkPath.slice(5);
          }
          
          // Prepare fetch URL
          let fetchUrl = `/mega-page-${megaPagePath}`;
          
          // Fetch content
          const response = await fetch(fetchUrl);
          if (!response.ok) {
            throw new Error(`Failed to load menu content: ${response.status}`);
          }
          
          const html = await response.text();
          
          // Process the menu content
          processMenuContent(menuContainer, element, linkPath, html);
          
          // Don't add mobile content during initial load - we'll do it when menu opens
          // if (config.showOnMobile) {
          //   addContentToMobileMenu(linkPath, html);
          // }
        } catch (error) {
          console.error(`Error loading mega menu content:`, error);
        }
      }
    }
    
    /**
     * Process loaded menu content
     * @param {HTMLElement} container - The container element for the menu
     * @param {HTMLElement} trigger - The trigger element that opens the menu
     * @param {string} linkPath - The path of the link
     * @param {string} html - The HTML content of the menu
     */
    function processMenuContent(container, trigger, linkPath, html) {
      // Check if this menu has already been initialized to prevent duplicate setup
      if (state.loadedMenus.has(linkPath)) {
        console.warn(`Menu ${linkPath} already initialized, skipping redundant setup`);
        return;
      }
      
      // Parse the HTML
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      const firstSection = doc.querySelector('#page .page-section');
      
      // Use requestAnimationFrame for DOM operations to optimize performance
      requestAnimationFrame(() => {
        // Insert only the first section if it exists
        if (firstSection) {
          container.appendChild(firstSection.cloneNode(true));
          
          // Store the section theme from the first section
          const sectionTheme = firstSection.getAttribute('data-section-theme');
          if (sectionTheme) {
            container.setAttribute('data-section-theme', sectionTheme);
          }
        }
        
        // Initialize Squarespace blocks if needed
        if (window.Squarespace && window.Y) {
          try {
             // Page content initialization
             window.Squarespace.initializePageContent(window.Y, window.Y.one(container));
             window.Squarespace.initializeNativeVideo(Y, Y.one(container));     
          } catch (err) {
            console.warn('Failed to initialize Squarespace blocks:', err);
          }
        }
        
        // Mark as loaded
        container.classList.add('mega-menu-loaded');
        state.loadedMenus.add(linkPath);
      });
      
      // Set up the menu trigger
      setupMenuTrigger(trigger, linkPath);
    }
    
    /**
     * Set up event listeners based on configuration
     * @param {HTMLElement} trigger - The trigger element
     * @param {string} menuId - The ID of the menu to open
     */
    function setupMenuTrigger(trigger, menuId) {
      // Set up common attributes for accessibility
      trigger.classList.add('mega-link');
      trigger.setAttribute('aria-haspopup', 'true');
      trigger.setAttribute('aria-controls', menuId);
      trigger.setAttribute('aria-expanded', 'false');
      trigger.parentElement.classList.add("mega-menu");
      
      const menu = document.getElementById(menuId);
      if (!menu) return;
      
      // Set menu attributes
      menu.setAttribute('aria-hidden', 'true');
      
      // Set initial tabindex for all links
      const menuLinks = findFocusableElements(menu);
      menuLinks.forEach(link => {
        link.setAttribute('tabindex', '-1');
      });
      
      // Set up event listeners based on configuration
      if (config.clickToShow === true || config.clickToShow === 'true') {
        // Click to open/close
        trigger.addEventListener('click', (event) => {
          event.preventDefault();
          toggleMenu(trigger, menu);
        });
      } else {
        // Hover to open/close
        const parentElement = trigger.parentElement;
        
        parentElement.addEventListener('mouseenter', () => openMenu(trigger, menu, false), { passive: true });
        parentElement.addEventListener('mouseleave', () => closeMenu(trigger, menu, false), { passive: true });
        
        // Also handle menu hover
        menu.addEventListener('mouseenter', () => openMenu(trigger, menu, false), { passive: true });
        menu.addEventListener('mouseleave', () => closeMenu(trigger, menu, false), { passive: true });
      }
      
      // Handle folder click-through if enabled for hover mode
      if ((config.folderClickThrough === true || config.folderClickThrough === 'true') && 
          !(config.clickToShow === true || config.clickToShow === 'true') && 
          !trigger.classList.contains('member-link')) {
        trigger.addEventListener('click', function(event) {
          const locationLink = this.getAttribute("href").slice(6);
          window.location.href = "/" + locationLink;
        });
      }
      
      // Handle keyboard interaction
      trigger.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          toggleMenu(trigger, menu);
        }
      });
    }
    
    /**
     * Set up observer for mobile folder changes (called after mobile content is loaded)
     */
    function setupMobileFolderObserver() {
      // Skip if showOnMobile is false
      if (!config.showOnMobile || !elements.headerMenu) return;
      
      // Create a mutation observer to detect mobile folder active class changes
      const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          if (mutation.type === 'attributes' && 
              mutation.attributeName === 'class' && 
              mutation.target.classList.contains('header-menu-nav-folder')) {
            
            // Handle folder class change
            handleMobileFolderChange(mutation.target);
          }
        }
      });
      
      // Start observing all mobile folders
      elements.mobileFolders.forEach(folder => {
        observer.observe(folder, {
          attributes: true,
          attributeFilter: ['class']
        });
      });
      
      // Store observer reference for cleanup
      megaMenuInstance.mobileFolderObserver = observer;
    }
    
    /**
     * Add mega menu content to mobile menu (modified to work with existing content)
     * @param {string} linkPath - The path of the link
     * @param {string} html - The HTML content of the menu
     */
    function addContentToMobileMenu(linkPath, html) {
      // Skip if showOnMobile is false
      if (config.showOnMobile === false || config.showOnMobile === 'false') return;
      
      // Find the corresponding mobile folder
      const mobileFolder = elements.mobileFolders.find(folder => 
        folder.getAttribute('data-folder') === `/${linkPath}`
      );
      
      if (!mobileFolder) return;
      
      // Check if content already exists (avoid duplicates)
      if (mobileFolder.querySelector('.mobile-mega-content')) return;
      
      // Parse the HTML from the desktop menu container
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = html;
      const firstSection = tempDiv.querySelector('.page-section');
      
      if (!firstSection) return;
      
      // Create a container for the mega content
      const mobileMenuContainer = document.createElement('div');
      mobileMenuContainer.className = 'mobile-mega-content';
      mobileMenuContainer.setAttribute('data-mega-path', linkPath);
      
      // Store the section theme from the first section for later use
      const sectionTheme = firstSection.getAttribute('data-section-theme');
      if (sectionTheme) {
        mobileMenuContainer.setAttribute('data-section-theme', sectionTheme);
      }
      
      // Insert the section
      mobileMenuContainer.appendChild(firstSection.cloneNode(true));
      
      //Add .btn class to all mega mobile button blocks
      const buttonBlocks = mobileMenuContainer.querySelectorAll('.button-block a');
      buttonBlocks.forEach(buttonBlock => {
        buttonBlock.classList.add('btn');
      });
      
      mobileFolder.appendChild(mobileMenuContainer);
      
      // Initialize Squarespace blocks if needed (using requestIdleCallback for better performance)
      const initializeBlocks = () => {
        if (window.Squarespace && window.Y) {
          try {
            window.Squarespace.initializePageContent(window.Y, window.Y.one(mobileMenuContainer));
          } catch (err) {
            console.warn('Failed to initialize Squarespace blocks in mobile menu:', err);
          }
        }
      };
      
      // Use requestIdleCallback if available, otherwise use setTimeout
      if (window.requestIdleCallback) {
        requestIdleCallback(initializeBlocks);
      } else {
        setTimeout(initializeBlocks, 0);
      }
    }
    
    /**
     * Find all focusable elements within a container
     * @param {HTMLElement} container - The container element
     * @returns {Array} - Array of focusable elements
     */
    function findFocusableElements(container) {
      // These selectors cover all elements that can receive focus
      return Array.from(container.querySelectorAll(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), ' + 
        'textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), [contenteditable], ' +
        '[role="button"]'
      ));
    }
    
    /**
     * Set up a keyboard trap on a menu
     * @param {HTMLElement} menu - The menu element
     * @param {HTMLElement} trigger - The trigger element
     */
    function setupKeyboardTrap(menu, trigger) {
      // Remove any existing handler
      removeKeyboardTrap(menu);
      
      // Create the handler
      const keyboardTrapHandler = (event) => {
        if (event.key === 'Tab') {
          const focusableElements = findFocusableElements(menu);
          
          if (focusableElements.length === 0) return;
          
          const firstElement = focusableElements[0];
          const lastElement = focusableElements[focusableElements.length - 1];
          
          // Handle focus trapping
          if (event.shiftKey && document.activeElement === firstElement) {
            event.preventDefault();
            lastElement.focus();
          } else if (!event.shiftKey && document.activeElement === lastElement) {
            event.preventDefault();
            firstElement.focus();
          }
        } else if (event.key === 'Escape') {
          event.preventDefault();
          closeMenu(trigger, menu);
        }
      };
      
      // Store the handler for cleanup
      menu._keyboardTrapHandler = keyboardTrapHandler;
      
      // Add the event listener
      menu.addEventListener('keydown', keyboardTrapHandler);
    }
    
    /**
     * Remove a keyboard trap from a menu
     * @param {HTMLElement} menu - The menu element
     */
    function removeKeyboardTrap(menu) {
      if (menu._keyboardTrapHandler) {
        menu.removeEventListener('keydown', menu._keyboardTrapHandler);
        menu._keyboardTrapHandler = null;
      }
    }
    
    /**
     * Toggle a menu open or closed
     * @param {HTMLElement} trigger - The trigger element
     * @param {HTMLElement} menu - The menu element
     */
    function toggleMenu(trigger, menu) {
      if (trigger.getAttribute('aria-expanded') === 'true') {
        closeMenu(trigger, menu);
      } else {
        openMenu(trigger, menu);
      }
    }
    
    /**
     * Open a menu
     * @param {HTMLElement} trigger - The trigger element
     * @param {HTMLElement} menu - The menu element
     * @param {boolean} shouldFocus - Whether to focus the first menu item
     */
    function openMenu(trigger, menu, shouldFocus = true) {
      // Check if this menu is already open (prevent duplicate calls)
      if (state.activeMenuId === menu.id) {
        return; // Exit early if menu is already open
      }
      
      // First close any open menu
      if (state.activeMenuId && state.activeMenuId !== menu.id) {
        const currentTrigger = document.querySelector(`.mega-link[aria-controls="${state.activeMenuId}"]`);
        const currentMenu = document.getElementById(state.activeMenuId);
        
        if (currentTrigger && currentMenu) {
          closeMenu(currentTrigger, currentMenu, false);
        }
      }
      
      // Update header height if needed
      updateHeaderHeight();
      
      // Use requestAnimationFrame for DOM updates to optimize performance
      requestAnimationFrame(() => {
        // Update DOM
        trigger.setAttribute('aria-expanded', 'true');
        menu.setAttribute('aria-hidden', 'false');
        menu.classList.add('active');
        
        // Set tabindex for all links
        const menuLinks = findFocusableElements(menu);
        menuLinks.forEach(link => {
          link.setAttribute('tabindex', '0');
        });
        
        // Handle adaptive theme if needed
        const firstSection = menu.querySelector('.page-section:first-child');
        if (firstSection && elements.header) {
          // Check if user has specified a custom adaptive header theme
          if (config.adaptiveHeaderTheme) {
            // If user specified 'transparent' or 'Transparent', add cse-transparent class
            if (config.adaptiveHeaderTheme.toLowerCase() === 'transparent') {
              elements.header.classList.add('cse-transparent');
              // REMOVE the existing theme for transparent mode
            } else {
              // For color themes, only apply if header doesn't have shrink class and is dynamic
              if (elements.header.getAttribute('data-header-style') === 'dynamic' && 
                  !elements.header.classList.contains('shrink')) {
                elements.header.setAttribute('data-section-theme', config.adaptiveHeaderTheme);
              }
            }
          } else if (elements.header.getAttribute('data-header-style') === 'dynamic') {
            // DEFAULT BEHAVIOR: use the menu's theme only for dynamic headers
            const menuTheme = menu.getAttribute('data-section-theme') || 
                              firstSection.getAttribute('data-section-theme');
            if (menuTheme) {
              elements.header.setAttribute('data-section-theme', menuTheme);
            }
          }
        }
        
        // Set up keyboard trap on menu
        setupKeyboardTrap(menu, trigger);
      });
      
      // Focus first link if requested
      if (shouldFocus) {
        const timeoutId = setTimeout(() => {
          const focusableElements = findFocusableElements(menu);
          if (focusableElements.length > 0) {
            focusableElements[0].focus();
          }
        }, 50);
        
        // Store timeout reference for cleanup
        timeouts.push(timeoutId);
      }
      
      // Always add scroll listener - hide on scroll is now always enabled
      window.addEventListener('scroll', handleScroll, { passive: true });
      
      // Track active menu
      state.activeMenuId = menu.id;
    }
    
    /**
     * Close a menu
     * @param {HTMLElement} trigger - The trigger element
     * @param {HTMLElement} menu - The menu element
     * @param {boolean} shouldFocus - Whether to focus the trigger element
     */
    function closeMenu(trigger, menu, shouldFocus = true) {
      // Remove keyboard trap from menu
      removeKeyboardTrap(menu);
      
      // Check if focus is within the menu
      const isMenuContainsFocus = menu.contains(document.activeElement);
      
      // If focus is within the menu, move it to the trigger before hiding
      if (isMenuContainsFocus) {
        trigger.focus();
      }
      
      // Use requestAnimationFrame for DOM updates to optimize performance
      requestAnimationFrame(() => {
        // Reset tabindex for all links before setting aria-hidden
        // This ensures no focusable elements remain in the hidden menu
        const menuLinks = findFocusableElements(menu);
        menuLinks.forEach(link => {
          link.setAttribute('tabindex', '-1');
        });
        
        // Update DOM
        trigger.setAttribute('aria-expanded', 'false');
        menu.setAttribute('aria-hidden', 'true');
        menu.classList.remove('active');
        
        // Restore header theme if needed
        if (elements.header) {
          // Check if adaptiveHeaderTheme is transparent
          if (config.adaptiveHeaderTheme && config.adaptiveHeaderTheme.toLowerCase() === 'transparent') {
            // Remove the cse-transparent class when closing
            elements.header.classList.remove('cse-transparent');
            // Restore the original header theme
            if (state.headerTheme) {
              elements.header.setAttribute('data-section-theme', state.headerTheme);
            }
          } else if (elements.header.getAttribute('data-header-style') === 'dynamic') {
            // For other themes, restore original theme only for dynamic headers
            elements.header.setAttribute('data-section-theme', state.headerTheme);
          }
        }
      });
      
      // Focus trigger if requested and we didn't already do it above
      if (shouldFocus && !isMenuContainsFocus) {
        // Small delay helps avoid focus issues during animation
        const timeoutId = setTimeout(() => {
          trigger.focus();
        }, 10);
        
        // Store timeout reference for cleanup
        timeouts.push(timeoutId);
      }
      
      // Always remove scroll listener when menu is closed
      window.removeEventListener('scroll', handleScroll);
      
      // Clear active menu
      state.activeMenuId = null;
    }
    
    /**
     * Apply menu width class to body based on configuration
     */
    function applyMenuWidthClass() {
      if (config.menuWidth === 'inset') {
        document.body.classList.add('cse-mega-inset');
        
        // Add mega-inset-click class to mega-container if clickToShow is true
        if (elements.megaContainer && 
            (config.clickToShow === true || config.clickToShow === 'true')) {
          elements.megaContainer.classList.add('mega-inset-click');
        }
      } else {
        document.body.classList.remove('cse-mega-inset');
        if (elements.megaContainer) {
          elements.megaContainer.classList.remove('mega-inset-click');
        }
      }
      
      // Add adaptive theme class if adaptiveHeaderTheme is set
      if (config.adaptiveHeaderTheme) {
        document.body.classList.add('cse-adaptive-theme');
      }
    }
    
    /**
     * Update cached header height
     */
    function updateHeaderHeight() {
      if (elements.header) {
        const headerRect = elements.header.getBoundingClientRect();
        state.headerHeight = headerRect.height;
        document.body.style.setProperty('--csemegaheaderheight', `${state.headerHeight}px`);
      }
    }
    
    /**
     * Set up global event listeners
     */
    function setupGlobalListeners() {
      // Window resize handler
      window.addEventListener('resize', utils.debounce(handleResize, 100), { passive: true });
      
      // Document keydown for Escape key
      document.addEventListener('keydown', handleKeyDown);
      
      // Document click for closing on outside click
      document.addEventListener('click', handleDocumentClick);
    }
    
    /**
     * Set up observer for edit mode
     */
    function setupEditModeObserver() {  
      // Check if page is in an iframe - likely Squarespace edit mode
      const isInIframe = window.self !== window.top;
      
      // Only set up observer if in an iframe
      if (!isInIframe) {
        return; // Skip observer setup for live site
      }
      // Create a mutation observer to detect edit mode
      const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          if ((!mutation.oldValue || !mutation.oldValue.match(/\bsqs-edit-mode-active\b/)) && 
              mutation.target.classList && 
              mutation.target.classList.contains('sqs-edit-mode-active')) {
            
            // Clean up when entering edit mode
            destroy();
            break;
          }
        }
      });
      
      // Start observing
      if (elements.container) {
        observer.observe(elements.container, {
          attributes: true,
          attributeOldValue: true,
          attributeFilter: ['class']
        });
      }
      
      // Store observer reference for cleanup
      megaMenuInstance.editModeObserver = observer;
    }
    
    /**
     * Set up observer for mobile menu open/close and lazy load content
     */
    function setupMobileMenuObserver() {
      // Skip if showOnMobile is false
      if (!config.showOnMobile || !elements.headerMenu) return;
      
      // Create observer to watch for mobile menu open/close
      const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          if (mutation.type === 'attributes' && 
              mutation.attributeName === 'class' && 
              mutation.target === elements.container) {
            
            if (elements.container.classList.contains('header--menu-open')) {
              // Menu opened - load mobile content
              loadMobileContent();
            } else {
              // Menu closed - clean up mobile content
              cleanupMobileContent();
            }
          }
        }
      });
      
      // Watch for mobile menu state changes
      observer.observe(elements.container, {
        attributes: true,
        attributeFilter: ['class']
      });
      
      // Store observer reference for cleanup
      megaMenuInstance.mobileMenuObserver = observer;
    }
    
    /**
     * Load mobile content when menu opens
     */
    function loadMobileContent() {
      // Use requestIdleCallback for better performance if available
      const loadContent = () => {
        elements.menuLinks.forEach(element => {
          const linkPath = element.getAttribute("data-mega-path").slice(1);
          const menuContainer = document.getElementById(linkPath);
          
          if (menuContainer) {
            // Get the HTML from the existing menu container
            const html = menuContainer.innerHTML;
            
            // Add content to mobile menu
            addContentToMobileMenu(linkPath, html);
          }
        });
        
        // Set up folder change observer after content is loaded
        setupMobileFolderObserver();
      };
      
      // Use requestIdleCallback if available, otherwise use setTimeout
      if (window.requestIdleCallback) {
        requestIdleCallback(loadContent);
      } else {
        setTimeout(loadContent, 0);
      }
    }
    
    /**
     * Clean up mobile content when menu closes
     */
    function cleanupMobileContent() {
      // Disconnect folder observer
      if (megaMenuInstance.mobileFolderObserver) {
        megaMenuInstance.mobileFolderObserver.disconnect();
        megaMenuInstance.mobileFolderObserver = null;
      }
      
      // Remove all mobile mega content
      elements.mobileFolders.forEach(folder => {
        const mobileContents = folder.querySelectorAll('.mobile-mega-content');
        mobileContents.forEach(content => {
          content.remove();
        });
      });
      
      // Restore original mobile menu theme
      if (elements.headerMenu && state.headerMobileTheme) {
        elements.headerMenu.setAttribute('data-section-theme', state.headerMobileTheme);
        elements.header.setAttribute('data-section-theme', state.headerMobileTheme);
      }
    }
    
    /**
     * Handle mobile folder active state changes
     * @param {HTMLElement} folder - The folder that changed
     */
    function handleMobileFolderChange(folder) {
      // Skip if showOnMobile is false
      if (!elements.container.classList.contains('header--menu-open') || !config.showOnMobile || !elements.headerMenu) return;
      
      const isActive = folder.classList.contains('header-menu-nav-folder--active');
      const megaPath = folder.getAttribute('data-folder');
      
      if (isActive && megaPath) {
        // Find the mega content to get the theme
        const megaContent = folder.querySelector('.mobile-mega-content');
        if (megaContent) {
          const theme = megaContent.getAttribute('data-section-theme');
          if (theme) {
            // Apply theme to header menu
            elements.headerMenu.setAttribute('data-section-theme', theme);
            elements.header.setAttribute('data-section-theme', theme);
          }
        }
      } else {
        // Restore original theme
        if (state.headerMobileTheme) {
          elements.headerMenu.setAttribute('data-section-theme', state.headerMobileTheme);
          elements.header.setAttribute('data-section-theme', state.headerMobileTheme);
        }
      }
    }
    
    /**
     * Handle window resize event
     */
    function handleResize() {
      // Reset cached header height on resize
      state.headerHeight = null;     
      // Update header height if a menu is open
      if (state.activeMenuId) {
        updateHeaderHeight();
      }
    }
    
    /**
     * Handle document keydown for Escape key
     * @param {KeyboardEvent} event - The keydown event
     */
    function handleKeyDown(event) {
      if (event.key === 'Escape' && state.activeMenuId) {
        const trigger = document.querySelector(`.mega-link[aria-controls="${state.activeMenuId}"]`);
        const menu = document.getElementById(state.activeMenuId);
        
        if (trigger && menu) {
          closeMenu(trigger, menu);
        }
      }
    }
    
    /**
     * Handle document click for closing on outside click
     * @param {MouseEvent} event - The click event
     */
    function handleDocumentClick(event) {
      if (!state.activeMenuId) return;   
      const menu = document.getElementById(state.activeMenuId);
      const trigger = document.querySelector(`.mega-link[aria-controls="${state.activeMenuId}"]`);     
      if (menu && trigger && !menu.contains(event.target) && !trigger.contains(event.target)) {
        closeMenu(trigger, menu, false);
      }
    }
    
    /**
     * Handle scroll event for closing menu on scroll
     * Always enabled now
     */
    function handleScroll() {
      if (!state.activeMenuId) return;    
      const menu = document.getElementById(state.activeMenuId);
      if (!menu) return;
      const section = menu.querySelector('.page-section');
      if (section) {
        const trigger = document.querySelector(`.mega-link[aria-controls="${state.activeMenuId}"]`);
        if (trigger) {
          closeMenu(trigger, menu, false);
        }
      }
    }
    
    /**
     * Clean up and destroy the mega menu instance
     */
    function destroy() {
      // Clean up all timeouts
      timeouts.forEach(clearTimeout);
      timeouts.length = 0;
      
      // Clean up global event listeners
      window.removeEventListener('resize', handleResize);
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('click', handleDocumentClick);
      
      // Always remove scroll event listener if menu is active
      if (state.activeMenuId) {
        window.removeEventListener('scroll', handleScroll);
      }
      
      // Clean up all menu-related event listeners
      elements.menuLinks.forEach(trigger => {
        const menuId = trigger.getAttribute('aria-controls');
        if (!menuId) return;
        
        const menu = document.getElementById(menuId);
        if (!menu) return;
        
        // Clean up trigger event listeners
        const triggerClone = trigger.cloneNode(true);
        trigger.parentNode.replaceChild(triggerClone, trigger);
        
        // Clean up menu event listeners
        const menuClone = menu.cloneNode(true);
        if (menu.parentNode) {
          menu.parentNode.replaceChild(menuClone, menu);
        }
      });
      
      // Clean up mobile menu content if showOnMobile is true
      if (config.showOnMobile && elements.mobileFolders && elements.mobileFolders.length) {
        elements.mobileFolders.forEach(folder => {
          // Find and remove all mobile mega content elements
          const mobileContents = folder.querySelectorAll('.mobile-mega-content');
          mobileContents.forEach(content => {
            content.remove();
          });
        });
      }
      
      // Disconnect mobile menu observer if showOnMobile is true
      if (config.showOnMobile && megaMenuInstance.mobileMenuObserver) {
        megaMenuInstance.mobileMenuObserver.disconnect();
        megaMenuInstance.mobileMenuObserver = null;
      }
      
      // Disconnect mobile folder observer if showOnMobile is true
      if (config.showOnMobile && megaMenuInstance.mobileFolderObserver) {
        megaMenuInstance.mobileFolderObserver.disconnect();
        megaMenuInstance.mobileFolderObserver = null;
      }
      
      // Stop observing DOM changes
      if (megaMenuInstance.editModeObserver) {
        megaMenuInstance.editModeObserver.disconnect();
        megaMenuInstance.editModeObserver = null;
      }
      
      // Remove mega container from DOM
      if (elements.megaContainer) {
        elements.megaContainer.remove();
      }
      
      // Restore original header theme if needed
      if (elements.header && state.headerTheme) {
        elements.header.setAttribute('data-section-theme', state.headerTheme);
      }
      
      // Remove cse-transparent class if it was added
      if (elements.header && config.adaptiveHeaderTheme && config.adaptiveHeaderTheme.toLowerCase() === 'transparent') {
        elements.header.classList.remove('cse-transparent');
      }
      
      // Restore original mobile menu theme if needed (only if showOnMobile is true)
      if (config.showOnMobile && elements.headerMenu && state.headerMobileTheme) {
        elements.headerMenu.setAttribute('data-section-theme', state.headerMobileTheme);
      }
      
      // Remove adaptive theme class if it was added
      if (config.adaptiveHeaderTheme) {
        document.body.classList.remove('cse-adaptive-theme');
      }
      
      // Remove from instance tracking
      if (window.megaMenuInstances) {
        window.megaMenuInstances.delete(megaMenuInstance);
      }
      
      // Clear references to allow garbage collection
      state.initialized = false;
    }
    
    // Create the instance object
    const megaMenuInstance = {
      config,
      state,
      elements,
      destroy,
      editModeObserver: null,
      mobileMenuObserver: null,
      mobileFolderObserver: null
    };
    
    // Add to instance tracking for proper cleanup
    if (!window.megaMenuInstances) {
      window.megaMenuInstances = new Set();
    }
    window.megaMenuInstances.add(megaMenuInstance);
    
    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }
    
    // Return the instance for external access if needed
    return megaMenuInstance;
  }
  
  // Expose to global scope
  window.MegaMenu = MegaMenu;
})();
