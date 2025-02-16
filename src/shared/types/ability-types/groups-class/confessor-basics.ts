import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import Dagger from "@shared/types/ability-types/skills/dagger";

export class ConfessorBasics implements IAbilityGroup {
  static instance: ConfessorBasics;
  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];

  constructor() {
    this.abilityGroup = AbilityGroup.ConfessorBasics;
    this.abilityGroupType = AbilityGroupType.Basics;
    this.abilities = [new Dagger()];
  }

  // Method to get the single instance of the class
  public static GetInstance(): ConfessorBasics {
    if (!ConfessorBasics.instance) {
      ConfessorBasics.instance = new ConfessorBasics();
    }
    return ConfessorBasics.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return ConfessorBasics.GetInstance() as T;
  }
}

export default ConfessorBasics;
