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
export {
  simulateResets,
  WEAR_SLOTS,
  type SimulateResetsOptions,
  type SimulateResetsResult,
  type SimRoomState,
  type SimMobGroup,
  type SimObjectNode,
  type SimEquippedObject,
  type SimDoorState,
  type DoorState,
} from './simulate.js';
export {
  validateSpellSpec,
  TAR_CHAR_OFFENSIVE,
  TAR_CHAR_DEFENSIVE,
  TAR_CHAR_SELF,
  DAMAGE_TYPE_CODE,
  APPLY_LOCATION_CODE,
  APPLY_LOCATION_MACRO,
  AFF_FLAG_MACRO,
  CURE_CONDITION_GSN,
  type SpellSpec,
  type SpellSpecSummary,
  type ValidateSpellSpecOptions,
  type DamageArchetype,
  type BuffArchetype,
  type DebuffArchetype,
  type HealArchetype,
  type CureArchetype,
  type DamageType,
  type ApplyLocation,
  type AffFlag,
  type CureCondition,
  type SaveType,
} from './spell-spec.js';
export {
  generateSpellC,
  generateOverlayRow,
  type GeneratedSpellC,
  type RegistryAnchor,
} from './spell-codegen.js';
export {
  parseLiveSnapshot,
  diffSpawnState,
  type LiveSnapshot,
  type LiveRoomState,
  type DiffSpawnStateResult,
  type RoomDrift,
  type DriftSummary,
  type DriftMobEntry,
  type DriftExtraObject,
  type DriftDoorChange,
} from './live-state.js';
