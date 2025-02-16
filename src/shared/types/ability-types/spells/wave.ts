import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class Wave implements IAbility {
  private static instance: Wave;

  name: string;
  helpFile: string;
  abilityGroupType: AbilityGroupType;
  abilityUsage: AbilityUsage;

  constructor() {
    this.name = "Wave";
    this.helpFile = `help wujen
Wave - The Wu Jen conjures a wave of water that carries them out of the
room, continuing for up to two rooms in a direction of their choosing.`;
    this.abilityGroupType = AbilityGroupType.Spells;
    this.abilityUsage = AbilityUsage.Active;

    if (Wave.instance === undefined) {
      Wave.instance = this;
    }
  }

  // Method to get the single instance of the class
  public static GetInstance(): Wave {
    if (!Wave.instance) {
      Wave.instance = new Wave();
    }
    return Wave.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return Wave.GetInstance() as T;
  }
}

export default Wave;
