import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import Dodge from "@shared/types/ability-types/skills/dodge";
import FireBreather from "@shared/types/ability-types/skills/fire-breather";
import Haymaker from "@shared/types/ability-types/skills/haymaker";
import KegToss from "@shared/types/ability-types/skills/keg-toss";
import SecondAttack from "@shared/types/ability-types/skills/second-attack";
import SuckerPunch from "@shared/types/ability-types/skills/sucker-punch";

export class BrewmasterDefault implements IAbilityGroup {
  static instance: BrewmasterDefault;
  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];
  public name: string;

  constructor() {
    this.name = this.constructor.name.toLowerCase();
    this.abilityGroup = AbilityGroup.BrewmasterDefault;
    this.abilityGroupType = AbilityGroupType.Default;
    this.abilities = [new SecondAttack(), new KegToss(), new Dodge(), new SuckerPunch(), new Haymaker(), new FireBreather()];
  }

  // Method to get the single instance of the class
  public static GetInstance(): BrewmasterDefault {
    if (!BrewmasterDefault.instance) {
      BrewmasterDefault.instance = new BrewmasterDefault();
    }
    return BrewmasterDefault.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return BrewmasterDefault.GetInstance() as T;
  }
}

export default BrewmasterDefault;
