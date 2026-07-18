export * from './types.js';
export { Reader, ParseError, flagConvert } from './reader.js';
export { parseAreaFile } from './parse.js';
export { emitAreaFile, EmitError } from './emit.js';
export {
  validateScripts,
  scriptBodyLines,
  MAX_SCRIPT_LINES,
  collectRefs,
  collectDefinedEntities,
  validateRefs,
  referencesTo,
  isKnownSpecFun,
  vnumsOutsideRange,
  type ScriptsSummary,
  type RefsSummary,
  type RefKind,
  type VnumRef,
  type ExternalVnumRef,
  type ValidateRefsOptions,
} from './validate.js';
export {
  parseSkillsFile,
  emitSkillsFile,
  validateSkills,
  stockSkillsFile,
  stockSkill,
  type SkillEntry,
  type StockSkillRow,
  type SkillsFile,
  type SkillsSummary,
} from './skills.js';
export { SKILL_SPELL_FUNS, STOCK_FUN_TARGET_PAIRS, STOCK_SKILLS } from './skills-stock.js';
export {
  parseGroupsFile,
  emitGroupsFile,
  validateGroups,
  stockGroupsFile,
  stockGroup,
  groupMemberCandidates,
  resolveMember,
  MAX_IN_GROUP,
  type GroupEntry,
  type StockGroupRow,
  type GroupsFile,
  type GroupsSummary,
} from './groups.js';
export { STOCK_GROUPS } from './groups-stock.js';
