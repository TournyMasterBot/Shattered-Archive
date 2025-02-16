import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import Mace from "@shared/types/ability-types/skills/mace";
import Spear from "@shared/types/ability-types/skills/spear";

export class ShamanBasics implements IAbilityGroup {
  static instance: ShamanBasics;
  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];

  constructor() {
    this.abilityGroup = AbilityGroup.ShamanBasics;
    this.abilityGroupType = AbilityGroupType.Basics;
    this.abilities = [Mace.GetInstance().Get(), Spear.GetInstance().Get()];
  }

  // Method to get the single instance of the class
  public static GetInstance(): ShamanBasics {
    if (!ShamanBasics.instance) {
      ShamanBasics.instance = new ShamanBasics();
    }
    return ShamanBasics.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return ShamanBasics.GetInstance() as T;
  }
}

export default ShamanBasics;
