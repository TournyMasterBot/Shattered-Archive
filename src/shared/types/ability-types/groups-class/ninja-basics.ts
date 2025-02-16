import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import Sword from "@shared/types/ability-types/skills/sword";
import Sneak from "@shared/types/ability-types/skills/sneak";

export class NinjaBasics implements IAbilityGroup {
  static instance: NinjaBasics;
  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];

  constructor() {
    this.abilityGroup = AbilityGroup.NinjaBasics;
    this.abilityGroupType = AbilityGroupType.Basics;
    this.abilities = [Sword.GetInstance().Get(), Sneak.GetInstance().Get()];
  }

  // Method to get the single instance of the class
  public static GetInstance(): NinjaBasics {
    if (!NinjaBasics.instance) {
      NinjaBasics.instance = new NinjaBasics();
    }
    return NinjaBasics.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return NinjaBasics.GetInstance() as T;
  }
}

export default NinjaBasics;
