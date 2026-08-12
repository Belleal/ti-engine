export { localizationLanguageEnum as localizationLanguage };
export declare var getLabel: (label: string, language?: TiLocalizationLanguage) => string;
export declare var getAllLabels: (language?: TiLocalizationLanguage) => TiLabelsTree;
export type TiLocalizationLanguage = string;
/**
 * Enum for defining a localization language based on the ISO 639-1 language code.
 *
 * @readonly
 * @enum {string}
 * @typedef {string} TiLocalizationLanguage
 */
declare const localizationLanguageEnum: Object;
