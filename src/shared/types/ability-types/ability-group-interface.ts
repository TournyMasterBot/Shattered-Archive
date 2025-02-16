import IAbility from "./ability";
import AbilityGroup from "./ability-group";
import AbilityGroupType from "./ability-group-type";

interface IAbilityGroup {
  abilityGroup: AbilityGroup;
  abilityGroupType: AbilityGroupType;
  abilities: IAbility[];

  Get<T>(): T;
}

export default IAbilityGroup;
