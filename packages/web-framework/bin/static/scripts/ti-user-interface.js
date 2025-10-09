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