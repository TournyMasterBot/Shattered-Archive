import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import Staff from "@shared/types/ability-types/skills/staff";

export class ShukenjaBasics implements IAbilityGroup {
  static instance: ShukenjaBasics;
  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];

  constructor() {
    this.abilityGroup = AbilityGroup.ShukenjaBasics;
    this.abilityGroupType = AbilityGroupType.Basics;
    this.abilities = [Staff.GetInstance().Get()];
  }

  // Method to get the single instance of the class
  public static GetInstance(): ShukenjaBasics {
    if (!ShukenjaBasics.instance) {
      ShukenjaBasics.instance = new ShukenjaBasics();
    }
    return ShukenjaBasics.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return ShukenjaBasics.GetInstance() as T;
  }
}

export default ShukenjaBasics;
