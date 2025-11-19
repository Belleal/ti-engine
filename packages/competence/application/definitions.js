/*
 * The ti-engine is an open source, free to use—both for personal and commercial projects—framework for the creation of microservice-based solutions using node.js.
 * Copyright © 2021-2025 Boris Kostadinov <kostadinov.boris@gmail.com>
 * This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

const tools = require( "@ti-engine/core/tools" );

const organizationPositionCodeEnum = tools.enum( require( "#config-positions" ) );
const organizationRoleCodeEnum = tools.enum( require( "#config-roles" ) );
const organizationPositionLevelCode = require( "#config-position-levels" );

module.exports.organizationPositionCode = organizationPositionCodeEnum;
module.exports.organizationRoleCode = organizationRoleCodeEnum;
module.exports.organizationPositionLevelCode = organizationPositionLevelCode;
