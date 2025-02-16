import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class ControlMetal implements IAbility {
  private static instance: ControlMetal;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;

  constructor() {
    this.name = "Control Metal";
    this.helpFile = `
help wujen
Control Metal - Demonstrating their mastery over the elements, the Wu Jen
focuses upon their enemy's weapons and shield, attempting to rip them from
unwilling hands and tossing them aside to gain the advantage.
`;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;

    if (ControlMetal.instance === undefined) {
      ControlMetal.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): ControlMetal {
    if (!ControlMetal.instance) {
      ControlMetal.instance = new ControlMetal();
    }
    return ControlMetal.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return ControlMetal.GetInstance() as T;
  }
}

export default ControlMetal;
