(function() {
  'use strict';

  /**
   * MegaMenu constructor
   * @param {Object} options - Configuration options for the mega menu
   */
  class MegaMenu {
    constructor(options = {}) {
      // Default configuration
      this.config = {
        clickToShow: false,        // Use click instead of hover to open menus
        folderClickThrough: false, // Allow folder links to be clickable
        showOnMobile: true,        // Show mega menu content in mobile menu
        menuWidth: 'full',         // 'full' or 'inset'
        memberLinks: []            // Member area links            
      };
      
      // Merge provided options with defaults
      Object.assign(this.config, options);
      
      // State tracking
      this.state = {
        initialized: false,
        activeMenuId: null,
        headerHeight: null,
        headerTheme: null,
        headerMobileTheme: null,  
        loadedMenus: new Set(),
        isInIframe: window.self !== window.top,
        isTouchDevice: this.detectTouchDevice()
      };
      
      // DOM element cache
      this.elements = {
        header: null,
        headerMenu: null,          // Added headerMenu element
        container: null,
        megaContainer: null,
        menuLinks: [],
        mobileFolders: []          // Added mobile folders
      };
      
      // Store timeouts for proper cleanup
      this.timeouts = [];
      
      // Utility functions
      this.utils = {
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
      
      // Event handlers object to store references for proper cleanup
      this.handlers = {
        keydown: this.handleKeyDown.bind(this),
        click: this.handleDocumentClick.bind(this),
        scroll: this.handleScroll.bind(this),
        mobileFolderChange: this.handleMobileFolderChange.bind(this) // Added handler for mobile folders
      };
      
      // Use debounced version for resize handler
      this.handlers.resize = this.utils.debounce(this.handleResize.bind(this), 100);
      
      // Add to instance tracking for proper cleanup
      if (!window.megaMenuInstances) {
        window.megaMenuInstances = new Set();
      }
      window.megaMenuInstances.add(this);
      
      // Initialize when DOM is ready
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', this.init.bind(this));
      } else {
        this.init();
      }
    }
    
    /**
     * Detect if the device is a touch device (no mouse cursor)
     * @returns {boolean} - True if the device is a touch device
     */
    detectTouchDevice() {
      // Primary check: Does the device support touch events?
      const hasTouchEvents = 'ontouchstart' in window || 
                            navigator.maxTouchPoints > 0 ||
                            (navigator.msMaxTouchPoints && navigator.msMaxTouchPoints > 0);
      return hasTouchEvents;
    }
    
    /**
     * Initialize the mega menu system
     */
    init() {
      // Cache DOM elements
      this.cacheElements();
      
      // Create mega container
      this.createMegaContainer();
      
      // Apply menu width setting to body
      this.applyMenuWidthClass();
      
      // Find and process mega menu links
      this.processMegaLinks();
      
      // Set up global event listeners
      this.setupGlobalListeners();
      
      // Set up observer for edit mode
      this.setupEditModeObserver();
      
      // Set up mobile menu folder change observer - only if showOnMobile is true
      if (this.config.showOnMobile) {
        this.setupMobileFolderObserver();
      }
      
      // Mark as initialized
      this.state.initialized = true;
    }
    
    /**
     * Cache frequently accessed DOM elements
     */
    cacheElements() {
      this.elements.header = document.querySelector('#header');
      this.elements.container = document.querySelector('body');
      
      // Store header theme for later
      if (this.elements.header) {
        this.state.headerTheme = this.elements.header.getAttribute('data-section-theme');
      }
      
      // Only cache mobile-related elements if showOnMobile is true
      if (this.config.showOnMobile) {
        this.elements.headerMenu = document.querySelector('#header .header-menu');
        
        // Store mobile header theme
        if (this.elements.headerMenu) {
          this.state.headerMobileTheme = this.elements.headerMenu.getAttribute('data-section-theme');
        }
        
        // Find mobile menu folders that correspond to mega menus
        if (this.elements.headerMenu) {
          this.elements.mobileFolders = Array.from(
            this.elements.headerMenu.querySelectorAll('.header-menu-nav-folder[data-folder^="/mega-"]')
          );
        }
      }
    }
    
    /**
     * Create the mega menu container
     */
    createMegaContainer() {
      this.elements.megaContainer = document.createElement('div');
      this.elements.megaContainer.id = 'mega-container';
      
      // Append to body
      document.body.appendChild(this.elements.megaContainer);
      
    }
    
    /**
     * Find and process all potential mega menu links
     */
    processMegaLinks() {
      // Get standard mega links
      const megaLinks = Array.from(document.querySelectorAll('.header-display-desktop .header-nav-folder-title[href^="/mega-"]'));
      
      // Process member area links if any
      const memberLinks = this.config.memberLinks.map(memberLinkId => {
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
      this.elements.menuLinks = [...megaLinks, ...memberLinks];
      
      // Load all menu content
      this.loadAllMenuContent();
    }
    
    /**
     * Preload all menu content
     */
    async loadAllMenuContent() {
      // Process each mega link
      for (const element of this.elements.menuLinks) {
        try {
          const linkPath = element.getAttribute("data-mega-path").slice(1);
          const isMemberLink = element.classList.contains('member-link');
          
          // Create menu container
          const menuContainer = document.createElement('div');
          menuContainer.id = linkPath;
          menuContainer.className = 'mega-menu-item';
          this.elements.megaContainer.appendChild(menuContainer);
          
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
          this.processMenuContent(menuContainer, element, linkPath, html);
          
          // Add the same content to mobile menu if showOnMobile is true and a matching folder exists
          if (this.config.showOnMobile) {
            this.addContentToMobileMenu(linkPath, html);
          }
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
    processMenuContent(container, trigger, linkPath, html) {
      // Check if this menu has already been initialized to prevent duplicate setup
      if (this.state.loadedMenus.has(linkPath)) {
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
        this.state.loadedMenus.add(linkPath);
      });
      
      // Set up the menu trigger
      this.setupMenuTrigger(trigger, linkPath);
    }
    
  
    /**
     * Set up event listeners based on configuration
     * @param {HTMLElement} trigger - The trigger element
     * @param {string} menuId - The ID of the menu to open
     */
    setupMenuTrigger(trigger, menuId) {
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
      const menuLinks = this.findFocusableElements(menu);
      menuLinks.forEach(link => {
        link.setAttribute('tabindex', '-1');
      });
      
      // Set up event listeners based on configuration
      if (this.config.clickToShow === true || this.config.clickToShow === 'true') {
        // Click to open/close
        trigger.addEventListener('click', (event) => {
          event.preventDefault();
          this.toggleMenu(trigger, menu);
        });
      } else {
        // Hover to open/close
        const parentElement = trigger.parentElement;
        
        parentElement.addEventListener('mouseenter', () => this.openMenu(trigger, menu, false), { passive: true });
        parentElement.addEventListener('mouseleave', () => this.closeMenu(trigger, menu, false), { passive: true });
        
        // Also handle menu hover
        menu.addEventListener('mouseenter', () => this.openMenu(trigger, menu, false), { passive: true });
        menu.addEventListener('mouseleave', () => this.closeMenu(trigger, menu, false), { passive: true });
      }
      
      // Handle folder click-through if enabled for hover mode
      if ((this.config.folderClickThrough === true || this.config.folderClickThrough === 'true') && 
          !(this.config.clickToShow === true || this.config.clickToShow === 'true') && 
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
          this.toggleMenu(trigger, menu);
        }
      });
    }
    
       /**
     * Add mega menu content to mobile menu
     * @param {string} linkPath - The path of the link
     * @param {string} html - The HTML content of the menu
     */
    addContentToMobileMenu(linkPath, html) {
      // Skip if showOnMobile is false
      if (this.config.showOnMobile === false || this.config.showOnMobile === 'false') return;
      
      // Find the corresponding mobile folder
      const mobileFolder = this.elements.mobileFolders.find(folder => 
        folder.getAttribute('data-folder') === `/${linkPath}`
      );
      
      if (!mobileFolder) return;
      
      // Parse the HTML
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      const firstSection = doc.querySelector('#page .page-section');
      
      // Create a container for the mega content
      const mobileMenuContainer = document.createElement('div');
      mobileMenuContainer.className = 'mobile-mega-content';
      mobileMenuContainer.setAttribute('data-mega-path', linkPath);
      
      // Store the section theme from the first section for later use
      if (firstSection) {
        const sectionTheme = firstSection.getAttribute('data-section-theme');
        if (sectionTheme) {
          mobileMenuContainer.setAttribute('data-section-theme', sectionTheme);
        }
      }  

      // Insert only the first section
        mobileMenuContainer.appendChild(firstSection.cloneNode(true));
      
      //Add .btn class to all mega mobile button blocks
      const buttonBlocks = mobileMenuContainer.querySelectorAll('.button-block a');
      buttonBlocks.forEach(buttonBlock => {
        buttonBlock.classList.add('btn');
      });
      
      mobileFolder.appendChild(mobileMenuContainer);
      
          // Initialize Squarespace blocks if needed
      if (window.Squarespace && window.Y) {
        try {
window.Squarespace.initializePageContent(window.Y, window.Y.one(mobileMenuContainer));
        
        } catch (err) {
          console.warn('Failed to initialize Squarespace blocks in mobile menu:', err);
        }
      }
    }
    
    
    /**
     * Find all focusable elements within a container
     * @param {HTMLElement} container - The container element
     * @returns {Array} - Array of focusable elements
     */
    findFocusableElements(container) {
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
    setupKeyboardTrap(menu, trigger) {
      // Remove any existing handler
      this.removeKeyboardTrap(menu);
      
      // Create the handler
      const keyboardTrapHandler = (event) => {
        if (event.key === 'Tab') {
          const focusableElements = this.findFocusableElements(menu);
          
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
          this.closeMenu(trigger, menu);
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
    removeKeyboardTrap(menu) {
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
    toggleMenu(trigger, menu) {
      if (trigger.getAttribute('aria-expanded') === 'true') {
        this.closeMenu(trigger, menu);
      } else {
        this.openMenu(trigger, menu);
      }
    }
    
    /**
     * Open a menu
     * @param {HTMLElement} trigger - The trigger element
     * @param {HTMLElement} menu - The menu element
     * @param {boolean} shouldFocus - Whether to focus the first menu item
     */
    openMenu(trigger, menu, shouldFocus = true) {
      // First close any open menu
      if (this.state.activeMenuId && this.state.activeMenuId !== menu.id) {
        const currentTrigger = document.querySelector(`.mega-link[aria-controls="${this.state.activeMenuId}"]`);
        const currentMenu = document.getElementById(this.state.activeMenuId);
        
        if (currentTrigger && currentMenu) {
          this.closeMenu(currentTrigger, currentMenu, false);
        }
      }
      
      // Update header height if needed
      this.updateHeaderHeight();
      
      // Use requestAnimationFrame for DOM updates to optimize performance
      requestAnimationFrame(() => {
        // Update DOM
        trigger.setAttribute('aria-expanded', 'true');
        menu.setAttribute('aria-hidden', 'false');
        menu.classList.add('active');
        
        // Set tabindex for all links
        const menuLinks = this.findFocusableElements(menu);
        menuLinks.forEach(link => {
          link.setAttribute('tabindex', '0');
        });
        
        // Handle adaptive theme if needed
        const firstSection = menu.querySelector('.page-section:first-child');
        if (firstSection) {        
          if (this.elements.header && this.elements.header.getAttribute('data-header-style') === 'dynamic') {
            const menuTheme = menu.getAttribute('data-section-theme') || 
                              firstSection.getAttribute('data-section-theme');
            if (menuTheme) {
              this.elements.header.setAttribute('data-section-theme', menuTheme);
            }
          }
        }
        
        // Set up keyboard trap on menu
        this.setupKeyboardTrap(menu, trigger);
      });
      
      // Focus first link if requested
      if (shouldFocus) {
        const timeoutId = setTimeout(() => {
          const focusableElements = this.findFocusableElements(menu);
          if (focusableElements.length > 0) {
            focusableElements[0].focus();
          }
        }, 50);
        
        // Store timeout reference for cleanup
        this.timeouts.push(timeoutId);
      }
      
      // Always add scroll listener - hide on scroll is now always enabled
      window.addEventListener('scroll', this.handlers.scroll, { passive: true });
      
      // Track active menu
      this.state.activeMenuId = menu.id;
    }
    
    /**
     * Close a menu
     * @param {HTMLElement} trigger - The trigger element
     * @param {HTMLElement} menu - The menu element
     * @param {boolean} shouldFocus - Whether to focus the trigger element
     */
    closeMenu(trigger, menu, shouldFocus = true) {
      // Remove keyboard trap from menu
      this.removeKeyboardTrap(menu);
      
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
        const menuLinks = this.findFocusableElements(menu);
        menuLinks.forEach(link => {
          link.setAttribute('tabindex', '-1');
        });
        
        // Update DOM
        trigger.setAttribute('aria-expanded', 'false');
        menu.setAttribute('aria-hidden', 'true');
        menu.classList.remove('active');
        
        // Restore header theme if needed
        if (this.elements.header && this.elements.header.getAttribute('data-header-style') === 'dynamic') {
          this.elements.header.setAttribute('data-section-theme', this.state.headerTheme);
        }
      });
      
      // Focus trigger if requested and we didn't already do it above
      if (shouldFocus && !isMenuContainsFocus) {
        // Small delay helps avoid focus issues during animation
        const timeoutId = setTimeout(() => {
          trigger.focus();
        }, 10);
        
        // Store timeout reference for cleanup
        this.timeouts.push(timeoutId);
      }
      
      // Always remove scroll listener when menu is closed
      window.removeEventListener('scroll', this.handlers.scroll);
      
      // Clear active menu
      this.state.activeMenuId = null;
    }
    
    /**
     * Apply menu width class to body based on configuration
     */
      applyMenuWidthClass() {
      if (this.config.menuWidth === 'inset') {
        document.body.classList.add('cse-mega-inset');
        
        // Add mega-inset-click class to mega-container if clickToShow is true
        if (this.elements.megaContainer && 
            (this.config.clickToShow === true || this.config.clickToShow === 'true')) {
          this.elements.megaContainer.classList.add('mega-inset-click');
        }
      } else {
        document.body.classList.remove('cse-mega-inset');
        if (this.elements.megaContainer) {
          this.elements.megaContainer.classList.remove('mega-inset-click');
        }
      }
    }
    
    /**
     * Update cached header height
     */
    updateHeaderHeight() {
      if (this.elements.header) {
        const headerRect = this.elements.header.getBoundingClientRect();
    	  this.state.headerHeight = headerRect.height;
        document.body.style.setProperty('--csemegaheaderheight', `${this.state.headerHeight}px`);
      }
    }
    
    /**
     * Set up global event listeners
     */
    setupGlobalListeners() {
      // Window resize handler
      window.addEventListener('resize', this.handlers.resize, { passive: true });
      
      // Document keydown for Escape key
      document.addEventListener('keydown', this.handlers.keydown);
      
      // Document click for closing on outside click
      document.addEventListener('click', this.handlers.click);
    }
    
    /**
     * Set up observer for edit mode
     */
    setupEditModeObserver() {  
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
            this.destroy();
            break;
          }
        }
      });
      
      // Start observing
      if (this.elements.container) {
        observer.observe(this.elements.container, {
          attributes: true,
          attributeOldValue: true,
          attributeFilter: ['class']
        });
      }
      
      // Store observer reference for cleanup
      this.editModeObserver = observer;
    }
    
    /**
     * Set up observer for mobile folder changes
     */
    setupMobileFolderObserver() {
      // Skip if showOnMobile is false
      if (!this.config.showOnMobile || !this.elements.headerMenu) return;
      
      // Create a mutation observer to detect mobile folder active class changes
      const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          if (mutation.type === 'attributes' && 
              mutation.attributeName === 'class' && 
              mutation.target.classList.contains('header-menu-nav-folder')) {
            
            // Handle folder class change
            this.handleMobileFolderChange(mutation.target);
          }
        }
      });
      
      // Start observing all mobile folders
      this.elements.mobileFolders.forEach(folder => {
        observer.observe(folder, {
          attributes: true,
          attributeFilter: ['class']
        });
      });
      
      // Store observer reference for cleanup
      this.mobileFolderObserver = observer;
    }
    
    /**
     * Handle mobile folder active state changes
     * @param {HTMLElement} folder - The folder that changed
     */
    handleMobileFolderChange(folder) {
      // Skip if showOnMobile is false
      if (!this.elements.container.classList.contains('header--menu-open') || !this.config.showOnMobile || !this.elements.headerMenu) return;
      
      const isActive = folder.classList.contains('header-menu-nav-folder--active');
      const megaPath = folder.getAttribute('data-folder');
      
      if (isActive && megaPath) {
        // Find the mega content to get the theme
        const megaContent = folder.querySelector('.mobile-mega-content');
        if (megaContent) {
          const theme = megaContent.getAttribute('data-section-theme');
          if (theme) {
            // Apply theme to header menu
            this.elements.headerMenu.setAttribute('data-section-theme', theme);
            this.elements.header.setAttribute('data-section-theme', theme);
          }
        }
      } else {
        // Restore original theme
        if (this.state.headerMobileTheme) {
          this.elements.headerMenu.setAttribute('data-section-theme', this.state.headerMobileTheme);
          this.elements.header.setAttribute('data-section-theme', this.state.headerMobileTheme);
        }
      }
    }
    
    /**
     * Handle window resize event
     */
    handleResize() {
      // Reset cached header height on resize
      this.state.headerHeight = null;     
      // Update header height if a menu is open
      if (this.state.activeMenuId) {
        this.updateHeaderHeight();
      }
    }
    
    /**
     * Handle document keydown for Escape key
     * @param {KeyboardEvent} event - The keydown event
     */
    handleKeyDown(event) {
      if (event.key === 'Escape' && this.state.activeMenuId) {
        const trigger = document.querySelector(`.mega-link[aria-controls="${this.state.activeMenuId}"]`);
        const menu = document.getElementById(this.state.activeMenuId);
        
        if (trigger && menu) {
          this.closeMenu(trigger, menu);
        }
      }
    }
    
    /**
     * Handle document click for closing on outside click
     * @param {MouseEvent} event - The click event
     */
    handleDocumentClick(event) {
      if (!this.state.activeMenuId) return;   
      const menu = document.getElementById(this.state.activeMenuId);
      const trigger = document.querySelector(`.mega-link[aria-controls="${this.state.activeMenuId}"]`);     
      if (menu&&trigger&&!menu.contains(event.target)&&!trigger.contains(event.target)) {
        this.closeMenu(trigger, menu, false);
      }
    }
    
    /**
     * Handle scroll event for closing menu on scroll
     * Always enabled now
     */
      handleScroll() {
      if (!this.state.activeMenuId) return;    
      const menu = document.getElementById(this.state.activeMenuId);
      if (!menu) return;
      const section = menu.querySelector('.page-section');
      if (section) {
        const trigger = document.querySelector(`.mega-link[aria-controls="${this.state.activeMenuId}"]`);
        if (trigger) {
          this.closeMenu(trigger, menu, false);
        }
      }
    }
    
   /**
    * Clean up and destroy the mega menu instance
    */
   destroy() {
     // Clean up all timeouts
     this.timeouts.forEach(clearTimeout);
     this.timeouts = [];
     
     // Clean up global event listeners
     window.removeEventListener('resize', this.handlers.resize);
     document.removeEventListener('keydown', this.handlers.keydown);
     document.removeEventListener('click', this.handlers.click);
     
     // Always remove scroll event listener if menu is active
     if (this.state.activeMenuId) {
       window.removeEventListener('scroll', this.handlers.scroll);
     }
     
     // Clean up all menu-related event listeners
     this.elements.menuLinks.forEach(trigger => {
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
     if (this.config.showOnMobile && this.elements.mobileFolders && this.elements.mobileFolders.length) {
       this.elements.mobileFolders.forEach(folder => {
         // Find and remove all mobile mega content elements
         const mobileContents = folder.querySelectorAll('.mobile-mega-content');
         mobileContents.forEach(content => {
           content.remove();
         });
       });
     }
     
     // Disconnect mobile folder observer if showOnMobile is true
     if (this.config.showOnMobile && this.mobileFolderObserver) {
       this.mobileFolderObserver.disconnect();
       this.mobileFolderObserver = null;
     }
     
     // Stop observing DOM changes
     if (this.editModeObserver) {
       this.editModeObserver.disconnect();
       this.editModeObserver = null;
     }
     
     // Remove mega container from DOM
     if (this.elements.megaContainer) {
       this.elements.megaContainer.remove();
     }
     
     // Restore original header theme if needed
     if (this.elements.header && this.state.headerTheme) {
       this.elements.header.setAttribute('data-section-theme', this.state.headerTheme);
     }
     
     // Restore original mobile menu theme if needed (only if showOnMobile is true)
     if (this.config.showOnMobile && this.elements.headerMenu && this.state.headerMobileTheme) {
       this.elements.headerMenu.setAttribute('data-section-theme', this.state.headerMobileTheme);
     }
     
     // Remove from instance tracking
     if (window.megaMenuInstances) {
       window.megaMenuInstances.delete(this);
     }
     
     // Clear references to allow garbage collection
     this.handlers = null;
     this.elements = null;
     this.config = null;
     this.state.initialized = false;
   }
  }
  
  // Expose to global scope
  window.MegaMenu = MegaMenu;
})();
