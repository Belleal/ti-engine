/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2025 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

const path = require( "node:path" );
const _ = require( "lodash" );
const config = require( "#config" );
const tools = require( "#tools" );

const defaultEmptyLabel = "!!! label not found !!!";

/**
 * Enum for defining a localization language based on the ISO 639-1 language code.
 *
 * @readonly
 * @enum {string}
 */
const localizationLanguageEnum = tools.enum( {
    // A:
    ABKHAZIAN: [ "ab", "Abkhazian", "Abkhazian" ],
    AFAR: [ "aa", "Afar", "Afar" ],
    AFRIKAANS: [ "af", "Afrikaans", "Afrikaans" ],
    AKAN: [ "ak", "Akan", "Akan" ],
    ALBANIAN: [ "sq", "Albanian", "Albanian" ],
    AMHARIC: [ "am", "Amharic", "Amharic" ],
    ARABIC: [ "ar", "Arabic", "Arabic" ],
    ARAGONESE: [ "an", "Aragonese", "Aragonese" ],
    ARMENIAN: [ "hy", "Armenian", "Armenian" ],
    ASSAMESE: [ "as", "Assamese", "Assamese" ],
    AVARIC: [ "av", "Avaric", "Avaric" ],
    AVESTAN: [ "ae", "Avestan", "Avestan" ],
    AYMARA: [ "ay", "Aymara", "Aymara" ],
    AZERBAIJANI: [ "az", "Azerbaijani", "Azerbaijani" ],
    // B:
    BAMBARA: [ "bm", "Bambara", "Bambara" ],
    BASHKIR: [ "ba", "Bashkir", "Bashkir" ],
    BASQUE: [ "eu", "Basque", "Basque" ],
    BELARUSIAN: [ "be", "Belarusian", "Belarusian" ],
    BENGALI: [ "bn", "Bengali", "Bengali" ],
    BIHARI_LANGUAGES: [ "bh", "Bihari languages", "Bihari languages" ],
    BISLAMA: [ "bi", "Bislama", "Bislama" ],
    BOSNIAN: [ "bs", "Bosnian", "Bosnian" ],
    BRETON: [ "br", "Breton", "Breton" ],
    BULGARIAN: [ "bg", "Bulgarian", "Bulgarian" ],
    BURMESE: [ "my", "Burmese", "Burmese" ],
    // C:
    CATALAN: [ "ca", "Catalan", "Catalan" ],
    CENTRAL_KHMER: [ "km", "Central Khmer", "Central Khmer" ],
    CHAMORRO: [ "ch", "Chamorro", "Chamorro" ],
    CHECHEN: [ "ce", "Chechen", "Chechen" ],
    CHICHEWA: [ "ny", "Chichewa", "Chichewa" ],
    CHINESE: [ "zh", "Chinese", "Chinese" ],
    CHURCH_SLAVIC: [ "cu", "Church Slavic", "Church Slavic" ],
    CHUVASH: [ "cv", "Chuvash", "Chuvash" ],
    CORNISH: [ "kw", "Cornish", "Cornish" ],
    CORSICAN: [ "co", "Corsican", "Corsican" ],
    CREE: [ "cr", "Cree", "Cree" ],
    CROATIAN: [ "hr", "Croatian", "Croatian" ],
    CZECH: [ "cs", "Czech", "Czech" ],
    // D:
    DANISH: [ "da", "Danish", "Danish" ],
    DIVEHI: [ "dv", "Divehi", "Divehi" ],
    DUTCH: [ "nl", "Dutch", "Dutch" ],
    DZONGKHA: [ "dz", "Dzongkha", "Dzongkha" ],
    // E:
    ENGLISH: [ "en", "English", "English" ],
    ESPERANTO: [ "eo", "Esperanto", "Esperanto" ],
    ESTONIAN: [ "et", "Estonian", "Estonian" ],
    EWE: [ "ee", "Ewe", "Ewe" ],
    // F:
    FAROESE: [ "fo", "Faroese", "Faroese" ],
    FIJIAN: [ "fj", "Fijian", "Fijian" ],
    FINNISH: [ "fi", "Finnish", "Finnish" ],
    FRENCH: [ "fr", "French", "French" ],
    FULAH: [ "ff", "Fulah", "Fulah" ],
    FRISIAN_WESTERN: [ "fy", "Western Frisian", "Western Frisian" ],
    // G:
    GAELIC_SCOTTISH: [ "gd", "Scottish Gaelic", "Scottish Gaelic" ],
    GALICIAN: [ "gl", "Galician", "Galician" ],
    GANDA: [ "lg", "Ganda", "Ganda" ],
    GEORGIAN: [ "ka", "Georgian", "Georgian" ],
    GERMAN: [ "de", "German", "German" ],
    GREEK_MODERN: [ "el", "Greek, Modern (1453–)", "Greek, Modern (1453–)" ],
    GUARANI: [ "gn", "Guarani", "Guarani" ],
    GUJARATI: [ "gu", "Gujarati", "Gujarati" ],
    // H:
    HAITIAN: [ "ht", "Haitian", "Haitian" ],
    HAUSA: [ "ha", "Hausa", "Hausa" ],
    HEBREW: [ "he", "Hebrew", "Hebrew" ],
    HERERO: [ "hz", "Herero", "Herero" ],
    HINDI: [ "hi", "Hindi", "Hindi" ],
    HIRI_MOTU: [ "ho", "Hiri Motu", "Hiri Motu" ],
    HUNGARIAN: [ "hu", "Hungarian", "Hungarian" ],
    // I:
    ICELANDIC: [ "is", "Icelandic", "Icelandic" ],
    IDO: [ "io", "Ido", "Ido" ],
    IGBO: [ "ig", "Igbo", "Igbo" ],
    INTERLINGUA: [ "ia", "Interlingua", "Interlingua" ],
    INTERLINGUE: [ "ie", "Interlingue", "Interlingue" ],
    INDONESIAN: [ "id", "Indonesian", "Indonesian" ],
    INUKTITUT: [ "iu", "Inuktitut", "Inuktitut" ],
    INUPIAQ: [ "ik", "Inupiaq", "Inupiaq" ],
    IRISH: [ "ga", "Irish", "Irish" ],
    ITALIAN: [ "it", "Italian", "Italian" ],
    // J:
    JAPANESE: [ "ja", "Japanese", "Japanese" ],
    JAVANESE: [ "jv", "Javanese", "Javanese" ],
    // K:
    KALAALLISUT: [ "kl", "Kalaallisut", "Kalaallisut" ],
    KANNADA: [ "kn", "Kannada", "Kannada" ],
    KASHMIRI: [ "ks", "Kashmiri", "Kashmiri" ],
    KAZAKH: [ "kk", "Kazakh", "Kazakh" ],
    KIKUYU: [ "ki", "Kikuyu", "Kikuyu" ],
    KINYARWANDA: [ "rw", "Kinyarwanda", "Kinyarwanda" ],
    KIRGHIZ: [ "ky", "Kirghiz", "Kirghiz" ],
    KOMI: [ "kv", "Komi", "Komi" ],
    KONGO: [ "kg", "Kongo", "Kongo" ],
    KOREAN: [ "ko", "Korean", "Korean" ],
    KUANYAMA: [ "kj", "Kuanyama", "Kuanyama" ],
    KURDISH: [ "ku", "Kurdish", "Kurdish" ],
    // L:
    LAO: [ "lo", "Lao", "Lao" ],
    LATIN: [ "la", "Latin", "Latin" ],
    LATVIAN: [ "lv", "Latvian", "Latvian" ],
    LIMBURGAN: [ "li", "Limburgan", "Limburgan" ],
    LINGALA: [ "ln", "Lingala", "Lingala" ],
    LITHUANIAN: [ "lt", "Lithuanian", "Lithuanian" ],
    LUBA_KATANGA: [ "lu", "Luba-Katanga", "Luba-Katanga" ],
    LUXEMBOURGISH: [ "lb", "Luxembourgish", "Luxembourgish" ],
    // M:
    MACEDONIAN: [ "mk", "Macedonian", "Macedonian" ],
    MALAGASY: [ "mg", "Malagasy", "Malagasy" ],
    MALAY: [ "ms", "Malay", "Malay" ],
    MALAYALAM: [ "ml", "Malayalam", "Malayalam" ],
    MALTESE: [ "mt", "Maltese", "Maltese" ],
    MANX: [ "gv", "Manx", "Manx" ],
    MAORI: [ "mi", "Maori", "Maori" ],
    MARATHI: [ "mr", "Marathi", "Marathi" ],
    MARSHALLESE: [ "mh", "Marshallese", "Marshallese" ],
    MONGOLIAN: [ "mn", "Mongolian", "Mongolian" ],
    // N:
    NAURU: [ "na", "Nauru", "Nauru" ],
    NAVAJO: [ "nv", "Navajo", "Navajo" ],
    NDEBELE_NORTH: [ "nd", "North Ndebele", "North Ndebele" ],
    NDEBELE_SOUTH: [ "nr", "South Ndebele", "South Ndebele" ],
    NDONGA: [ "ng", "Ndonga", "Ndonga" ],
    NEPALI: [ "ne", "Nepali", "Nepali" ],
    NORTHERN_SAMI: [ "se", "Northern Sami", "Northern Sami" ],
    NORWEGIAN: [ "no", "Norwegian", "Norwegian" ],
    NORWEGIAN_BOKMAL: [ "nb", "Norwegian Bokmål", "Norwegian Bokmål" ],
    NORWEGIAN_NYNORSK: [ "nn", "Norwegian Nynorsk", "Norwegian Nynorsk" ],
    // O:
    OCCITAN: [ "oc", "Occitan", "Occitan" ],
    OJIBWA: [ "oj", "Ojibwa", "Ojibwa" ],
    ORIYA: [ "or", "Oriya", "Oriya" ],
    OROMO: [ "om", "Oromo", "Oromo" ],
    OSSETIAN: [ "os", "Ossetian", "Ossetian" ],
    // P:
    PANJABI: [ "pa", "Panjabi", "Panjabi" ],
    PALI: [ "pi", "Pali", "Pali" ],
    PASHTO: [ "ps", "Pashto", "Pashto" ],
    POLISH: [ "pl", "Polish", "Polish" ],
    PORTUGUESE: [ "pt", "Portuguese", "Portuguese" ],
    // Q:
    QUECHUA: [ "qu", "Quechua", "Quechua" ],
    // R:
    ROMANIAN: [ "ro", "Romanian", "Romanian" ],
    ROMANSH: [ "rm", "Romansh", "Romansh" ],
    RUNDI: [ "rn", "Rundi", "Rundi" ],
    RUSSIAN: [ "ru", "Russian", "Russian" ],
    // S:
    SANGO: [ "sg", "Sango", "Sango" ],
    SANSKRIT: [ "sa", "Sanskrit", "Sanskrit" ],
    SARDINIAN: [ "sc", "Sardinian", "Sardinian" ],
    SERBIAN: [ "sr", "Serbian", "Serbian" ],
    SHONA: [ "sn", "Shona", "Shona" ],
    SINDHI: [ "sd", "Sindhi", "Sindhi" ],
    SINHALA: [ "si", "Sinhala", "Sinhala" ],
    SLOVAK: [ "sk", "Slovak", "Slovak" ],
    SLOVENIAN: [ "sl", "Slovenian", "Slovenian" ],
    SOMALI: [ "so", "Somali", "Somali" ],
    SOTHO_SOUTHERN: [ "st", "Southern Sotho", "Southern Sotho" ],
    SPANISH: [ "es", "Spanish", "Spanish" ],
    SUNDANESE: [ "su", "Sundanese", "Sundanese" ],
    SWAHILI: [ "sw", "Swahili", "Swahili" ],
    SWATI: [ "ss", "Swati", "Swati" ],
    SWEDISH: [ "sv", "Swedish", "Swedish" ],
    // T:
    TAGALOG: [ "tl", "Tagalog", "Tagalog" ],
    TAHITIAN: [ "ty", "Tahitian", "Tahitian" ],
    TAJIK: [ "tg", "Tajik", "Tajik" ],
    TAMIL: [ "ta", "Tamil", "Tamil" ],
    TATAR: [ "tt", "Tatar", "Tatar" ],
    TELUGU: [ "te", "Telugu", "Telugu" ],
    THAI: [ "th", "Thai", "Thai" ],
    TIBETAN: [ "bo", "Tibetan", "Tibetan" ],
    TIGRINYA: [ "ti", "Tigrinya", "Tigrinya" ],
    TONGA: [ "to", "Tonga", "Tonga" ],
    TSONGA: [ "ts", "Tsonga", "Tsonga" ],
    TSWANA: [ "tn", "Tswana", "Tswana" ],
    TURKISH: [ "tr", "Turkish", "Turkish" ],
    TURKMEN: [ "tk", "Turkmen", "Turkmen" ],
    TWI: [ "tw", "Twi", "Twi" ],
    // U:
    UIGHUR: [ "ug", "Uighur", "Uighur" ],
    UKRAINIAN: [ "uk", "Ukrainian", "Ukrainian" ],
    URDU: [ "ur", "Urdu", "Urdu" ],
    UZBEK: [ "uz", "Uzbek", "Uzbek" ],
    // V:
    VENDA: [ "ve", "Venda", "Venda" ],
    VIETNAMESE: [ "vi", "Vietnamese", "Vietnamese" ],
    VOLAPUK: [ "vo", "Volapük", "Volapük" ],
    // W:
    WALLON: [ "wa", "Walloon", "Walloon" ],
    WELSH: [ "cy", "Welsh", "Welsh" ],
    WOLOF: [ "wo", "Wolof", "Wolof" ],
    // X:
    XHOSA: [ "xh", "Xhosa", "Xhosa" ],
    // Y:
    YIDDISH: [ "yi", "Yiddish", "Yiddish" ],
    YORUBA: [ "yo", "Yoruba", "Yoruba" ],
    // Z:
    ZHUANG: [ "za", "Zhuang", "Zhuang" ],
    ZULU: [ "zu", "Zulu", "Zulu" ]
} );

/**
 * @typedef {string} TiLocalizationLanguage
 */
module.exports.localizationLanguage = localizationLanguageEnum;

/**
 * The key of this object is the language code, and the value is the textual representation of the label.
 *
 * @typedef {Object<TiLocalizationLanguage, string>} TiLocalizedLabel
 */

/**
 * A nested labels tree where intermediate nodes are objects and leaf nodes are language-to-text maps.
 *
 * @typedef {Object<string, TiLocalizedLabel | TiLabelsTree>} TiLabelsTree
 */

/**
 * @typedef {Object} TiLabels
 * @property {TiLabelsTree} labels
 */

/** @type {TiLabels} */
const labels = require( "#labels" );

// Load any custom labels defined in the configuration:
const labelsPaths = config.getSetting( config.setting.LOCALIZATION_LABELS_PATH );
if ( labelsPaths && _.isArray( labelsPaths ) && labelsPaths.length > 0 ) {
    _.forEach( labelsPaths, ( labelsPath ) => {
        let filePath = path.normalize( path.join( process.cwd(), labelsPath ) );
        let fileLabels = require( filePath );
        _.merge( labels, fileLabels );
    } );
}

// Prevent further modifications to the TiLabels object:
Object.freeze( labels );

/**
 * Used to return the textual value for a label based on the current system language by default or the specified language code if provided.
 *
 * @method
 * @param {string} label This should be a dot-separated JSON path string.
 * @param {TiLocalizationLanguage} [language] The language code to use for the lookup. If not provided, the current system language will be used.
 * @returns {string}
 * @public
 */
module.exports.getLabel = ( label, language ) => {
    return _.get( labels, label + "." + ( ( language ) ? language : config.getSetting( config.setting.LOCALIZATION_LANGUAGE ) ), defaultEmptyLabel );
};

/**
 * Used to return the entire labels tree.
 * <br/>
 * NOTE: The result will be a modified copy of the label tree that has no "language" end-nodes and keeps only the appropriate labels for the requested language.
 * For example, if the original JSON path is "path.to.label.language", the returned path will be just "path.to.label" corresponding to the text label.
 *
 * @method
 * @param {TiLocalizationLanguage} [language] The language code to use for the lookup. If not provided, the current system language will be used.
 * @returns {Object}
 * @public
 */
module.exports.getAllLabels = ( language ) => {
    const usedLanguage = language || config.getSetting( config.setting.LOCALIZATION_LANGUAGE );
    return _.cloneDeepWith( labels, ( value ) => {
        if ( _.isPlainObject( value ) ) {
            const values = Object.values( value );
            const isLeaf = values.length > 0 && values.every( v => _.isString( v ) || _.isNil( v ) );
            if ( isLeaf ) {
                // Return only the desired language or default placeholder if missing:
                return _.get( value, usedLanguage, defaultEmptyLabel );
            }
        } else {
            // Return undefined to let lodash handle default deep cloning for non-leaves:
            return undefined;
        }
    } );
};