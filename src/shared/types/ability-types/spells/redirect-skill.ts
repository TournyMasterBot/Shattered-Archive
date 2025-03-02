import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class RedirectSkill implements IAbility {
  private static instance: RedirectSkill;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;

  constructor() {
    this.name = this.constructor.name;
    this.helpFile = ``;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;

    if (RedirectSkill.instance === undefined) {
      RedirectSkill.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): RedirectSkill {
    if (!RedirectSkill.instance) {
      RedirectSkill.instance = new RedirectSkill();
    }
    return RedirectSkill.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return RedirectSkill.GetInstance() as T;
  }
}

export default RedirectSkill;
