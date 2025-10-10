/**
 * @typedef {Object} SidebarFlyoutConfig
 * @property {string} [menuTitle]
 * @property {number} [offset]
 * @property {string} [placement]
 * @property {boolean} [fixed]
 * @property {Array<SidebarFlyoutButtonConfig>} [buttonConfigs]
 */

/**
 * @typedef {Object} SidebarFlyoutButtonConfig
 * @property {string} title
 * @property {string} icon
 * @property {Object} action
 * @property {string} action.href
 * @property {string} action.target
 * @property {string} action.swap
 */

/**
 * @constant
 * @type {SidebarFlyoutConfig}
 */
const configSidebarUserMenu = {
    menuTitle: "User",
    offset: 20,
    buttonConfigs: [ {
        title: "Profile",
        icon: "person",
        action: {
            href: "/app/profile",
            target: "#ti-content",
            swap: "innerHTML"
        }
    }, {
        title: "Logout",
        icon: "logout",
        action: {
            href: "/logout",
            method: "post",
            target: "body",
            swap: "outerHTML"
        }
    } ]
};

/**
 * @constant
 * @type {SidebarFlyoutConfig}
 */
const configSidebarAdministrationMenu = {
    menuTitle: "Administration",
    offset: 20,
    buttonConfigs: [ {
        title: "Settings",
        icon: "settings",
        action: {
            href: "/app/administration",
            target: "#ti-content",
            swap: "innerHTML"
        }
    } ]
};

/**
 * Register on-initialization tasks for the Alpine.js framework.
 */
document.addEventListener( "alpine:init", () => {
    const defaultConfig = {
        menuTitle: "Menu",
        placement: "right-start",
        offset: 10,
        fixed: true,
        buttonConfigs: []
    };

    Alpine.store( "tiComponentsConfig", {
        sidebarAdministrationMenu: deepMerge( defaultConfig, configSidebarAdministrationMenu ),
        sidebarUserMenu: deepMerge( defaultConfig, configSidebarUserMenu )
    } );
} );