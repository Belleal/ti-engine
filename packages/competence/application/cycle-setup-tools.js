/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2026 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

/**
 * Pure helpers backing the Cycle Setup screen.
 *
 * @module cycle-setup-tools
 */

/**
 * Finds families excluded from a cycle that nevertheless have competencies configured for it.
 * <br/>
 * `cycle.excludedFamilies` is derived once, when the cycle record is created, from which families had competencies
 * at that moment. It is data, never re-derived — so a family that gains competencies in a later release stays
 * excluded, with its specializations hidden and its baseline unreachable in practice. This surfaces that staleness
 * so a Supervisor can act on it; it deliberately does **not** re-derive the field, because including a family in a
 * cycle is a governance decision rather than a computation.
 *
 * @method
 * @param {Array<string>} excludedFamilies
 * @param {Object} sets The Cycle Setup `sets` payload — `family → nodeKey → { codes: [] }`.
 * @returns {Array<string>} The excluded family codes that now have at least one code resolved for the cycle.
 * @public
 */
module.exports.deriveStaleExclusions = ( excludedFamilies, sets ) => {
    const excluded = Array.isArray( excludedFamilies ) ? excludedFamilies : [];
    const resolved = ( sets && typeof sets === "object" ) ? sets : {};
    return excluded.filter( ( family ) => {
        const familySets = resolved[ family ];
        if ( !familySets || typeof familySets !== "object" ) {
            return false;
        }
        return Object.values( familySets ).some( ( node ) => node && Array.isArray( node.codes ) && node.codes.length > 0 );
    } );
};
