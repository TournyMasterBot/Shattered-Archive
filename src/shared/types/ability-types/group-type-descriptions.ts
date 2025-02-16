import AbilityGroupType from "./ability-group-type";

const GroupTypeDescriptions: { [key in AbilityGroupType]: string } = {
  [AbilityGroupType.Unknown]: "Unknown",
  [AbilityGroupType.Skills]: "Skills",
  [AbilityGroupType.Spells]: "Spells",
  [AbilityGroupType.Songs]: "Songs",
  [AbilityGroupType.Basics]: "Basics",
  [AbilityGroupType.Default]: "Default",
  [AbilityGroupType.Race]: "Race",
  [AbilityGroupType.Class]: "Class",
  [AbilityGroupType.Specialty]: "Specialty",
};

export default GroupTypeDescriptions;
