declare const _exports: {
    renderProse: (section: Object) => import("../html.js").SafeString;
    renderVerse: (section: Object) => import("../html.js").SafeString;
    renderClosing: (section: Object) => import("../html.js").SafeString;
    renderLanguageExample: (section: Object) => import("../html.js").SafeString;
    renderHero: (section: Object) => import("../html.js").SafeString;
    renderGallery: (section: Object) => import("../html.js").SafeString;
    renderAudio: (section: Object) => import("../html.js").SafeString;
    renderCharacterCards: (section: Object) => import("../html.js").SafeString;
    renderAgePanels: (section: Object) => import("../html.js").SafeString;
    renderTimeStrip: (section: Object) => import("../html.js").SafeString;
    renderTimeline: (section: Object) => import("../html.js").SafeString;
    renderFeatured: (section: Object, context: Object) => import("../html.js").SafeString;
    renderPostList: (section: Object, context: Object) => import("../html.js").SafeString;
    renderPostCard: (item: {
        record: Object;
        verdict: string;
    }, context: Object, featured?: boolean) => import("../html.js").SafeString;
    renderPagination: (page: number, pages: number, context: Object) => import("../html.js").SafeString;
    renderCapture: (section: Object, context: Object) => import("../html.js").SafeString;
    renderFormStatus: (kind: string, title?: string, body?: string) => import("../html.js").SafeString;
    renderDictionary: (section: Object, context: Object) => import("../html.js").SafeString;
};
export = _exports;
