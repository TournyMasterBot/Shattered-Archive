import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import Dagger from "@shared/types/ability-types/skills/dagger";
import Steal from "@shared/types/ability-types/skills/steal";

export class NightshadeBasics implements IAbilityGroup {
  static instance: NightshadeBasics;
  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];
  public name: string;

  constructor() {
    this.name = this.constructor.name.toLowerCase();
    this.abilityGroup = AbilityGroup.NightshadeBasics;
    this.abilityGroupType = AbilityGroupType.Basics;
    this.abilities = [Dagger.GetInstance().Get(), Steal.GetInstance().Get()];
  }

  // Method to get the single instance of the class
  public static GetInstance(): NightshadeBasics {
    if (!NightshadeBasics.instance) {
      NightshadeBasics.instance = new NightshadeBasics();
    }
    return NightshadeBasics.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return NightshadeBasics.GetInstance() as T;
  }
}

export default NightshadeBasics;
