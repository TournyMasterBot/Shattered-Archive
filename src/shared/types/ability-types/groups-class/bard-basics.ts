import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import Staff from "@shared/types/ability-types/skills/staff";

export class BardBasics implements IAbilityGroup {
  static instance: BardBasics;
  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];

  constructor() {
    this.abilityGroup = AbilityGroup.BardBasics;
    this.abilityGroupType = AbilityGroupType.Basics;
    this.abilities = [new Staff()];
  }

  // Method to get the single instance of the class
  public static GetInstance(): BardBasics {
    if (!BardBasics.instance) {
      BardBasics.instance = new BardBasics();
    }
    return BardBasics.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return BardBasics.GetInstance() as T;
  }
}

export default BardBasics;
