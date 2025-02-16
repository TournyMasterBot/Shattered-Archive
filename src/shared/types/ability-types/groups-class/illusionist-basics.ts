import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import Dagger from "@shared/types/ability-types/skills/dagger";
import Staff from "@shared/types/ability-types/skills/staff";

export class IllusionistBasics implements IAbilityGroup {
  static instance: IllusionistBasics;
  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];

  constructor() {
    this.abilityGroup = AbilityGroup.IllusionistBasics;
    this.abilityGroupType = AbilityGroupType.Basics;
    this.abilities = [Dagger.GetInstance().Get(), Staff.GetInstance().Get()];
  }

  // Method to get the single instance of the class
  public static GetInstance(): IllusionistBasics {
    if (!IllusionistBasics.instance) {
      IllusionistBasics.instance = new IllusionistBasics();
    }
    return IllusionistBasics.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return IllusionistBasics.GetInstance() as T;
  }
}

export default IllusionistBasics;
