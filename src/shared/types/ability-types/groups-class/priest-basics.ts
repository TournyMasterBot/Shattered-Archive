import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import Dagger from "@shared/types/ability-types/skills/dagger";

export class PriestBasics implements IAbilityGroup {
  static instance: PriestBasics;
  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];

  constructor() {
    this.abilityGroup = AbilityGroup.PriestBasics;
    this.abilityGroupType = AbilityGroupType.Basics;
    this.abilities = [Dagger.GetInstance().Get()];
  }

  // Method to get the single instance of the class
  public static GetInstance(): PriestBasics {
    if (!PriestBasics.instance) {
      PriestBasics.instance = new PriestBasics();
    }
    return PriestBasics.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return PriestBasics.GetInstance() as T;
  }
}

export default PriestBasics;
