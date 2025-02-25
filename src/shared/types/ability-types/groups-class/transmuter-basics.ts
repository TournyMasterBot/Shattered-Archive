import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import Dagger from "@shared/types/ability-types/skills/dagger";

export class TransmuterBasics implements IAbilityGroup {
  static instance: TransmuterBasics;
  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];
  public name: string;

  constructor() {
    this.name = this.constructor.name.toLowerCase();
    this.abilityGroup = AbilityGroup.TransmuterBasics;
    this.abilityGroupType = AbilityGroupType.Basics;
    this.abilities = [Dagger.GetInstance()];
  }

  // Method to get the single instance of the class
  public static GetInstance(): TransmuterBasics {
    if (!TransmuterBasics.instance) {
      TransmuterBasics.instance = new TransmuterBasics();
    }
    return TransmuterBasics.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return TransmuterBasics.GetInstance() as T;
  }
}

export default TransmuterBasics;
