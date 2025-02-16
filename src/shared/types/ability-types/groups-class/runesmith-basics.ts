import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import Staff from "@shared/types/ability-types/skills/staff";

export class RunesmithBasics implements IAbilityGroup {
  static instance: RunesmithBasics;
  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];

  constructor() {
    this.abilityGroup = AbilityGroup.RunesmithBasics;
    this.abilityGroupType = AbilityGroupType.Basics;
    this.abilities = [Staff.GetInstance().Get()];
  }

  // Method to get the single instance of the class
  public static GetInstance(): RunesmithBasics {
    if (!RunesmithBasics.instance) {
      RunesmithBasics.instance = new RunesmithBasics();
    }
    return RunesmithBasics.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return RunesmithBasics.GetInstance() as T;
  }
}

export default RunesmithBasics;
