import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class RainbowPattern implements IAbility {
  private static instance: RainbowPattern;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;

  constructor() {
    this.name = this.constructor.name;
    this.helpFile = `rainbow pattern
A bright rainbow of colors strikes your opponent. There is a good chance
that it will leave your opponent blinded as well. It's a lot like color
spray, only a lot more potent.`;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;

    if (RainbowPattern.instance === undefined) {
      RainbowPattern.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): RainbowPattern {
    if (!RainbowPattern.instance) {
      RainbowPattern.instance = new RainbowPattern();
    }
    return RainbowPattern.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return RainbowPattern.GetInstance() as T;
  }
}

export default RainbowPattern;
