export declare var onShutDownHandler: (instance: TiWebServer) => ExpressHandler;
export declare var startupGateHandler: (instance: TiWebServer, holdLimit?: number) => ExpressHandler;
export declare var resourceProtectionHandler: (instance: TiWebServer) => ExpressHandler;
export declare var authenticationHandler: (instance: TiWebServer) => ExpressHandler;
export declare var authorizedOAuth2CallbackHandler: (instance: TiWebServer, authMethod: TiAuthMethod) => ExpressHandler;
export declare var logoutHandler: () => ExpressHandler;
export declare var healthHandler: () => ExpressHandler;
export declare var serverTimingHandler: (instance: TiWebServer) => ExpressHandler;
export declare var timedHandler: (name: string, handler: ExpressHandler) => ExpressHandler;
export declare var userInformationHandler: () => ExpressHandler;
export declare var labelsBundleHandler: (instance: TiWebServer) => ExpressHandler;
export declare var languageChoiceHandler: (instance: TiWebServer) => ExpressHandler;
export { resolveRequestLanguage };
export declare var httpRedirectHandler: (instance: TiWebServer) => ExpressHandler;
export declare var serviceCallHandler: (instance: TiWebServer) => ExpressHandler;
export declare var invalidRouteHandler: () => ExpressHandler;
export declare var defaultErrorHandler: () => ExpressErrorHandler;
export declare var nonceGenerationHandler: () => ExpressHandler;
export declare var resolveCspAdditions: (configured?: Object) => Record<string, string[]>;
export declare var cspHeaderHandler: (contentSecurityPolicy?: Object) => ExpressHandler;
export declare var webAppHandler: (instance: TiWebServer) => ExpressHandler;
export declare var sessionRefreshHandler: (instance: TiWebServer) => ExpressHandler;
export declare var originRefererValidationHandler: (instance: any) => ExpressHandler;
export declare var csrfInitHandler: (instance: TiWebServer) => ExpressHandler;
export declare var csrfTokenHandler: () => ExpressHandler;
export declare var csrfProtectionHandler: () => ExpressHandler;
import type { TiAuthMethod } from "#auth-manager";
import type TiWebServer from "#web-server";
export type ExpressRequest = import("express").Request;
export type ExpressResponse = import("express").Response;
export type ExpressHandler = (request: ExpressRequest, response: ExpressResponse, next: (error: Error | null) => void) => void;
export type ExpressErrorHandler = (error: Error, request: ExpressRequest, response: ExpressResponse, next: (error: Error | null) => void) => void;
/**
 * The language a request is served in (CA-410): a signed-in session's, else the one the visitor chose, else the one
 * the service configuration names, else the deployment's.
 * <br/>
 * Everything that answers a request that may be anonymous asks this rather than reading `session.language`, which an
 * anonymous request does not have: the sign-in screen, its label catalogue, and the views rendered around it.
 *
 * @method
 * @param {Object} request
 * @param {TiWebServer} instance
 * @returns {string}
 * @public
 */
declare let resolveRequestLanguage: (request: Object, instance: TiWebServer) => string;
